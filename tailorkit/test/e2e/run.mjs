// Browser end-to-end test: real Chromium, the real extension, the real dashboard.
// Run with: npm run e2e   (needs Chrome/Chromium; set CHROMIUM_PATH if it is not auto-detected)
import { chromium } from 'playwright-core';
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
import { closeBrowser } from '../../server/lib/render.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'tailorkit-e2e-'));

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const dashServer = createApp({ dbPath: ':memory:' }).listen(0, '127.0.0.1');
await new Promise((r) => dashServer.once('listening', r));
const DASH = `http://127.0.0.1:${dashServer.address().port}`;
const site = http.createServer((req, res) => {
  let body;
  try { body = readFileSync(join(here, 'site', req.url.slice(1) || 'job.html')); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
});
const SITE = `http://127.0.0.1:${await listen(site)}`;

// Test copy of the extension that is allowed to read the fixture server and talk to this dashboard.
// (A real click grants the active tab via activeTab; a test cannot click the toolbar icon.)
const extDir = join(tmp, 'ext');
cpSync(join(root, 'extension'), extDir, { recursive: true });
const mf = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
mf.host_permissions = [`${SITE}/*`, `${DASH}/*`];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(mf));

const ctx = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: process.env.CHROMIUM_PATH || undefined, headless: false, viewport: { width: 1280, height: 860 },
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
}).catch(async () => chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: '/opt/pw-browsers/chromium', headless: false, viewport: { width: 1280, height: 860 },
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
}));

const pageErrors = [];
const watch = (p) => p.on('pageerror', (e) => pageErrors.push(e.message));
let failed = false;
const step = async (name, fn) => { try { await fn(); console.log('✔', name); } catch (e) { failed = true; console.log('✖', name, '\n   ', e.message.split('\n')[0]); } };

try {
  const dash = await ctx.newPage(); watch(dash);
  await step('sign up and upload resume; confirm step shows the rebuilt resume', async () => {
    await dash.goto(DASH);
    await dash.fill('input[type=email]', 'e2e@example.com'); await dash.fill('input[type=password]', 'correct horse');
    await dash.click('button[type=submit]');
    await dash.waitForSelector('.drop');
    await dash.setInputFiles('input[type=file]', join(root, 'fixtures', 'sample-resume.txt'));
    await dash.waitForSelector('.compare iframe');
    const html = await dash.frameLocator('.compare iframe').locator('h2').allInnerTexts();
    assert.deepEqual(html, ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS']);
    await dash.click('text=Looks right, continue');
    await dash.waitForSelector('.empty');
  });

  const ext = await ctx.newPage();
  await ext.goto('chrome://extensions');
  const extId = await ext.evaluate(() => document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item').id);
  await ext.close();

  async function capture(path) {
    const jobTab = await ctx.newPage(); watch(jobTab); await jobTab.goto(`${SITE}/${path}`);
    const pop = await ctx.newPage(); watch(pop);
    await pop.goto(`chrome-extension://${extId}/popup.html`);
    if (await pop.locator('input[type=email]').count()) {
      await pop.fill('input[type=email]', 'e2e@example.com'); await pop.fill('input[type=password]', 'correct horse');
      await pop.fill('input[type=text]', DASH); await pop.click('button[type=submit]');
    }
    await pop.waitForSelector('text=Capture this job');
    // The popup is a tab here, not a toolbar popup, so point it at the page that was open before it.
    await pop.evaluate(async (u) => { const me = await chrome.tabs.getCurrent(); const t = (await chrome.tabs.query({})).filter((x) => x.id !== me.id).sort((a, b) => b.id - a.id)[0]; chrome.tabs.query = async () => [{ id: t.id, url: u }]; }, `${SITE}/${path}`);
    await pop.click('text=Capture this job');
    await pop.waitForSelector('.score, .err', { timeout: 15000 });
    return { pop, jobTab };
  }

  await step('extension captures a structured job page (keeps line breaks) and scores it', async () => {
    const { pop, jobTab } = await capture('job.html');
    const text = await pop.locator('.wrap').innerText();
    assert.match(text, /Senior Backend Engineer/); assert.match(text, /Acme Payments/);
    assert.match(text, /Required, missing from your resume/);
    assert.match(text, /Kubernetes/);
    assert.match(text, /Download tailored PDF/);
    const [dl] = await Promise.all([pop.waitForEvent('download', { timeout: 20000 }), pop.click('text=Download tailored PDF')]);
    assert.match(dl.suggestedFilename(), /^Acme_Payments_Senior_Backend_Engineer\.pdf$/);
    await jobTab.close(); await pop.close();
  });

  await step('extension captures a hiring post: title, company, no byline noise', async () => {
    const { pop, jobTab } = await capture('post.html');
    const text = await pop.locator('.wrap').innerText();
    assert.match(text, /Product Analyst/); assert.match(text, /Zeta Labs/); assert.doesNotMatch(text, /Recruitment/);
    await jobTab.close(); await pop.close();
  });

  await step('job page: Kubernetes is the only must-have gap; confirming it updates the score', async () => {
    await dash.goto(`${DASH}/#/tracking`); await dash.waitForSelector('.board');
    await dash.click('.jcard:has-text("Senior Backend")'); await dash.waitForSelector('.ring');
    const gaps = await dash.locator('.gap .chip').allInnerTexts();
    assert.ok(gaps.includes('Kubernetes'), `gaps were ${gaps}`);
    // Requirements split across list items must all be detected (this fails if line breaks are lost in capture).
    const covered = await dash.locator('.chip.good').allInnerTexts();
    for (const need of ['Docker', 'PostgreSQL', 'CI/CD', 'Redis', 'AWS']) assert.ok(covered.includes(need), `${need} should be a detected, covered requirement; covered was ${covered}`);
    assert.ok(gaps.includes('Terraform') && gaps.includes('Kafka'), `nice-to-haves after "Good to have" should be detected; gaps were ${gaps}`);
    const before = Number(await dash.locator('.ring > div').innerText());
    await dash.click('.gap:has(.chip:text-is("Kubernetes")) >> text=I have this'); await dash.waitForTimeout(500);
    assert.ok(Number(await dash.locator('.ring > div').innerText()) > before);
  });

  await step('re-tailor, edit: remove bullet updates preview, undo restores, PDF downloads', async () => {
    await dash.click('text=Re-tailor'); await dash.waitForTimeout(800);
    await dash.click('text=Edit & preview'); await dash.waitForSelector('.editor iframe'); await dash.waitForTimeout(900);
    const frame = dash.frameLocator('.editor iframe');
    const skills = await frame.locator('p.skills').allInnerTexts();
    assert.ok(skills.join(' ').includes('Kubernetes'), 'confirmed skill is on the tailored resume');
    const n = await frame.locator('li').count();
    await dash.click('button[aria-label="Remove bullet"] >> nth=0'); await dash.waitForTimeout(900);
    assert.equal(await frame.locator('li').count(), n - 1);
    await dash.click('text=↶ Undo'); await dash.waitForTimeout(900);
    assert.equal(await frame.locator('li').count(), n);
    const [d] = await Promise.all([dash.waitForEvent('download'), dash.click('text=Download PDF')]);
    assert.match(d.suggestedFilename(), /\.pdf$/);
  });

  await step('screening prep and skill gaps render', async () => {
    await dash.goBack().catch(() => {}); await dash.goto(`${DASH}/#/tracking`); await dash.waitForSelector('.board');
    await dash.click('.jcard:has-text("Product Analyst")'); await dash.waitForSelector('.ring');
    await dash.click('text=Screening prep'); await dash.waitForSelector('.qa');
    assert.ok(await dash.locator('.qa .q', { hasText: 'notice period' }).count());
    await dash.goto(`${DASH}/#/gaps`); await dash.waitForSelector('.gap');
  });

  await step('no uncaught page errors', async () => { assert.deepEqual(pageErrors, []); });
} finally {
  await ctx.close(); site.close(); dashServer.close(); await closeBrowser();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
