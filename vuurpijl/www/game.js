// Vuurpijl! — light the fuse, launch, steer, explode, upgrade, repeat.
(function () {
  'use strict';

  const L = window.VPLogic;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return n.toLocaleString('nl-NL');
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
  let boomT = 0, flightZone = 0, wonMoon = false;
  let ambientT = 1;
  let scroll = { cloud: 0, star: 0 };

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
  function firework(ax, ay, scale, pal, dim) {
    const rings = dim ? 1 : 2 + Math.floor(scale);
    for (let k = 0; k < rings; k++) {
      const n = Math.floor((dim ? 26 : 50) + scale * 18);
      const sp = (dim ? 70 : 150 + scale * 40) * (1 - k * 0.22);
      const col = pal[k % pal.length];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.3;
        const v = sp * rand(0.85, 1.1);
        part(ax, ay, {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 40, drag: 0.985,
          life: rand(1.2, 2.0) * (dim ? 0.7 : 1), size: dim ? 1.8 : rand(2, 3.4), color: col, sparkle: true,
        });
      }
    }
    if (!dim) {
      for (let i = 0; i < 40; i++) part(ax, ay, { vx: rand(-60, 60), vy: rand(-60, 60), drag: 0.97, life: rand(0.3, 0.7), size: rand(10, 22), color: '#fff6c8' });
    }
  }

  // ---------- world objects ----------
  function spawnOne(y) {
    // half of everything lands close to the flight path, so a straight
    // first flight still picks something up
    const spanM = (W * (Math.random() < 0.5 ? 0.12 : 0.42)) / cam.ppm;
    const x = rocket.x + rocket.vx * 0.4 + rand(-spanM, spanM);
    const roll = Math.random();
    const coinVal = Math.max(1, Math.round(1 + y / 120));
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
      if (y > 4200) type = Math.random() < 0.5 ? 'sat' : 'meteor';
      else if (y > 2600) type = Math.random() < 0.6 ? 'meteor' : 'sat';
      else if (y > 1400) type = Math.random() < 0.5 ? 'plane' : 'balloon';
      else if (y > 500) type = Math.random() < 0.5 ? 'plane' : 'bird';
      else if (y > 150) type = Math.random() < 0.3 ? 'balloon' : 'bird';
      const dir = Math.random() < 0.5 ? -1 : 1;
      const speed = { bird: 70, plane: 130, balloon: 15, sat: 50, meteor: 160 }[type];
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
      floatText(o.x, o.y, '+KRUIT', '#ff8c1a');
      sfx.pickup(); vib(20);
    } else if (o.type === 'star') {
      o.dead = true;
      rocket.turboLeft++;
      floatText(o.x, o.y, '+TURBO', '#80d8ff');
      sfx.pickup(); vib(20);
    } else if (!o.hit) {
      o.hit = true; o.dead = o.type !== 'balloon' && o.type !== 'sat' && o.type !== 'plane';
      rocket.vx *= 0.5; rocket.vy *= 0.62;
      rocket.spin += (Math.random() < 0.5 ? -1 : 1) * Math.max(1.5, 6 - st.stab * 0.45);
      shake = 12; sfx.bump(); vib(60);
      floatText(rocket.x, rocket.y, ['AU!', 'BONK!', 'OEPS!', 'KRAK!'][Math.floor(Math.random() * 4)], '#ff4d6d');
      const col = { bird: '#e0e0e0', meteor: '#a0703c', plane: '#cfd8dc', balloon: '#ff4d6d', sat: '#b0bec5' }[o.type];
      for (let i = 0; i < 14; i++) part(o.x, o.y, { vx: rand(-120, 120), vy: rand(-120, 60), g: 120, life: rand(0.5, 1), size: rand(2, 4), color: col, glow: false });
    }
  }

  // ---------- flow ----------
  const EVO = () => L.EVOS[save.evo];

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
    $('ignite-hint').textContent = save.flights < 2
      ? 'Steek de lont aan en tik als de naald in het GROENE vak staat!'
      : 'Steek de lont aan!';
    ign = null;
  }

  function light() {
    audioInit();
    if (state !== 'ignite' || ign) return;
    ign = { t: 0, dur: 2.6, speed: rand(3.6, 4.6), center: rand(0.62, 0.86), done: false };
    show('btn-light', false);
    $('ignite-hint').textContent = 'Tik als de naald in het groene vak staat!';
    loopStart('fuse', 'highpass', 3500, 0.7);
    loopSet('fuse', 0.25);
    vib(15);
  }

  function needle() { return 0.5 - 0.5 * Math.cos(ign.t * ign.speed); }

  function igniteTap() {
    if (!ign || ign.done || ign.t < 0.2) return;
    const d = Math.abs(needle() - ign.center);
    if (d < st.perfect) launch(1.3, 'PERFECT! 🔥');
    else if (d < st.perfect * 2.6) launch(1.12, 'GOED!');
    else launch(1.0, 'Mwah…');
  }

  function launch(boost, label) {
    ign.done = true;
    loopStop('fuse');
    show('ignite', false);
    rocket = L.newRocket(st, boost);
    nextSpawnY = 12;
    objects = [];
    flightZone = 0; wonMoon = false;
    state = 'flight';
    show('hud', true);
    updateTurboBtn();
    toast(label);
    if (boost >= 1.3) { sfx.perfect(); vib(50); }
    sfx.launch(); vib(30);
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
      toast('PLOF!', 900);
    } else {
      sfx.boom(big); vib(140); shake = 16;
      firework(rocket.x, rocket.y, 1 + big * 0.5, PALETTES[save.evo % PALETTES.length]);
      if (wonMoon) {
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
      zoneName = L.ZONES[save.zones].name;
    }
    const total = rocket.coins + bonus + zoneBonus;
    const newRecord = maxH > save.record + 0.5 && save.flights > 0;
    save.coins += total;
    save.record = Math.max(save.record, maxH);
    save.flights++;
    if (wonMoon) save.moon++;
    store();

    $('res-title').textContent = wonMoon ? 'DE MAAN! 🌕' : (maxH < 5 ? 'PLOF…' : ['KNAL!', 'BOEM!', 'PATS!', 'WOEHOE!'][Math.floor(Math.random() * 4)]);
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
    $('moon-progress').style.width = clamp((save.record / L.MOON_Y) * 100, 0, 100) + '%';
    const evo = EVO(), next = L.EVOS[save.evo + 1];
    $('evo-name').textContent = evo.name;
    $('evo-mult').textContent = 'Kracht ×' + evo.mult.toFixed(2);
    const be = $('btn-evolve');
    if (!next) {
      be.textContent = 'MAXIMAAL'; be.disabled = true; be.className = 'buy max';
      $('evo-need').textContent = save.moon ? 'Je bent op de maan geweest ' + save.moon + '×!' : 'Op naar de maan!';
    } else {
      be.className = 'buy';
      be.textContent = '⬆ ' + next.name + ' · ' + fmt(next.cost) + ' 🪙';
      const reached = save.record >= next.need;
      be.disabled = !reached || save.coins < next.cost;
      $('evo-need').textContent = reached ? 'Kracht ×' + next.mult.toFixed(2) : 'Haal eerst ' + fmt(next.need) + ' m hoogte';
    }
    drawPreview();

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
        '<div class="top"><span class="ico">' + u.icon + '</span><span>' + u.name + ' <small>' + lv + '/' + u.max + '</small></span></div>' +
        '<div class="desc">' + u.desc + '</div><div class="lvl">' + bars + '</div>';
      const b = document.createElement('button');
      b.className = 'buy' + (max ? ' max' : '');
      b.textContent = max ? 'MAX' : fmt(c) + ' 🪙';
      b.disabled = !can;
      b.addEventListener('click', () => buy(u));
      el.appendChild(b);
      box.appendChild(el);
    }
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
    toast('EVOLUTIE! ' + next.name, 1400);
    renderShop();
  }

  function drawPreview() {
    const pc = $('evo-preview'), p = pc.getContext('2d');
    p.clearRect(0, 0, pc.width, pc.height);
    const g = p.createRadialGradient(60, 70, 5, 60, 70, 70);
    g.addColorStop(0, 'rgba(255,210,63,.35)'); g.addColorStop(1, 'rgba(255,210,63,0)');
    p.fillStyle = g; p.fillRect(0, 0, pc.width, pc.height);
    drawRocket(p, 60, 112, 0, EVO(), 1.15, 0);
  }

  // ---------- drawing ----------
  function drawRocket(c, x, y, ang, evo, scale, flame) {
    const s = scale * evo.size;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(s, s);
    // flame
    if (flame) {
      const turbo = flame > 1;
      const len = (turbo ? 52 : 26) + Math.random() * 12;
      const gr = c.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, turbo ? '#e0f7ff' : '#fff6c8');
      gr.addColorStop(0.35, turbo ? '#4cc9f0' : '#ffb703');
      gr.addColorStop(1, turbo ? 'rgba(58,134,255,0)' : 'rgba(255,77,0,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(-6, 0); c.quadraticCurveTo(0, len * 1.2, 6, 0); c.closePath();
      c.fill();
      for (let b = 0; b < evo.boosters; b++) {
        const bx = b === 0 ? -11 : 11;
        c.beginPath(); c.moveTo(bx - 3, -2); c.quadraticCurveTo(bx, len * 0.8, bx + 3, -2); c.fill();
      }
    }
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
    // body
    const bg = c.createLinearGradient(-7, 0, 7, 0);
    bg.addColorStop(0, shadeHex(evo.body, -40)); bg.addColorStop(0.45, shadeHex(evo.body, 35)); bg.addColorStop(1, shadeHex(evo.body, -55));
    c.fillStyle = bg;
    c.fillRect(-7, -44, 14, 44);
    // stripes
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < evo.stripes; i++) c.fillRect(-7, -36 + i * 9, 14, 3);
    if (evo.fins >= 3) { c.fillStyle = evo.nose; c.fillRect(-1.5, -12, 3, 14); }
    if (evo.fins >= 4) { c.fillStyle = '#4cc9f0'; c.beginPath(); c.arc(0, -28, 3.5, 0, 7); c.fill(); }
    // nose
    c.fillStyle = evo.nose;
    c.beginPath(); c.moveTo(-8, -44); c.lineTo(0, -62); c.lineTo(8, -44); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(-7, -3, 14, 3);
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
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
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

    // moon, growing as you get closer
    const k = clamp(h / L.MOON_Y, 0, 1);
    const mr = 22 + 200 * Math.pow(k, 2.4);
    const mx = lerp(W * 0.8, W * 0.5, Math.pow(k, 1.5)), my = lerp(H * 0.12, H * 0.02, k);
    const mg = cx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 2.2);
    mg.addColorStop(0, 'rgba(255,250,220,.25)'); mg.addColorStop(1, 'rgba(255,250,220,0)');
    cx.fillStyle = mg; cx.beginPath(); cx.arc(mx, my, mr * 2.2, 0, 7); cx.fill();
    cx.fillStyle = '#f4f1de'; cx.beginPath(); cx.arc(mx, my, mr, 0, 7); cx.fill();
    cx.fillStyle = 'rgba(160,150,130,.45)';
    [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]].forEach(([a, b, r]) => {
      cx.beginPath(); cx.arc(mx + a * mr, my + b * mr, r * mr, 0, 7); cx.fill();
    });

    // clouds
    const cloudA = h < 120 ? h / 120 : h < 1600 ? 1 : clamp(1 - (h - 1600) / 800, 0, 1);
    if (cloudA > 0.01) {
      const loop = H * 1.6;
      for (const c of clouds) {
        const y = ((c.y * loop + scroll.cloud) % loop + loop) % loop - H * 0.3;
        const x = ((c.x * W * 1.4 - cam.x * cam.ppm * 0.3) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
        cx.fillStyle = 'rgba(150,160,210,' + 0.22 * cloudA + ')';
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

  function drawGround() {
    const [, gy] = w2s(0, 0);
    if (gy > H + 50) return;
    const p = cam.ppm;
    // houses (infinite street, deterministic)
    const slot = 14;
    const left = Math.floor((cam.x - W / 2 / p) / slot) - 1, right = Math.ceil((cam.x + W / 2 / p) / slot) + 1;
    for (let i = left; i <= right; i++) {
      if (i === 0 || i === -1) continue; // keep the launch spot clear
      const hw = 8 + hash(i) * 4, hh = 6 + hash(i + 77) * 9;
      const [x0, y0] = w2s(i * slot + 1, hh);
      const w = hw * p, hp = hh * p;
      cx.fillStyle = '#1a1433';
      cx.fillRect(x0, y0, w, hp);
      // roof
      cx.beginPath(); cx.moveTo(x0 - 0.6 * p, y0); cx.lineTo(x0 + w / 2, y0 - 3.5 * p); cx.lineTo(x0 + w + 0.6 * p, y0); cx.fill();
      // windows
      const cols = Math.max(1, Math.floor(hw / 3)), rows = Math.max(1, Math.floor(hh / 3.4));
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
        if (hash(i * 31 + a * 7 + b * 13) < 0.45) continue;
        cx.fillStyle = hash(i + a + b * 3) < 0.5 ? '#ffd57a' : '#ffb347';
        cx.fillRect(x0 + (a + 0.35) * (w / cols), y0 + (b + 0.3) * (hp / rows), 1.2 * p, 1.3 * p);
      }
    }
    // ground
    cx.fillStyle = '#16301f';
    cx.fillRect(0, gy, W, H - gy + 40);
    cx.fillStyle = '#244a2f';
    cx.fillRect(0, gy, W, Math.max(2, 0.6 * p));
    // the bottle the rocket stands in
    if (state === 'shop' || state === 'ignite' || (rocket && rocket.y < 60)) {
      const [bx] = w2s(0, 0), s = p / 6;
      cx.save(); cx.translate(bx, gy); cx.scale(s, s);
      cx.fillStyle = 'rgba(60,140,70,.85)';
      cx.beginPath();
      cx.moveTo(-11, 0); cx.lineTo(-11, -36); cx.quadraticCurveTo(-11, -46, -4, -50); cx.lineTo(-4, -62);
      cx.lineTo(4, -62); cx.lineTo(4, -50); cx.quadraticCurveTo(11, -46, 11, -36); cx.lineTo(11, 0); cx.closePath(); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(-8, -38, 3, 30);
      cx.fillStyle = '#e9d8a6'; cx.fillRect(-10, -28, 20, 12);
      cx.restore();
    }
  }

  function drawIgnite() {
    const [x, gy] = w2s(0, 0);
    const ry = gy - 62; // rocket sits on top of the bottle neck
    drawRocket(cx, x, ry, Math.sin(time * 1.5) * 0.01, EVO(), 1, 0);
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
    firework(x, y, 0.3, PALETTES[Math.floor(Math.random() * PALETTES.length)], true);
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
      const z = L.ZONES[zi];
      $('hud-zone').textContent = (zi > save.zones ? '✨ NIEUW: ' : '') + z.name;
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

    if (state === 'ignite' && ign && !ign.done) {
      ign.t += dt;
      if (ign.t >= ign.dur) launch(0.9, 'Te laat…');
    }

    if (state === 'flight') {
      let target = steer;
      if (keys.l || keys.r) target = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      const n = 3;
      for (let i = 0; i < n; i++) L.step(rocket, st, dt / n, target);
      if (rocket.burning) {
        const turbo = rocket.turboT > 0;
        loopSet('thrust', turbo ? 0.9 : 0.55, turbo ? 1400 : 600);
        // exhaust goes out of the nozzle, opposite to the thrust (screen coords)
        const ex = -Math.sin(rocket.ang), ey = Math.cos(rocket.ang);
        for (let i = 0; i < (turbo ? 4 : 2); i++) {
          const v = rand(60, 120);
          part(rocket.x, rocket.y, {
            vx: ex * v + rand(-25, 25), vy: ey * v, drag: 0.96, life: rand(0.3, 0.6),
            size: rand(2, 4), color: turbo ? '#4cc9f0' : (Math.random() < 0.5 ? '#ffb703' : '#fff6c8'), sparkle: true, g: 30,
          });
        }
        part(rocket.x, rocket.y, { vx: rand(-15, 15), vy: rand(10, 40), drag: 0.97, life: rand(1, 1.8), size: 4, grow: 12, color: '#8890a8', glow: false });
      } else {
        loopSet('thrust', 0);
      }
      if (rocket.y >= L.MOON_Y && !wonMoon) {
        wonMoon = true;
        rocket.fuel = 0; rocket.turboT = 0; rocket.turboLeft = 0;
        toast('🌕 DE MAAN! 🌕', 2000);
        explode(false);
      } else if (L.finished(rocket)) {
        explode(rocket.y <= 0.5);
      }
      updateTurboBtn();
      updateHud(dt);
    }

    if (state === 'boom') {
      boomT += dt;
      if (boomT > 2.4) showResult();
    }

    // camera
    if (rocket && (state === 'flight' || state === 'boom')) {
      const sp = state === 'flight' ? Math.hypot(rocket.vx, rocket.vy) : 0;
      const targetPpm = clamp(6 / (1 + sp / 55), 0.45, 6);
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
      drawRocket(cx, x, y, rocket.ang, EVO(), 1, rocket.burning ? (rocket.turboT > 0 ? 2 : 1) : 0);
    }
    cx.restore();
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

  $('btn-launch').addEventListener('click', goIgnite);
  $('btn-light').addEventListener('click', light);
  $('btn-turbo').addEventListener('pointerdown', (e) => { e.stopPropagation(); useTurbo(); });
  $('btn-continue').addEventListener('click', goShop);
  $('btn-evolve').addEventListener('click', evolve);
  $('btn-sound').addEventListener('click', () => { audioInit(); setSound(!save.sound); });
  $('btn-reset').addEventListener('click', () => {
    if (window.confirm('Alle voortgang wissen en opnieuw beginnen?')) { save = L.freshSave(); store(); goShop(); }
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

  setSound(save.sound);
  goShop();
  requestAnimationFrame(frame);
})();
