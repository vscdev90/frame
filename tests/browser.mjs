/**
 * End-to-end smoke test: walks the whole product loop in a real browser
 * and fails on any console error, page error or failed request.
 */
// Playwright lives in different places locally and in CI, so resolve it
// rather than hard-coding one path.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const BASE = process.env.BASE || 'http://localhost:8899';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

page.on('console', (m) => {
  // Network failures are reported separately by requestfailed; the CDN
  // for Three.js is expected to be unreachable in a sandbox.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  // The Three.js CDN is expected to be unreachable in a sandbox; the app
  // must fall back to the isometric renderer rather than break.
  if (!r.url().includes('cdn.jsdelivr.net')) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};

await step('landing loads', async () => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Design/ }).first().waitFor();
});

await step('start a project', async () => {
  await page.getByRole('button', { name: 'Start a project' }).first().click();
  await page.waitForFunction(() => location.hash.includes('/project'));
  await page.getByText('What are you planning to build?').waitFor();
});

await step('choose building type', async () => {
  await page.locator('[data-type="detached_house"]').click();
  await page.locator('#pname').fill('House Bloemendaal');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByText('Where is the project?').waitFor();
});

await step('enter location', async () => {
  await page.locator('#address').fill('Zandvoortselaan 12, Bloemendaal');
  await page.locator('#plot_area').fill('612');
  await page.locator('#frontage').fill('20');
  await page.waitForTimeout(120);
  if (!(await page.locator('#siteplan svg').count())) throw new Error('site plan not drawn');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByText('What do you need?').waitFor();
});

await step('define program', async () => {
  await page.locator('[data-count="bedrooms"][data-delta="1"]').click();
  await page.locator('[data-toggle="workspace"]').click();
  await page.locator('[data-toggle="storage"]').click();
  await page.locator('#notes').fill('A guest room would be nice.');
  const summary = await page.locator('#program-summary').innerText();
  if (!/m² gross/.test(summary)) throw new Error(`program summary missing: ${summary}`);
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByText('Set your budget').waitFor();
});

await step('set budget', async () => {
  await page.locator('#budget').fill('620000');
  await page.locator('#budget').dispatchEvent('change');
  await page.waitForTimeout(150);
  const txt = await page.locator('#budget-value').innerText();
  if (!txt.includes('620')) throw new Error(`budget not applied: ${txt}`);
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByText('Your design directions').waitFor();
});

await step('review directions', async () => {
  const tabs = await page.locator('#dir-tabs .tile').count();
  if (tabs < 3) throw new Error(`expected 3 directions, got ${tabs}`);
  await page.locator('#dir-tabs .tile').nth(1).click();
  await page.waitForTimeout(100);
  if (!(await page.locator('#dir-body svg').count())) throw new Error('direction preview not drawn');
  await page.getByRole('button', { name: /Explore this option/ }).click();
  await page.waitForFunction(() => location.hash.includes('workspace'));
});

await step('workspace renders', async () => {
  await page.locator('#feasibility-card').waitFor();
  await page.waitForTimeout(800); // allow the 3D loader to resolve or fall back
  if (!(await page.locator('#vp-body svg, #vp-body canvas').count())) throw new Error('viewport empty');
  const feas = await page.locator('#feasibility-card').innerText();
  if (!/\/ 100/.test(feas)) throw new Error('feasibility not rendered');
});

await step('panels: massing, plans, facades, construction, cost, versions', async () => {
  for (const p of ['massing', 'plans', 'facades', 'construction', 'cost', 'versions']) {
    await page.locator(`[data-panel="${p}"]`).click();
    await page.waitForTimeout(160);
    const text = await page.locator('#panel-body').innerText();
    if (text.trim().length < 30) throw new Error(`panel ${p} rendered empty`);
  }
});

await step('change construction system re-prices', async () => {
  const before = await page.locator('#budget-card').innerText();
  await page.locator('[data-panel="construction"]').click();
  await page.waitForTimeout(150);
  // Pick whichever system is not currently selected.
  const alternative = await page.locator('[data-system]:not(:has(.tag.good))').first();
  await alternative.click();
  await page.waitForTimeout(250);
  const after = await page.locator('#budget-card').innerText();
  if (before === after) throw new Error('cost did not change with the construction system');
});

await step('what-if runs the consequence engine', async () => {
  await page.locator('[data-whatif="more_glass"]').click();
  await page.locator('#answer .impact').first().waitFor();
  const text = await page.locator('#answer').innerText();
  if (!/Daylight/.test(text)) throw new Error(`no daylight consequence: ${text}`);
});

await step('assistant answers from computed data', async () => {
  await page.locator('#ask').fill('Why does it cost this much?');
  await page.locator('[data-action="ask"]').click();
  const text = await page.locator('#answer').innerText();
  if (!/per m²|construction cost/i.test(text)) throw new Error(`cost explanation missing: ${text}`);
  await page.locator('#ask').fill('Be honest — what is wrong with this design?');
  await page.locator('[data-action="ask"]').click();
  if (!/CRITIQUE/.test(await page.locator('#answer').innerText())) throw new Error('critic did not run');
});

await step('apply a what-if change', async () => {
  await page.locator('[data-whatif="single_storey"]').click();
  await page.locator('[data-apply]').click();
  await page.waitForTimeout(300);
  const sub = await page.locator('#ws-sub').innerText();
  if (!sub.length) throw new Error('workspace lost its state after applying a change');
});

await step('save a version', async () => {
  await page.locator('[data-action="save-version"]').click();
  await page.locator('[data-panel="versions"]').click();
  await page.waitForTimeout(150);
  if (!/V0/.test(await page.locator('#panel-body').innerText())) throw new Error('version not recorded');
});

await step('compare page', async () => {
  await page.locator('[data-go="compare"]').first().click();
  await page.getByText('Compare design directions').waitFor();
  await page.waitForTimeout(200);
  const svgs = await page.locator('svg').count();
  if (svgs < 4) throw new Error(`compare page under-rendered (${svgs} svg)`);
  if (!/Scenarios/.test(await page.locator('body').innerText())) throw new Error('scenarios missing');
});

await step('design brief', async () => {
  await page.locator('[data-go="workspace"]').first().click();
  await page.locator('[data-go="brief"]').first().click();
  await page.getByText('Your design brief').waitFor();
  const text = await page.locator('article').innerText();
  for (const heading of ['1. Project', '4. Budget', '8. Risks', '9. Next steps']) {
    if (!text.includes(heading)) throw new Error(`brief missing section ${heading}`);
  }
  if (!/does not replace professional/.test(text)) throw new Error('brief missing the limitations notice');
});

await step('projects list and reload persistence', async () => {
  await page.goto(`${BASE}/index.html#/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const text = await page.locator('body').innerText();
  if (!text.includes('House Bloemendaal')) throw new Error('project did not persist');
});

await step('every page fits a 390px phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('frame.projects.v1'))[0].id);
  const routes = [
    '#/', '#/projects',
    `#/project/${id}/project`, `#/project/${id}/location`, `#/project/${id}/program`,
    `#/project/${id}/budget`, `#/project/${id}/design`,
    `#/project/${id}/workspace`, `#/project/${id}/compare`, `#/project/${id}/brief`
  ];
  const offenders = [];
  for (const route of routes) {
    await page.goto(`${BASE}/index.html${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    if (overflow > 2) offenders.push(`${route} overflows by ${overflow}px`);
  }
  if (offenders.length) throw new Error(offenders.join('; '));
});

await step('workspace panels fit a phone too', async () => {
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('frame.projects.v1'))[0].id);
  await page.goto(`${BASE}/index.html#/project/${id}/workspace`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const offenders = [];
  for (const p of ['massing', 'plans', 'facades', 'construction', 'cost', 'versions']) {
    await page.locator(`[data-panel="${p}"]`).click();
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 2) offenders.push(`${p} overflows by ${overflow}px`);
  }
  if (offenders.length) throw new Error(offenders.join('; '));
  await page.setViewportSize({ width: 1440, height: 950 });
});

await browser.close();

if (errors.length) {
  console.error('\nFAILED — console/page errors:');
  for (const e of [...new Set(errors)]) console.error('  ' + e);
  process.exit(1);
}
console.log('\nAll browser checks passed.');
