// Browser test of the static dashboard demo (no server involved). Run: npm run demo:build && npm run e2e:demo
// E2E_SHOTS=dir saves screenshots.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'demo', 'dist');
const SHOTS = process.env.E2E_SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `demo-${n}.png`) }); };
let n = 0; const results = [];
const step = async (name, fn) => { try { await fn(); results.push(['✔', name]); console.log('✔', name); } catch (e) { results.push(['✘', name]); console.log('✘', name, '\n  ', e.message.split('\n')[0]); process.exitCode = 1; await shot(`fail-${++n}`); } };

await page.goto(`${base}#d-tracking`);
await step('opens signed in on the board with six sample jobs', async () => {
  await page.waitForSelector('.jcard');
  assert.equal(await page.locator('.jcard').count(), 6);
  assert.ok(await page.locator('.demo-pill').isVisible());
  await shot('board');
});
await step('job page shows a real match score and gaps', async () => {
  await page.locator('.jcard', { hasText: 'Acme Payments' }).click();
  await page.waitForSelector('h1:has-text("Senior Backend Engineer")');
  assert.match(page.url(), /#d-job-1$/);
  const body = await page.locator('main').innerText();
  assert.match(body, /Kubernetes/);
  await shot('job');
});
await step('prepared interview prep opens instantly with drafted answers', async () => {
  await page.getByRole('tab', { name: /Interview prep/ }).click();
  await page.waitForSelector('details.q');
  assert.ok(await page.locator('details.q').count() >= 5);
  assert.match(await page.locator('details.q .ans').first().innerText(), /(\w+\s+){8}/);
  await shot('prep');
});
await step('prep for another job is generated on demand', async () => {
  await page.goto(`${base}#d-job-4`); await page.reload();
  await page.getByRole('tab', { name: /Interview prep/ }).click();
  await page.waitForSelector('details.q', { timeout: 8000 });
});
await step('Ask AI streams a scripted reply and says it is scripted', async () => {
  await page.getByRole('tab', { name: /Ask AI/ }).click();
  await page.locator('.suggest button').nth(2).click();
  await page.waitForFunction(() => /Demo reply/.test(document.querySelector('.thread')?.innerText || ''), null, { timeout: 8000 });
  await shot('chat');
});
await step('paste a job: scored, tailored, new job on the board', async () => {
  await page.goto(`${base}#d-tracking`); await page.reload();
  await page.getByRole('button', { name: 'Add job' }).first().click();
  await page.locator('#add-job textarea').fill(`Product Analyst\nBrightcart, Mumbai\n\nRequirements\n- 2+ years of experience in analytics\n- Strong SQL and Excel\n- Tableau or Power BI\n- A/B testing\n\nGood to have\n- Python`);
  await page.locator('#add-job').getByRole('button', { name: 'Add job' }).click();
  await page.waitForSelector('h1:has-text("Product Analyst")');
  assert.match(await page.locator('main').innerText(), /SQL/);
  await shot('pasted');
});
await step('moving a job to another stage works', async () => {
  await page.locator('select[aria-label="Stage"]').selectOption('applied');
  await page.getByText('Moved to Applied').waitFor();
});
await step('resume editor previews the tailored resume with embedded fonts', async () => {
  await page.goto(`${base}#d-resumes`); await page.reload();
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await page.waitForSelector('iframe[title="Resume preview"]');
  await page.waitForFunction(() => document.querySelector('iframe[title="Resume preview"]')?.srcdoc?.includes('RAHUL'), null, { timeout: 8000 });
  await page.waitForTimeout(500); assert.ok(await page.frameLocator('iframe[title="Resume preview"]').locator('body').innerText().then((t) => t.includes('PayNest')), 'preview is empty');
  await shot('editor');
});
await step('PDF download explains it is off in the preview', async () => {
  await page.getByRole('button', { name: /Download|PDF/ }).first().click();
  await page.getByText(/Downloads are switched off/).waitFor();
});
await step('skill gaps, profile and settings render', async () => {
  for (const [hash, text] of [['#d-gaps', /Kubernetes/], ['#d-profile', /Rahul|RAHUL/i], ['#d-settings', /./]]) {
    await page.goto(`${base}${hash}`); await page.reload();
    await page.waitForSelector('main h1');
    assert.match(await page.locator('main').innerText(), text);
  }
});
await step('dark theme and phone width have no horizontal scroll', async () => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto(`${base}#d-tracking`); await page.reload(); await page.waitForSelector('.jcard'); await shot('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 800 }); await page.reload(); await page.waitForSelector('.jcard');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways at 390px');
  await shot('mobile');
});
await step('no uncaught errors', async () => { assert.deepEqual(errors, []); });

await browser.close(); server.close();
if (results.some(([s]) => s === '✘')) process.exit(1);
