// Checks daily missions, achievements, weather and prestige.
// Run: node vuurpijl/tests/meta.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';
const require = createRequire(import.meta.url);
const L = require('../www/logic.js');
const M = require('../www/meta.js');

const save = Object.assign(L.freshSave(), { record: 1234, types: [0, 3, 7] });
const day = new Date(2026, 9, 18);

// the same day gives the same three missions; a new day gives new ones
const d1 = M.dailyMissions(save, day);
assert.equal(d1.missions.length, 3);
const again = M.dailyMissions(Object.assign(L.freshSave(), { record: 1234, types: [0, 3, 7] }), day);
assert.deepEqual(again.missions, d1.missions);
assert.equal(M.dailyMissions(save, day), d1, 'same day keeps the same object (and progress)');
assert.notEqual(M.dailyMissions(save, new Date(2026, 9, 19)).day, d1.day);

// progress: max keeps the best flight, sum adds up
const s2 = Object.assign(L.freshSave(), { record: 500, types: [0] });
s2.daily = { day: 'x', reward: 1, chest: false, missions: [
  { kind: 'height', mode: 'max', target: 300, progress: 0 },
  { kind: 'flights', mode: 'sum', target: 2, progress: 0 },
  { kind: 'nohit', mode: 'max', target: 100, progress: 0 },
] };
const flight = (o) => Object.assign({ maxY: 0, coins: 0, bestCombo: 0, perfect: false, hits: 0, powerups: 0, typeIdx: 0 }, o);
M.trackMissions(s2, flight({ maxY: 200, hits: 1 }));
M.trackMissions(s2, flight({ maxY: 150 }));
assert.deepEqual(s2.daily.missions.map((m) => m.progress), [200, 2, 150]);
assert.deepEqual(s2.daily.missions.map(M.missionDone), [false, true, true]);

// achievements are earned once
const s3 = Object.assign(L.freshSave(), { flights: 1, record: 1000 });
const got = M.checkAchievements(s3, flight({ maxY: 1000, bestCombo: 12 }));
assert.ok(['first', 'roofs', 'clouds', 'combo10', 'nohit', 'exact'].every((id) => got.some((a) => a.id === id)));
assert.equal(M.checkAchievements(s3, flight({ maxY: 1000, bestCombo: 12 })).length, 0);

// weather
assert.equal(M.rollWeather(new Date(2026, 11, 31), 0.9), 'newyear');
assert.equal(M.rollWeather(new Date(2026, 11, 5), 0.1), 'snow');
assert.equal(M.rollWeather(new Date(2026, 6, 5), 0.1), 'clear');
const windy = L.stats(L.freshSave(), { wind: 6 });
const r = L.newRocket(windy, 1);
for (let i = 0; i < 60; i++) L.step(r, windy, 1 / 60, 0);
assert.ok(r.x > 0.5, 'wind pushes the rocket sideways');

// prestige keeps the collection, resets the rest, and pays more
const rich = Object.assign(L.freshSave(), { ends: 1, coins: 9e6, record: 52000, evo: 8, skins: ['none', 'crown'], achievements: ['blackhole'], flights: 200 });
assert.ok(M.canPrestige(rich));
const next = M.prestige(rich);
assert.equal(next.prestige, 1);
assert.equal(next.coins, 0);
assert.equal(next.record, 0);
assert.equal(next.evo, 0);
assert.deepEqual(next.skins, ['none', 'crown']);
assert.equal(next.flights, 200);
assert.equal(L.stats(next).coin, 1.5);
console.log('meta ok');
