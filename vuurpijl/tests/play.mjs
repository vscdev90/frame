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

// language: English by default, even on a Dutch phone, and the button switches
{
  const nlPage = await browser.newPage({ locale: 'nl-NL' });
  await nlPage.goto(BASE + '/index.html');
  if (!(await nlPage.textContent('#btn-launch')).includes('LAUNCH')) throw new Error('Dutch phone did not start in English');
  await nlPage.close();
}
const txt = (sel) => page.textContent(sel);
if (!(await txt('#btn-launch')).includes('LAUNCH')) throw new Error('English browser did not start in English');
await page.click('#btn-lang');
if (!(await txt('#btn-launch')).includes('LANCEREN')) throw new Error('language button did not switch to Dutch');
if (!(await txt('#upgrades')).includes('Stuwkracht')) throw new Error('upgrades not translated');
await page.click('#btn-lang');
if (!(await txt('#upgrades')).includes('Thrust')) throw new Error('upgrades not switched back to English');

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
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('play test ok');
