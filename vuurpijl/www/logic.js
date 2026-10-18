// Vuurpijl! — game rules and physics. No DOM in here, so the balance can be
// simulated in Node (see vuurpijl/tests/balance.mjs).
(function (root) {
  'use strict';

  const G = 9.8;          // m/s²
  const MOON_Y = 6000;    // game metres to the moon
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
  ];

  // Evolutions: each one multiplies thrust and changes the look.
  const EVOS = [
    { name: 'Sterretje',     mult: 1.0, cost: 0,      need: 0,    body: '#e63946', nose: '#ffd166', fins: 0, stripes: 0, boosters: 0, size: 1.0 },
    { name: 'Knalpijl',      mult: 1.3, cost: 350,    need: 60,   body: '#2a9d8f', nose: '#e9c46a', fins: 2, stripes: 1, boosters: 0, size: 1.08 },
    { name: 'Fluitpijl',     mult: 1.65, cost: 2500,  need: 250,  body: '#7b2cbf', nose: '#ff9f1c', fins: 2, stripes: 2, boosters: 0, size: 1.15 },
    { name: 'Gouden Komeet', mult: 2.1, cost: 12000,  need: 800,  body: '#f4a261', nose: '#fff3b0', fins: 3, stripes: 2, boosters: 1, size: 1.22 },
    { name: 'Dubbele Draak', mult: 2.6, cost: 50000,  need: 1800, body: '#d00000', nose: '#ffba08', fins: 3, stripes: 3, boosters: 2, size: 1.3 },
    { name: 'Maanraket',     mult: 3.2, cost: 200000, need: 3200, body: '#e5e5e5', nose: '#4361ee', fins: 4, stripes: 3, boosters: 2, size: 1.4 },
  ];

  const UPGRADES = [
    { id: 'kruit',   name: 'Kruit',      icon: '🧨', desc: 'Brandt langer',                 max: 20, base: 18,  grow: 1.62 },
    { id: 'stuw',    name: 'Stuwkracht', icon: '🔥', desc: 'Duwt harder',                   max: 20, base: 22,  grow: 1.62 },
    { id: 'aero',    name: 'Stroomlijn', icon: '🪶', desc: 'Minder luchtweerstand',         max: 20, base: 20,  grow: 1.62 },
    { id: 'lont',    name: 'Lont',       icon: '🧵', desc: 'Groter PERFECT-vak bij aansteken', max: 10, base: 15, grow: 1.6 },
    { id: 'stuur',   name: 'Vinnen',     icon: '🎯', desc: 'Sneller sturen, minder tollen', max: 10, base: 15,  grow: 1.6 },
    { id: 'knal',    name: 'Knal',       icon: '💥', desc: 'Grotere eindknal = meer munten', max: 20, base: 30, grow: 1.66 },
    { id: 'magneet', name: 'Magneet',    icon: '🧲', desc: 'Trekt munten naar je toe',      max: 10, base: 45,  grow: 1.65 },
    { id: 'turbo',   name: 'Turbo',      icon: '⚡', desc: '+1 turbostoot per vlucht',      max: 5,  base: 150, grow: 3.2 },
  ];

  function cost(u, lvl) {
    return Math.round(u.base * Math.pow(u.grow, lvl));
  }

  function freshSave() {
    const lv = {};
    for (const u of UPGRADES) lv[u.id] = 0;
    return { coins: 0, record: 0, evo: 0, lv, zones: 0, flights: 0, moon: 0, sound: true };
  }

  function stats(save) {
    const L = save.lv;
    const evo = EVOS[save.evo];
    return {
      fuel: 1.3 + 0.36 * L.kruit,                    // seconds of burn
      thrust: (24 + 5 * L.stuw) * evo.mult,           // m/s²
      drag: 0.012 * Math.pow(0.9, L.aero),          // quadratic drag coefficient
      perfect: 0.07 + 0.018 * L.lont,                // half-width of the perfect zone (0..1 meter)
      steer: 2.2 + 0.45 * L.stuur,                   // how fast the rocket follows your finger
      stab: L.stuur,
      knal: 1 + 0.2 * L.knal,                        // height-bonus multiplier
      magnet: L.magneet ? 30 + 16 * L.magneet : 0,   // screen px
      turbo: L.turbo,
    };
  }

  function newRocket(st, boost) {
    return {
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, spin: 0,
      fuel: st.fuel, fuelMax: st.fuel, boost,
      turboT: 0, turboLeft: st.turbo,
      maxY: 0, coins: 0, burning: true, fallT: 0,
    };
  }

  // Advance the rocket by dt. target is -1..1 (where the player points).
  function step(r, st, dt, target) {
    const burning = r.fuel > 0 || r.turboT > 0;
    if (burning) {
      const want = target * MAX_ANGLE;
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

    let ax = 0, ay = -G;
    if (burning) {
      const T = st.thrust * r.boost * (r.turboT > 0 ? 2.2 : 1);
      ax += Math.sin(r.ang) * T;
      ay += Math.cos(r.ang) * T;
      if (r.fuel > 0) r.fuel = Math.max(0, r.fuel - dt);
      if (r.turboT > 0) r.turboT = Math.max(0, r.turboT - dt);
    }
    const sp = Math.hypot(r.vx, r.vy);
    ax -= st.drag * sp * r.vx;
    ay -= st.drag * sp * r.vy;
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

  function heightBonus(maxY, st) {
    return Math.floor((5 + maxY * 0.3) * st.knal);
  }

  function zoneIndex(y) {
    let i = 0;
    for (let k = 0; k < ZONES.length; k++) if (y >= ZONES[k].y) i = k;
    return i;
  }

  const api = { G, MOON_Y, MAX_ANGLE, ZONES, EVOS, UPGRADES, cost, freshSave, stats, newRocket, step, finished, heightBonus, zoneIndex };
  root.VPLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
