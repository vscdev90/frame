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
// a mystery box never hands out a skin that belongs to an event or the pass
const s6b = Object.assign(L.freshSave(), { skins: M.SKINS.filter((k) => k.cost).map((k) => k.id) });
assert.notEqual(M.mysteryBox(s6b, () => 0.1).kind, 'skin');

// Halloween: only around the end of October, with days left
assert.equal(M.activeEvent(new Date(2026, 9, 24, 23)), null);
const hw = M.activeEvent(new Date(2026, 9, 29, 12));
assert.equal(hw.id, 'halloween'); assert.equal(hw.key, 'halloween-2026'); assert.equal(hw.goal, 120);
assert.equal(hw.daysLeft, 5);
assert.equal(M.activeEvent(new Date(2026, 10, 2, 22)).daysLeft, 1, 'the last day');
assert.equal(M.activeEvent(new Date(2026, 10, 3, 0, 1)), null);
// sweets pay a box at 40 and 80 and the witch hat at 120; a new year starts over
const s7 = Object.assign(L.freshSave(), { record: 500 });
assert.deepEqual(M.addEventItems(s7, hw, 39, () => 0.9), []);
assert.equal(M.addEventItems(s7, hw, 2, () => 0.9).length, 1);
assert.equal(M.addEventItems(s7, hw, 80, () => 0.9).length, 2, 'box at 80 and the hat at 120 at once');
assert.ok(s7.skins.includes('witch'));
assert.deepEqual(M.addEventItems(s7, hw, 30, () => 0.9), [], 'nothing more after the last prize');
const hw27 = M.activeEvent(new Date(2027, 9, 30));
M.addEventItems(s7, hw27, 120, () => 0.9);
assert.equal(s7.event.key, 'halloween-2027');
assert.equal(s7.skins.filter((k) => k === 'witch').length, 1, 'already had the hat: coins instead');

// Rocket Pass: XP per flight, 30 tiers that pay out, a new pass every month
assert.equal(M.flightXp({ perfect: false, near: 0, bestCombo: 0 }), 10);
assert.equal(M.flightXp({ perfect: true, near: 9, bestCombo: 100, record: true }), 10 + 10 + 25 + 15 + 20);
const s8 = Object.assign(L.freshSave(), { record: 1000, coins: 0 });
const oct = new Date(2026, 9, 29);
assert.deepEqual(M.addPassXp(s8, 99, oct), []);
const t1 = M.addPassXp(s8, 1, oct);
assert.equal(t1.length, 1); assert.equal(t1[0].tier, 1); assert.equal(t1[0].kind, 'coins'); assert.equal(s8.coins, t1[0].coins);
const lots = M.addPassXp(s8, 10000, oct, () => 0.9);
assert.equal(s8.pass.tier, 30); assert.equal(lots.length, 29);
assert.ok(s8.skins.includes('goggles') && s8.skins.includes('goldtrail'), 'pass skins at 15 and 30');
assert.deepEqual(M.addPassXp(s8, 500, oct), [], 'a full pass takes no more');
let total = 0; for (let t = 0; t < 30; t++) total += M.passNeed(t);
assert.equal(total, 4500);
assert.equal(M.passDaysLeft(new Date(2026, 9, 31, 12)), 1);
M.addPassXp(s8, 10, new Date(2026, 10, 1));
assert.equal(s8.pass.season, '2026-11'); assert.equal(s8.pass.tier, 0); assert.equal(s8.pass.xp, 10);
// a second pass: the skins are owned, so those tiers pay coins
const c8 = s8.coins;
M.addPassXp(s8, 10000, new Date(2026, 10, 2), () => 0.9);
assert.ok(s8.coins > c8); assert.equal(s8.skins.filter((k) => k === 'goggles').length, 1);

// what survives a new universe now includes the streak, the pass and the event
const s9 = Object.assign(L.freshSave(), { ends: 1, login: { day: 'x', streak: 4 }, pass: { season: 'y', xp: 1, tier: 3 }, notify: true });
const n9 = M.prestige(s9);
assert.equal(n9.login.streak, 4); assert.equal(n9.pass.tier, 3); assert.equal(n9.notify, true);

// reminders: off unless switched on; one a day at most, in the daytime, three at most
const s10 = Object.assign(L.freshSave(), { flights: 20, record: 900, best: 900 });
const noon = new Date(2026, 9, 29, 12, 0).getTime();
assert.deepEqual(M.planReminders(s10, noon, hw), []);
s10.notify = true;
s10.login = { day: M.dayKey(new Date(noon)), streak: 3 };
M.passState(s10, new Date(noon));
const plan = M.planReminders(s10, noon, hw);
assert.ok(plan.length >= 1 && plan.length <= 3);
const kinds = plan.map((r) => r.kind);
assert.equal(plan[0].kind, 'fans', 'noon + 8 h is 20:00 today');
assert.equal(new Date(plan[0].at).getHours(), 20);
assert.ok(kinds.includes('streak'), 'tomorrow evening for the streak');
assert.equal(plan.find((r) => r.kind === 'streak').day, 4);
const dayset = new Set(plan.map((r) => M.dayKey(new Date(r.at))));
assert.equal(dayset.size, plan.length, 'never two on one day');
for (const r of plan) {
  const d = new Date(r.at), mins = d.getHours() * 60 + d.getMinutes();
  assert.ok(mins >= 600 && mins <= 1230, 'only in the daytime: ' + d);
  assert.ok(r.at > noon);
}
// late in the evening: the fans' reminder moves to the next morning
const late = new Date(2026, 9, 29, 22, 0).getTime();
const fans = M.planReminders(Object.assign({}, s10, { login: null, pass: null }), late, null).find((r) => r.kind === 'fans');
assert.equal(new Date(fans.at).getHours(), 10);
assert.equal(new Date(fans.at).getDate(), 30);
console.log('meta ok');
