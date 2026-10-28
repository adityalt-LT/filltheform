// Captures the product screenshots used on the website from the demo build. Run: npm run demo:build && node scripts/make-site-shots.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'demo', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await page.emulateMedia({ colorScheme: 'light' });
const clean = () => page.evaluate(() => { document.querySelector('.demo-pill')?.remove(); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
await page.goto(`${base}#d-job-1`); await page.waitForSelector('.fit'); await page.waitForTimeout(1500); await clean();
await page.screenshot({ path: join(root, 'site', 'assets', 'shot-job.jpg'), type: 'jpeg', quality: 86 });
await page.goto(`${base}#d-tracking`); await page.reload(); await page.waitForSelector('.jcard'); await page.waitForTimeout(400); await clean();
await page.screenshot({ path: join(root, 'site', 'assets', 'shot-board.jpg'), type: 'jpeg', quality: 86 });
await browser.close(); server.close(); console.log('Saved site/assets/shot-job.jpg and shot-board.jpg');
