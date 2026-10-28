// Browser test of the marketing site: the free keyword checker, the waitlist form and layout. Run: npm run site:build && npm run e2e:site
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'site', 'dist');
const SHOTS = process.env.E2E_SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `site-${n}.png`), fullPage: n !== 'home-top' }); };
const step = async (name, fn) => { try { await fn(); console.log('✔', name); } catch (e) { console.log('✘', name, '\n  ', e.message.split('\n')[0]); process.exitCode = 1; } };

await step('home page renders and the waitlist form validates and reports preview mode', async () => {
  await page.goto(base); await page.waitForSelector('h1'); await shot('home-top');
  const form = page.locator('form.waitlist').first();
  await form.locator('input[type=email]').fill('nope'); await form.locator('button').click();
  assert.match(await form.locator('.msg').innerText(), /valid email/);
  await form.locator('input[type=email]').fill('a@b.co'); await form.locator('button').click();
  assert.match(await form.locator('.msg').innerText(), /Preview only/);
  await shot('home');
});
await step('keyword checker finds covered and missing required skills', async () => {
  await page.goto(`${base}tools/resume-keyword-checker.html`);
  await page.fill('#resume', readFileSync(join(root, 'fixtures', 'sample-resume.txt'), 'utf8'));
  await page.fill('#jd', readFileSync(join(root, 'fixtures', 'sample-jd.txt'), 'utf8'));
  await page.click('#check');
  await page.waitForSelector('#result:not([hidden])');
  assert.match(await page.locator('#have').innerText(), /Python/);
  assert.match(await page.locator('#missing').innerText(), /Kubernetes/);
  assert.match(await page.locator('#score').innerText(), /\d+% of required/);
  await shot('checker');
});
await step('checker asks for more text instead of guessing', async () => {
  await page.fill('#resume', 'short'); await page.click('#check');
  assert.match(await page.locator('#summary').innerText(), /Paste both/);
});
await step('pricing, guide and FAQ pages render', async () => {
  for (const [p, h1] of [['pricing.html', /Simple pricing/], ['guides/tailor-resume-to-job-description.html', /tailor your resume/i], ['faq.html', /Frequently/]]) {
    await page.goto(base + p); assert.match(await page.locator('h1').innerText(), h1); await shot(p.split('/').pop().replace('.html', ''));
  }
});
await step('no horizontal scroll on a phone, dark theme readable', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['', 'pricing.html', 'tools/resume-keyword-checker.html', 'faq.html']) { await page.goto(base + p); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sideways scroll on ${p || 'home'}`); }
  await page.goto(base); await shot('mobile');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.reload(); await shot('dark');
});
await step('no uncaught errors', async () => { assert.deepEqual(errors, []); });
await browser.close(); server.close();
