// Makes the Play Store art and the app icon from the game itself:
//   vuurpijl/store/icon-512.png, feature-1024x500.png, screenshot-1..6.png (1080x1920)
//   android/app/src/main/res/mipmap-*/ic_launcher_{background,foreground}.png
// Run with the game served at $BASE:  node vuurpijl/tools/store-art.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8897';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'store');
const RES = join(ROOT, 'android/app/src/main/res');
mkdirSync(STORE, { recursive: true });

const browser = await chromium.launch();
const save = (path, dataUrl) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64')); };

// ---------- icon and feature graphic, drawn with the game's own rocket art ----------
const art = await browser.newPage();
await art.goto(BASE + '/index.html');
await art.click('#splash');
await art.evaluate(() => document.fonts.load("80px 'Lilita One'"));

const icons = await art.evaluate(() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  function sky(p, w, h, seed) {
    const g = p.createRadialGradient(w * 0.45, h * 0.35, 0, w * 0.45, h * 0.35, Math.max(w, h) * 0.8);
    g.addColorStop(0, '#6a2fa0'); g.addColorStop(0.45, '#22155a'); g.addColorStop(1, '#090a26');
    p.fillStyle = g; p.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      p.fillStyle = 'rgba(255,255,255,' + (0.3 + hash(i + seed) * 0.7) + ')';
      const r = (0.6 + hash(i + seed + 50) * 1.6) * Math.min(w, h) / 300;
      p.beginPath(); p.arc(hash(i + seed + 100) * w, hash(i + seed + 200) * h, r, 0, 7); p.fill();
    }
  }
  function burst(p, x, y, r, cols) {
    p.save(); p.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + k * 0.2, rr = r * (1 - k * 0.35);
      p.fillStyle = cols[(i + k) % cols.length];
      p.beginPath(); p.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.045, 0, 7); p.fill();
      p.strokeStyle = cols[(i + k) % cols.length]; p.globalAlpha = 0.35; p.lineWidth = r * 0.02;
      p.beginPath(); p.moveTo(x + Math.cos(a) * rr * 0.55, y + Math.sin(a) * rr * 0.55); p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); p.stroke();
      p.globalAlpha = 1;
    }
    p.restore();
  }
  function moon(p, x, y, r) {
    const g = p.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(255,250,220,.35)'); g.addColorStop(1, 'rgba(255,250,220,0)');
    p.fillStyle = g; p.beginPath(); p.arc(x, y, r * 2.4, 0, 7); p.fill();
    p.fillStyle = '#f4f1de'; p.beginPath(); p.arc(x, y, r, 0, 7); p.fill();
    p.fillStyle = 'rgba(160,150,130,.45)';
    [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12]].forEach(([a, b, rr]) => { p.beginPath(); p.arc(x + a * r, y + b * r, rr * r, 0, 7); p.fill(); });
  }
  // a rocket in flight: smoke trail, glow, then the rocket itself (game art)
  function flyer(p, x, y, ang, scale, o) {
    const back = [-Math.sin(ang), Math.cos(ang)];
    for (let i = 0; i < 14; i++) {
      const d = (24 + i * 13) * scale, r = (6 + i * 2.2) * scale;
      p.fillStyle = 'rgba(200,205,225,' + (0.32 - i * 0.02) + ')';
      p.beginPath(); p.arc(x + back[0] * d + Math.sin(i * 1.7) * 3 * scale, y + back[1] * d, r, 0, 7); p.fill();
    }
    p.save(); p.globalCompositeOperation = 'lighter';
    const g = p.createRadialGradient(x, y, 0, x, y, 70 * scale);
    g.addColorStop(0, 'rgba(255,170,60,.7)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    p.fillStyle = g; p.beginPath(); p.arc(x, y, 70 * scale, 0, 7); p.fill();
    p.restore();
    window.__vp.paint(p, x, y, Object.assign({ ang, scale, flame: 1 }, o));
  }
  function sparkle(p, x, y, r, col) {
    p.fillStyle = col;
    p.beginPath(); p.moveTo(x, y - r); p.lineTo(x + r * 0.22, y - r * 0.22); p.lineTo(x + r, y); p.lineTo(x + r * 0.22, y + r * 0.22);
    p.lineTo(x, y + r); p.lineTo(x - r * 0.22, y + r * 0.22); p.lineTo(x - r, y); p.lineTo(x - r * 0.22, y - r * 0.22); p.closePath(); p.fill();
  }

  const out = {};
  // adaptive icon layers: 108dp with the important part inside the middle 66%
  for (const [name, px] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]) {
    const [bc, b] = mk(px, px);
    sky(b, px, px, 1);
    burst(b, px * 0.27, px * 0.3, px * 0.13, ['#ff4d6d', '#ffd23f']);
    burst(b, px * 0.76, px * 0.68, px * 0.11, ['#4cc9f0', '#80ffdb']);
    moon(b, px * 0.74, px * 0.27, px * 0.07);
    const [fc, f] = mk(px, px);
    const s = px / 108;
    flyer(f, px * 0.43, px * 0.7, 0.55, 0.68 * s, { type: 0, evo: 3 });
    sparkle(f, px * 0.7, px * 0.42, px * 0.045, '#fff6c8');
    sparkle(f, px * 0.32, px * 0.42, px * 0.03, '#ffd23f');
    out[name] = { bg: bc.toDataURL('image/png'), fg: fc.toDataURL('image/png') };
  }
  // the store icon: both layers in one 512 picture
  {
    const [c, p] = mk(512, 512);
    sky(p, 512, 512, 1);
    burst(p, 512 * 0.22, 512 * 0.25, 512 * 0.15, ['#ff4d6d', '#ffd23f']);
    burst(p, 512 * 0.8, 512 * 0.72, 512 * 0.12, ['#4cc9f0', '#80ffdb']);
    moon(p, 512 * 0.78, 512 * 0.22, 512 * 0.075);
    flyer(p, 512 * 0.42, 512 * 0.72, 0.55, 4.1, { type: 0, evo: 3 });
    sparkle(p, 512 * 0.72, 512 * 0.4, 24, '#fff6c8');
    sparkle(p, 512 * 0.28, 512 * 0.45, 15, '#ffd23f');
    out.store = c.toDataURL('image/png');
  }
  // feature graphic 1024x500
  {
    const W = 1024, H = 500;
    const [c, p] = mk(W, H);
    sky(p, W, H, 7);
    burst(p, 140, 120, 80, ['#ff4d6d', '#ffd23f', '#ffffff']);
    burst(p, 900, 380, 70, ['#4cc9f0', '#80ffdb']);
    burst(p, 610, 80, 50, ['#c77dff', '#ff9f1c']);
    moon(p, 930, 90, 42);
    // Saturn
    p.strokeStyle = 'rgba(230,205,150,.85)'; p.lineWidth = 6;
    p.beginPath(); p.ellipse(110, 410, 70, 16, -0.25, Math.PI, Math.PI * 2); p.stroke();
    p.fillStyle = '#e3c58b'; p.beginPath(); p.arc(110, 410, 34, 0, 7); p.fill();
    p.beginPath(); p.ellipse(110, 410, 70, 16, -0.25, 0, Math.PI); p.stroke();
    flyer(p, 760, 330, 0.45, 3.0, { type: 0, evo: 4 });
    flyer(p, 600, 430, -0.35, 1.6, { type: 8 });
    flyer(p, 880, 220, 0.2, 1.4, { type: 18 });
    flyer(p, 470, 300, 0.6, 1.3, { type: 7 });
    p.textAlign = 'left';
    p.font = "150px 'Lilita One'";
    p.lineWidth = 14; p.strokeStyle = '#3a1500'; p.strokeText('ROCKET', 60, 250);
    p.fillStyle = '#ffd23f'; p.fillText('ROCKET', 60, 250);
    p.strokeText('!', 60 + p.measureText('ROCKET').width + 4, 250);
    p.fillStyle = '#ff4d6d'; p.fillText('!', 60 + p.measureText('ROCKET').width + 4, 250);
    p.font = "40px 'Lilita One'"; p.lineWidth = 8; p.strokeStyle = 'rgba(10,8,40,.8)';
    p.strokeText('Light it. Fly it. Blow it up!', 66, 310); p.fillStyle = '#ffffff'; p.fillText('Light it. Fly it. Blow it up!', 66, 310);
    out.feature = c.toDataURL('image/png');
  }
  return out;
});
for (const [name, d] of Object.entries(icons)) {
  if (name === 'store') save(join(STORE, 'icon-512.png'), d);
  else if (name === 'feature') save(join(STORE, 'feature-1024x500.png'), d);
  else {
    save(join(RES, 'mipmap-' + name, 'ic_launcher_background.png'), d.bg);
    save(join(RES, 'mipmap-' + name, 'ic_launcher_foreground.png'), d.fg);
  }
}
await art.close();
console.log('icons and feature graphic done');

// ---------- screenshots of the real game, with a caption on top ----------
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const state = () => page.evaluate(() => window.__vp.state);
const setSave = (src) => page.evaluate((src) => {
  const s = window.__vp.save; new Function('s', src)(s); localStorage.setItem('vuurpijl-save-v1', JSON.stringify(s));
}, src);
const fresh = async (src) => {
  await setSave('Object.keys(s).forEach((k) => delete s[k]);');
  await setSave(`Object.assign(s, { coins: 2500000, record: 30000, best: 30000, flights: 140, evo: 4, zones: 9, moon: 12,
    types: [...Array(20).keys()], skins: ['none', 'shades', 'party'], achievements: ['first', 'roofs', 'clouds', 'space', 'moon', 'mars', 'combo10', 'boss'],
    visits: { moon: 12, mars: 5, belt: 2 }, counters: { perfects: 30, bossDodges: 3 }, sound: false,
    lv: { kruit: 14, stuw: 14, aero: 13, lont: 8, stuur: 7, knal: 12, magneet: 6, turbo: 3 } });` + src);
  await page.reload(); await page.click('#splash'); await page.waitForTimeout(700);
};
const launch = async () => {
  await page.click('#btn-launch'); await page.click('#btn-light'); await page.waitForTimeout(500);
  await page.mouse.click(180, 330);
  for (let k = 0; k < 40 && (await state()) === 'countdown'; k++) await page.waitForTimeout(150);
};
const shots = [];
const grab = async (title, sub) => shots.push({ png: (await page.screenshot()).toString('base64'), title, sub });

await page.goto(BASE + '/index.html');
await page.click('#splash');

// 1. on the pad in the city, fuse burning, crowd watching
await fresh('s.site = 2; s.type = 0;');
await page.click('#btn-launch'); await page.click('#btn-light'); await page.waitForTimeout(900);
await grab('LIGHT IT!', 'Time the fuse for a PERFECT start');
await page.mouse.click(180, 330);
// 2. coins, combo and power-ups
await page.waitForTimeout(900);
await page.evaluate(() => {
  for (let i = 0; i < 9; i++) window.__vp.spawnAhead('coin', { r: 11, v: 1 }, 50 + i * 26);
  window.__vp.spawnAhead('magnetp', {}, 330); window.__vp.spawnAhead('star', { r: 14 }, 420);
});
await page.waitForTimeout(700);
await grab('FLY IT!', 'Steer, grab coins and build combos');
for (let k = 0; k < 200 && (await state()) === 'flight'; k++) await page.waitForTimeout(100);

// 3. a mega bang
await fresh('s.site = 0; s.type = 1; s.evo = 5;');
await launch();
for (let k = 0; k < 300 && (await state()) === 'flight'; k++) await page.waitForTimeout(100);
await page.waitForTimeout(380);
await grab('BLOW IT UP!', 'Every rocket has its own explosion');

// 4. out in space near Saturn
await fresh('s.site = 4; s.type = 19; s.evo = 7;');
await launch();
await page.waitForTimeout(600);
await page.evaluate(() => window.__vp.warp(28600));
await page.waitForTimeout(1600);
await grab('FLY TO THE PLANETS', 'The moon, Mars, Saturn… and beyond');
await page.evaluate(() => window.__vp.warp(16300));
await page.waitForTimeout(500);
await page.evaluate(() => window.__vp.spawnAhead('boss', { kind: 'whale', bx: window.__vp.rocket.x + 3, r: 58 }, 260));
await page.waitForTimeout(500);
// 5. a boss
await grab('DODGE GIANT BOSSES', 'Space whales, motherships, seagulls…');

// 6. the shed full of crazy things to launch
await fresh('s.site = 3; s.type = 8;');
await page.evaluate(() => document.getElementById('types-fun').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(400);
await grab('20 CRAZY THINGS TO LAUNCH', 'Farting cows, toilets, UFOs and more');

// put a caption band on each screenshot
const comp = await browser.newPage();
await comp.goto(BASE + '/index.html');
await comp.evaluate(() => document.fonts.load("80px 'Lilita One'"));
for (let i = 0; i < shots.length; i++) {
  const url = await comp.evaluate(async ({ png, title, sub }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const p = c.getContext('2d');
    p.drawImage(img, 0, 0, 1080, 1920);
    const g = p.createLinearGradient(0, 0, 0, 470);
    g.addColorStop(0, 'rgba(18,10,48,.97)'); g.addColorStop(0.7, 'rgba(18,10,48,.85)'); g.addColorStop(1, 'rgba(18,10,48,0)');
    p.fillStyle = g; p.fillRect(0, 0, 1080, 470);
    p.textAlign = 'center';
    let size = 104;
    p.font = size + "px 'Lilita One'";
    while (p.measureText(title).width > 980) { size -= 4; p.font = size + "px 'Lilita One'"; }
    p.lineWidth = 14; p.strokeStyle = '#3a1500'; p.strokeText(title, 540, 175);
    p.fillStyle = '#ffd23f'; p.fillText(title, 540, 175);
    p.font = "52px 'Lilita One'"; p.fillStyle = '#ffffff'; p.fillText(sub, 540, 270);
    return c.toDataURL('image/png');
  }, shots[i]);
  save(join(STORE, `screenshot-${i + 1}.png`), url);
}
console.log('screenshots done:', shots.length);
await browser.close();
