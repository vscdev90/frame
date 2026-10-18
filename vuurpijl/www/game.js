// Vuurpijl! — light the fuse, launch, steer, explode, upgrade, repeat.
(function () {
  'use strict';

  const L = window.VPLogic;
  const I = window.VPI18n;
  const T = (k) => I.t(k);
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return n.toLocaleString(T('locale'));
  }

  // ---------- save ----------
  const SAVE_KEY = 'vuurpijl-save-v1';
  let save = L.freshSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      save = Object.assign(L.freshSave(), s);
      save.lv = Object.assign(L.freshSave().lv, s.lv || {});
      if (!Array.isArray(save.types) || !save.types.includes(0)) save.types = [0];
    }
  } catch (e) { /* private mode: play without saving */ }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ---------- haptics ----------
  function vib(ms) {
    try {
      if (window.AndroidBridge && window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  // ---------- audio (all synthesised, no files) ----------
  const A = { ctx: null, master: null, noise: null, loops: {} };
  function audioInit() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = save.sound ? 0.6 : 0;
      A.master.connect(A.ctx.destination);
      const len = A.ctx.sampleRate * 2;
      A.noise = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { A.ctx = null; }
  }
  // Language: English by default, Dutch when the player picks it.
  function setLang(lang) {
    I.set(lang);
    save.lang = I.lang; store();
    document.documentElement.lang = I.lang;
    document.title = I.lang === 'en' ? 'Rocket!' : 'Vuurpijl!';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
    $('btn-lang').textContent = I.lang === 'en' ? 'NL' : 'EN';
    $('btn-lang').setAttribute('aria-label', T('lang'));
    $('btn-sound').setAttribute('aria-label', T('sound'));
    $('btn-reset').setAttribute('aria-label', T('reset'));
    $('btn-tilt').setAttribute('aria-label', T('tilt'));
  }

  function setSound(on) {
    save.sound = on; store();
    if (A.master) A.master.gain.value = on ? 0.6 : 0;
    $('btn-sound').textContent = on ? '🔊' : '🔇';
  }
  function tone(f0, dur, type, vol, f1, delay) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, vol, f0, f1, ftype, delay) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + (delay || 0);
    const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = A.noise;
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function loopStart(name, ftype, freq, q) {
    if (!A.ctx || A.loops[name]) return;
    const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = A.noise; s.loop = true;
    f.type = ftype; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start();
    A.loops[name] = { s, f, g };
  }
  function loopSet(name, vol, freq) {
    const l = A.loops[name];
    if (!l) return;
    l.g.gain.setTargetAtTime(vol, A.ctx.currentTime, 0.05);
    if (freq) l.f.frequency.setTargetAtTime(freq, A.ctx.currentTime, 0.1);
  }
  function loopStop(name) {
    const l = A.loops[name];
    if (!l) return;
    l.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.05);
    l.s.stop(A.ctx.currentTime + 0.3);
    delete A.loops[name];
  }
  const sfx = {
    coin() { tone(1300, 0.07, 'square', 0.05, 1900); tone(1900, 0.12, 'square', 0.04, null, 0.06); },
    buy() { tone(520, 0.1, 'triangle', 0.2); tone(780, 0.15, 'triangle', 0.2, null, 0.08); tone(1040, 0.25, 'triangle', 0.2, null, 0.16); },
    nope() { tone(220, 0.15, 'square', 0.1, 160); },
    launch() { burst(0.8, 0.6, 300, 3000, 'bandpass'); tone(700, 1.4, 'sine', 0.06, 2600); },
    perfect() { [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, null, i * 0.07)); },
    bump() { tone(180, 0.22, 'square', 0.18, 60); burst(0.15, 0.3, 1500, 300); },
    turbo() { burst(0.6, 0.5, 600, 4000, 'bandpass'); tone(300, 0.5, 'sawtooth', 0.08, 900); },
    pickup() { tone(500, 0.2, 'sine', 0.2, 1200); },
    boom(big) {
      burst(1.4, 0.9, 1200, 80);
      tone(70, 0.8, 'sine', 0.7, 28);
      const n = 10 + big * 4;
      for (let i = 0; i < n; i++) burst(0.05, 0.25, 4000, 2000, 'highpass', 0.35 + Math.random() * 1.6);
    },
    plof() { burst(0.4, 0.5, 600, 100); tone(120, 0.3, 'sine', 0.3, 50); },
    fart() { tone(55 + Math.random() * 35, 0.2, 'sawtooth', 0.2, 35); burst(0.2, 0.15, 250, 80); },
    moo() { tone(160, 0.8, 'sawtooth', 0.14, 110); tone(80, 0.8, 'sawtooth', 0.08, 70); },
    oink() { tone(520, 0.12, 'square', 0.1, 300); tone(470, 0.12, 'square', 0.1, 280, 0.16); },
    flush() { burst(1.4, 0.5, 1400, 200); burst(0.6, 0.25, 3000, 800, 'bandpass', 0.3); },
    fizz() { burst(1.2, 0.45, 3000, 7000, 'highpass'); },
    pop() { tone(1200, 0.08, 'square', 0.25, 300); burst(0.1, 0.4, 4000, 1000, 'highpass'); },
    roar() { burst(1.6, 0.6, 200, 1600, 'bandpass'); },
    wobble() { tone(500, 0.6, 'sine', 0.12, 900); tone(900, 0.6, 'sine', 0.12, 450, 0.6); },
    launchFor(id) {
      const f = { cola: 'fizz', wc: 'flush', koe: 'moo', varken: 'oink', champagne: 'pop', ufo: 'wobble', jager: 'roar', hover: 'roar', stealth: 'roar', nasa: 'roar' }[id];
      if (f) sfx[f]();
      if (f !== 'wobble') sfx.launch();
    },
  };

  // ---------- canvas ----------
  const cv = $('game'), cx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- state ----------
  let state = 'shop';       // shop | ignite | flight | boom | result
  let st = L.stats(save);
  let rocket = null;
  let cam = { x: 0, y: 0, ppm: 6, anchor: 0.78 };
  let objects = [], parts = [], texts = [];
  let nextSpawnY = 12;
  let steer = 0, steerPointer = null, keys = { l: false, r: false };
  let shake = 0, time = 0;
  let ign = null;           // fuse minigame
  let boomT = 0, flightZone = 0, reachedEnd = false;
  let ambientT = 1;
  let scroll = { cloud: 0, star: 0 };
  let env = { flash: 0, next: 2, bolt: null };   // lightning in the clouds
  let tiltSteer = 0, stageShown = 1, lastPuff = false;

  const stars = Array.from({ length: 160 }, (_, i) => ({ x: hash(i), y: hash(i + 500), s: 0.5 + hash(i + 900) * 1.8, p: hash(i + 1300) * 6.28 }));
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: hash(i + 40), y: hash(i + 80), w: 70 + hash(i + 120) * 120 }));

  function w2s(x, y) {
    return [W / 2 + (x - cam.x) * cam.ppm, H * cam.anchor - (y - cam.y) * cam.ppm];
  }

  // ---------- particles ----------
  function part(ax, ay, o) {
    if (parts.length > 1400) parts.shift();
    parts.push(Object.assign({ ax, ay, ox: 0, oy: 0, vx: 0, vy: 0, g: 0, drag: 1, life: 1, max: 1, size: 3, color: '#fff', glow: true, grow: 0 }, o));
  }
  function floatText(ax, ay, text, color) {
    texts.push({ ax, ay, oy: 0, text, color: color || '#ffd23f', life: 1 });
  }

  const PALETTES = [
    ['#ff4d6d', '#ffd23f', '#ffffff'],
    ['#4cc9f0', '#80ffdb', '#ffffff'],
    ['#c77dff', '#ff9f1c', '#ffd6ff'],
    ['#ffd23f', '#ffe8a3', '#ff8c1a'],
    ['#ff0054', '#ffbd00', '#00f5d4'],
    ['#4361ee', '#4cc9f0', '#ffffff', '#ffd23f'],
  ];
  // mode: undefined = full burst, 'dim' = far-away neighbour fireworks,
  // 'small' = the little follow-up bursts of a crossette
  const EXHAUST = {
    fire: ['#ffb703', '#fff6c8'], blue: ['#4cc9f0', '#ffffff'], foam: ['#c8a27a', '#ffffff', '#f1e3c4'],
    water: ['#90e0ef', '#ffffff'], gas: ['#9acd32', '#c5e478'], bubbles: ['#ffd23f', '#fff8e0'], beam: ['#7cfc00', '#c8ffb0'],
  };

  function firework(ax, ay, scale, pal, mode) {
    const dim = mode === 'dim', small = mode === 'small';
    const rings = dim || small ? 1 : 2 + Math.floor(scale);
    for (let k = 0; k < rings; k++) {
      const n = Math.floor((dim ? 26 : small ? 22 : 50) + scale * 18);
      const sp = (dim ? 90 : small ? 280 : 520 + scale * 140) * (1 - k * 0.22);
      const col = pal[k % pal.length];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.3;
        const v = sp * rand(0.85, 1.1);
        part(ax, ay, {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: dim ? 40 : 70, drag: dim ? 0.985 : 0.94,
          life: rand(0.8, 1.3) * (dim ? 0.8 : 1), size: dim ? 1.8 : rand(2, 3.4), color: col, sparkle: true,
        });
      }
    }
    if (!dim) {
      for (let i = 0; i < (small ? 6 : 30); i++) part(ax, ay, { vx: rand(-90, 90), vy: rand(-90, 90), drag: 0.95, life: rand(0.2, 0.45), size: rand(10, 22), color: '#fff6c8' });
    }
  }

  // The final bang, shaped by the rocket type.
  function bang(kind, ax, ay, scale, pal) {
    part(ax, ay, { life: 0.22, max: 0.22, size: 50 + scale * 20, grow: 50, color: '#fff8e0' });
    const at = (ms, fn) => setTimeout(fn, ms);
    switch (kind) {
      case 'big': { // Dikke Bertha: a huge burst, then a ring of crackling follow-ups
        firework(ax, ay, scale * 1.7, pal);
        const d = (150 + scale * 40) / cam.ppm;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          at(200 + k * 25, () => { firework(ax + Math.cos(a) * d, ay + Math.sin(a) * d, 0.5, pal, 'small'); burst(0.08, 0.3, 3000, 1500, 'highpass'); });
        }
        break;
      }
      case 'willow': // Gierpijl: long golden trails drooping down
        for (let i = 0; i < 120; i++) {
          const a = Math.random() * Math.PI * 2, v = rand(250, 480);
          part(ax, ay, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 190, drag: 0.94, life: rand(1.1, 1.7), size: rand(1.8, 2.6), color: Math.random() < 0.6 ? '#ffcf6b' : '#ffb347', sparkle: true });
        }
        break;
      case 'ring': // Lange Brander: two crisp tilted rings
        [[560, pal[0]], [360, '#ffffff']].forEach(([v, col]) => {
          for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2;
            part(ax, ay, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, g: 50, drag: 0.94, life: rand(0.9, 1.2), size: 2.6, color: col, sparkle: true });
          }
        });
        break;
      case 'gold': // Goudzoeker: gold glitter and a shower of coins
        firework(ax, ay, scale, ['#ffd23f', '#fff3b0', '#ffb703']);
        for (let i = 0; i < 26; i++) part(ax, ay, { vx: rand(-260, 260), vy: rand(-320, 40), g: 520, drag: 0.98, life: rand(1, 1.5), size: 5, color: '#ffd23f', glow: false });
        break;
      case 'foam': // cola: a brown fountain of foam
        for (let i = 0; i < 90; i++) part(ax, ay, { vx: rand(-300, 300), vy: rand(-380, 120), g: 420, drag: 0.97, life: rand(0.8, 1.4), size: rand(3, 7), color: Math.random() < 0.6 ? '#c8a27a' : '#ffffff', glow: false });
        break;
      case 'paper': // toilet: streamers of toilet paper
        firework(ax, ay, scale * 0.7, ['#ffffff', '#cfe8ff']);
        for (let i = 0; i < 40; i++) part(ax, ay, { vx: rand(-200, 200), vy: rand(-260, 40), g: 90, drag: 0.97, life: rand(1.2, 1.8), size: rand(3, 5), color: '#ffffff', glow: false });
        floatText(ax, ay, '🧻🧻🧻', '#ffffff');
        break;
      case 'confetti': // cow and pig: a party, nobody gets hurt
        for (let i = 0; i < 140; i++) part(ax, ay, { vx: rand(-320, 320), vy: rand(-360, 160), g: 160, drag: 0.95, life: rand(1, 1.6), size: rand(2, 4), color: ['#ff4d6d', '#ffd23f', '#4cc9f0', '#80ffdb', '#c77dff'][i % 5], glow: false });
        floatText(ax, ay, T(TYPE().id === 'varken' ? 'oink' : 'moo'), '#ffffff');
        break;
      case 'fireball': // gas bottle: one huge fireball
        for (let i = 0; i < 50; i++) part(ax, ay, { vx: rand(-220, 220), vy: rand(-220, 220), drag: 0.92, life: rand(0.6, 1.1), size: rand(14, 30), grow: 40, color: ['#ff4d00', '#ff8c1a', '#ffd23f'][i % 3] });
        for (let i = 0; i < 30; i++) part(ax, ay, { vx: rand(-120, 120), vy: rand(-160, 40), drag: 0.95, life: rand(1.2, 2), size: 10, grow: 30, color: '#555', glow: false });
        firework(ax, ay, scale, pal);
        break;
      case 'banana': // golden-yellow willow
        for (let i = 0; i < 110; i++) {
          const a = Math.random() * Math.PI * 2, v = rand(250, 460);
          part(ax, ay, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 180, drag: 0.94, life: rand(1.1, 1.6), size: 2.4, color: Math.random() < 0.7 ? '#ffe066' : '#fff3b0', sparkle: true });
        }
        break;
      case 'carrot':
        firework(ax, ay, scale, ['#f77f00', '#2b9348', '#fcbf49']);
        break;
      case 'champagne': // gold glitter and rising bubbles
        firework(ax, ay, scale, ['#ffd23f', '#fff8e0', '#f1e3c4']);
        for (let i = 0; i < 60; i++) part(ax, ay, { vx: rand(-160, 160), vy: rand(-60, 60), g: -140, drag: 0.97, life: rand(1, 1.8), size: rand(2, 4), color: '#fff8e0' });
        break;
      case 'kaboom': // cartoon: a big bang with a big word
        firework(ax, ay, scale * 1.4, ['#ff4d6d', '#ffd23f', '#ffffff']);
        floatText(ax, ay, T('kaboom'), '#ffd23f');
        break;
      case 'jet': // the pilot ejects with a parachute
        firework(ax, ay, scale, ['#ffffff', '#4cc9f0', '#ff4d6d']);
        floatText(ax, ay, T('eject'), '#ffffff');
        break;
      case 'ufo': // green rings, and the alien waves goodbye
        [[540, '#7cfc00'], [340, '#c8ffb0']].forEach(([v, col]) => {
          for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            part(ax, ay, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4, g: 30, drag: 0.94, life: rand(0.9, 1.2), size: 2.6, color: col, sparkle: true });
          }
        });
        floatText(ax, ay, '👽👋', '#7cfc00');
        break;
      case 'multi': // Tweetrapper: three bursts in a row
        firework(ax, ay, scale, pal);
        at(130, () => firework(ax - 70 / cam.ppm, ay + 50 / cam.ppm, scale * 0.7, PALETTES[(save.evo + 1) % PALETTES.length]));
        at(260, () => firework(ax + 70 / cam.ppm, ay + 80 / cam.ppm, scale * 0.7, PALETTES[(save.evo + 2) % PALETTES.length]));
        break;
      default:
        firework(ax, ay, scale, pal);
    }
  }

  // ---------- world objects ----------
  function spawnOne(y) {
    // half of everything lands close to the flight path, so a straight
    // first flight still picks something up
    const spanM = (W * (Math.random() < 0.5 ? 0.12 : 0.42)) / cam.ppm;
    const x = rocket.x + rocket.vx * 0.4 + rand(-spanM, spanM);
    // the asteroid belt and alien space are busier
    const obst = y > 14000 && y < 21000 ? 0.5 : y > 21000 ? 0.42 : 0.31;
    const roll = Math.random() * 0.69 / (1 - obst) ;
    const coinVal = Math.max(1, Math.round((1 + y / 120) * st.coin));
    if (roll < 0.58 || y < 25) {
      if (Math.random() < 0.3) {
        for (let i = 0; i < 4; i++) objects.push({ type: 'coin', x, y: y + (i * 34) / cam.ppm, r: 11, v: coinVal, vxs: 0 });
      } else objects.push({ type: 'coin', x, y, r: 11, v: coinVal, vxs: 0 });
    } else if (roll < 0.65) {
      objects.push({ type: 'fuel', x, y, r: 14, vxs: 0 });
    } else if (roll < 0.69) {
      objects.push({ type: 'star', x, y, r: 14, vxs: 0 });
    } else {
      let type = 'bird';
      if (y > 21000) type = Math.random() < 0.5 ? 'alien' : Math.random() < 0.6 ? 'meteor' : 'sat';
      else if (y > 14000) type = Math.random() < 0.7 ? 'rock' : 'meteor';
      else if (y > 6000) type = Math.random() < 0.4 ? 'sat' : 'meteor';
      else if (y > 4200) type = Math.random() < 0.5 ? 'sat' : 'meteor';
      else if (y > 2600) type = Math.random() < 0.6 ? 'meteor' : 'sat';
      else if (y > 1400) type = Math.random() < 0.5 ? 'plane' : 'balloon';
      else if (y > 500) type = Math.random() < 0.5 ? 'plane' : 'bird';
      else if (y > 150) type = Math.random() < 0.3 ? 'balloon' : 'bird';
      const dir = Math.random() < 0.5 ? -1 : 1;
      const speed = { bird: 70, plane: 130, balloon: 15, sat: 50, meteor: 160, rock: 30, alien: 120 }[type];
      objects.push({ type, x, y, r: type === 'plane' ? 22 : 17, vxs: dir * speed * rand(0.7, 1.2), dir, hit: false, t: Math.random() * 6 });
    }
  }

  function updateObjects(dt) {
    const viewTop = rocket.y + (H * cam.anchor) / cam.ppm;
    while (rocket.vy > 0 && nextSpawnY < viewTop + 160 / cam.ppm) {
      spawnOne(nextSpawnY);
      nextSpawnY += rand(80, 150) / cam.ppm;
    }
    const [rx, ry] = w2s(rocket.x, rocket.y);
    const hx = rx + Math.sin(rocket.ang) * 30 * EVO().size, hy = ry - Math.cos(rocket.ang) * 30 * EVO().size;
    for (const o of objects) {
      o.t = (o.t || 0) + dt;
      if (o.vxs) {
        o.x += (o.vxs / cam.ppm) * dt;
        if (o.type === 'meteor') o.y -= (60 / cam.ppm) * dt;
      }
      if (o.dead) continue;
      let [sx, sy] = w2s(o.x, o.y);
      if (o.type === 'coin' && st.magnet && state === 'flight') {
        const d = Math.hypot(sx - hx, sy - hy);
        if (d < st.magnet) {
          const pull = Math.min(1, dt * 9);
          o.x += ((hx - sx) / cam.ppm) * pull;
          o.y -= ((hy - sy) / cam.ppm) * pull;
          [sx, sy] = w2s(o.x, o.y);
        }
      }
      if (state !== 'flight') continue;
      if (Math.hypot(sx - hx, sy - hy) < o.r + 16) touch(o, sx, sy);
    }
    objects = objects.filter((o) => !o.dead && o.y > rocket.y - (H * 1.2) / cam.ppm);
  }

  function touch(o, sx, sy) {
    if (o.type === 'coin') {
      o.dead = true;
      rocket.coins += o.v;
      floatText(o.x, o.y, '+' + o.v);
      sfx.coin();
      for (let i = 0; i < 6; i++) part(o.x, o.y, { vx: rand(-80, 80), vy: rand(-80, 80), life: 0.4, size: 2, color: '#ffd23f' });
    } else if (o.type === 'fuel') {
      o.dead = true;
      rocket.fuel += 0.7;
      rocket.fuelMax = Math.max(rocket.fuelMax, rocket.fuel);
      floatText(o.x, o.y, T('plusFuel'), '#ff8c1a');
      sfx.pickup(); vib(20);
    } else if (o.type === 'star') {
      o.dead = true;
      rocket.turboLeft++;
      floatText(o.x, o.y, T('plusTurbo'), '#80d8ff');
      sfx.pickup(); vib(20);
    } else if (!o.hit && st.stealth && Math.random() < 0.5) {
      o.hit = true;
      floatText(o.x, o.y, T('stealth'), '#c8ffb0');
    } else if (!o.hit) {
      o.hit = true; o.dead = o.type !== 'balloon' && o.type !== 'sat' && o.type !== 'plane';
      rocket.vx *= 0.5; rocket.vy *= 0.62;
      rocket.spin += (Math.random() < 0.5 ? -1 : 1) * Math.max(1.5, 6 - st.stab * 0.45);
      shake = 12; sfx.bump(); vib(60);
      floatText(rocket.x, rocket.y, T('ouch')[Math.floor(Math.random() * 4)], '#ff4d6d');
      const col = { bird: '#e0e0e0', meteor: '#a0703c', plane: '#cfd8dc', balloon: '#ff4d6d', sat: '#b0bec5', rock: '#6b6b75', alien: '#7cfc00' }[o.type];
      for (let i = 0; i < 14; i++) part(o.x, o.y, { vx: rand(-120, 120), vy: rand(-120, 60), g: 120, life: rand(0.5, 1), size: rand(2, 4), color: col, glow: false });
    }
  }

  // ---------- flow ----------
  const EVO = () => L.EVOS[save.evo];
  const TYPE = () => L.TYPES[save.type || 0];

  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function toast(text, ms) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('show'), ms || 900);
  }

  function goShop() {
    state = 'shop';
    resetCamera();
    show('result', false); show('hud', false); show('ignite', false);
    renderShop();
    show('shop', true);
  }

  function resetCamera() {
    cam.x = 0; cam.y = 0; cam.ppm = 6; cam.anchor = 0.78;
    objects = []; texts = [];
    rocket = L.newRocket(st, 1);
    rocket.burning = false;
  }

  function goIgnite() {
    audioInit();
    st = L.stats(save);
    state = 'ignite';
    resetCamera();
    show('shop', false); show('result', false);
    show('ignite', true); show('btn-light', true);
    $('ignite-hint').textContent = T(save.flights < 2 ? 'hintFirst' : 'hint');
    ign = null;
  }

  function light() {
    audioInit();
    if (state !== 'ignite' || ign) return;
    ign = { t: 0, dur: 2.6, speed: rand(3.6, 4.6), center: rand(0.62, 0.86), done: false };
    show('btn-light', false);
    $('ignite-hint').textContent = T('hintTap');
    loopStart('fuse', 'highpass', 3500, 0.7);
    loopSet('fuse', 0.25);
    vib(15);
  }

  function needle() { return 0.5 - 0.5 * Math.cos(ign.t * ign.speed); }

  function igniteTap() {
    if (!ign || ign.done || ign.t < 0.2) return;
    const d = Math.abs(needle() - ign.center);
    if (d < st.perfect) launch(1.3, T('perfect'));
    else if (d < st.perfect * 2.6) launch(1.12, T('good'));
    else launch(1.0, T('meh'));
  }

  function launch(boost, label) {
    ign.done = true;
    loopStop('fuse');
    show('ignite', false);
    if (st.autoBoost && boost < 1.2) { boost = 1.2; label = T('good'); }
    rocket = L.newRocket(st, boost);
    nextSpawnY = 12;
    objects = [];
    flightZone = 0; reachedEnd = false; stageShown = 1; lastPuff = false;
    state = 'flight';
    if (save.flights < 3) {
      $('hud-zone').textContent = T('steerHint');
      $('hud-zone').classList.add('show', 'hint');
      hudZoneT = 3.5;
    }
    show('hud', true);
    updateTurboBtn();
    toast(label);
    if (boost >= 1.3) { sfx.perfect(); vib(50); }
    sfx.launchFor(TYPE().id); vib(30);
    loopStart('thrust', 'lowpass', 500, 0.8);
    for (let i = 0; i < 40; i++) part(0, 0, { vx: rand(-160, 160), vy: rand(-80, 10), g: 60, drag: 0.95, life: rand(0.6, 1.4), size: rand(6, 14), color: '#9aa', glow: false, grow: 14 });
  }

  function useTurbo() {
    if (state !== 'flight' || rocket.turboLeft <= 0 || rocket.turboT > 0) return;
    rocket.turboLeft--;
    rocket.turboT = 1.2;
    sfx.turbo(); vib(40); shake = 6;
    toast('⚡ TURBO!', 600);
    updateTurboBtn();
  }

  function updateTurboBtn() {
    const on = state === 'flight' && rocket && rocket.turboLeft > 0;
    show('btn-turbo', on);
    if (on) $('turbo-n').textContent = '×' + rocket.turboLeft;
  }

  function explode(ground) {
    state = 'boom';
    boomT = 0;
    loopStop('thrust');
    show('btn-turbo', false);
    const big = save.evo + save.lv.knal / 5;
    if (ground) {
      sfx.plof(); vib(80);
      for (let i = 0; i < 30; i++) part(rocket.x, rocket.y, { vx: rand(-100, 100), vy: rand(-140, 0), g: 200, life: rand(0.5, 1), size: rand(3, 6), color: '#ff8c1a' });
      toast(T('plof'), 900);
    } else {
      const type = TYPE();
      sfx.boom(big + (type.burst === 'big' ? 6 : 0));
      if (type.burst === 'big') tone(45, 1.1, 'sine', 0.8, 25);
      if (type.burst === 'willow') tone(2200, 0.9, 'sine', 0.05, 500);
      if (type.burst === 'confetti') sfx[type.id === 'varken' ? 'oink' : 'moo']();
      if (type.burst === 'foam') sfx.fizz();
      if (type.burst === 'paper') sfx.flush();
      if (type.burst === 'fireball') tone(40, 1.3, 'sine', 0.8, 22);
      vib(type.burst === 'big' ? 250 : 140);
      shake = type.burst === 'big' ? 30 : 16;
      bang(type.burst, rocket.x, rocket.y, (1 + big * 0.5) * (0.5 + 0.5 * type.bang), PALETTES[save.evo % PALETTES.length]);
      if (reachedEnd) {
        for (let k = 0; k < 5; k++) setTimeout(() => firework(rocket.x + rand(-40, 40) / cam.ppm, rocket.y + rand(-30, 60) / cam.ppm, 2, PALETTES[k % PALETTES.length]), 250 * k);
      }
    }
  }

  function showResult() {
    state = 'result';
    show('hud', false);
    const maxH = rocket.maxY;
    const bonus = L.heightBonus(maxH, st);
    let zoneBonus = 0, zoneName = '';
    const zi = L.zoneIndex(maxH);
    while (save.zones < zi) {
      save.zones++;
      zoneBonus += L.ZONES[save.zones].bonus;
      zoneName = I.zone(save.zones, L);
    }
    const total = rocket.coins + bonus + zoneBonus;
    const newRecord = maxH > save.record + 0.5 && save.flights > 0;
    save.coins += total;
    save.record = Math.max(save.record, maxH);
    save.flights++;
    if (maxH >= L.MOON_Y) save.moon++;
    if (reachedEnd) save.ends++;
    store();

    $('res-title').textContent = reachedEnd ? T('endTitle') : (maxH < 5 ? T('plofTitle') : T('booms')[Math.floor(Math.random() * 4)]);
    $('res-height').textContent = fmt(maxH) + ' m';
    $('res-coins').textContent = fmt(rocket.coins) + ' 🪙';
    $('res-bonus').textContent = fmt(bonus) + ' 🪙';
    show('res-zone-line', zoneBonus > 0);
    $('res-zone').textContent = zoneName + ' +' + fmt(zoneBonus);
    show('res-record', newRecord);
    $('res-total').textContent = '+' + fmt(total) + ' 🪙';
    show('result', true);
    if (newRecord || zoneBonus) { sfx.perfect(); vib(60); }
  }

  // ---------- shop ----------
  function renderShop() {
    st = L.stats(save);
    $('shop-coins').textContent = fmt(save.coins);
    $('shop-record').textContent = fmt(save.record) + ' m';
    $('shop-flights').textContent = save.flights;
    const gi = Math.max(0, L.BODIES.findIndex((b) => b.y > save.record));
    const goal = L.BODIES.find((b) => b.y > save.record) || L.BODIES[L.BODIES.length - 1];
    const from = gi > 0 && goal.y > save.record ? L.BODIES[gi - 1].y : 0;
    $('moon-progress').style.width = clamp(((save.record - from) / (goal.y - from)) * 100, 0, 100) + '%';
    $('goal-ico').textContent = goal.icon;
    const evo = EVO(), next = L.EVOS[save.evo + 1];
    $('evo-name').textContent = I.evo(save.evo, L);
    $('evo-mult').textContent = T('power') + ' ×' + evo.mult.toFixed(2);
    const be = $('btn-evolve');
    if (!next) {
      be.textContent = T('maxed'); be.disabled = true; be.className = 'buy max';
      $('evo-need').textContent = save.moon ? T('beenMoon')(save.moon) : T('toMoon');
    } else {
      be.className = 'buy';
      be.textContent = '⬆ ' + I.evo(save.evo + 1, L) + ' · ' + fmt(next.cost) + ' 🪙';
      const reached = save.record >= next.need;
      be.disabled = !reached || save.coins < next.cost;
      $('evo-need').textContent = reached ? T('power') + ' ×' + next.mult.toFixed(2) : T('reachFirst')(fmt(next.need));
    }
    drawPreview();
    renderChoices();
    $('btn-tilt').classList.toggle('on', !!save.tilt);

    const box = $('upgrades');
    box.innerHTML = '';
    for (const u of L.UPGRADES) {
      const lv = save.lv[u.id];
      const c = L.cost(u, lv);
      const max = lv >= u.max;
      const can = !max && save.coins >= c;
      const el = document.createElement('div');
      el.className = 'upg' + (can ? ' can' : '');
      const bars = Array.from({ length: Math.min(u.max, 10) }, (_, i) => {
        const filled = u.max > 10 ? lv >= (i + 1) * (u.max / 10) : lv > i;
        return '<i class="' + (filled ? 'on' : '') + '"></i>';
      }).join('');
      el.innerHTML =
        '<div class="top"><span class="ico">' + u.icon + '</span><span>' + I.upgName(u) + ' <small>' + lv + '/' + u.max + '</small></span></div>' +
        '<div class="desc">' + I.upgDesc(u) + '</div><div class="lvl">' + bars + '</div>';
      const b = document.createElement('button');
      b.className = 'buy' + (max ? ' max' : '');
      b.textContent = max ? 'MAX' : fmt(c) + ' 🪙';
      b.disabled = !can;
      b.addEventListener('click', () => buy(u));
      el.appendChild(b);
      box.appendChild(el);
    }
  }

  function chip(icon, name, lines, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'chip ' + cls;
    b.innerHTML = '<span class="ci">' + icon + '</span><span class="cn">' + name + '</span>' +
      lines.map((l) => '<span class="cs">' + l + '</span>').join('');
    b.addEventListener('click', onClick);
    return b;
  }

  function renderChoices() {
    const sites = $('sites');
    sites.innerHTML = '';
    L.SITES.forEach((s, i) => {
      const open = save.record >= s.need;
      const sub = open ? '🪙 ×' + s.mult.toLocaleString(T('locale')) : '🔒 ' + fmt(s.need) + ' m';
      sites.appendChild(chip(s.icon, I.site(i, L), [sub], (i === save.site ? 'sel' : '') + (open ? '' : ' locked'), () => pickSite(i)));
    });
    ['fire', 'fun', 'machine'].forEach((c) => { $('types-' + c).innerHTML = ''; });
    L.TYPES.forEach((t, i) => {
      const owned = save.types.includes(i), open = save.record >= t.need;
      const lines = [I.typeDesc(i, L)];
      if (!owned) lines.push(open ? fmt(t.cost) + ' 🪙' : '🔒 ' + fmt(t.need) + ' m');
      const cls = (i === save.type ? 'sel' : '') + (!owned && !open ? ' locked' : '') + (!owned && open && save.coins >= t.cost ? ' buyable' : '');
      $('types-' + t.cat).appendChild(chip(t.icon, I.typeName(i, L), lines, cls, () => pickType(i)));
    });
  }

  function pickSite(i) {
    audioInit();
    const s = L.SITES[i];
    if (save.record < s.need) { sfx.nope(); toast(T('reachFirst')(fmt(s.need)), 1200); return; }
    save.site = i; store();
    tone(660, 0.12, 'triangle', 0.15); vib(10);
    renderShop();
  }

  function pickType(i) {
    audioInit();
    const t = L.TYPES[i];
    if (!save.types.includes(i)) {
      if (save.record < t.need) { sfx.nope(); toast(T('reachFirst')(fmt(t.need)), 1200); return; }
      if (save.coins < t.cost) { sfx.nope(); return; }
      save.coins -= t.cost;
      save.types.push(i);
      sfx.perfect(); vib(60);
      toast(t.icon + ' ' + I.typeName(i, L), 1200);
    } else {
      tone(660, 0.12, 'triangle', 0.15); vib(10);
    }
    save.type = i; store();
    renderShop();
  }

  function buy(u) {
    audioInit();
    const lv = save.lv[u.id];
    const c = L.cost(u, lv);
    if (lv >= u.max || save.coins < c) { sfx.nope(); return; }
    save.coins -= c;
    save.lv[u.id]++;
    store(); sfx.buy(); vib(15);
    renderShop();
  }

  function evolve() {
    audioInit();
    const next = L.EVOS[save.evo + 1];
    if (!next || save.record < next.need || save.coins < next.cost) { sfx.nope(); return; }
    save.coins -= next.cost;
    save.evo++;
    store();
    sfx.perfect(); vib(80);
    toast(T('evolved') + I.evo(save.evo, L), 1400);
    renderShop();
  }

  function drawPreview() {
    const pc = $('evo-preview'), p = pc.getContext('2d');
    p.clearRect(0, 0, pc.width, pc.height);
    const g = p.createRadialGradient(60, 70, 5, 60, 70, 70);
    g.addColorStop(0, 'rgba(255,210,63,.35)'); g.addColorStop(1, 'rgba(255,210,63,0)');
    p.fillStyle = g; p.fillRect(0, 0, pc.width, pc.height);
    drawRocket(p, 60, 112, 0, EVO(), TYPE().len > 1.2 ? 0.95 : 1.1, 0, TYPE(), 1);
  }

  // ---------- drawing ----------
  function drawRocket(c, x, y, ang, evo, scale, flame, type, stageN) {
    type = type || L.TYPES[0];
    if (type.cat !== 'fire') { drawCraft(c, x, y, ang, evo, scale, flame, type, stageN || 1); return; }
    const staged = stageN > 1;
    const s = scale * evo.size;
    const two = type.stages > 1;
    const base = two && staged ? -20 : 0; // after staging only the top stage flies on
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(s * type.w, s * type.len);
    c.translate(0, -base);
    // flame
    if (flame) {
      const turbo = flame > 1;
      const len = (turbo ? 52 : 26) + Math.random() * 12;
      const gr = c.createLinearGradient(0, base, 0, base + len);
      gr.addColorStop(0, turbo ? '#e0f7ff' : '#fff6c8');
      gr.addColorStop(0.35, turbo ? '#4cc9f0' : '#ffb703');
      gr.addColorStop(1, turbo ? 'rgba(58,134,255,0)' : 'rgba(255,77,0,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(-6, base); c.quadraticCurveTo(0, base + len * 1.2, 6, base); c.closePath();
      c.fill();
      if (!staged) {
        for (let b = 0; b < evo.boosters; b++) {
          const bx = b === 0 ? -11 : 11;
          c.beginPath(); c.moveTo(bx - 3, -2); c.quadraticCurveTo(bx, len * 0.8, bx + 3, -2); c.fill();
        }
      }
    }
    if (!(two && staged)) {
      // stick
      c.fillStyle = '#c8955a';
      c.fillRect(-1.2, 0, 2.4, 58);
      // boosters
      for (let b = 0; b < evo.boosters; b++) {
        const bx = b === 0 ? -13 : 8;
        c.fillStyle = evo.nose;
        c.fillRect(bx, -24, 5, 22);
        c.beginPath(); c.moveTo(bx, -24); c.lineTo(bx + 2.5, -31); c.lineTo(bx + 5, -24); c.fill();
      }
      // fins
      c.fillStyle = evo.nose;
      if (evo.fins >= 2) {
        c.beginPath(); c.moveTo(-7, -14); c.lineTo(-15, 2); c.lineTo(-7, 0); c.fill();
        c.beginPath(); c.moveTo(7, -14); c.lineTo(15, 2); c.lineTo(7, 0); c.fill();
      }
    }
    // body
    const bg = c.createLinearGradient(-7, 0, 7, 0);
    bg.addColorStop(0, shadeHex(evo.body, -40)); bg.addColorStop(0.45, shadeHex(evo.body, 35)); bg.addColorStop(1, shadeHex(evo.body, -55));
    c.fillStyle = bg;
    if (two) {
      c.fillRect(-7, -44, 14, 24);
      if (!staged) {
        c.fillStyle = '#555b6e'; c.fillRect(-7, -20, 14, 20);
        c.fillStyle = '#ffd23f'; c.fillRect(-7, -21, 14, 2);
      }
    } else {
      c.fillRect(-7, -44, 14, 44);
    }
    // stripes
    c.fillStyle = type.id === 'goud' ? '#ffd23f' : 'rgba(255,255,255,.85)';
    for (let i = 0; i < evo.stripes; i++) c.fillRect(-7, -36 + i * 9, 14, 3);
    if (type.id === 'dik') { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(-7, -40, 14, 2); c.fillRect(-7, -8, 14, 2); }
    if (type.id === 'gier') { c.fillStyle = '#b0bec5'; c.fillRect(7, -34, 3, 16); }
    if (!staged && evo.fins >= 3) { c.fillStyle = evo.nose; c.fillRect(-1.5, -12, 3, 14); }
    if (evo.fins >= 4) { c.fillStyle = '#4cc9f0'; c.beginPath(); c.arc(0, -30, 3.5, 0, 7); c.fill(); }
    // nose
    c.fillStyle = type.id === 'goud' ? '#ffd23f' : evo.nose;
    c.beginPath(); c.moveTo(-8, -44); c.lineTo(0, -62); c.lineTo(8, -44); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(-7, base - 3, 14, 3);
    c.restore();
  }

  const FLAME = {
    fire: ['#fff6c8', '#ffb703', 'rgba(255,77,0,0)'], blue: ['#ffffff', '#4cc9f0', 'rgba(58,134,255,0)'],
    foam: ['#ffffff', '#c8a27a', 'rgba(120,70,30,0)'], water: ['#ffffff', '#90e0ef', 'rgba(0,150,255,0)'],
    gas: ['#e9ffd0', '#9acd32', 'rgba(110,140,40,0)'], bubbles: ['#fff8e0', '#ffd23f', 'rgba(255,210,63,0)'],
  };

  // Everything that is not a firework rocket. Origin is the nozzle, up is -y,
  // about 62 px tall like the rockets.
  function drawCraft(c, x, y, ang, evo, scale, flame, t, stageN) {
    const id = t.id;
    const base = id === 'nasa' ? [0, -24, -42][stageN - 1] : 0; // dropped stages
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(scale * evo.size * 0.95, scale * evo.size * 0.95);
    c.translate(0, -base);
    const P = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.fill(); };
    const E = (ex, ey, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 7); c.fill(); };
    const R = (rx, ry, w, h, col) => { c.fillStyle = col; c.fillRect(rx, ry, w, h); };
    if (flame) {
      if (t.flame === 'beam' && flame === 1) {
        const g = c.createLinearGradient(0, -24, 0, 70);
        g.addColorStop(0, 'rgba(124,252,0,.6)'); g.addColorStop(1, 'rgba(124,252,0,0)');
        P([[-8, -24], [8, -24], [22, 70], [-22, 70]], g);
      } else {
        const cols = FLAME[flame > 1 ? 'blue' : t.flame] || FLAME.fire;
        const len = (flame > 1 ? 52 : t.flame === 'blue' ? 44 : 28) + Math.random() * 12;
        const g = c.createLinearGradient(0, base, 0, base + len);
        g.addColorStop(0, cols[0]); g.addColorStop(0.35, cols[1]); g.addColorStop(1, cols[2]);
        c.fillStyle = g;
        const fw = id === 'koe' || id === 'varken' || id === 'gas' ? 9 : 6;
        c.beginPath(); c.moveTo(-fw, base); c.quadraticCurveTo(0, base + len * 1.2, fw, base); c.closePath(); c.fill();
      }
    }
    switch (id) {
      case 'cola': // upside down: the spray comes out of the neck
        R(-4, -10, 8, 10, '#3b1f12'); P([[-4, -10], [-10, -20], [10, -20], [4, -10]], '#3b1f12');
        R(-10, -58, 20, 38, '#3b1f12'); E(0, -58, 10, 4, '#3b1f12');
        R(-10, -44, 20, 9, '#d62828'); R(-10, -41, 20, 2, '#ffffff');
        R(-7, -56, 3, 30, 'rgba(255,255,255,.25)');
        break;
      case 'wc':
        R(-11, -62, 22, 16, '#f1f1f1'); R(-11, -62, 22, 3, '#cfcfcf'); R(6, -58, 5, 2, '#9e9e9e');
        R(-12, -46, 24, 4, '#e0e0e0');
        E(0, -34, 14, 12, '#ffffff'); E(0, -37, 11, 6, '#cfe8ff');
        P([[-6, -24], [6, -24], [4, 0], [-4, 0]], '#eeeeee');
        break;
      case 'koe': case 'varken': { // head first, the gas comes out of the back
        const pig = id === 'varken', body = pig ? '#f4a6b8' : '#ffffff', dark = pig ? '#e48aa0' : '#333333';
        [[-16, -42], [-16, -18], [12, -42], [12, -18]].forEach(([lx, ly]) => R(lx, ly, 4, 6, dark));
        E(0, -28, 13, 24, body);
        if (!pig) { E(-5, -34, 5, 7, '#222'); E(6, -20, 4, 5, '#222'); E(4, -42, 3, 3, '#222'); }
        E(0, -54, 9, 8, body);
        if (pig) {
          E(0, -58, 5, 3.5, '#e48aa0'); R(-2.5, -59, 1.5, 2, '#a0526a'); R(1, -59, 1.5, 2, '#a0526a');
          P([[-8, -57], [-6, -64], [-3, -58]], '#e48aa0'); P([[8, -57], [6, -64], [3, -58]], '#e48aa0');
        } else {
          E(0, -58, 6, 3.5, '#f4b6c2');
          P([[-7, -58], [-12, -64], [-5, -60]], '#dddddd'); P([[7, -58], [12, -64], [5, -60]], '#dddddd');
        }
        R(-3.5, -53, 2, 2, '#111'); R(1.5, -53, 2, 2, '#111');
        c.strokeStyle = dark; c.lineWidth = 2; c.beginPath(); c.moveTo(3, -4); c.quadraticCurveTo(9, 2, 4, 7); c.stroke();
        break;
      }
      case 'gas':
        R(-11, -50, 22, 48, '#d62828'); E(0, -50, 11, 6, '#d62828'); E(0, -2, 11, 3, '#a01818');
        R(-5, -60, 10, 8, '#9e9e9e'); R(-8, -62, 16, 3, '#bdbdbd');
        R(-11, -36, 22, 3, '#ffffff'); R(-7, -48, 3, 40, 'rgba(255,255,255,.2)');
        break;
      case 'banaan':
        c.lineCap = 'round';
        c.strokeStyle = '#ffd23f'; c.lineWidth = 13; c.beginPath(); c.moveTo(-2, -4); c.quadraticCurveTo(14, -32, 2, -60); c.stroke();
        c.strokeStyle = '#e0b400'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(12, -32, 2, -56); c.stroke();
        R(-4, -5, 4, 5, '#5a3d1e'); R(0, -66, 4, 5, '#5a3d1e');
        break;
      case 'wortel':
        P([[-10, -52], [10, -52], [0, 0]], '#f77f00');
        c.strokeStyle = '#c75f00'; c.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(-6 + k * 1.5, -44 + k * 10); c.lineTo(-1 + k * 1.5, -44 + k * 10); c.stroke(); }
        P([[-2, -52], [-9, -66], [0, -56]], '#2b9348'); P([[2, -52], [9, -66], [0, -56]], '#2b9348'); P([[-1.5, -52], [0, -72], [1.5, -52]], '#55a630');
        break;
      case 'champagne': // neck down, the cork is long gone
        R(-4, -10, 8, 10, '#d4a017'); P([[-4, -10], [-10, -22], [10, -22], [4, -10]], '#1b4332');
        R(-10, -60, 20, 38, '#1b4332'); E(0, -60, 10, 4, '#1b4332');
        R(-10, -46, 20, 12, '#f1e3c4'); R(-10, -46, 20, 2, '#d4a017');
        R(-7, -58, 3, 34, 'rgba(255,255,255,.2)');
        break;
      case 'cartoon':
        P([[-9, -14], [-17, 4], [-9, 0]], '#ffffff'); P([[9, -14], [17, 4], [9, 0]], '#ffffff');
        R(-9, -46, 18, 46, '#e63946'); P([[-9, -46], [0, -64], [9, -46]], '#e63946');
        R(-9, -30, 18, 9, '#ffffff');
        c.fillStyle = '#e63946'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('TNT', 0, -23);
        E(0, -50, 3.5, 3.5, '#a8dadc');
        break;
      case 'jager': case 'hover': case 'stealth': { // seen from above, nose up
        const col = id === 'jager' ? '#9aa5b1' : id === 'hover' ? '#5b6b4a' : '#3a3f47';
        if (id === 'stealth') {
          P([[0, -64], [6, -44], [20, -14], [8, -8], [7, 0], [-7, 0], [-8, -8], [-20, -14], [-6, -44]], col);
          P([[-7, -4], [-13, 4], [-5, 0]], col); P([[7, -4], [13, 4], [5, 0]], col);
          E(0, -32, 4.5, 4.5, '#555c66');
          c.strokeStyle = '#2a2e34'; c.lineWidth = 1;
          c.save(); c.translate(0, -32); c.rotate(time * 20); c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.moveTo(0, -4); c.lineTo(0, 4); c.stroke(); c.restore();
        } else {
          if (id === 'jager') P([[-4, -30], [-20, -10], [-20, -6], [-4, -12], [4, -12], [20, -6], [20, -10], [4, -30]], col);
          else { P([[-4, -32], [-22, -24], [-22, -18], [-4, -20], [4, -20], [22, -18], [22, -24], [4, -32]], col); E(-7, -36, 3, 5, '#3f4a33'); E(7, -36, 3, 5, '#3f4a33'); }
          P([[-4, -50], [0, -64], [4, -50], [5, 0], [-5, 0]], col);
          P([[-4, -6], [-11, 2], [-4, -1]], col); P([[4, -6], [11, 2], [4, -1]], col);
        }
        E(0, -50, 2.6, 7, '#4cc9f0');
        break;
      }
      case 'ufo':
        E(0, -38, 10, 9, 'rgba(160,230,255,.6)'); E(0, -35, 4, 4, '#55dd55');
        R(-2, -37, 1.2, 1.5, '#111'); R(1, -37, 1.2, 1.5, '#111');
        E(0, -30, 22, 7, '#9aa5b1'); E(0, -31, 22, 3, '#c7d0d9');
        for (let k = -2; k <= 2; k++) E(k * 8, -28, 1.8, 1.8, Math.sin(time * 6 + k) > 0 ? '#ffd23f' : '#ff4d6d');
        break;
      case 'nasa': { // three stages; spent ones are gone
        if (stageN < 2) { P([[-8, -8], [-14, 2], [-8, 0]], '#111'); P([[8, -8], [14, 2], [8, 0]], '#111'); R(-8, -24, 16, 24, '#f1f1f1'); R(-8, -12, 16, 4, '#111'); }
        if (stageN < 3) { R(-7, -42, 14, 18, '#f1f1f1'); R(-7, -30, 14, 3, '#111'); }
        R(-6, -54, 12, 12, '#f1f1f1'); P([[-6, -54], [0, -66], [6, -54]], '#f1f1f1');
        R(-1, -73, 2, 8, '#bbbbbb'); R(-6, -50, 12, 2, '#111');
        break;
      }
    }
    c.restore();
  }

  function shadeHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function mixHex(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(x >> 16, y >> 16, t)), g = Math.round(lerp((x >> 8) & 255, (y >> 8) & 255, t)), bl = Math.round(lerp(x & 255, y & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  const SKY = [
    { y: 0,    top: '#0d1840', bot: '#3d2a5c' },
    { y: 700,  top: '#0a1436', bot: '#1f2a66' },
    { y: 1600, top: '#060b26', bot: '#152056' },
    { y: 3000, top: '#020310', bot: '#080b2a' },
    { y: 6000, top: '#000000', bot: '#05061a' },
  ];
  // the glow on the horizon differs per launch site
  const SITE_TINT = ['#3d2a5c', '#5a2d55', '#5c3a2a', '#203a5c', '#2a3550'];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = i === 0 ? { y: 0, top: SKY[0].top, bot: SITE_TINT[save.site || 0] } : SKY[i], b = SKY[i + 1];
      if (h <= b.y) { const t = (h - a.y) / (b.y - a.y); return [mixHex(a.top, b.top, t), mixHex(a.bot, b.bot, t)]; }
    }
    return [SKY[SKY.length - 1].top, SKY[SKY.length - 1].bot];
  }

  function drawBackground(h) {
    const [top, bot] = skyAt(Math.max(0, h));
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

    // stars
    const starA = clamp(0.3 + h / 2500, 0.3, 1);
    cx.fillStyle = '#fff';
    for (const s of stars) {
      const y = ((s.y * H + scroll.star) % H + H) % H;
      cx.globalAlpha = starA * (0.6 + 0.4 * Math.sin(time * 2 + s.p));
      cx.fillRect(s.x * W, y, s.s, s.s);
    }
    cx.globalAlpha = 1;

    const au = bell(h, 1200, 1800, 3000, 3700);
    if (au > 0) drawAurora(au);
    const spaceA = clamp((h - 2600) / 800, 0, 1);
    if (spaceA > 0) drawSpace(h, spaceA);
    if (env.bolt && env.flash > 0.25) drawBolt();

    drawBodies(h);

    // clouds
    const cloudA = h < 120 ? h / 120 : h < 1600 ? 1 : clamp(1 - (h - 1600) / 800, 0, 1);
    if (cloudA > 0.01) {
      const loop = H * 1.6;
      for (const c of clouds) {
        const y = ((c.y * loop + scroll.cloud) % loop + loop) % loop - H * 0.3;
        const x = ((c.x * W * 1.4 - cam.x * cam.ppm * 0.3) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
        cx.fillStyle = 'rgba(150,160,210,' + (0.22 + env.flash * 0.35) * cloudA + ')';
        for (let i = 0; i < 4; i++) {
          cx.beginPath(); cx.ellipse(x + (i - 1.5) * c.w * 0.3, y + Math.sin(i * 2.1) * 8, c.w * 0.32, c.w * 0.18, 0, 0, 7); cx.fill();
        }
      }
    }

    // speed lines
    const sp = rocket ? Math.hypot(rocket.vx, rocket.vy) : 0;
    if (sp > 120 && (state === 'flight')) {
      cx.strokeStyle = 'rgba(255,255,255,' + clamp((sp - 120) / 400, 0, 0.35) + ')';
      cx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - rocket.vx * 0.08, y + rocket.vy * 0.08); cx.stroke();
      }
    }
  }

  function bell(h, a, b, c, d) {
    if (h <= a || h >= d) return 0;
    if (h < b) return (h - a) / (b - a);
    if (h <= c) return 1;
    return (d - h) / (d - c);
  }

  // Stratosphere: northern lights.
  function drawAurora(a) {
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    const cols = ['80,255,170', '150,90,255', '60,200,255'];
    for (let k = 0; k < 3; k++) {
      const baseY = H * (0.14 + k * 0.14) + Math.sin(time * 0.2 + k) * 12;
      for (let x = 0; x <= W; x += 6) {
        const y = baseY + Math.sin(x * 0.012 + time * 0.6 + k * 2) * 28 + Math.sin(x * 0.031 - time * 0.4) * 10;
        [0.42, 0.26, 0.14, 0.06].forEach((al, j) => {
          cx.fillStyle = 'rgba(' + cols[k] + ',' + al * a * 0.6 + ')';
          cx.fillRect(x, y + j * 22, 6, 22);
        });
      }
    }
    cx.restore();
  }

  // The next destination grows as you get closer; the one you passed slides away below.
  function drawBodies(h) {
    const B = L.BODIES;
    let n = B.findIndex((b) => b.y > h);
    if (n < 0) n = B.length - 1;
    if (n > 0) {
      const pb = B[n - 1];
      const y = H * 0.02 + ((h - pb.y) / 1500) * H * 1.2;
      if (y - 222 < H) drawBody(pb.kind, W * 0.5, y, 222, 1);
    }
    const prev = n > 0 ? B[n - 1].y : 0;
    const k = clamp((h - prev) / (B[n].y - prev), 0, 1);
    const r = 22 + 200 * Math.pow(k, 2.4);
    drawBody(B[n].kind, lerp(W * 0.8, W * 0.5, Math.pow(k, 1.5)), lerp(H * 0.12, H * 0.02, k), r, k);
  }

  const GLOW = { moon: '255,250,220', mars: '255,120,80', jupiter: '255,200,150', saturn: '255,230,170', neptune: '120,160,255', blackhole: '255,140,40' };
  function drawBody(kind, x, y, r, k) {
    const disc = (col) => { cx.fillStyle = col; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); };
    const spot = (a, b, rr, col) => { cx.fillStyle = col; cx.beginPath(); cx.arc(x + a * r, y + b * r, rr * r, 0, 7); cx.fill(); };
    if (kind === 'belt') { // no planet: a band of tumbling rocks
      cx.fillStyle = '#5a5a64';
      for (let i = 0; i < 18; i++) {
        const rx = (hash(i) * 1.4 - 0.2) * W, ry = y + (hash(i + 30) - 0.5) * (40 + r * 0.6), rr = (3 + hash(i + 60) * 8) * (0.4 + k);
        cx.beginPath(); cx.arc(rx, ry, rr, 0, 7); cx.fill();
      }
      return;
    }
    const gc = GLOW[kind];
    const g = cx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
    g.addColorStop(0, 'rgba(' + gc + ',.25)'); g.addColorStop(1, 'rgba(' + gc + ',0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r * 2.2, 0, 7); cx.fill();
    if (kind === 'moon') {
      disc('#f4f1de');
      [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]].forEach(([a, b, rr]) => spot(a, b, rr, 'rgba(160,150,130,.45)'));
    } else if (kind === 'mars') {
      disc('#c1440e');
      [[-0.3, 0.1, 0.25], [0.3, -0.2, 0.18], [0.1, 0.45, 0.15]].forEach(([a, b, rr]) => spot(a, b, rr, 'rgba(110,30,5,.45)'));
      cx.fillStyle = '#f4f1de'; cx.beginPath(); cx.ellipse(x, y - r * 0.88, r * 0.35, r * 0.12, 0, 0, 7); cx.fill();
    } else if (kind === 'jupiter' || kind === 'neptune') {
      cx.save(); cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.clip();
      const bands = kind === 'jupiter' ? ['#e8d2b0', '#b5835a', '#d9b38c', '#a0704a', '#e8d2b0', '#c49a6c', '#e8d2b0'] : ['#3d5afe', '#5c7cfa', '#3d5afe', '#4c6ef5', '#3d5afe'];
      bands.forEach((col, i) => { cx.fillStyle = col; cx.fillRect(x - r, y - r + (i * 2 * r) / bands.length, 2 * r, (2 * r) / bands.length + 1); });
      if (kind === 'jupiter') { cx.fillStyle = '#c0392b'; cx.beginPath(); cx.ellipse(x + r * 0.3, y + r * 0.25, r * 0.18, r * 0.1, 0, 0, 7); cx.fill(); }
      cx.restore();
    } else if (kind === 'saturn') {
      cx.strokeStyle = 'rgba(230,205,150,.85)'; cx.lineWidth = Math.max(2, r * 0.12);
      cx.beginPath(); cx.ellipse(x, y, r * 2, r * 0.45, -0.25, Math.PI, Math.PI * 2); cx.stroke();
      disc('#e3c58b');
      cx.fillStyle = 'rgba(180,140,80,.35)'; cx.fillRect(x - r * 0.9, y - r * 0.15, r * 1.8, r * 0.12);
      cx.beginPath(); cx.ellipse(x, y, r * 2, r * 0.45, -0.25, 0, Math.PI); cx.stroke();
    } else if (kind === 'blackhole') {
      cx.save(); cx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 + time * 0.8;
        cx.fillStyle = 'rgba(255,' + (120 + (i % 3) * 40) + ',40,.6)';
        cx.beginPath(); cx.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.45, Math.max(1.5, r * 0.05), 0, 7); cx.fill();
      }
      cx.restore();
      disc('#000000');
      cx.strokeStyle = 'rgba(255,170,60,.8)'; cx.lineWidth = Math.max(1.5, r * 0.04); cx.beginPath(); cx.arc(x, y, r * 1.02, 0, 7); cx.stroke();
    }
    if (kind !== 'blackhole') { cx.fillStyle = 'rgba(0,0,0,.18)'; cx.beginPath(); cx.arc(x + r * 0.25, y + r * 0.15, r, 0, 7); cx.fill(); }
  }

  // Space: nebulae and the earth curving away below.
  function drawSpace(h, a) {
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    [[0.25, 0.3, '170,60,255'], [0.8, 0.55, '40,180,200'], [0.4, 0.8, '255,60,140']].forEach(([nx, ny, col], i) => {
      const x = nx * W, y = ((ny * H + scroll.star * 0.4 + i * 300) % (H * 1.6)) - H * 0.3, r = W * 0.45;
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col + ',' + 0.16 * a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    cx.restore();
    // the earth below, left behind after the moon
    const e = clamp((h - 2800) / 2000, 0, 1) * clamp(1 - (h - 7000) / 3000, 0, 1);
    if (e > 0) {
      const R = W * (3.4 - 1.8 * e), cy = H + R - 30 - 90 * e;
      const g = cx.createRadialGradient(W / 2, cy, R * 0.9, W / 2, cy, R);
      g.addColorStop(0, '#0b2a55'); g.addColorStop(1, '#2a7ab8');
      cx.globalAlpha = e;
      cx.fillStyle = g; cx.beginPath(); cx.arc(W / 2, cy, R, 0, 7); cx.fill();
      cx.strokeStyle = 'rgba(120,200,255,.55)'; cx.lineWidth = 6; cx.beginPath(); cx.arc(W / 2, cy, R + 3, 0, 7); cx.stroke();
      cx.globalAlpha = 1;
    }
  }

  function makeBolt() {
    const pts = [];
    let x = rand(0.1, 0.9) * W, y = -10;
    const end = H * rand(0.3, 0.6);
    while (y < end) { pts.push([x, y]); x += rand(-22, 22); y += rand(18, 36); }
    return pts;
  }
  function drawBolt() {
    cx.save();
    cx.globalAlpha = env.flash;
    cx.strokeStyle = '#e8eeff'; cx.lineWidth = 3; cx.shadowColor = '#9fb4ff'; cx.shadowBlur = 16;
    cx.beginPath();
    env.bolt.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y)));
    cx.stroke();
    cx.restore();
  }

  // ---------- launch sites ----------
  const SITE_GROUND = [
    ['#16301f', '#244a2f'], // backyard grass
    ['#3b3424', '#5a4e33'], // beach sand
    ['#1b1b24', '#2e2e3a'], // city street
    ['#6f7d96', '#a9b8cf'], // mountain snow
    ['#262a33', '#3a404c'], // launch base concrete
  ];

  // Calls fn(i) for every slot of the given width (metres) that is on screen.
  function eachSlot(slot, fn) {
    const p = cam.ppm;
    const left = Math.floor((cam.x - W / 2 / p) / slot) - 2, right = Math.ceil((cam.x + W / 2 / p) / slot) + 1;
    for (let i = left; i <= right; i++) fn(i);
  }

  function drawHouses(p) {
    eachSlot(14, (i) => {
      if (i === 0 || i === -1) return; // keep the launch spot clear
      const hw = 8 + hash(i) * 4, hh = 6 + hash(i + 77) * 9;
      const [x0, y0] = w2s(i * 14 + 1, hh);
      const w = hw * p, hp = hh * p;
      cx.fillStyle = '#1a1433';
      cx.fillRect(x0, y0, w, hp);
      cx.beginPath(); cx.moveTo(x0 - 0.6 * p, y0); cx.lineTo(x0 + w / 2, y0 - 3.5 * p); cx.lineTo(x0 + w + 0.6 * p, y0); cx.fill();
      litWindows(i, x0, y0, w, hp, Math.max(1, Math.floor(hw / 3)), Math.max(1, Math.floor(hh / 3.4)), 0.45, p);
    });
  }

  function litWindows(seed, x0, y0, w, hp, cols, rows, dark, p) {
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      if (hash(seed * 31 + a * 7 + b * 13) < dark) continue;
      cx.fillStyle = hash(seed + a + b * 3) < 0.5 ? '#ffd57a' : '#ffb347';
      cx.fillRect(x0 + (a + 0.35) * (w / cols), y0 + (b + 0.3) * (hp / rows), Math.max(1, 1.2 * p), Math.max(1, 1.3 * p));
    }
  }

  function drawBeach(p) {
    const cols = ['#7a3f55', '#3f6a7a', '#7a6a3f', '#3f7a55', '#5a4a7a'];
    eachSlot(9, (i) => {
      if (i < 1) return; // the sea is on the left
      const [x0, y0] = w2s(i * 9, 4.5);
      const w = 5 * p, hp = 4.5 * p;
      cx.fillStyle = cols[Math.floor(hash(i) * cols.length)];
      cx.fillRect(x0, y0, w, hp);
      cx.fillStyle = '#2a1f2f';
      cx.beginPath(); cx.moveTo(x0 - 0.4 * p, y0); cx.lineTo(x0 + w / 2, y0 - 2 * p); cx.lineTo(x0 + w + 0.4 * p, y0); cx.fill();
      cx.fillStyle = hash(i + 3) < 0.5 ? '#ffd57a' : '#2a1f2f';
      cx.fillRect(x0 + w * 0.35, y0 + hp * 0.45, w * 0.3, hp * 0.55);
    });
  }
  function drawSea(p, gy) {
    const [sx] = w2s(-10, 0);
    if (sx <= 0) return;
    cx.fillStyle = '#0b2340';
    cx.fillRect(0, gy - 0.4 * p, sx, H - gy + 40);
    cx.strokeStyle = 'rgba(160,200,255,.35)'; cx.lineWidth = 1.5;
    for (let r = 0; r < 6; r++) {
      const y = gy + r * (8 + r * 6);
      for (let x = ((time * 20 + r * 37) % 40) - 40; x < sx; x += 40) { cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 14, y); cx.stroke(); }
    }
    // the moon's reflection
    cx.fillStyle = 'rgba(255,245,200,.25)';
    const rx = Math.min(sx - 20, W * 0.25);
    for (let r = 0; r < 8; r++) cx.fillRect(rx - 10 + Math.sin(time * 2 + r) * 5, gy + 4 + r * 12, 20 - r, 2);
  }

  function drawCity(p) {
    eachSlot(20, (i) => {
      if (i === 0 || i === -1) return;
      const hw = 12 + hash(i) * 5, hh = 25 + hash(i + 77) * 60;
      const [x0, y0] = w2s(i * 20 + 1, hh);
      const w = hw * p, hp = hh * p;
      cx.fillStyle = '#141226';
      cx.fillRect(x0, y0, w, hp);
      litWindows(i, x0, y0, w, hp, Math.max(2, Math.floor(hw / 2.5)), Math.max(2, Math.floor(hh / 3.5)), 0.5, p * 0.7);
      cx.fillStyle = '#141226'; cx.fillRect(x0 + w / 2 - 0.3 * p, y0 - 6 * p, 0.6 * p, 6 * p);
      cx.fillStyle = Math.sin(time * 3 + i) > 0 ? '#ff1744' : '#4a0010';
      cx.fillRect(x0 + w / 2 - 0.6 * p, y0 - 6.6 * p, 1.2 * p, 1.2 * p);
    });
  }

  function drawMountains(p) {
    eachSlot(70, (i) => {
      if (i === 0 || i === -1) return; // launch from the valley
      const hh = 50 + hash(i + 5) * 110, half = 45 + hash(i + 9) * 25, cxm = i * 70 + 35;
      const [l, gy] = w2s(cxm - half, 0), [t, ty] = w2s(cxm, hh), [r] = w2s(cxm + half, 0);
      cx.fillStyle = '#1e2a44';
      cx.beginPath(); cx.moveTo(l, gy); cx.lineTo(t, ty); cx.lineTo(r, gy); cx.fill();
      const k = 0.28;
      cx.fillStyle = '#9fb0c9';
      cx.beginPath(); cx.moveTo(lerp(t, l, k), lerp(ty, gy, k)); cx.lineTo(t, ty); cx.lineTo(lerp(t, r, k), lerp(ty, gy, k));
      cx.lineTo(t + (r - t) * 0.08, lerp(ty, gy, k * 0.8)); cx.lineTo(t - (t - l) * 0.1, lerp(ty, gy, k * 1.1)); cx.fill();
    });
    eachSlot(6, (i) => {
      if (Math.abs(i) < 2 || hash(i + 40) < 0.35) return;
      const hh = 5 + hash(i + 41) * 4;
      const [x, gy] = w2s(i * 6, 0), [, ty] = w2s(0, hh);
      cx.fillStyle = '#0f2a22';
      cx.beginPath(); cx.moveTo(x - 2 * p, gy); cx.lineTo(x, ty); cx.lineTo(x + 2 * p, gy); cx.fill();
      cx.fillStyle = 'rgba(220,230,245,.7)';
      cx.beginPath(); cx.moveTo(x - 0.8 * p, ty + 2 * p); cx.lineTo(x, ty); cx.lineTo(x + 0.8 * p, ty + 2 * p); cx.fill();
    });
  }

  function drawBase(p, gy) {
    // searchlights sweeping the sky
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    [-30, 30].forEach((wx, k) => {
      const [x] = w2s(wx, 0);
      const a = Math.sin(time * 0.6 + k * 2) * 0.5 + (k ? 0.25 : -0.25);
      const len = H * 1.4, spread = 0.07;
      const g = cx.createLinearGradient(x, gy, x + Math.sin(a) * len, gy - Math.cos(a) * len);
      g.addColorStop(0, 'rgba(200,220,255,.35)'); g.addColorStop(1, 'rgba(200,220,255,0)');
      cx.fillStyle = g;
      cx.beginPath(); cx.moveTo(x, gy);
      cx.lineTo(x + Math.sin(a - spread) * len, gy - Math.cos(a - spread) * len);
      cx.lineTo(x + Math.sin(a + spread) * len, gy - Math.cos(a + spread) * len); cx.fill();
    });
    cx.restore();
    eachSlot(40, (i) => {
      if (i === 0 || i === -1) return;
      const [x, y] = w2s(i * 40 + 8, 0);
      const w = 24 * p, hh = 10 * p;
      cx.fillStyle = '#2a2f3d';
      cx.beginPath(); cx.ellipse(x + w / 2, y, w / 2, hh, 0, Math.PI, 0); cx.fill();
      cx.strokeStyle = '#3a4152'; cx.lineWidth = 1;
      for (let k = 1; k < 5; k++) { cx.beginPath(); cx.moveTo(x + (w * k) / 5, y); cx.lineTo(x + (w * k) / 5, y - hh * Math.sin((Math.PI * k) / 5)); cx.stroke(); }
      cx.fillStyle = Math.sin(time * 4 + i) > 0 ? '#ff1744' : '#40000c';
      cx.fillRect(x + w / 2 - 1.5, y - hh - 4, 3, 3);
    });
  }

  // What the rocket stands in: always 62 px tall (at scale 1).
  function drawLauncher(site, bx, gy, s) {
    cx.save(); cx.translate(bx, gy); cx.scale(s, s);
    const poly = (pts, col) => { cx.fillStyle = col; cx.beginPath(); pts.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.closePath(); cx.fill(); };
    if (site === 'tuin') { // a bottle
      cx.fillStyle = 'rgba(60,140,70,.85)';
      cx.beginPath();
      cx.moveTo(-11, 0); cx.lineTo(-11, -36); cx.quadraticCurveTo(-11, -46, -4, -50); cx.lineTo(-4, -62);
      cx.lineTo(4, -62); cx.lineTo(4, -50); cx.quadraticCurveTo(11, -46, 11, -36); cx.lineTo(11, 0); cx.closePath(); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(-8, -38, 3, 30);
      cx.fillStyle = '#e9d8a6'; cx.fillRect(-10, -28, 20, 12);
    } else if (site === 'strand') { // a sand castle
      cx.fillStyle = '#9c8452'; cx.fillRect(-20, -26, 40, 26);
      for (let k = -20; k < 20; k += 8) cx.fillRect(k, -31, 5, 5);
      cx.fillStyle = '#b39a62'; cx.fillRect(-8, -56, 16, 30);
      for (let k = -8; k < 8; k += 6) cx.fillRect(k, -62, 4, 6);
      cx.fillStyle = '#3a2f1f'; cx.fillRect(-4, -12, 8, 12);
    } else if (site === 'stad') { // a wheelie bin
      cx.fillStyle = '#2d5a3a'; cx.fillRect(-12, -55, 24, 50);
      cx.fillStyle = '#244a30'; cx.fillRect(-14, -62, 28, 7);
      cx.fillStyle = '#111'; cx.beginPath(); cx.arc(-8, -3, 4, 0, 7); cx.arc(8, -3, 4, 0, 7); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,.2)'; cx.fillRect(-8, -48, 3, 36);
    } else if (site === 'berg') { // a snowman
      cx.fillStyle = '#e8eef7';
      cx.beginPath(); cx.arc(0, -14, 14, 0, 7); cx.arc(0, -37, 10, 0, 7); cx.arc(0, -54, 8, 0, 7); cx.fill();
      cx.fillStyle = '#111'; cx.fillRect(-4, -57, 2, 2); cx.fillRect(2, -57, 2, 2); cx.fillRect(-1, -40, 2, 2); cx.fillRect(-1, -33, 2, 2);
      poly([[0, -54], [9, -52], [0, -51]], '#ff8c1a');
    } else { // a launch pad with a gantry tower
      cx.fillStyle = '#555b6e'; cx.fillRect(-26, -8, 52, 8);
      cx.fillStyle = '#3a404c'; cx.fillRect(-3, -62, 6, 54);
      cx.strokeStyle = '#8a93a8'; cx.lineWidth = 1.5;
      cx.strokeRect(16, -120, 10, 112);
      for (let y = -120; y < -8; y += 10) { cx.beginPath(); cx.moveTo(16, y); cx.lineTo(26, y + 10); cx.moveTo(26, y); cx.lineTo(16, y + 10); cx.stroke(); }
      cx.fillStyle = '#8a93a8'; cx.fillRect(4, -96, 12, 3);
      cx.fillStyle = Math.sin(time * 4) > 0 ? '#ff1744' : '#40000c'; cx.fillRect(19, -125, 4, 4);
    }
    cx.restore();
  }

  function drawGround() {
    const [, gy] = w2s(0, 0);
    if (gy > H + 50) return;
    const p = cam.ppm, si = save.site || 0, site = L.SITES[si].id;
    if (site === 'tuin') drawHouses(p);
    else if (site === 'strand') drawBeach(p);
    else if (site === 'stad') drawCity(p);
    else if (site === 'berg') drawMountains(p);
    else drawBase(p, gy);
    const [g1, g2] = SITE_GROUND[si];
    cx.fillStyle = g1;
    cx.fillRect(0, gy, W, H - gy + 40);
    cx.fillStyle = g2;
    cx.fillRect(0, gy, W, Math.max(2, 0.6 * p));
    if (site === 'strand') drawSea(p, gy);
    if (site === 'stad') {
      cx.fillStyle = '#e9d8a6';
      eachSlot(6, (i) => { const [x] = w2s(i * 6, 0); cx.fillRect(x, gy + 3 * p, 3 * p, Math.max(1, 0.3 * p)); });
    }
    if (state === 'shop' || state === 'ignite' || (rocket && rocket.y < 60)) {
      const [bx] = w2s(0, 0);
      drawLauncher(site, bx, gy, p / 6);
    }
  }

  function drawIgnite() {
    const [x, gy] = w2s(0, 0);
    const ry = gy - 62; // rocket sits on top of the bottle neck
    drawRocket(cx, x, ry, Math.sin(time * 1.5) * 0.01, EVO(), 1, 0, TYPE(), 1);
    if (state !== 'ignite') return;
    // fuse: a curl from the nozzle
    const fx = (u) => x + 4 + u * 20 + Math.sin(u * 9) * 4, fy = (u) => ry + 2 + u * 10;
    const burnt = ign ? clamp(ign.t / ign.dur, 0, 1) : 0;
    cx.strokeStyle = '#3b2a1a'; cx.lineWidth = 2;
    cx.beginPath();
    for (let u = 0; u <= 1 - burnt + 0.001; u += 0.05) { const uu = u; u === 0 ? cx.moveTo(fx(uu), fy(uu)) : cx.lineTo(fx(uu), fy(uu)); }
    cx.stroke();
    if (ign) {
      const u = 1 - burnt, sx = fx(u), sy = fy(u);
      for (let i = 0; i < 3; i++) part(cam.x + (sx - W / 2) / cam.ppm, cam.y + (H * cam.anchor - sy) / cam.ppm, { vx: rand(-60, 60), vy: rand(-90, 10), g: 140, life: rand(0.2, 0.5), size: rand(1.5, 2.5), color: Math.random() < 0.5 ? '#fff6c8' : '#ffb703' });
      // power meter
      const mx = Math.min(W - 46, x + 80), mh = Math.min(240, H * 0.35), my = ry - mh + 10;
      cx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(mx - 4, my - 4, 34, mh + 8, 10); cx.fill();
      cx.fillStyle = '#5a1a1a'; cx.fillRect(mx, my, 26, mh);
      const good = st.perfect * 2.6, perf = st.perfect;
      const zy = (v) => my + mh - v * mh;
      cx.fillStyle = '#d4a017'; cx.fillRect(mx, zy(Math.min(1, ign.center + good)), 26, (Math.min(1, ign.center + good) - Math.max(0, ign.center - good)) * mh);
      cx.fillStyle = '#3ddc4a'; cx.fillRect(mx, zy(Math.min(1, ign.center + perf)), 26, (Math.min(1, ign.center + perf) - Math.max(0, ign.center - perf)) * mh);
      const ny = zy(needle());
      cx.fillStyle = '#fff';
      cx.beginPath(); cx.moveTo(mx - 10, ny - 7); cx.lineTo(mx + 2, ny); cx.lineTo(mx - 10, ny + 7); cx.fill();
      cx.fillRect(mx, ny - 1.5, 26, 3);
    }
  }

  function roundRect(x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
  }

  function drawObjects() {
    for (const o of objects) {
      const [x, y] = w2s(o.x, o.y);
      if (y < -60 || y > H + 60 || x < -80 || x > W + 80) continue;
      cx.save(); cx.translate(x, y);
      switch (o.type) {
        case 'coin': {
          const sq = Math.abs(Math.cos(time * 4 + o.x));
          cx.fillStyle = '#b8860b'; cx.beginPath(); cx.ellipse(0, 0, 11 * sq + 2, 11, 0, 0, 7); cx.fill();
          cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.ellipse(0, 0, 9 * sq + 1, 9, 0, 0, 7); cx.fill();
          break;
        }
        case 'fuel':
          cx.fillStyle = '#d62828'; roundRect(-10, -13, 20, 26, 4); cx.fill();
          cx.fillStyle = '#fff'; cx.font = 'bold 13px sans-serif'; cx.textAlign = 'center'; cx.fillText('🧨', 0, 5);
          break;
        case 'star':
          cx.rotate(time * 2);
          cx.fillStyle = '#80d8ff';
          cx.beginPath();
          for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 15, a = (i / 10) * Math.PI * 2; cx.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
          cx.fill();
          break;
        case 'bird': {
          cx.scale(o.dir, 1);
          const f = Math.sin(o.t * 14) * 8;
          cx.strokeStyle = '#ddd'; cx.lineWidth = 3; cx.lineCap = 'round';
          cx.beginPath(); cx.moveTo(-14, -f); cx.quadraticCurveTo(-6, -4, 0, 0); cx.quadraticCurveTo(6, -4, 14, -f); cx.stroke();
          cx.fillStyle = '#ddd'; cx.beginPath(); cx.ellipse(2, 1, 6, 3.5, 0, 0, 7); cx.fill();
          break;
        }
        case 'plane':
          cx.scale(o.dir, 1);
          cx.fillStyle = '#cfd8dc';
          roundRect(-26, -5, 52, 10, 5); cx.fill();
          cx.beginPath(); cx.moveTo(-4, 0); cx.lineTo(-14, 16); cx.lineTo(4, 0); cx.fill();
          cx.beginPath(); cx.moveTo(-22, -3); cx.lineTo(-28, -14); cx.lineTo(-18, -3); cx.fill();
          cx.fillStyle = Math.sin(o.t * 6) > 0 ? '#ff1744' : '#333'; cx.fillRect(-28, -15, 3, 3);
          break;
        case 'balloon':
          cx.fillStyle = '#ff4d6d'; cx.beginPath(); cx.ellipse(0, -6, 14, 17, 0, 0, 7); cx.fill();
          cx.strokeStyle = '#ccc'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, 11); cx.lineTo(0, 24); cx.stroke();
          cx.fillStyle = '#8d6e63'; cx.fillRect(-4, 22, 8, 6);
          break;
        case 'sat':
          cx.rotate(o.t * 0.6);
          cx.fillStyle = '#90a4ae'; cx.fillRect(-6, -6, 12, 12);
          cx.fillStyle = '#1e88e5'; cx.fillRect(-24, -4, 16, 8); cx.fillRect(8, -4, 16, 8);
          break;
        case 'meteor': {
          const tg = cx.createLinearGradient(0, 0, -o.dir * 40, -24);
          tg.addColorStop(0, 'rgba(255,140,26,.8)'); tg.addColorStop(1, 'rgba(255,140,26,0)');
          cx.fillStyle = tg; cx.beginPath(); cx.moveTo(-6, -8); cx.lineTo(-o.dir * 44, -26); cx.lineTo(6, 8); cx.fill();
          cx.fillStyle = '#8d6e63'; cx.beginPath(); cx.arc(0, 0, 11, 0, 7); cx.fill();
          cx.fillStyle = '#6d4c41'; cx.beginPath(); cx.arc(-3, -2, 3, 0, 7); cx.fill();
          break;
        }
        case 'rock':
          cx.rotate(o.t * 0.4);
          cx.fillStyle = '#6b6b75';
          cx.beginPath();
          for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = 17 + hash(i + o.x) * 7; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          cx.fill();
          cx.fillStyle = '#4a4a52'; cx.beginPath(); cx.arc(-5, -3, 4, 0, 7); cx.arc(6, 5, 3, 0, 7); cx.fill();
          break;
        case 'alien':
          cx.translate(0, Math.sin(o.t * 4) * 6);
          cx.fillStyle = 'rgba(160,255,160,.5)'; cx.beginPath(); cx.ellipse(0, -5, 8, 7, 0, 0, 7); cx.fill();
          cx.fillStyle = '#7cfc00'; cx.beginPath(); cx.arc(0, -5, 3.5, 0, 7); cx.fill();
          cx.fillStyle = '#8a93a8'; cx.beginPath(); cx.ellipse(0, 0, 18, 5, 0, 0, 7); cx.fill();
          cx.fillStyle = Math.sin(o.t * 8) > 0 ? '#ffd23f' : '#ff4d6d'; cx.fillRect(-10, -1, 3, 3); cx.fillRect(7, -1, 3, 3);
          break;
      }
      cx.restore();
    }
  }

  function drawParticles() {
    for (const p of parts) {
      const [x, y] = w2s(p.ax, p.ay);
      const a = clamp(p.life / p.max, 0, 1);
      cx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      cx.globalAlpha = p.sparkle ? a * (0.6 + 0.4 * Math.sin(time * 30 + p.vx)) : a * (p.glow ? 1 : 0.55);
      cx.fillStyle = p.color;
      const s = p.size + p.grow * (1 - a);
      cx.beginPath(); cx.arc(x + p.ox, y + p.oy, s, 0, 7); cx.fill();
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    cx.textAlign = 'center';
    cx.font = '900 20px system-ui, sans-serif';
    for (const t of texts) {
      const [x, y] = w2s(t.ax, t.ay);
      cx.globalAlpha = clamp(t.life * 1.5, 0, 1);
      cx.fillStyle = '#000'; cx.fillText(t.text, x + 1.5, y + t.oy + 1.5);
      cx.fillStyle = t.color; cx.fillText(t.text, x, y + t.oy);
    }
    cx.globalAlpha = 1;
  }

  function updateParticles(dt) {
    for (const p of parts) {
      p.ox += p.vx * dt; p.oy += p.vy * dt;
      p.vy += p.g * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const t of texts) { t.life -= dt; t.oy -= 40 * dt; }
    texts = texts.filter((t) => t.life > 0);
  }

  function ambientFireworks(dt) {
    if (cam.y > 700) return;
    ambientT -= dt;
    if (ambientT > 0) return;
    ambientT = rand(0.5, 1.5);
    const x = cam.x + rand(-0.45, 0.45) * W / cam.ppm;
    const y = cam.y + rand(0.2, 0.7) * H * cam.anchor / cam.ppm;
    firework(x, y, 0.3, PALETTES[Math.floor(Math.random() * PALETTES.length)], 'dim');
    burst(0.3, 0.06, 900, 200, 'lowpass');
  }

  // ---------- HUD ----------
  let hudZoneT = 0;
  function updateHud(dt) {
    $('hud-height').textContent = fmt(rocket.y) + ' m';
    $('hud-coins').textContent = '🪙 ' + fmt(rocket.coins);
    $('hud-fuel').style.width = clamp((rocket.fuel / rocket.fuelMax) * 100, 0, 100) + '%';
    const zi = L.zoneIndex(rocket.y);
    if (zi > flightZone) {
      flightZone = zi;
      $('hud-zone').classList.remove('hint');
      $('hud-zone').textContent = (zi > save.zones ? T('newZone') : '') + I.zone(zi, L);
      $('hud-zone').classList.add('show');
      hudZoneT = 2.2;
      if (zi > save.zones) { sfx.perfect(); vib(30); }
    }
    if (hudZoneT > 0) { hudZoneT -= dt; if (hudZoneT <= 0) $('hud-zone').classList.remove('show'); }
  }

  // ---------- main loop ----------
  function update(dt) {
    time += dt;
    shake *= Math.exp(-8 * dt);
    env.flash = Math.max(0, env.flash - dt * 3);

    if (state === 'ignite' && ign && !ign.done) {
      ign.t += dt;
      if (ign.t >= ign.dur) launch(0.9, T('late'));
    }

    if (state === 'flight') {
      let target = steerPointer !== null ? steer : (save.tilt ? tiltSteer : 0);
      if (keys.l || keys.r) target = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      const n = 3;
      const ts = L.timeScale(rocket.y);
      for (let i = 0; i < n; i++) L.step(rocket, st, (dt * ts) / n, target);
      if (rocket.stageN > stageShown) {
        // the spent stage tumbles away and the next one roars
        stageShown = rocket.stageN;
        toast(T('stage2'), 900);
        sfx.turbo(); vib(60); shake = 10;
        part(rocket.x, rocket.y, { vx: rand(-40, 40), vy: 40, g: 300, life: 1.4, max: 1.4, size: 6, color: '#555b6e', glow: false });
        for (let i = 0; i < 24; i++) part(rocket.x, rocket.y, { vx: rand(-160, 160), vy: rand(-60, 120), drag: 0.93, life: rand(0.3, 0.7), size: rand(2, 4), color: '#ffb703', sparkle: true });
      }
      if (rocket.y > 220 && rocket.y < 1000) {
        env.next -= dt;
        if (env.next <= 0) {
          env.next = rand(1.2, 3.5);
          env.flash = 1;
          env.bolt = makeBolt();
          burst(1.4, 0.45, 500, 60, 'lowpass', 0.15); tone(55, 1, 'sine', 0.3, 30, 0.15);
        }
      }
      const puffOn = !st.puffs || Math.sin(rocket.t * 11) > -0.3;
      if (st.puffs && rocket.burning && puffOn && !lastPuff) sfx.fart();
      lastPuff = puffOn;
      if (rocket.burning && (puffOn || rocket.turboT > 0)) {
        const turbo = rocket.turboT > 0;
        const fl = turbo ? 'blue' : TYPE().flame;
        loopSet('thrust', turbo ? 0.9 : 0.55, turbo || fl === 'blue' ? 1400 : 600);
        // exhaust goes out of the nozzle, opposite to the thrust (screen coords)
        const ex = -Math.sin(rocket.ang), ey = Math.cos(rocket.ang);
        const cols = EXHAUST[fl] || EXHAUST.fire;
        for (let i = 0; i < (turbo ? 4 : 2); i++) {
          const v = rand(60, 120);
          part(rocket.x, rocket.y, {
            vx: ex * v + rand(-25, 25), vy: ey * v, drag: 0.96, life: rand(0.3, 0.6),
            size: rand(2, 4), color: cols[Math.floor(Math.random() * cols.length)], sparkle: fl !== 'foam', glow: fl !== 'foam', g: fl === 'bubbles' ? -60 : 30,
          });
        }
        part(rocket.x, rocket.y, { vx: rand(-15, 15), vy: rand(10, 40), drag: 0.97, life: rand(1, 1.8), size: 4, grow: fl === 'gas' ? 20 : 12, color: fl === 'gas' ? '#7a9a3a' : '#8890a8', glow: false });
      } else {
        loopSet('thrust', 0);
      }
      if (rocket.y >= L.END_Y && !reachedEnd) {
        reachedEnd = true;
        rocket.fuel = 0; rocket.turboT = 0; rocket.turboLeft = 0; rocket.stagesLeft = [];
        toast(T('endToast'), 2200);
        explode(false);
      } else if (L.finished(rocket)) {
        explode(rocket.y <= 0.5);
      }
      updateTurboBtn();
      updateHud(dt);
    }

    if (state === 'boom') {
      boomT += dt;
      if (boomT > (reachedEnd ? 2.4 : 1.2)) showResult();
    }

    // camera
    if (rocket && (state === 'flight' || state === 'boom')) {
      const sp = state === 'flight' ? Math.hypot(rocket.vx, rocket.vy) : 0;
      const targetPpm = clamp(6 / (1 + (sp * L.timeScale(rocket.y)) / 55), 0.08, 6);
      cam.ppm = lerp(cam.ppm, targetPpm, Math.min(1, dt * 1.5));
      cam.anchor = lerp(cam.anchor, 0.62, Math.min(1, dt * 1.2));
      cam.x = lerp(cam.x, rocket.x, Math.min(1, dt * 3));
      const prevY = cam.y;
      cam.y = rocket.y;
      const dyPx = (cam.y - prevY) * cam.ppm;
      scroll.star += dyPx * 0.08;
      scroll.cloud += dyPx * 0.6;
      updateObjects(dt);
    }

    ambientFireworks(dt);
    updateParticles(dt);
  }

  function render() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const h = rocket ? rocket.y : 0;
    drawBackground(h);
    cx.save();
    if (shake > 0.3) cx.translate(rand(-shake, shake), rand(-shake, shake));
    drawGround();
    if (state === 'shop' || state === 'ignite') drawIgnite();
    drawObjects();
    drawParticles();
    if (state === 'flight') {
      const [x, y] = w2s(rocket.x, rocket.y);
      const puffOn = !st.puffs || Math.sin(rocket.t * 11) > -0.3;
      const flame = rocket.turboT > 0 ? 2 : rocket.burning && puffOn ? 1 : 0;
      drawRocket(cx, x, y, rocket.ang, EVO(), 1, flame, TYPE(), rocket.stageN);
    }
    cx.restore();
    if (env.flash > 0) { cx.fillStyle = 'rgba(210,220,255,' + env.flash * 0.2 + ')'; cx.fillRect(0, 0, W, H); }
    if (state === 'flight') drawSteerPads();
  }

  // Arrows in the bottom corners show where to hold, and light up while steering.
  function drawSteerPads() {
    const cur = keys.l || keys.r ? (keys.r ? 1 : 0) - (keys.l ? 1 : 0) : steerPointer !== null ? steer : save.tilt ? tiltSteer : 0;
    const y = H - 80;
    [[-1, 34], [1, W - 34]].forEach(([d, x]) => {
      const on = cur * d > 0.15;
      cx.fillStyle = 'rgba(255,255,255,' + (on ? 0.6 : 0.16) + ')';
      cx.beginPath(); cx.arc(x, y, 26, 0, 7); cx.fill();
      cx.fillStyle = on ? '#0b1230' : 'rgba(255,255,255,.5)';
      cx.beginPath(); cx.moveTo(x + d * 10, y); cx.lineTo(x - d * 7, y - 11); cx.lineTo(x - d * 7, y + 11); cx.fill();
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function steerFrom(px) { steer = clamp((px - W / 2) / (W * 0.32), -1, 1); }
  cv.addEventListener('pointerdown', (e) => {
    audioInit();
    if (state === 'ignite') { igniteTap(); return; }
    if (state === 'boom' && boomT > 0.3) { showResult(); return; }
    if (state === 'flight') { steerPointer = e.pointerId; steerFrom(e.clientX); }
  });
  window.addEventListener('pointermove', (e) => { if (e.pointerId === steerPointer) steerFrom(e.clientX); });
  const release = (e) => { if (e.pointerId === steerPointer) { steerPointer = null; steer = 0; } };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = true;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'ignite') { ign ? igniteTap() : light(); }
      else if (state === 'flight') useTurbo();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = false;
  });

  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma != null) tiltSteer = clamp(e.gamma / 25, -1, 1);
  });
  $('btn-tilt').addEventListener('click', () => {
    audioInit();
    save.tilt = !save.tilt; store();
    toast(T(save.tilt ? 'tiltOn' : 'tiltOff'), 1200);
    renderShop();
  });

  $('btn-launch').addEventListener('click', goIgnite);
  $('btn-light').addEventListener('click', light);
  $('btn-turbo').addEventListener('pointerdown', (e) => { e.stopPropagation(); useTurbo(); });
  $('btn-continue').addEventListener('click', goShop);
  $('btn-evolve').addEventListener('click', evolve);
  $('btn-lang').addEventListener('click', () => { save.langChosen = true; setLang(I.lang === 'en' ? 'nl' : 'en'); renderShop(); });
  $('btn-sound').addEventListener('click', () => { audioInit(); setSound(!save.sound); });
  $('btn-reset').addEventListener('click', () => {
    if (window.confirm(T('resetAsk'))) { save = Object.assign(L.freshSave(), { lang: save.lang, langChosen: save.langChosen, sound: save.sound, tilt: save.tilt }); store(); goShop(); }
  });

  // Android back button: the wrapper asks us first.
  window.vpBack = function () {
    if (state === 'shop') return 'exit';
    if (state === 'ignite' && !ign) { goShop(); return 'ok'; }
    if (state === 'result') { goShop(); return 'ok'; }
    return 'ok';
  };
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend(); else A.ctx.resume();
  });

  // test hook
  window.__vp = { get state() { return state; }, get rocket() { return rocket; }, get save() { return save; } };

  // English unless the player picked Dutch with the button
  setLang(save.langChosen ? save.lang : 'en');
  setSound(save.sound);
  goShop();
  requestAnimationFrame(frame);
})();
