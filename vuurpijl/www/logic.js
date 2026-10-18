// Vuurpijl! — game rules and physics. No DOM in here, so the balance can be
// simulated in Node (see vuurpijl/tests/balance.mjs).
(function (root) {
  'use strict';

  const G = 9.8;          // m/s²
  const MOON_Y = 6000;    // game metres to the moon
  const END_Y = 52000;    // the black hole at the end of the universe
  const MAX_ANGLE = 0.8;  // rad, how far the player can tilt the rocket

  const ZONES = [
    { y: 0,    name: 'Achtertuin',        bonus: 0 },
    { y: 50,   name: 'Boven de daken',    bonus: 25 },
    { y: 200,  name: 'De wolken',         bonus: 80 },
    { y: 700,  name: 'Vliegtuigroute',    bonus: 300 },
    { y: 1600, name: 'Stratosfeer',       bonus: 1000 },
    { y: 3000, name: 'De ruimte',         bonus: 3000 },
    { y: 4500, name: 'Satellietbaan',     bonus: 8000 },
    { y: MOON_Y, name: 'DE MAAN',         bonus: 30000 },
    { y: 10000, name: 'MARS',             bonus: 50000 },
    { y: 15000, name: 'Asteroïdengordel', bonus: 100000 },
    { y: 22000, name: 'JUPITER',          bonus: 200000 },
    { y: 30000, name: 'SATURNUS',         bonus: 400000 },
    { y: 40000, name: 'NEPTUNUS',         bonus: 800000 },
    { y: END_Y, name: 'HET ZWARTE GAT',   bonus: 2000000 },
  ];

  // The big things you fly past; drawn growing as you get near.
  const BODIES = [
    { y: MOON_Y, kind: 'moon',      icon: '🌕' },
    { y: 10000,  kind: 'mars',      icon: '🔴' },
    { y: 15000,  kind: 'belt',      icon: '🪨' },
    { y: 22000,  kind: 'jupiter',   icon: '🟠' },
    { y: 30000,  kind: 'saturn',    icon: '🪐' },
    { y: 40000,  kind: 'neptune',   icon: '🔵' },
    { y: END_Y,  kind: 'blackhole', icon: '🕳️' },
  ];

  // Evolutions: each one multiplies thrust and changes the look.
  const EVOS = [
    { name: 'Sterretje',     mult: 1.0, cost: 0,      need: 0,    body: '#e63946', nose: '#ffd166', fins: 0, stripes: 0, boosters: 0, size: 1.0 },
    { name: 'Knalpijl',      mult: 1.3, cost: 350,    need: 60,   body: '#2a9d8f', nose: '#e9c46a', fins: 2, stripes: 1, boosters: 0, size: 1.08 },
    { name: 'Fluitpijl',     mult: 1.65, cost: 2500,  need: 250,  body: '#7b2cbf', nose: '#ff9f1c', fins: 2, stripes: 2, boosters: 0, size: 1.15 },
    { name: 'Gouden Komeet', mult: 2.1, cost: 12000,  need: 800,  body: '#f4a261', nose: '#fff3b0', fins: 3, stripes: 2, boosters: 1, size: 1.22 },
    { name: 'Dubbele Draak', mult: 2.6, cost: 50000,  need: 1800, body: '#d00000', nose: '#ffba08', fins: 3, stripes: 3, boosters: 2, size: 1.3 },
    { name: 'Maanraket',     mult: 3.2, cost: 200000, need: 3200, body: '#e5e5e5', nose: '#4361ee', fins: 4, stripes: 3, boosters: 2, size: 1.4 },
    { name: 'Marspijl',      mult: 3.9, cost: 1500000,  need: 8000,  body: '#c1440e', nose: '#ffd23f', fins: 4, stripes: 3, boosters: 2, size: 1.45 },
    { name: 'Sterrenjager',  mult: 4.7, cost: 6000000,  need: 16000, body: '#3a0ca3', nose: '#4cc9f0', fins: 4, stripes: 3, boosters: 2, size: 1.5 },
    { name: 'Melkwegpijl',   mult: 5.6, cost: 25000000, need: 28000, body: '#111111', nose: '#f72585', fins: 4, stripes: 3, boosters: 2, size: 1.55 },
  ];

  const UPGRADES = [
    { id: 'kruit',   name: 'Kruit',      icon: '🧨', desc: 'Brandt langer',                 max: 25, base: 18,  grow: 1.62 },
    { id: 'stuw',    name: 'Stuwkracht', icon: '🔥', desc: 'Duwt harder',                   max: 25, base: 22,  grow: 1.62 },
    { id: 'aero',    name: 'Stroomlijn', icon: '🪶', desc: 'Minder luchtweerstand',         max: 25, base: 20,  grow: 1.62 },
    { id: 'lont',    name: 'Lont',       icon: '🧵', desc: 'Groter PERFECT-vak bij aansteken', max: 10, base: 15, grow: 1.6 },
    { id: 'stuur',   name: 'Vinnen',     icon: '🎯', desc: 'Sneller sturen, minder tollen', max: 10, base: 15,  grow: 1.6 },
    { id: 'knal',    name: 'Knal',       icon: '💥', desc: 'Grotere eindknal = meer munten', max: 25, base: 30, grow: 1.66 },
    { id: 'magneet', name: 'Magneet',    icon: '🧲', desc: 'Trekt munten naar je toe',      max: 10, base: 45,  grow: 1.65 },
    { id: 'turbo',   name: 'Turbo',      icon: '⚡', desc: '+1 turbostoot per vlucht',      max: 5,  base: 150, grow: 3.2 },
  ];

  // Launch sites ("levels"): unlocked by your height record, each pays more.
  const SITES = [
    { id: 'tuin',   icon: '🏡', name: 'Achtertuin',   need: 0,    mult: 1 },
    { id: 'strand', icon: '🏖️', name: 'Strand',       need: 150,  mult: 1.15 },
    { id: 'stad',   icon: '🏙️', name: 'Stad',         need: 600,  mult: 1.3 },
    { id: 'berg',   icon: '🏔️', name: 'Bergtop',      need: 1500, mult: 1.45 },
    { id: 'basis',  icon: '🛰️', name: 'Lanceerbasis', need: 3000, mult: 1.6 },
  ];

  // What you launch: bought once, then pick one before a flight. Each trades
  // something off. cat groups them in the shop; w/len stretch the firework
  // drawing; flame and burst pick the exhaust and the final explosion.
  // Specials: puffs (thrust comes in farts), spin (wobbles by itself),
  // drift (curves right), lowg (less gravity), stealth (half the obstacles
  // miss you), autoBoost (always a good start), extraTurbo, steer, drag.
  const T = (o) => Object.assign({ thrust: 1, fuel: 1, bang: 1, coin: 1, magnet: 0, stages: 1, w: 1, len: 1, flame: 'fire', burst: 'peony' }, o);
  const TYPES = [
    T({ id: 'klassiek', cat: 'fire', icon: '🎆', name: 'Klassiek',      desc: 'Alles gemiddeld',                   cost: 0,      need: 0 }),
    T({ id: 'dik',      cat: 'fire', icon: '💣', name: 'Dikke Bertha',  desc: 'Traag, maar een MEGA-knal',         cost: 500,    need: 80,   thrust: 0.85, fuel: 1.1, bang: 2.2, w: 1.6, len: 0.92, burst: 'big' }),
    T({ id: 'gier',     cat: 'fire', icon: '😱', name: 'Gierpijl',      desc: 'Supersnel, kort, kleine knal',      cost: 1500,   need: 250,  thrust: 1.35, fuel: 0.75, bang: 0.8, w: 0.75, len: 1.1, burst: 'willow' }),
    T({ id: 'lang',     cat: 'fire', icon: '🕯️', name: 'Lange Brander', desc: 'Zwakker, brandt veel langer',       cost: 5000,   need: 600,  thrust: 0.9, fuel: 1.6, w: 0.95, len: 1.35, burst: 'ring' }),
    T({ id: 'goud',     cat: 'fire', icon: '💰', name: 'Goudzoeker',    desc: 'Munten ×1,6 en trekt ze aan',       cost: 12000,  need: 1200, thrust: 0.95, bang: 1.2, coin: 1.6, magnet: 50, w: 1.1, burst: 'gold' }),
    T({ id: 'trap',     cat: 'fire', icon: '⏫', name: 'Tweetrapper',   desc: 'Tweede trap ontsteekt in de lucht', cost: 30000,  need: 2200, thrust: 1.05, fuel: 1.25, bang: 1.3, stages: 2, w: 1.05, len: 1.3, burst: 'multi' }),

    T({ id: 'cola',     cat: 'fun', icon: '🥤', name: 'Colafles + snoepjes', desc: 'Enorme spuit, maar heel kort',    cost: 250,    need: 30,   thrust: 2.4, fuel: 0.35, bang: 0.9, flame: 'foam', burst: 'foam' }),
    T({ id: 'wc',       cat: 'fun', icon: '🚽', name: 'Vliegende wc-pot',    desc: 'Doortrekken en gaan! Munten ×1,2', cost: 900,  need: 120,  fuel: 1.1, bang: 1.1, coin: 1.2, flame: 'water', burst: 'paper' }),
    T({ id: 'koe',      cat: 'fun', icon: '🐄', name: 'Scheetkoe',           desc: 'Vliegt op scheten. Boe!',         cost: 2500,   need: 300,  thrust: 1.2, fuel: 1.1, bang: 1.2, flame: 'gas', burst: 'confetti', puffs: true }),
    T({ id: 'varken',   cat: 'fun', icon: '🐷', name: 'Scheetvarken',        desc: 'Nog meer scheten, munten ×1,25',  cost: 4000,   need: 450,  thrust: 1.3, bang: 1.2, coin: 1.25, flame: 'gas', burst: 'confetti', puffs: true }),
    T({ id: 'gas',      cat: 'fun', icon: '🧯', name: 'Gasfles',             desc: 'Superkrachtig, tolt alle kanten op', cost: 7000, need: 700,  thrust: 1.6, fuel: 0.95, bang: 2.6, flame: 'blue', burst: 'fireball', spin: true, steer: 0.6 }),
    T({ id: 'banaan',   cat: 'fun', icon: '🍌', name: 'Reuzenbanaan',        desc: 'Buigt af naar rechts, munten ×1,5', cost: 10000, need: 1000, thrust: 1.2, fuel: 1.2, coin: 1.5, burst: 'banana', drift: true }),
    T({ id: 'wortel',   cat: 'fun', icon: '🥕', name: 'Reuzenwortel',        desc: 'Superstroomlijn',                 cost: 15000,  need: 1400, thrust: 1.15, fuel: 1.25, drag: 0.55, burst: 'carrot' }),
    T({ id: 'champagne', cat: 'fun', icon: '🍾', name: 'Champagnefles',      desc: 'Plop! Altijd een goede start',    cost: 25000,  need: 2000, thrust: 1.3, fuel: 1.2, bang: 2.0, flame: 'bubbles', burst: 'champagne', autoBoost: true }),
    T({ id: 'cartoon',  cat: 'fun', icon: '🧨', name: 'Cartoonraket',        desc: 'KA-BOEM! +1 turbo',              cost: 40000,  need: 2800, thrust: 1.35, fuel: 1.3, bang: 1.7, burst: 'kaboom', extraTurbo: 1 }),

    T({ id: 'jager',    cat: 'machine', icon: '✈️', name: 'Straaljager',     desc: 'Naverbrander: snel en lang',      cost: 70000,   need: 3500,  thrust: 1.3, fuel: 1.3, flame: 'blue', burst: 'jet' }),
    T({ id: 'hover',    cat: 'machine', icon: '🛩️', name: 'Hover-jet',       desc: 'Stijgt recht op, +2 turbo',       cost: 150000,  need: 4500,  thrust: 1.3, fuel: 1.35, flame: 'blue', burst: 'jet', extraTurbo: 2 }),
    T({ id: 'stealth',  cat: 'machine', icon: '🥷', name: 'Stealth-jet met liftfan', desc: 'Obstakels missen je vaak',  cost: 400000,  need: 6000,  thrust: 1.4, fuel: 1.4, flame: 'blue', burst: 'jet', stealth: true, autoBoost: true }),
    T({ id: 'ufo',      cat: 'machine', icon: '🛸', name: 'Retro-UFO',       desc: 'Minder zwaartekracht, stuurt top', cost: 800000, need: 9000,  thrust: 1.35, fuel: 1.5, flame: 'beam', burst: 'ufo', lowg: 0.6, steer: 1.6 }),
    T({ id: 'nasa',     cat: 'machine', icon: '🚀', name: 'Ruimteraket',     desc: 'Drie trappen naar de sterren',    cost: 2000000, need: 14000, thrust: 1.45, fuel: 1.6, bang: 1.5, stages: 3, burst: 'multi' }),
  ];

  function cost(u, lvl) {
    return Math.round(u.base * Math.pow(u.grow, lvl));
  }

  function freshSave() {
    const lv = {};
    for (const u of UPGRADES) lv[u.id] = 0;
    return { coins: 0, record: 0, evo: 0, lv, zones: 0, flights: 0, moon: 0, ends: 0, sound: true, site: 0, type: 0, types: [0], tilt: false };
  }

  function stats(save) {
    const L = save.lv;
    const evo = EVOS[save.evo];
    const type = TYPES[save.type || 0], site = SITES[save.site || 0];
    return {
      fuel: (1.3 + 0.36 * L.kruit) * type.fuel,      // seconds of burn
      thrust: (24 + 5 * L.stuw) * evo.mult * type.thrust, // m/s²
      drag: 0.012 * Math.pow(0.9, L.aero) * (type.drag || 1), // quadratic drag coefficient
      perfect: 0.07 + 0.018 * L.lont,                // half-width of the perfect zone (0..1 meter)
      steer: (2.2 + 0.45 * L.stuur) * (type.steer || 1), // how fast the rocket follows your finger
      stab: L.stuur,
      knal: (1 + 0.2 * L.knal) * type.bang,          // height-bonus multiplier
      magnet: (L.magneet ? 30 + 16 * L.magneet : 0) + type.magnet, // screen px
      turbo: L.turbo + (type.extraTurbo || 0),
      coin: site.mult * type.coin,                   // coin value multiplier
      income: site.mult,                             // height-bonus multiplier from the site
      stages: type.stages,
      lowg: type.lowg || 1,
      puffs: !!type.puffs, spin: !!type.spin, drift: !!type.drift,
      stealth: !!type.stealth, autoBoost: !!type.autoBoost,
    };
  }

  function stageFuel(st) {
    if (st.stages === 3) return [st.fuel * 0.4, st.fuel * 0.45, st.fuel * 0.5];
    if (st.stages === 2) return [st.fuel * 0.55, st.fuel * 0.6];
    return [st.fuel];
  }

  // Up in space the air runs out and gravity gets weaker.
  function airAt(y) { return y < 2000 ? 1 : Math.max(0.5, Math.exp(-(y - 2000) / 1500)); }
  // Deep space is big: the game runs faster up there so a flight stays short.
  function timeScale(y) { return 1 + Math.min(1.5, Math.max(0, (y - 3000) / 8000)); }
  function gravityAt(y) { return 1 / (1 + Math.pow(y / 40000, 2)); }

  function newRocket(st, boost) {
    return {
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, spin: 0,
      // multi-stage rockets split their powder; later stages burn hotter
      fuel: stageFuel(st)[0], fuelMax: stageFuel(st)[0],
      stagesLeft: stageFuel(st).slice(1), stageN: 1, staged: false, boost, t: 0,
      turboT: 0, turboLeft: st.turbo,
      maxY: 0, coins: 0, burning: true, fallT: 0,
    };
  }

  // Advance the rocket by dt. target is -1..1 (where the player points).
  function step(r, st, dt, target) {
    r.t += dt;
    if (r.fuel <= 0 && r.stagesLeft.length) {
      r.fuel = r.fuelMax = r.stagesLeft.shift();
      r.boost *= 1.35;
      r.stageN++;
      r.staged = true;
    }
    const burning = r.fuel > 0 || r.turboT > 0;
    if (burning) {
      const want = clamp(target + (st.drift ? 0.35 : 0), -1, 1) * MAX_ANGLE;
      if (st.spin) r.spin += (Math.random() - 0.5) * 14 * dt;
      r.ang += (want - r.ang) * Math.min(1, st.steer * dt);
    } else {
      // A spent rocket behaves like an arrow and noses into its velocity.
      const sp = Math.hypot(r.vx, r.vy);
      if (sp > 1) {
        const velAng = Math.atan2(r.vx, r.vy);
        r.ang += (velAng - r.ang) * Math.min(1, 2 * dt);
      }
    }
    r.ang += r.spin * dt;
    r.spin *= Math.exp(-(2.5 + st.stab * 0.7) * dt);

    let ax = 0, ay = -G * gravityAt(r.y) * st.lowg;
    if (burning) {
      let T = st.thrust * r.boost * (r.turboT > 0 ? 2.2 : 1);
      if (st.puffs) T *= Math.sin(r.t * 11) > -0.3 ? 1.25 : 0.25;
      ax += Math.sin(r.ang) * T;
      ay += Math.cos(r.ang) * T;
      if (r.fuel > 0) r.fuel = Math.max(0, r.fuel - dt);
      if (r.turboT > 0) r.turboT = Math.max(0, r.turboT - dt);
    }
    const sp = Math.hypot(r.vx, r.vy), drag = st.drag * airAt(r.y);
    ax -= drag * sp * r.vx;
    ay -= drag * sp * r.vy;
    r.vx += ax * dt;
    r.vy += ay * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (r.y < 0) { r.y = 0; if (r.vy < 0) r.vy = 0; }
    if (r.y > r.maxY) r.maxY = r.y;
    r.burning = burning;
    if (!burning && r.vy < 0) r.fallT += dt; else r.fallT = 0;
  }

  // The flight ends once the rocket is spent and starts to fall.
  // With turbo left you get a short window to fire it.
  function finished(r) {
    if (r.fuel > 0 || r.turboT > 0) return false;
    if (r.y <= 0 && r.maxY > 1) return true;
    if (r.vy >= 0) return false;
    return r.turboLeft === 0 || r.fallT > 1.5;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function heightBonus(maxY, st) {
    return Math.floor((5 + maxY * 0.3) * st.knal * (st.income || 1));
  }

  function zoneIndex(y) {
    let i = 0;
    for (let k = 0; k < ZONES.length; k++) if (y >= ZONES[k].y) i = k;
    return i;
  }

  const api = { G, MOON_Y, END_Y, MAX_ANGLE, ZONES, BODIES, EVOS, UPGRADES, SITES, TYPES, airAt, gravityAt, timeScale, cost, freshSave, stats, newRocket, step, finished, heightBonus, zoneIndex };
  root.VPLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
