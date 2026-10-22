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
const SHOTS = process.env.E2E_SHOTS; // optional: directory to save screenshots for design review
const assertClean = async (page, where) => { const t = await page.locator('main').innerText(); assert.doesNotMatch(t, /undefined|NaN|\[object|(^|\s)false(\s|$)|(^|\s)null(\s|$)/, `stray value rendered on ${where}`); };
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full }); };
const step = async (name, fn) => { try { await fn(); console.log('✔', name); } catch (e) { failed = true; console.log('✖', name, '\n   ', e.message.split('\n')[0]); } };

try {
  const dash = await ctx.newPage(); watch(dash);
  await step('onboarding asks only for the resume and builds the profile from it', async () => {
    await dash.goto(DASH);
    await shot(dash, '01-auth');
    await dash.fill('input[type=email]', 'e2e@example.com'); await dash.fill('input[type=password]', 'correct horse');
    await dash.click('button[type=submit]');
    await dash.waitForSelector('.drop');
    await shot(dash, '02-welcome');
    assert.equal(await dash.locator('input[type=text], input[type=number]').count(), 0, 'no form fields on the welcome step');
    await dash.setInputFiles('input[type=file]', join(root, 'fixtures', 'sample-resume.txt'));
    await dash.waitForSelector('.profile-card');
    const card = await dash.locator('.profile-card').innerText();
    for (const want of ['RAHUL SHARMA', 'Software Engineer', 'Bengaluru', 'rahul.sharma@example.com', '+91 98765 43210', 'Python', 'Django']) assert.ok(card.includes(want), `profile shows ${want}`);
    await dash.click('summary:has-text("Check how we rebuilt")');
    await dash.waitForTimeout(700);
    const headings = await dash.frameLocator('.compare iframe').locator('h2').allInnerTexts();
    assert.deepEqual(headings, ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS']);
    await shot(dash, '03-profile-review', true);
    await dash.click('text=Looks good, continue');
    await dash.waitForSelector('.empty');
    await shot(dash, '04-empty');
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

  await step('single-page site with stale structured data: captures the job on screen, not the previous one (Nike, not Acme)', async () => {
    const { pop, jobTab } = await capture('spa.html');
    const text = await pop.locator('.wrap').innerText();
    assert.match(text, /Product Management Intern/); assert.match(text, /Nike/);
    assert.doesNotMatch(text, /Senior Backend Engineer/); assert.doesNotMatch(text, /Acme/);
    await jobTab.close(); await pop.close();
  });

  await step('job-list layout (hidden "Selected, Nykaa…" heading next to the real job): title and company come from the job on screen', async () => {
    const { pop, jobTab } = await capture('joblist.html');
    const text = await pop.locator('.wrap').innerText();
    assert.match(text, /Product Manager II/); assert.match(text, /Kuku/); assert.doesNotMatch(text, /Nykaa|Selected/);
    await shot(pop, '11-popup-result');
    await jobTab.close(); await pop.close();
  });

  await step('company and title come from the panel that holds the description (company link), not from other cards in the list', async () => {
    const { pop, jobTab } = await capture('panel.html');
    const text = await pop.locator('.wrap').innerText();
    assert.match(text, /Product Manager II/); assert.match(text, /Kuku/); assert.doesNotMatch(text, /Nykaa|Selected|Company not detected/);
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
    await shot(dash, '09-job-overview', true);
    await assertClean(dash, 'job overview');
    const before = Number(await dash.locator('.ring > div').innerText());
    await dash.click('.gap:has(.chip:text-is("Kubernetes")) >> text=I have this'); await dash.waitForTimeout(500);
    assert.ok(Number(await dash.locator('.ring > div').innerText()) > before);
  });

  await step('re-tailor, edit: remove bullet updates preview, undo restores, PDF downloads', async () => {
    await dash.click('text=Re-tailor'); await dash.waitForTimeout(800);
    await dash.click('text=Edit & preview'); await dash.waitForSelector('.editor iframe'); await dash.waitForTimeout(900);
    await shot(dash, '10-editor', true);
    const frame = dash.frameLocator('.editor iframe');
    const skills = await frame.locator('.tx').allInnerTexts();
    assert.ok(skills.join(' ').includes('Kubernetes'), 'confirmed skill is on the tailored resume');
    const n = await frame.locator('.li').count();
    await dash.click('button[aria-label="Remove bullet"] >> nth=0'); await dash.waitForTimeout(900);
    assert.equal(await frame.locator('.li').count(), n - 1);
    await dash.click('text=↶ Undo'); await dash.waitForTimeout(900);
    assert.equal(await frame.locator('.li').count(), n);
    const [d] = await Promise.all([dash.waitForEvent('download'), dash.click('text=Download PDF')]);
    assert.match(d.suggestedFilename(), /\.pdf$/);
  });

  await step('the three captures are three separate jobs on the board', async () => {
    await dash.goto(`${DASH}/#/tracking`); await dash.waitForSelector('.board');
    const titles = await dash.locator('.jcard .t').allInnerTexts();
    for (const t of ['Senior Backend Engineer', 'Product Analyst', 'Product Management Intern', 'Product Manager II']) assert.ok(titles.includes(t), `${t} in ${titles}`);
    await shot(dash, '05-board');
    await assertClean(dash, 'tracking');
  });

  await step('interview prep: every question has a drafted answer, nothing asks the user for input', async () => {
    await dash.click('.jcard:has-text("Product Management Intern")'); await dash.waitForSelector('.ring');
    await dash.click('.tabs >> text=Interview prep');
    await dash.waitForSelector('.oneliner', { timeout: 30000 });
    await shot(dash, '06-prep', true);
    await assertClean(dash, 'interview prep');
    const qs = await dash.locator('details.q').count();
    assert.ok(qs >= 8, `expected 8+ questions, got ${qs}`);
    const page = await dash.locator('main').innerText();
    assert.doesNotMatch(page, /needs your input/i);
    assert.match(page, /Turn on AI/);
    await dash.click('details.q >> nth=1 >> summary'); await dash.waitForTimeout(200);
    assert.ok((await dash.locator('details.q[open] .ans').first().innerText()).length > 30);
  });

  await step('Ask AI explains how to turn on AI when there is no key; Settings shows setup steps', async () => {
    await dash.click('.tabs >> text=Ask AI');
    await dash.waitForSelector('text=Ask AI needs an API key');
    await shot(dash, '07-chat-off');
    await dash.goto(`${DASH}/#/settings`); await dash.waitForSelector('text=ANTHROPIC_API_KEY');
    await shot(dash, '08-settings', true);
  });

  await step('skill gaps render', async () => {
    await dash.goto(`${DASH}/#/gaps`); await dash.waitForSelector('.gap');
  });

  await step('no uncaught page errors', async () => { assert.deepEqual(pageErrors, []); });
} finally {
  await ctx.close(); site.close(); dashServer.close(); await closeBrowser();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
