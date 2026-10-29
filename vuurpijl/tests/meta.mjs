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
// daily streak: day 1, then 2 the next day, back to 1 after a missed day; paid at once
const s4 = Object.assign(L.freshSave(), { record: 1000, coins: 0 });
const r1 = M.checkLogin(s4, new Date(2026, 9, 18), () => 0.9);
assert.equal(r1.streak, 1); assert.equal(s4.coins, r1.coins);
assert.equal(M.checkLogin(s4, new Date(2026, 9, 18)), null, 'only once a day');
assert.equal(M.checkLogin(s4, new Date(2026, 9, 19)).streak, 2);
assert.equal(M.checkLogin(s4, new Date(2026, 9, 22)).streak, 1, 'a missed day restarts the streak');
s4.login = { day: M.dayKey(new Date(2026, 9, 29)), streak: 7 };
assert.equal(M.checkLogin(s4, new Date(2026, 9, 30)).streak, 1, 'after day 7 it starts over');

// offline coins: nothing for a short break or a brand-new player, capped at 8 hours
const s5 = Object.assign(L.freshSave(), { record: 2000, best: 2000, flights: 10, lastSeen: 0 });
assert.equal(M.offlineCoins(s5, 1e12).coins, 0, 'no lastSeen, no coins');
s5.lastSeen = 1e12;
assert.equal(M.offlineCoins(s5, 1e12 + 5 * 60 * 1000).coins, 0, 'five minutes is nothing');
const two = M.offlineCoins(s5, 1e12 + 2 * 3600 * 1000).coins, full = M.offlineCoins(s5, 1e12 + 24 * 3600 * 1000).coins;
assert.ok(two > 0 && full === two * 4, 'capped at 8 hours');

// mystery boxes give a skin, turbo or coins
const s6 = Object.assign(L.freshSave(), { record: 500 });
assert.equal(M.mysteryBox(s6, () => 0.1).kind, 'skin');
assert.equal(s6.skins.length, 2);
assert.equal(M.mysteryBox(s6, () => 0.3).kind, 'turbo');
assert.equal(s6.bonusTurbo, 3);
const box = M.mysteryBox(s6, () => 0.9);
assert.ok(box.kind === 'coins' && s6.coins === box.coins);
console.log('meta ok');
