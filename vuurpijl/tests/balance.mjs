// Simulates a greedy player to check that progression to the moon takes a
// sensible number of flights. Run: node vuurpijl/tests/balance.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('../www/logic.js');

function fly(save) {
  const st = L.stats(save);
  const r = L.newRocket(st, 1.2);
  const dt = 1 / 60;
  let t = 0;
  while (!L.finished(r) && t < 300) {
    if (r.fuel <= 0 && r.turboT <= 0 && r.turboLeft > 0 && r.vy < 40) { r.turboLeft--; r.turboT = 1.2; }
    L.step(r, st, dt, 0);
    t += dt;
  }
  const coins = Math.floor((r.maxY * 0.08 + 4) * st.coin);
  return { h: r.maxY, t, earn: coins + L.heightBonus(r.maxY, st) };
}

const save = L.freshSave();
let flights = 0;
const marks = [];
while (flights < 600) {
  flights++;
  const f = fly(save);
  save.coins += f.earn;
  while (L.zoneIndex(f.h) > save.zones) { save.zones++; save.coins += L.ZONES[save.zones].bonus; }
  save.record = Math.max(save.record, f.h);
  if (flights % 10 === 0 || f.h >= L.MOON_Y) marks.push(`#${flights} h=${f.h.toFixed(0)}m t=${f.t.toFixed(1)}s evo=${save.evo} earn=${f.earn}`);
  if (f.h >= L.MOON_Y) break;
  // a sensible player always launches from the best site unlocked
  save.site = L.SITES.reduce((best, s, i) => (save.record >= s.need ? i : best), 0);
  for (;;) {
    const ne = L.EVOS[save.evo + 1];
    if (ne && save.record >= ne.need && save.coins >= ne.cost) { save.coins -= ne.cost; save.evo++; continue; }
    let best = null, bc = Infinity;
    for (const u of L.UPGRADES) {
      const lv = save.lv[u.id];
      if (lv >= u.max) continue;
      const c = L.cost(u, lv);
      if (c < bc) { bc = c; best = u; }
    }
    if (best && save.coins >= bc) { save.coins -= bc; save.lv[best.id]++; } else break;
  }
}
console.log(marks.join('\n'));
console.log('levels', JSON.stringify(save.lv));
if (flights >= 600) { console.error('never reached the moon'); process.exit(1); }
if (flights < 30) { console.error('moon reached too quickly'); process.exit(1); }
console.log(`moon after ${flights} flights`);
