// Vuurpijl! — Dutch and English text. Dutch is the source language; logic.js
// keeps the Dutch names and this file supplies the English ones.
(function (root) {
  'use strict';

  const TEXT = {
    nl: {
      title: 'VUURPIJL', record: 'Record', flights: 'Vluchten', yourRocket: 'Jouw pijl',
      launchBtn: '🚀 LANCEREN', lightBtn: '🔥 AANSTEKEN', toShed: '🛠️ NAAR DE SCHUUR',
      resHeight: 'Hoogte', resCoins: 'Munten gepakt', resBonus: 'Knalbonus', resZone: 'Nieuwe zone', resTotal: 'Totaal',
      newRecord: '🏆 NIEUW RECORD!', sound: 'Geluid', reset: 'Opnieuw beginnen', lang: 'Taal',
      hintFirst: 'Steek de lont aan en tik als de naald in het GROENE vak staat!',
      hint: 'Steek de lont aan!', hintTap: 'Tik als de naald in het groene vak staat!',
      perfect: 'PERFECT! 🔥', good: 'GOED!', meh: 'Mwah…', late: 'Te laat…',
      plusFuel: '+KRUIT', plusTurbo: '+TURBO', ouch: ['AU!', 'BONK!', 'OEPS!', 'KRAK!'],
      plof: 'PLOF!', plofTitle: 'PLOF…', moon: 'DE MAAN! 🌕', moonToast: '🌕 DE MAAN! 🌕',
      booms: ['KNAL!', 'BOEM!', 'PATS!', 'WOEHOE!'],
      power: 'Kracht', maxed: 'MAXIMAAL', beenMoon: (n) => 'Je bent op de maan geweest ' + n + '×!',
      toMoon: 'Op naar de maan!', reachFirst: (m) => 'Haal eerst ' + m + ' m hoogte',
      evolved: 'EVOLUTIE! ', newZone: '✨ NIEUW: ', resetAsk: 'Alle voortgang wissen en opnieuw beginnen?',
      locale: 'nl-NL',
      siteHead: 'Lanceerplek', typeHead: 'Pijltype', upgHead: 'Upgrades',
      stage2: 'TRAP 2! 🔥', steerHint: '◀ Houd links of rechts vast om te sturen ▶',
      tilt: 'Kantelen', tiltOn: '📱 Sturen door te kantelen: AAN', tiltOff: '📱 Kantelen: UIT', tap: 'Tik om door te gaan',
    },
    en: {
      title: 'ROCKET', record: 'Record', flights: 'Flights', yourRocket: 'Your rocket',
      launchBtn: '🚀 LAUNCH', lightBtn: '🔥 LIGHT FUSE', toShed: '🛠️ TO THE SHED',
      resHeight: 'Height', resCoins: 'Coins collected', resBonus: 'Bang bonus', resZone: 'New zone', resTotal: 'Total',
      newRecord: '🏆 NEW RECORD!', sound: 'Sound', reset: 'Start over', lang: 'Language',
      hintFirst: 'Light the fuse, then tap when the needle is in the GREEN zone!',
      hint: 'Light the fuse!', hintTap: 'Tap when the needle is in the green zone!',
      perfect: 'PERFECT! 🔥', good: 'GOOD!', meh: 'Meh…', late: 'Too late…',
      plusFuel: '+FUEL', plusTurbo: '+TURBO', ouch: ['OUCH!', 'BONK!', 'OOPS!', 'CRACK!'],
      plof: 'FIZZLE!', plofTitle: 'FIZZLE…', moon: 'THE MOON! 🌕', moonToast: '🌕 THE MOON! 🌕',
      booms: ['BANG!', 'BOOM!', 'POW!', 'WOOHOO!'],
      power: 'Power', maxed: 'MAXED', beenMoon: (n) => 'You have been to the moon ' + n + '×!',
      toMoon: 'To the moon!', reachFirst: (m) => 'Reach ' + m + ' m first',
      evolved: 'EVOLVED! ', newZone: '✨ NEW: ', resetAsk: 'Erase all progress and start over?',
      locale: 'en-US',
      siteHead: 'Launch site', typeHead: 'Rocket type', upgHead: 'Upgrades',
      stage2: 'STAGE 2! 🔥', steerHint: '◀ Hold left or right to steer ▶',
      tilt: 'Tilt', tiltOn: '📱 Tilt steering: ON', tiltOff: '📱 Tilt: OFF', tap: 'Tap to continue',
    },
  };

  const EN_ZONES = ['Backyard', 'Above the roofs', 'The clouds', 'Flight path', 'Stratosphere', 'Outer space', 'Satellite orbit', 'THE MOON'];
  const EN_EVOS = ['Sparkler', 'Banger', 'Whistler', 'Golden Comet', 'Double Dragon', 'Moon Rocket'];
  const EN_UPGRADES = {
    kruit:   ['Powder',     'Burns longer'],
    stuw:    ['Thrust',     'Pushes harder'],
    aero:    ['Streamline', 'Less air resistance'],
    lont:    ['Fuse',       'Bigger PERFECT zone when lighting'],
    stuur:   ['Fins',       'Steer faster, spin less'],
    knal:    ['Bang',       'Bigger final bang = more coins'],
    magneet: ['Magnet',     'Pulls coins towards you'],
    turbo:   ['Turbo',      '+1 turbo boost per flight'],
  };

  const EN_SITES = ['Backyard', 'Beach', 'City', 'Mountain top', 'Launch base'];
  const EN_TYPES = [
    ['Classic',      'All-round'],
    ['Big Bertha',   'Slow, but a MEGA bang'],
    ['Screamer',     'Super fast, short, small bang'],
    ['Long Burner',  'Weaker, burns much longer'],
    ['Gold Digger',  'Coins ×1.6 and pulls them in'],
    ['Two-Stager',   'Second stage ignites mid-air'],
  ];

  const I = {
    lang: 'nl',
    set(lang) { I.lang = TEXT[lang] ? lang : 'en'; },
    t(key) { return TEXT[I.lang][key]; },
    zone(i, L) { return I.lang === 'en' ? EN_ZONES[i] : L.ZONES[i].name; },
    evo(i, L) { return I.lang === 'en' ? EN_EVOS[i] : L.EVOS[i].name; },
    site(i, L) { return I.lang === 'en' ? EN_SITES[i] : L.SITES[i].name; },
    typeName(i, L) { return I.lang === 'en' ? EN_TYPES[i][0] : L.TYPES[i].name; },
    typeDesc(i, L) { return I.lang === 'en' ? EN_TYPES[i][1] : L.TYPES[i].desc; },
    upgName(u) { return I.lang === 'en' ? EN_UPGRADES[u.id][0] : u.name; },
    upgDesc(u) { return I.lang === 'en' ? EN_UPGRADES[u.id][1] : u.desc; },
  };
  root.VPI18n = I;
})(window);
