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
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const state = () => page.evaluate(() => window.__vp.state);

await page.goto(BASE + '/index.html');
await page.waitForTimeout(500);
if (await state() !== 'shop') throw new Error('did not start in the shop');
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
  await shot('4-result');
  await page.click('#btn-continue');
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
await page.reload();
const before = await page.evaluate(() => window.__vp.save.coins);
await page.click('#missions .mission:first-child button');
const claimed = await page.evaluate(() => window.__vp.save);
if (!claimed.daily.missions[0].claimed || claimed.coins <= before) throw new Error('mission reward not paid');

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
await page.waitForTimeout(300);
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
await shot('15-result');
await page.click('#btn-continue');

// fly once from every site with everything you can launch (all unlocked)
for (let i = 0; i < 20; i++) {
  await page.evaluate((i) => {
    const s = window.__vp.save;
    Object.assign(s, { record: 60000, coins: 1e9, types: [...Array(20).keys()], type: i, site: i % 5, evo: 0 });
    Object.assign(s.lv, { kruit: 2, stuw: 6, aero: 6 });
    localStorage.setItem('vuurpijl-save-v1', JSON.stringify(s));
  }, i);
  await page.reload();
  await page.click('#btn-launch');
  await page.waitForTimeout(300);
  if (i < 5 || i % 3 === 0) await shot(`8-site${i}`);
  await page.click('#btn-light');
  await page.waitForTimeout(500);
  await page.mouse.click(195, 400);
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
await page.reload();
await page.click('#btn-launch');
await page.click('#btn-light');
await page.waitForTimeout(600);
await page.mouse.click(195, 400);
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
await page.reload();
if (!(await page.isVisible('#prestige'))) throw new Error('new universe not offered');
page.once('dialog', (d) => d.accept());
await page.click('#btn-prestige');
const uni = await page.evaluate(() => window.__vp.save);
if (uni.prestige !== 1 || uni.coins !== 0 || uni.record !== 0 || uni.skin !== 'shades') throw new Error('new universe did not reset properly');
if (!(await page.textContent('#shop-universe')).includes('Universe #2')) throw new Error('universe line missing');
await shot('16-universe');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('play test ok');
