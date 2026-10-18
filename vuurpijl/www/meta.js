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
  const KEEP = ['flights', 'ends', 'moon', 'prestige', 'best', 'achievements', 'skins', 'skin', 'visits', 'counters', 'daily', 'sound', 'tilt'];
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
        nohit: f.hits === 0 ? f.maxY : 0, power: f.powerups, vehicle: f.typeIdx === m.type ? f.maxY : 0,
      }[m.kind] || 0;
      m.progress = m.mode === 'sum' ? m.progress + v : Math.max(m.progress, v);
    }
  }
  function missionDone(m) { return m.progress >= m.target; }

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
  };
  root.VPMeta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
