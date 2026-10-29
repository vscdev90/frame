// Rocket! — everything around the flights: daily missions, achievements,
// skins, weather and prestige. No DOM in here, so it can be tested in Node.
(function (root) {
  'use strict';

  const L = root.VPLogic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  // ---------- prestige ----------
  // After the black hole you can start a new universe: progress resets, but
  // every universe pays 50% more coins for good.
  function prestigeMult(save) { return 1 + 0.5 * (save.prestige || 0); }
  function canPrestige(save) { return (save.ends || 0) > 0; }
  // What survives a new universe.
  const KEEP = ['flights', 'ends', 'moon', 'prestige', 'best', 'achievements', 'skins', 'skin', 'visits', 'counters', 'daily', 'sound', 'tilt',
    'login', 'lastSeen', 'pass', 'event', 'notify', 'bonusTurbo', 'adBoostAt'];
  function prestige(save) {
    const next = L.freshSave();
    for (const k of KEEP) if (save[k] !== undefined) next[k] = save[k];
    next.prestige = (save.prestige || 0) + 1;
    next.ghost = null;
    return next;
  }

  // ---------- skins (cosmetic) ----------
  const SKINS = [
    { id: 'none',      icon: '🚫', name: 'None',          cost: 0 },
    { id: 'shades',    icon: '😎', name: 'Sunglasses',    cost: 2000 },
    { id: 'party',     icon: '🥳', name: 'Party hat',     cost: 8000 },
    { id: 'santa',     icon: '🎅', name: 'Santa hat',     cost: 15000, december: true },
    { id: 'propeller', icon: '🧢', name: 'Propeller cap', cost: 40000 },
    { id: 'rainbow',   icon: '🌈', name: 'Rainbow trail', cost: 100000 },
    { id: 'crown',     icon: '👑', name: 'Crown',         ach: 'blackhole' },
    // only from an event or the Rocket Pass
    { id: 'witch',     icon: '🧙', name: 'Witch hat',     event: 'halloween' },
    { id: 'goggles',   icon: '🥽', name: 'Pilot goggles', pass: 15 },
    { id: 'goldtrail', icon: '✨', name: 'Golden trail',  pass: 30 },
  ];

  // ---------- achievements ----------
  // test(save, flight): flight is the summary of the flight that just ended.
  const ACHIEVEMENTS = [
    { id: 'first',     icon: '🎇', name: 'First Launch',     desc: 'Launch once',                         reward: 20,     test: (s) => s.flights >= 1 },
    { id: 'roofs',     icon: '🏠', name: 'Over the Roofs',   desc: 'Reach 100 m',                         reward: 50,     test: (s) => s.record >= 100 },
    { id: 'clouds',    icon: '☁️', name: 'Cloud Surfer',     desc: 'Reach 500 m',                         reward: 200,    test: (s) => s.record >= 500 },
    { id: 'space',     icon: '🌌', name: 'Astronaut',        desc: 'Reach space (3,000 m)',               reward: 2000,   test: (s) => s.record >= 3000 },
    { id: 'moon',      icon: '🌕', name: 'Moonwalker',       desc: 'Reach the moon',                      reward: 20000,  test: (s) => s.record >= 6000 },
    { id: 'mars',      icon: '🔴', name: 'Red Planet',       desc: 'Reach Mars',                          reward: 60000,  test: (s) => s.record >= 10000 },
    { id: 'blackhole', icon: '🕳️', name: 'End of the Universe', desc: 'Reach the black hole (unlocks 👑)', reward: 500000, test: (s) => (s.ends || 0) > 0 },
    { id: 'f100',      icon: '💯', name: 'Frequent Flyer',   desc: 'Make 100 flights',                    reward: 5000,   test: (s) => s.flights >= 100 },
    { id: 'combo10',   icon: '🔥', name: 'On Fire',          desc: 'Get a combo of 10',                   reward: 500,    test: (s, f) => f && f.bestCombo >= 10 },
    { id: 'combo30',   icon: '☄️', name: 'Unstoppable',      desc: 'Get a combo of 30',                   reward: 5000,   test: (s, f) => f && f.bestCombo >= 30 },
    { id: 'perfect10', icon: '🎯', name: 'Sharpshooter',     desc: '10 PERFECT launches',                 reward: 1000,   test: (s) => s.counters.perfects >= 10 },
    { id: 'boss',      icon: '🐋', name: 'Boss Dodger',      desc: 'Dodge a boss',                        reward: 3000,   test: (s) => s.counters.bossDodges >= 1 },
    { id: 'nohit',     icon: '😇', name: 'Untouchable',      desc: 'Reach 1,000 m without a hit',         reward: 2000,   test: (s, f) => f && f.hits === 0 && f.maxY >= 1000 },
    { id: 'exact',     icon: '📏', name: 'Precision',        desc: 'Explode between 995 and 1,005 m',     reward: 3000,   test: (s, f) => f && f.maxY >= 995 && f.maxY <= 1005 },
    { id: 'cowmoon',   icon: '🐄', name: 'Over the Moon',    desc: 'Reach the moon with the Farting Cow', reward: 50000,  test: (s, f) => f && f.type === 'koe' && f.maxY >= 6000 },
    { id: 'collector', icon: '🧰', name: 'Collector',        desc: 'Own 10 things to launch',             reward: 10000,  test: (s) => s.types.length >= 10 },
    { id: 'all',       icon: '🏆', name: 'Got Them All',     desc: 'Own all 20 things to launch',         reward: 250000, test: (s) => s.types.length >= L.TYPES.length },
    { id: 'universe',  icon: '✨', name: 'New Universe',     desc: 'Start a new universe',                reward: 0,      test: (s) => (s.prestige || 0) > 0 },
    { id: 'daredevil', icon: '😎', name: 'Daredevil',        desc: '5 close calls in one flight',         reward: 2500,   test: (s, f) => f && f.near >= 5 },
    { id: 'streak7',   icon: '📆', name: 'Regular',          desc: 'Play 7 days in a row',                reward: 5000,   test: (s) => s.login && s.login.streak >= 7 },
  ];

  // Returns the achievements newly earned (and marks them in the save).
  function checkAchievements(save, flight) {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (save.achievements.includes(a.id)) continue;
      if (a.test(save, flight)) { save.achievements.push(a.id); got.push(a); }
    }
    return got;
  }

  // ---------- daily missions ----------
  function dayKey(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function seeded(seed) {
    let x = 0;
    for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  }
  function nice(n) {
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1));
    return Math.max(1, Math.round(n / p) * p);
  }

  // kind: what to track. mode 'max' keeps the best single flight, 'sum' adds up.
  const MISSIONS = [
    { kind: 'height',  mode: 'max', target: (s) => nice(Math.max(60, s.record * 0.75)) },
    { kind: 'coins',   mode: 'max', target: (s) => nice(Math.max(15, Math.min(s.record, 20000) * 0.04)) },
    { kind: 'combo',   mode: 'max', target: (s) => 5 + Math.min(20, Math.floor(s.record / 500)) },
    { kind: 'flights', mode: 'sum', target: () => 5 },
    { kind: 'perfect', mode: 'sum', target: () => 3 },
    { kind: 'nohit',   mode: 'max', target: (s) => nice(Math.max(40, s.record * 0.4)) },
    { kind: 'power',   mode: 'sum', target: () => 3 },
    { kind: 'vehicle', mode: 'max', target: (s) => nice(Math.max(40, s.record * 0.4)) },
    { kind: 'near',    mode: 'sum', target: () => 5 },
  ];

  // Today's three missions; rebuilt when the day changes.
  function dailyMissions(save, date) {
    const key = dayKey(date);
    if (save.daily && save.daily.day === key) return save.daily;
    const rnd = seeded(key + ':' + (save.prestige || 0));
    const pool = MISSIONS.slice();
    const owned = save.types.filter((i) => i !== 0);
    const list = [];
    while (list.length < 3 && pool.length) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (m.kind === 'vehicle' && !owned.length) continue;
      const mission = { kind: m.kind, mode: m.mode, target: m.target(save), progress: 0, claimed: false };
      if (m.kind === 'vehicle') mission.type = owned[Math.floor(rnd() * owned.length)];
      list.push(mission);
    }
    const reward = nice(100 + save.record * 2) * prestigeMult(save);
    save.daily = { day: key, missions: list, reward, chest: false };
    return save.daily;
  }

  // Feed a finished flight into today's missions.
  function trackMissions(save, f) {
    const d = save.daily;
    if (!d) return;
    for (const m of d.missions) {
      const v = {
        height: f.maxY, coins: f.coins, combo: f.bestCombo, flights: 1, perfect: f.perfect ? 1 : 0,
        nohit: f.hits === 0 ? f.maxY : 0, power: f.powerups, vehicle: f.typeIdx === m.type ? f.maxY : 0, near: f.near || 0,
      }[m.kind] || 0;
      m.progress = m.mode === 'sum' ? m.progress + v : Math.max(m.progress, v);
    }
  }
  function missionDone(m) { return m.progress >= m.target; }

  // ---------- coming back: a daily streak, coins earned while away, mystery boxes ----------
  // The base of all these rewards grows with your record, so they stay worth it.
  function rewardBase(save) { return nice(80 + (save.record || 0) * 1.2) * prestigeMult(save); }

  // Seven days, then it starts over; miss a day and it restarts at day 1.
  const LOGIN = [
    { kind: 'coins', mult: 1 }, { kind: 'coins', mult: 2 }, { kind: 'turbo', n: 2 }, { kind: 'coins', mult: 3 },
    { kind: 'box' }, { kind: 'coins', mult: 5 }, { kind: 'coins', mult: 10 },
  ];
  // Returns today's reward the first time it is asked each day (already paid out), else null.
  function checkLogin(save, date, rnd) {
    const d = date || new Date(), key = dayKey(d);
    const lg = save.login || { day: null, streak: 0 };
    if (lg.day === key) return null;
    const y = new Date(d); y.setDate(y.getDate() - 1);
    const streak = lg.day === dayKey(y) ? (lg.streak % 7) + 1 : 1;
    save.login = { day: key, streak };
    const r = Object.assign({ streak }, LOGIN[streak - 1]);
    if (r.kind === 'coins') { r.coins = rewardBase(save) * r.mult; save.coins += r.coins; }
    if (r.kind === 'turbo') save.bonusTurbo = (save.bonusTurbo || 0) + r.n;
    if (r.kind === 'box') r.box = mysteryBox(save, rnd || Math.random);
    return r;
  }

  // Coins "your fans collected" while the game was closed: up to 8 hours.
  function offlineCoins(save, now) {
    if (!save.lastSeen || !save.flights) return { hours: 0, coins: 0 };
    const hours = Math.min(8, (now - save.lastSeen) / 3600000);
    if (hours < 0.25) return { hours: 0, coins: 0 };
    return { hours, coins: Math.round(nice(10 + (save.best || save.record || 0) * 0.2) * prestigeMult(save) * hours) };
  }

  // A surprise: sometimes a skin, sometimes turbo, mostly a pile of coins.
  function mysteryBox(save, rnd) {
    rnd = rnd || Math.random;
    const r = rnd();
    const skins = SKINS.filter((k) => k.cost && !k.ach && !save.skins.includes(k.id));
    if (r < 0.2 && skins.length) {
      const k = skins[Math.floor(rnd() * skins.length)];
      save.skins.push(k.id);
      return { kind: 'skin', skin: k };
    }
    if (r < 0.45) { save.bonusTurbo = (save.bonusTurbo || 0) + 3; return { kind: 'turbo', n: 3 }; }
    const coins = rewardBase(save) * (2 + Math.floor(rnd() * 4));
    save.coins += coins;
    return { kind: 'coins', coins };
  }

  // ---------- seasonal events ----------
  // A few days a year with their own look, a sweet to collect and a prize you can only get then.
  // Months count from 0 (9 = October); the last day counts in full.
  const EVENTS = [
    { id: 'halloween', icon: '🎃', name: 'Halloween', from: [9, 25], to: [10, 2], item: '🍬', skin: 'witch',
      steps: [{ at: 40, kind: 'box' }, { at: 80, kind: 'box' }, { at: 120, kind: 'skin' }] },
  ];
  function activeEvent(date) {
    const d = date || new Date();
    for (const e of EVENTS) {
      const start = new Date(d.getFullYear(), e.from[0], e.from[1]);
      const end = new Date(d.getFullYear(), e.to[0], e.to[1] + 1);
      if (d >= start && d < end) {
        return Object.assign({ key: e.id + '-' + d.getFullYear(), end: end.getTime(), daysLeft: Math.ceil((end - d) / 86400000), goal: e.steps[e.steps.length - 1].at }, e);
      }
    }
    return null;
  }
  // This year's progress; next year starts at zero again.
  function eventState(save, ev) {
    if (!save.event || save.event.key !== ev.key) save.event = { key: ev.key, n: 0, paid: 0 };
    return save.event;
  }
  // Adds what you collected and pays every prize reached. Returns those prizes.
  function addEventItems(save, ev, n, rnd) {
    const es = eventState(save, ev);
    es.n += n;
    const got = [];
    for (const step of ev.steps) {
      if (es.paid >= step.at || es.n < step.at) continue;
      es.paid = step.at;
      if (step.kind === 'box') got.push(mysteryBox(save, rnd));
      else got.push(giveSkin(save, ev.skin, 10));
    }
    return got;
  }
  // A skin you earned; if you already have it, a big pile of coins instead.
  function giveSkin(save, id, mult) {
    if (!save.skins.includes(id)) { save.skins.push(id); return { kind: 'skin', skin: SKINS.find((k) => k.id === id) }; }
    const coins = rewardBase(save) * mult;
    save.coins += coins;
    return { kind: 'coins', coins };
  }

  // ---------- Rocket Pass ----------
  // Every flight and mission gives XP. Thirty tiers, each with a prize; a fresh pass every month.
  const PASS_TIERS = 30;
  function passNeed(tier) { return tier < 10 ? 100 : tier < 20 ? 150 : 200; } // XP to go from tier to tier + 1
  function passReward(tier) { // tiers count from 1
    if (tier === 15) return { kind: 'skin', id: 'goggles' };
    if (tier === 30) return { kind: 'skin', id: 'goldtrail' };
    if (tier % 5 === 0) return { kind: 'box' };
    if (tier % 3 === 0) return { kind: 'turbo', n: 2 };
    return { kind: 'coins', mult: 1 + Math.floor(tier / 6) };
  }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  // The current month's pass (a new month starts a new one).
  function passState(save, date) {
    const key = monthKey(date || new Date());
    if (!save.pass || save.pass.season !== key) save.pass = { season: key, xp: 0, tier: 0 };
    return save.pass;
  }
  function passDaysLeft(date) {
    const d = date || new Date();
    return Math.ceil((new Date(d.getFullYear(), d.getMonth() + 1, 1) - d) / 86400000);
  }
  function flightXp(f) {
    return 10 + (f.perfect ? 10 : 0) + Math.min(25, (f.near || 0) * 5) + Math.min(15, Math.floor((f.bestCombo || 0) / 5) * 3) + (f.record ? 20 : 0);
  }
  // Adds XP and pays every tier reached. Returns [{ tier, kind, ... }].
  function addPassXp(save, xp, date, rnd) {
    const p = passState(save, date);
    if (p.tier >= PASS_TIERS) return [];
    p.xp += xp;
    const got = [];
    while (p.tier < PASS_TIERS && p.xp >= passNeed(p.tier)) {
      p.xp -= passNeed(p.tier);
      p.tier++;
      const r = passReward(p.tier);
      let paid;
      if (r.kind === 'skin') paid = giveSkin(save, r.id, 8);
      else if (r.kind === 'box') paid = mysteryBox(save, rnd);
      else if (r.kind === 'turbo') { save.bonusTurbo = (save.bonusTurbo || 0) + r.n; paid = { kind: 'turbo', n: r.n }; }
      else { const coins = rewardBase(save) * r.mult; save.coins += coins; paid = { kind: 'coins', coins }; }
      got.push(Object.assign({ tier: p.tier }, paid));
    }
    if (p.tier >= PASS_TIERS) p.xp = 0;
    return got;
  }

  // ---------- reminders (notifications in the Android app) ----------
  // A plan of what to say when: at most one a day, only between 10:00 and 20:30, at most three ahead.
  // Each is { at, kind, ... }; the game turns them into text.
  function planReminders(save, now, ev) {
    if (!save.notify || !save.flights) return [];
    const at = (days, h, m) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d.getTime(); };
    const today = dayKey(new Date(now));
    const list = [];
    // most urgent first: a streak about to break, the last day of an event or a pass, then the rest
    if (save.login && save.login.streak >= 1 && save.login.day === today) list.push({ at: at(1, 19), kind: 'streak', day: (save.login.streak % 7) + 1 });
    if (ev && (!save.event || save.event.key !== ev.key || save.event.paid < ev.goal)) {
      const n = save.event && save.event.key === ev.key ? save.event.n : 0;
      list.push({ at: at(ev.daysLeft - 1, 12), kind: 'event', n, goal: ev.goal, icon: ev.icon, name: ev.name });
    }
    const p = save.pass;
    if (p && p.season === monthKey(new Date(now)) && p.tier < PASS_TIERS) list.push({ at: at(passDaysLeft(new Date(now)) - 1, 17), kind: 'pass', tier: p.tier });
    // the fans' coins are full after 8 hours: say so then, moved into the daytime
    const full = new Date(now + 8 * 3600000);
    if (full.getHours() < 10) full.setHours(10, 0, 0, 0);
    else if (full.getHours() * 60 + full.getMinutes() > 20 * 60 + 30) { full.setDate(full.getDate() + 1); full.setHours(10, 0, 0, 0); }
    list.push({ at: full.getTime(), kind: 'fans', coins: offlineCoins(Object.assign({}, save, { lastSeen: now }), now + 8 * 3600000).coins });
    list.push({ at: at(3, 18), kind: 'miss', record: save.best || save.record || 0 });
    const days = new Set(), out = [];
    for (const r of list) {
      const day = dayKey(new Date(r.at));
      if (r.at < now + 30 * 60000 || days.has(day)) continue;
      days.add(day);
      out.push(r);
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 3);
  }

  // ---------- weather ----------
  // Picked per flight. Rain and snow add drag low down, wind pushes you
  // sideways, and on New Year's Eve everything pays double.
  const WEATHER = {
    clear:   { icon: '✨', name: 'Clear skies',     desc: '' },
    rain:    { icon: '🌧️', name: 'Rain',            desc: 'More air resistance below 2,000 m', drag: 1.25 },
    wind:    { icon: '🌬️', name: 'Windy',           desc: 'Pushes you sideways below 2,000 m' },
    snow:    { icon: '❄️', name: 'Snow',            desc: 'A bit more drag, coins ×1.2', drag: 1.1, coin: 1.2 },
    newyear: { icon: '🎆', name: "New Year's Eve!", desc: 'Fireworks everywhere, coins ×2', coin: 2 },
  };
  function rollWeather(date, r) {
    const m = date.getMonth(), d = date.getDate();
    if ((m === 11 && d === 31) || (m === 0 && d === 1)) return 'newyear';
    if ((m === 11 || m <= 1) && r < 0.35) return 'snow';
    if (r < 0.6) return 'clear';
    if (r < 0.8) return 'rain';
    return 'wind';
  }

  // ---------- bosses ----------
  // One of each per flight, at a fixed height; dodge it for a big reward.
  const BOSSES = [
    { kind: 'gull',   y: 450,   name: 'Giant Seagull' },
    { kind: 'whale',  y: 16500, name: 'Space Whale' },
    { kind: 'mother', y: 23500, name: 'Mothership' },
  ];

  const api = {
    prestigeMult, canPrestige, prestige, SKINS, ACHIEVEMENTS, checkAchievements,
    dayKey, dailyMissions, trackMissions, missionDone, WEATHER, rollWeather, BOSSES, nice,
    LOGIN, checkLogin, offlineCoins, mysteryBox, rewardBase,
    EVENTS, activeEvent, eventState, addEventItems, PASS_TIERS, passNeed, passReward, passState, passDaysLeft, flightXp, addPassXp,
    planReminders,
  };
  root.VPMeta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
