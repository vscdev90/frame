// Simulates a sensible greedy player to check that progression to the moon
// and on to the black hole takes a sensible number of flights.
// Run: node vuurpijl/tests/balance.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('../www/logic.js');

function fly(save, typeIdx) {
  const st = L.stats(Object.assign({}, save, { type: typeIdx }));
  const r = L.newRocket(st, st.autoBoost ? 1.25 : 1.2);
  const dt = 1 / 30;
  let t = 0;
  while (!L.finished(r) && t < 400 && r.y < L.END_Y) {
    if (r.fuel <= 0 && r.turboT <= 0 && !r.stagesLeft.length && r.turboLeft > 0 && r.vy < 40) { r.turboLeft--; r.turboT = 1.2; }
    // the game speeds physics up in deep space; t is time the player waits
    const ts = L.timeScale(r.y);
    L.step(r, st, dt * ts, 0);
    t += dt;
  }
  const coins = Math.floor((Math.min(r.maxY, 20000) * 0.06 + 4) * st.coin);
  return { h: r.maxY, t, earn: coins + L.heightBonus(r.maxY, st) };
}

const save = L.freshSave();
let flights = 0, moonAt = 0;
const marks = [];
while (flights < 1000) {
  flights++;
  // fly the best thing you own
  let best = null;
  for (const i of save.types) {
    const f = fly(save, i);
    if (!best || f.h > best.h) best = Object.assign(f, { i });
  }
  save.type = best.i;
  const f = best;
  save.coins += f.earn;
  while (L.zoneIndex(f.h) > save.zones) { save.zones++; save.coins += L.ZONES[save.zones].bonus; }
  save.record = Math.max(save.record, f.h);
  if (!moonAt && f.h >= L.MOON_Y) moonAt = flights;
  if (flights % 20 === 0 || f.h >= L.END_Y) marks.push(`#${flights} h=${f.h.toFixed(0)}m t=${f.t.toFixed(0)}s evo=${save.evo} type=${L.TYPES[best.i].id} earn=${f.earn}`);
  if (f.h >= L.END_Y) break;
  save.site = L.SITES.reduce((b, s, i) => (save.record >= s.need ? i : b), 0);
  for (;;) {
    const ne = L.EVOS[save.evo + 1];
    if (ne && save.record >= ne.need && save.coins >= ne.cost) { save.coins -= ne.cost; save.evo++; continue; }
    // the newest machine you can afford
    const tIdx = L.TYPES.findIndex((t, i) => t.cat === 'machine' && !save.types.includes(i) && save.record >= t.need && save.coins >= t.cost);
    if (tIdx >= 0) { save.coins -= L.TYPES[tIdx].cost; save.types.push(tIdx); continue; }
    let up = null, bc = Infinity;
    for (const u of L.UPGRADES) {
      const lv = save.lv[u.id];
      if (lv >= u.max) continue;
      const c = L.cost(u, lv);
      if (c < bc) { bc = c; up = u; }
    }
    if (up && save.coins >= bc) { save.coins -= bc; save.lv[up.id]++; } else break;
  }
}
console.log(marks.join('\n'));
console.log('levels', JSON.stringify(save.lv), 'types', save.types.map((i) => L.TYPES[i].id).join(','));
console.log(`moon after ${moonAt} flights, black hole after ${flights} flights`);
const fail = (m) => { console.error(m); process.exit(1); };
if (!moonAt || moonAt < 40 || moonAt > 120) fail('moon should take 40-120 flights');
if (flights >= 1000) fail('never reached the black hole');
if (flights < 140 || flights > 400) fail('black hole should take 140-400 flights');
