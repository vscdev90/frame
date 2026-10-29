// Plays the game in a real browser: shop → light fuse → fly → result → buy.
// Fails on any page error. Screenshots go to $SHOTS if set.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8898';
const SHOTS = process.env.SHOTS;
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
// Android's WebView silently answers native dialogs with "no", so the game must never use them
page.on('dialog', (d) => { errors.push('native dialog used: ' + d.message()); d.dismiss(); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const state = () => page.evaluate(() => window.__vp.state);
// the splash screen covers everything until it is tapped
// reward popups (daily streak, mystery box) can turn up after a flight or a reload; tap them away
const popups = [];
const dismissRewards = async (p) => {
  // a plain click would set off the handler below a second time, so send the event directly
  while (await p.isVisible('#reward')) { popups.push(await p.textContent('#reward-title')); await p.dispatchEvent('#reward-ok', 'click'); }
};
await page.addLocatorHandler(page.locator('#reward'), () => dismissRewards(page));
const reload = async () => { await page.reload(); await page.click('#splash'); await page.waitForTimeout(900); await dismissRewards(page); };

await page.goto(BASE + '/index.html');
await page.waitForTimeout(300);
if (!(await page.isVisible('#splash'))) throw new Error('no splash screen');
await shot('0-splash');
await page.click('#splash');
await page.waitForTimeout(600);
if (await page.isVisible('#splash')) throw new Error('splash did not close');
if (await state() !== 'shop') throw new Error('did not start in the shop');
if (!(await page.evaluate(() => window.__vp.music))) throw new Error('menu music did not start');
await shot('1-shop');

// language: always English, also on a Dutch phone, and no language button
{
  const nlPage = await browser.newPage({ locale: 'nl-NL' });
  await nlPage.goto(BASE + '/index.html');
  await nlPage.waitForTimeout(300);
  const text = await nlPage.textContent('body');
  for (const dutch of ['LANCEREN', 'Kruit', 'Achtertuin', 'Vuurwerk', 'Klassiek', 'Haal eerst', 'Kracht']) {
    if (text.includes(dutch)) throw new Error('Dutch text in the shop: ' + dutch);
  }
  if (await nlPage.$('#btn-lang')) throw new Error('language button should be gone');
  await nlPage.close();
}

for (let flight = 0; flight < 3; flight++) {
  await page.click('#btn-launch');
  await page.click('#btn-light');
  await page.waitForTimeout(900);
  await shot('2-fuse');
  await page.mouse.click(195, 400);
  if (await state() !== 'flight') throw new Error('tap did not launch');
  await page.waitForTimeout(700);
  await shot('3-flight');
  for (let i = 0; i < 80 && (await state()) !== 'result'; i++) await page.waitForTimeout(250);
  if (await state() !== 'result') throw new Error('flight never ended');
  await page.waitForTimeout(900);
  await shot('4-result');
  if (!(await page.textContent('#res-next-text')).trim()) throw new Error('result screen shows no next goal');
  if (flight === 0) {
    // FLY AGAIN goes straight back to the launch pad
    await page.dispatchEvent('#btn-again', 'click'); // it pulses, so it never holds still
    if (await state() !== 'ignite') throw new Error('fly again did not go to the launch pad');
    if ((await page.evaluate(() => window.vpBack())) !== 'ok' || (await state()) !== 'shop') throw new Error('back did not leave the launch pad');
  } else await page.click('#btn-continue');
}
const save = await page.evaluate(() => window.__vp.save);
if (save.flights !== 3 || save.coins <= 0) throw new Error('save not updated: ' + JSON.stringify(save));
// buy the first affordable upgrade
const buy = await page.$('.upg .buy:not([disabled])');
if (!buy) throw new Error('nothing affordable after 3 flights');
await buy.click();
await shot('5-bought');
const after = await page.evaluate(() => window.__vp.save);
const total = Object.values(after.lv).reduce((a, b) => a + b, 0);
if (total !== 1) throw new Error('upgrade not applied');

// features show up one by one: after 3 flights the hangar and the missions, not yet the pass
if (!(await page.isVisible('#btn-hangar')) || !(await page.isVisible('#btn-missions'))) throw new Error('hangar and missions should be open after 3 flights');
if (await page.isVisible('#btn-pass')) throw new Error('the pass should wait until flight 5');
if ((await page.$$('#upgrades .upg')).length !== 8) throw new Error('all eight upgrades after 3 flights');
await page.click('#btn-hangar');
if (!(await page.isVisible('#hangar'))) throw new Error('hangar did not open');
await shot('17-hangar');
await page.click('[data-close="hangar"]');

// shop shows every launch site and rocket type
if ((await page.$$('#sites .chip')).length !== 5) throw new Error('expected 5 launch sites');
const nTypes = (await page.$$('[id^=types-] .chip')).length;
if (nTypes !== 20) throw new Error('expected 20 things to launch, got ' + nTypes);

// daily missions: three plus a bonus chest; finish one and claim it
const setSave = (fn) => page.evaluate((src) => {
  const s = window.__vp.save;
  new Function('s', src)(s);
  localStorage.setItem('vuurpijl-save-v1', JSON.stringify(s));
}, fn);
if ((await page.$$('#missions .mission')).length !== 4) throw new Error('expected 3 missions and a chest');
await setSave('const m = s.daily.missions[0]; m.progress = m.target; s.coins = 50000;');
await reload();
const before = await page.evaluate(() => window.__vp.save.coins);
if (!(await page.isVisible('#btn-missions .dot'))) throw new Error('missions icon should show a dot when one can be claimed');
await page.click('#btn-missions');
await page.click('#missions .mission:first-child button');
const claimed = await page.evaluate(() => window.__vp.save);
if (!claimed.daily.missions[0].claimed || claimed.coins <= before) throw new Error('mission reward not paid');
await page.click('[data-close="missionsview"]');
if (await page.isVisible('#missionsview')) throw new Error('missions did not close');

// collection: skins, star map, achievements
await page.click('#btn-collection');
if (!(await page.isVisible('#collection'))) throw new Error('collection did not open');
if ((await page.$$('#badges .badge')).length < 15) throw new Error('achievements missing');
if ((await page.$$('#starmap .planet')).length !== 7) throw new Error('star map should list 7 places');
await page.click('#skins .chip:nth-child(2)'); // sunglasses, 2,000 coins
if ((await page.evaluate(() => window.__vp.save.skin)) !== 'shades') throw new Error('skin not bought');
await shot('11-collection');
await page.click('#btn-close-collection');

// one flight that touches everything new: power-ups, shield, coin rain, combo, a boss, weather
await page.click('#btn-launch');
await page.click('#btn-light');
await page.waitForTimeout(500);
await page.mouse.click(195, 400);
const vp = (fn, arg) => page.evaluate(fn, arg);
await vp(() => { window.__vp.rocket.fuel += 6; }); // a long burn, so there is time for everything below
await page.waitForTimeout(300);
// a near miss (while the rocket is still fast): a balloon just beside you pays out once it is behind you
await vp(() => window.__vp.spawnAhead('balloon', { r: 17 }, 60, 17 + 16 + 18));
for (let k = 0; k < 25 && !(await vp(() => window.__vp.flight.near)); k++) await page.waitForTimeout(150);
if (!((await vp(() => window.__vp.flight.near)) >= 1)) throw new Error('close call not counted');
await vp(() => window.__vp.spawnAhead('shield'));
await page.waitForTimeout(400);
if (!(await vp(() => window.__vp.rocket.shield))) throw new Error('shield not picked up');
await vp(() => window.__vp.spawnAhead('bird', { r: 17, dir: 1 }));
await page.waitForTimeout(400);
if (await vp(() => window.__vp.rocket.shield)) throw new Error('shield did not block the bird');
await vp(() => window.__vp.spawnAhead('magnetp'));
await vp(() => { for (let i = 0; i < 8; i++) window.__vp.spawnAhead('coin', { r: 11, v: 1 }, 40 + i * 14); });
await page.waitForTimeout(600);
if ((await vp(() => window.__vp.combo)) < 5) throw new Error('coins in a row did not build a combo');
await shot('12-combo');
// a golden coin is worth ten
const g0 = await vp(() => window.__vp.rocket.coins);
await vp(() => window.__vp.spawnAhead('coin', { r: 15, v: 10, gold: true }));
await page.waitForTimeout(400);
if ((await vp(() => window.__vp.rocket.coins)) - g0 < 10) throw new Error('golden coin did not pay');
await vp(() => window.__vp.spawnAhead('goldcloud', { r: 38 }));
await page.waitForTimeout(400);
if (!((await vp(() => window.__vp.bonusT)) > 0)) throw new Error('golden cloud did not start a coin rain');
await vp(() => window.__vp.spawnAhead('slowmo'));
for (const w of ['rain', 'snow', 'wind', 'newyear']) {
  await vp((w) => { window.__vp.weather.id = w; window.__vp.weather.wind = 5; }, w);
  await page.waitForTimeout(150);
  await shot('13-weather-' + w);
  if ((await vp(() => window.__vp.weather.id)) !== w) throw new Error('weather not set');
}
await vp(() => window.__vp.spawnAhead('boss', { kind: 'whale', bx: window.__vp.rocket.x, r: 58 }));
await page.waitForTimeout(500);
await shot('14-boss');
for (let k = 0; k < 300 && (await state()) === 'flight'; k++) await page.waitForTimeout(150);
for (let k = 0; k < 20 && (await state()) !== 'result'; k++) await page.waitForTimeout(150);
if (await state() !== 'result') throw new Error('extras flight did not end');
// share falls back to a download in a desktop browser
const dl = page.waitForEvent('download', { timeout: 5000 });
await page.click('#btn-share');
const file = await dl;
if (!/^rocket-\d+m\.png$/.test(file.suggestedFilename())) throw new Error('unexpected share file ' + file.suggestedFilename());
await page.waitForTimeout(900);
await shot('15-result');
const lv0 = await page.evaluate(() => Object.values(window.__vp.save.lv).reduce((a, b) => a + b, 0));
if (!(await page.isVisible('#btn-res-buy'))) throw new Error('no buy button on the result screen');
await page.click('#btn-res-buy');
const lv1 = await page.evaluate(() => Object.values(window.__vp.save.lv).reduce((a, b) => a + b, 0) + window.__vp.save.evo);
if (lv1 <= lv0) throw new Error('buy on the result screen did nothing');
await page.click('#btn-continue');

// there is no cheat mode: five taps on the title change nothing
const before5 = await page.evaluate(() => JSON.stringify(window.__vp.save));
for (let i = 0; i < 5; i++) await page.click('#shop .wallet');
if (await page.$('#cheats, [data-cheat], #btn-boom')) throw new Error('cheat mode is still in the page');
if ((await page.evaluate(() => JSON.stringify(window.__vp.save))) !== before5) throw new Error('title taps changed the save');

// the space rocket counts down before it lifts off; the cola gets a mint
await setSave('s.types = [...Array(20).keys()]; s.type = 19;');
await reload();
await page.click('#btn-launch');
if (await page.evaluate(() => window.__vp.music)) throw new Error('music should stop on the launch pad');
await page.click('#btn-light');
await page.waitForTimeout(500);
await page.mouse.click(195, 400);
if (await state() !== 'countdown') throw new Error('space rocket did not count down');
await page.waitForTimeout(1200);
await shot('18-countdown');
for (let k = 0; k < 40 && (await state()) === 'countdown'; k++) await page.waitForTimeout(150);
if (await state() !== 'flight') throw new Error('countdown did not lift off');
await page.waitForTimeout(250);
await shot('19-liftoff');
for (let k = 0; k < 300 && (await state()) === 'flight'; k++) await page.waitForTimeout(150);
for (let k = 0; k < 20 && (await state()) !== 'result'; k++) await page.waitForTimeout(150);
await page.click('#btn-continue');
await setSave('s.type = 6;');
await reload();
await page.click('#btn-launch');
await page.click('#btn-light');
await page.waitForTimeout(250);
await shot('20-cola-mint');
await page.waitForTimeout(900);
await shot('21-cola-fizz');
await page.mouse.click(195, 400);
await page.waitForTimeout(200);
await shot('22-cola-liftoff');
for (let k = 0; k < 300 && (await state()) === 'flight'; k++) await page.waitForTimeout(150);
for (let k = 0; k < 20 && (await state()) !== 'result'; k++) await page.waitForTimeout(150);
await page.click('#btn-continue');

// fly once from every site with everything you can launch (all unlocked)
for (let i = 0; i < 20; i++) {
  await page.evaluate((i) => {
    const s = window.__vp.save;
    Object.assign(s, { record: 60000, coins: 1e9, types: [...Array(20).keys()], type: i, site: i % 5, evo: 0 });
    Object.assign(s.lv, { kruit: 2, stuw: 6, aero: 6 });
    localStorage.setItem('vuurpijl-save-v1', JSON.stringify(s));
  }, i);
  await reload();
  await page.click('#btn-launch');
  await page.waitForTimeout(300);
  if (i < 5 || i % 3 === 0) await shot(`8-site${i}`);
  await page.click('#btn-light');
  await page.waitForTimeout(500);
  await page.mouse.click(195, 400);
  for (let k = 0; k < 40 && (await state()) === 'countdown'; k++) await page.waitForTimeout(150);
  for (let k = 0; k < 300 && (await state()) === 'flight'; k++) {
    if (k === 6) await shot(`9-fly${i}`);
    await page.waitForTimeout(150);
  }
  if (await state() !== 'boom') throw new Error('type ' + i + ' did not explode, state ' + (await state()));
  await page.waitForTimeout(250);
  await shot(`10-bang${i}`);
  await page.waitForTimeout(150);
  await page.mouse.click(195, 400); // tap skips the rest of the explosion
  if (await state() !== 'result') throw new Error('tap did not skip the explosion');
  await page.click('#btn-continue');
}

// a long flight with a strong rocket, to exercise high zones and the moon
await page.evaluate(() => {
  const s = window.__vp.save;
  Object.assign(s.lv, { kruit: 25, stuw: 25, aero: 25, turbo: 5 }); s.evo = 8; s.type = 19; s.site = 4;
  localStorage.setItem('vuurpijl-save-v1', JSON.stringify(s));
});
await reload();
await page.click('#btn-launch');
await page.click('#btn-light');
await page.waitForTimeout(600);
await page.mouse.click(195, 400);
for (let k = 0; k < 40 && (await state()) === 'countdown'; k++) await page.waitForTimeout(150);
for (let i = 0; i < 480 && (await state()) === 'flight'; i++) {
  if (i % 40 === 10) await shot(`6-high${i}`);
  if (await page.isVisible('#btn-turbo') && i % 8 === 0) await page.dispatchEvent('#btn-turbo', 'pointerdown');
  await page.waitForTimeout(250);
}
for (let i = 0; i < 20 && (await state()) !== 'result'; i++) await page.waitForTimeout(250);
await shot('7-end');
const r = await page.evaluate(() => window.__vp.rocket.maxY);
console.log('strong rocket reached', Math.round(r), 'm');
if (await state() === 'result') await page.click('#btn-continue');

// a new universe after the black hole
await setSave('s.ends = Math.max(1, s.ends);');
await reload();
if (!(await page.isVisible('#prestige'))) throw new Error('new universe not offered');
await page.click('#btn-prestige');
if (!(await page.isVisible('#modal'))) throw new Error('no confirmation dialog');
await page.click('#modal-yes');
const uni = await page.evaluate(() => window.__vp.save);
if (uni.prestige !== 1 || uni.coins !== 0 || uni.record !== 0 || uni.skin !== 'shades') throw new Error('new universe did not reset properly');
if (!(await page.textContent('#shop-universe')).includes('Universe #2')) throw new Error('universe line missing');
// the reset button (in the collection's settings) asks the same way; cancel keeps everything
await page.click('#btn-collection');
await page.click('#btn-reset');
await page.click('#modal-no');
await page.click('[data-close="collection"]');
if ((await page.evaluate(() => window.__vp.save.prestige)) !== 1) throw new Error('cancel should keep the save');
await shot('16-universe');
// today's streak popped up after a reload, and the pass went up a tier or more
if (!popups.some((t) => t.includes('Day 1 streak'))) throw new Error('no daily streak popup: ' + popups.join(', '));
if (!((await page.evaluate(() => window.__vp.save.pass.tier)) >= 1)) throw new Error('all those flights and missions did not reach pass tier 1');
// the pass icon opens every tier
if (!(await page.isVisible('#btn-pass'))) throw new Error('pass icon missing after many flights');
await page.click('#btn-pass');
if (!(await page.isVisible('#passview')) || (await page.$$('#pass-tiers .tier')).length !== 30) throw new Error('pass view should list 30 tiers');
if (!(await page.textContent('#pass')).includes('Tier') || !(await page.$('#pass-tiers .tier.now'))) throw new Error('current tier not shown');
await shot('17-pass');
await page.click('[data-close="passview"]');
if (await page.isVisible('#btn-pass .dot')) throw new Error('the pass dot should clear once seen');

// Halloween (the clock is set to the 30th of October): a banner, sweets, bats, and a witch hat at 120 sweets
{
  const ev = await browser.newPage({ viewport: { width: 390, height: 844 } });
  ev.on('pageerror', (e) => errors.push('halloween pageerror: ' + e.message));
  ev.on('dialog', (d) => { errors.push('native dialog used: ' + d.message()); d.dismiss(); });
  await ev.clock.setFixedTime(new Date(2026, 9, 30, 12, 0));
  await ev.addInitScript(() => {
    if (!localStorage.getItem('vuurpijl-save-v1')) localStorage.setItem('vuurpijl-save-v1', JSON.stringify({ flights: 1, login: { day: '2026-10-30', streak: 1 } }));
  });
  await ev.goto(BASE + '/index.html');
  if (!(await ev.textContent('#splash-event')).includes('Halloween')) throw new Error('splash does not mention Halloween');
  await ev.click('#splash');
  await ev.waitForTimeout(700);
  if (SHOTS) await ev.screenshot({ path: SHOTS + '/30-halloween-shop.png' });
  await ev.click('#btn-event');
  const banner = await ev.textContent('#event');
  if (!(await ev.isVisible('#event')) || !banner.includes('4 days left') || !banner.includes('0/40')) throw new Error('Halloween banner wrong: ' + banner);
  if (SHOTS) await ev.screenshot({ path: SHOTS + '/30b-halloween-panel.png' });
  await ev.click('[data-close="eventview"]');
  await ev.evaluate(() => { Object.assign(window.__vp.save.event, { n: 119, paid: 80 }); });
  await ev.click('#btn-launch'); await ev.click('#btn-light'); await ev.waitForTimeout(500);
  await ev.mouse.click(195, 400);
  await ev.waitForTimeout(300);
  await ev.evaluate(() => window.__vp.spawnAhead('candy', { r: 13 }));
  await ev.waitForTimeout(400);
  if (!((await ev.evaluate(() => window.__vp.flight.candy)) >= 1)) throw new Error('sweet not picked up');
  await ev.evaluate(() => { window.__vp.spawnAhead('bird', { r: 17, dir: 1, spooky: true }, 150, 90); window.__vp.spawnAhead('balloon', { r: 17, spooky: true }, 250, -90); });
  await ev.waitForTimeout(250);
  if (SHOTS) await ev.screenshot({ path: SHOTS + '/31-halloween-flight.png' });
  for (let k = 0; k < 300 && (await ev.evaluate(() => window.__vp.state)) !== 'result'; k++) {
    if ((await ev.evaluate(() => window.__vp.state)) === 'boom') await ev.mouse.click(195, 400);
    await ev.waitForTimeout(150);
  }
  if (!(await ev.textContent('#res-pass')).includes('🍬 +')) throw new Error('sweets missing on the result screen');
  await ev.waitForSelector('#reward:not(.hidden)', { timeout: 3000 });
  if (!(await ev.textContent('#reward-title')).includes('Halloween prize') || !(await ev.textContent('#reward-text')).includes('Witch hat')) throw new Error('no witch hat at 120 sweets');
  if (SHOTS) await ev.screenshot({ path: SHOTS + '/32-witch-hat.png' });
  await ev.click('#reward-ok');
  if (!(await ev.evaluate(() => window.__vp.save.skins.includes('witch')))) throw new Error('witch hat not given');
  await ev.click('#btn-continue');
  if (!(await ev.textContent('#event')).includes('All prizes collected')) throw new Error('banner should say all prizes are collected');
  if (!(await ev.textContent('#event-count')).includes('120')) throw new Error('the event icon should count the sweets');
  await ev.click('#btn-collection');
  await ev.click('#skins .chip:has-text("Witch hat")');
  if ((await ev.evaluate(() => window.__vp.save.skin)) !== 'witch') throw new Error('could not wear the witch hat');
  await ev.click('#btn-close-collection');
  if (SHOTS) await ev.screenshot({ path: SHOTS + '/33-witch-on.png' });
  await ev.close();
}

// after the event (10 November): no banner and no sweets; a pass tier pays out with a popup
{
  const off = await browser.newPage({ viewport: { width: 390, height: 844 } });
  off.on('pageerror', (e) => errors.push('november pageerror: ' + e.message));
  await off.clock.setFixedTime(new Date(2026, 10, 10, 12, 0));
  await off.addInitScript(() => {
    if (!localStorage.getItem('vuurpijl-save-v1')) localStorage.setItem('vuurpijl-save-v1', JSON.stringify({ flights: 10, login: { day: '2026-11-10', streak: 1 }, pass: { season: '2026-11', xp: 95, tier: 0 } }));
  });
  await off.goto(BASE + '/index.html');
  if ((await off.textContent('#splash-event')).trim()) throw new Error('no event in November');
  await off.click('#splash');
  await off.waitForTimeout(700);
  if ((await off.isVisible('#btn-event')) || (await off.evaluate(() => window.__vp.event)) !== null) throw new Error('Halloween should be over');
  if (!(await off.textContent('#pass-days')).includes('21 days left')) throw new Error('pass days wrong: ' + (await off.textContent('#pass-days')));
  await off.click('#btn-launch'); await off.click('#btn-light'); await off.waitForTimeout(500);
  await off.mouse.click(195, 400);
  for (let k = 0; k < 300 && (await off.evaluate(() => window.__vp.state)) !== 'result'; k++) {
    if ((await off.evaluate(() => window.__vp.state)) === 'boom') await off.mouse.click(195, 400);
    await off.waitForTimeout(150);
  }
  for (let k = 0; k < 20 && !(await off.textContent('#toast')).includes('Pass tier 1'); k++) await off.waitForTimeout(150);
  if (!(await off.textContent('#toast')).includes('Pass tier 1')) throw new Error('no pass tier message: ' + (await off.textContent('#toast')));
  if (await off.isVisible('#reward')) throw new Error('a pass tier alone should not open a popup');
  await off.click('#btn-continue');
  if (!(await off.textContent('#pass-tier')).includes('Tier 1/30')) throw new Error('pass card not updated');
  if (!(await off.isVisible('#btn-pass .dot'))) throw new Error('pass icon should show a dot for the new tier');
  await off.click('#btn-pass');
  if ((await off.$$('#pass-tiers .tier.done')).length !== 1) throw new Error('tier 1 should be done');
  await off.close();
}

// coming back after three hours, on day 7 of a streak: coins from your fans and the big daily prize, in one popup
{
  const back = await browser.newPage({ viewport: { width: 390, height: 844 } });
  back.on('pageerror', (e) => errors.push('back pageerror: ' + e.message));
  await back.addInitScript(() => {
    if (sessionStorage.getItem('set')) return;
    sessionStorage.setItem('set', '1');
    const y = new Date(); y.setDate(y.getDate() - 1);
    const key = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    localStorage.setItem('vuurpijl-save-v1', JSON.stringify({ coins: 100, record: 900, best: 900, flights: 12, lastSeen: Date.now() - 3 * 3600000, login: { day: key, streak: 6 } }));
  });
  await back.goto(BASE + '/index.html');
  await back.click('#splash');
  await back.waitForSelector('#reward:not(.hidden)', { timeout: 3000 });
  if (!(await back.textContent('#reward-title')).includes('Welcome back')) throw new Error('no welcome back popup');
  if (!(await back.textContent('#reward-text')).includes('(3 h)')) throw new Error('away time wrong: ' + (await back.textContent('#reward-text')));
  const c1 = await back.evaluate(() => window.__vp.save.coins);
  if (!(c1 > 100)) throw new Error('offline coins not paid');
  if (SHOTS) await back.screenshot({ path: SHOTS + '/25-welcome-back.png' });
  if (!(await back.textContent('#reward-text')).includes('Day 7')) throw new Error('day 7 prize missing from the popup');
  if ((await back.$$('#reward-days > div')).length !== 7 || !(await back.$('#reward-days > div:nth-child(7).today'))) throw new Error('streak days not shown');
  // both are paid at once: 3 h of fans (about 190 an hour here) and ten times the daily base (about 1,160)
  const c2 = await back.evaluate(() => window.__vp.save.coins);
  if (!(c2 >= 100 + 3 * 190 * 0.9 + 10 * 1160 * 0.9)) throw new Error('welcome back and day 7 paid too little: ' + (c2 - 100));
  await back.click('#reward-ok');
  if (await back.isVisible('#reward')) throw new Error('popups did not close');
  const lg = await back.evaluate(() => window.__vp.save.login.streak);
  if (lg !== 7) throw new Error('streak not saved');
  // the same day again: nothing new
  await back.reload();
  await back.click('#splash');
  await back.waitForTimeout(1200);
  if (await back.isVisible('#reward')) throw new Error('daily reward paid twice on one day');
  // the 8th flight ends with a mystery box; and it lands just short of the record
  await back.evaluate(() => { Object.assign(window.__vp.save, { flights: 7 }); Object.assign(window.__vp.save.lv, { kruit: 4, stuw: 4, aero: 4 }); });
  await back.click('#btn-launch'); await back.click('#btn-light'); await back.waitForTimeout(500);
  await back.mouse.click(195, 400);
  for (let k = 0; k < 300 && (await back.evaluate(() => window.__vp.state)) !== 'result'; k++) {
    if ((await back.evaluate(() => window.__vp.state)) === 'boom') {
      await back.evaluate(() => { window.__vp.save.record = Math.round(window.__vp.rocket.maxY) + 12; });
      await back.mouse.click(195, 400);
    }
    await back.waitForTimeout(150);
  }
  if (!(await back.isVisible('#res-close')) || !/SO CLOSE! Only 1\d m short/.test(await back.textContent('#res-close'))) throw new Error('no "so close" line: ' + (await back.textContent('#res-close')));
  await back.waitForTimeout(1700);
  if (!(await back.isVisible('#reward')) || !(await back.textContent('#reward-title')).includes('Mystery box')) throw new Error('no mystery box on flight 8');
  if (SHOTS) await back.screenshot({ path: SHOTS + '/27-mystery-box.png' });
  await back.click('#reward-ok');
  await back.click('#btn-continue');
  await back.close();
}

// The Android app: rewarded videos through the Android bridge (mocked here).
{
  const app = await browser.newPage({ viewport: { width: 390, height: 844 } });
  app.on('pageerror', (e) => errors.push('app pageerror: ' + e.message));
  app.on('dialog', (d) => { errors.push('native dialog used: ' + d.message()); d.dismiss(); });
  await app.addInitScript(() => {
    window.__ads = 0;
    window.AndroidBridge = {
      version: () => '1.0.99', adReady: () => true,
      showRewarded: (tag) => { window.__ads++; setTimeout(() => window.vpAdDone(tag, true), 50); },
      privacyOptionsRequired: () => true, showPrivacyOptions: () => {}, vibrate: () => {},
      notifyStatus: () => 'ask', openNotifySettings: () => {},
      requestNotify: () => { window.__asked = (window.__asked || 0) + 1; setTimeout(() => window.vpNotifyDone(true), 30); },
      scheduleNotifications: (json) => { window.__sched = JSON.parse(json); },
    };
    // an old save from when there was a cheat mode
    localStorage.setItem('vuurpijl-save-v1', JSON.stringify({ coins: 5000, record: 300, flights: 5, cheats: true, god: true, infFuel: true }));
  });
  await app.goto(BASE + '/index.html');
  await app.click('#splash');
  await app.waitForTimeout(500);
  const old = await app.evaluate(() => window.__vp.save);
  if ('god' in old || 'cheats' in old || 'infFuel' in old) throw new Error('old cheat settings were not cleaned out of the save');
  // a returning player gets today's streak reward, and a video doubles it
  await app.waitForSelector('#reward:not(.hidden)', { timeout: 3000 });
  if (!(await app.isVisible('#reward-ad'))) throw new Error('reward popup has no video button');
  const r0 = await app.evaluate(() => window.__vp.save.coins);
  await app.click('#reward-ad');
  await app.waitForTimeout(300);
  if (!((await app.evaluate(() => window.__vp.save.coins)) > r0)) throw new Error('reward video paid nothing');
  if (await app.isVisible('#reward')) throw new Error('reward popup did not close after the video');
  // then, once, the game asks about reminders in its own words; yes asks Android for the permission
  await app.waitForSelector('#modal:not(.hidden)', { timeout: 2000 });
  if (!(await app.textContent('#modal-text')).includes('heads-up')) throw new Error('reminder question missing');
  if (SHOTS) await app.screenshot({ path: SHOTS + '/28-notify-ask.png' });
  await app.click('#modal-yes');
  await app.waitForTimeout(200);
  if ((await app.evaluate(() => window.__asked)) !== 1 || (await app.evaluate(() => window.__vp.save.notify)) !== true) throw new Error('permission not asked');
  const plan = await app.evaluate(() => window.__sched);
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 3) throw new Error('no reminder plan: ' + JSON.stringify(plan));
  const days = new Set(plan.map((r) => new Date(r.at).toDateString()));
  if (days.size !== plan.length) throw new Error('two reminders on one day');
  for (const r of plan) {
    const h = new Date(r.at).getHours();
    if (!r.title || !r.text || h < 10 || h > 20 || r.at < Date.now()) throw new Error('bad reminder ' + JSON.stringify(r));
  }
  if ((await app.evaluate(() => window.vpPause())) !== 'ok') throw new Error('pause hook missing');
  await app.addLocatorHandler(app.locator('#reward'), () => dismissRewards(app));
  // free boost: a video gives +2 turbo on the next flight
  await app.waitForTimeout(1200);
  await app.click('#btn-ad-boost');
  await app.waitForTimeout(300);
  if ((await app.evaluate(() => window.__vp.save.bonusTurbo)) !== 2) throw new Error('boost video did not give turbo');
  if (SHOTS) await app.screenshot({ path: SHOTS + '/23-ad-boost.png' });
  await app.click('#btn-launch'); await app.click('#btn-light'); await app.waitForTimeout(500);
  await app.mouse.click(195, 400);
  if ((await app.evaluate(() => window.__vp.rocket.turboLeft)) < 2) throw new Error('boost turbo not applied');
  for (let k = 0; k < 300 && (await app.evaluate(() => window.__vp.state)) !== 'result'; k++) {
    if ((await app.evaluate(() => window.__vp.state)) === 'boom') await app.mouse.click(195, 400);
    await app.waitForTimeout(150);
  }
  // double the coins with a video
  await app.waitForTimeout(1300);
  const c1 = await app.evaluate(() => window.__vp.save.coins);
  await app.click('#btn-ad-double');
  await app.waitForTimeout(300);
  const c2 = await app.evaluate(() => window.__vp.save.coins);
  if (!(c2 > c1)) throw new Error('double-coins video paid nothing');
  if (await app.isVisible('#btn-ad-double')) throw new Error('double button should be used up');
  if (SHOTS) await app.screenshot({ path: SHOTS + '/24-ad-double.png' });
  await app.click('#btn-continue');
  await app.click('#btn-collection');
  if (!(await app.isVisible('#btn-privacy'))) throw new Error('privacy options button missing');
  // reminders can be switched off (and the plan is cleared)
  if (!(await app.textContent('#btn-notify')).includes('ON')) throw new Error('reminder switch missing');
  await app.click('#btn-notify');
  if (!(await app.textContent('#btn-notify')).includes('OFF') || (await app.evaluate(() => window.__sched.length)) !== 0) throw new Error('reminders did not switch off');
  if (!(await app.textContent('#col-stats')).includes('v1.0.99')) throw new Error('version missing');
  if ((await app.evaluate(() => window.__ads)) !== 3) throw new Error('expected three videos');
  await app.close();
}

await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('play test ok');
