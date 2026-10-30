// Browser test of the one-page site: loads, hover/tap effects fire, sticky steps morph, FAQ opens, reduced motion and phone layout hold.
// Run: node test/e2e/onepage.mjs   (E2E_SHOTS=dir saves screenshots)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'onepage', 'index.html');
const SHOTS = process.env.E2E_SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const shot = async (n, full) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `onepage-${n}.png`), fullPage: !!full }); };
const step = async (name, fn) => { try { await fn(); console.log('✔', name); } catch (e) { console.log('✘', name, '\n  ', e.message.split('\n')[0]); process.exitCode = 1; } };
const reveal = () => page.evaluate(() => document.querySelectorAll('.reveal,.split').forEach((e) => e.classList.add('in')));
const scrollTo = async (sel) => { await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'instant' }), sel); await page.waitForTimeout(500); };

await page.goto('file://' + file); await page.waitForTimeout(1200);
await step('hero headline reveals word by word', async () => { assert.equal(await page.locator('h1 .w').count(), 4); await shot('hero'); });
await step('hero demo: cursor clicks, post flies, ring counts to 82', async () => {
  await page.locator('#stage').hover(); await page.waitForTimeout(3200); await shot('hero-run');
  await page.waitForFunction(() => document.querySelector('#stage [data-count]').textContent === '82', null, { timeout: 8000 });
});
await step('sticky how-it-works moves 1 → 2 → 3 and the mock morphs', async () => {
  await scrollTo('#how'); const top = await page.evaluate(() => document.querySelector('#how').offsetTop); const span = await page.evaluate(() => document.querySelector('#how').offsetHeight - innerHeight);
  const at = async (f) => { await page.evaluate(([t, s, f]) => scrollTo(0, t + s * f), [top, span, f]); await page.waitForTimeout(900); return page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('on'))); };
  assert.equal(await at(.1), 0); await shot('how-1'); assert.equal(await at(.5), 1); await shot('how-2'); assert.equal(await at(.9), 2); await shot('how-3');
  assert.equal(await page.locator('.pin .state.on').count(), 1);
});
await reveal();
await step('score card: hover refills the ring and pops 3 amber chips', async () => { await scrollTo('.card.a'); await page.locator('.card.a').hover(); await page.waitForTimeout(2200); assert.equal(await page.locator('.card.a .chip.amber').count(), 3); await shot('card-a'); });
await step('resume card: bullets re-order on hover (relevant first) and the confirm chip appears', async () => {
  await scrollTo('.card.b'); const y = (sel) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().top);
  const before = await y('.card.b .bl.r1'); await page.locator('.card.b').hover(); await page.waitForTimeout(1800);
  const after = await y('.card.b .bl.r1'); assert.ok(after < before - 80, `relevant bullet moved up (${before} → ${after})`);
  assert.ok(Number(await page.locator('.card.b .confirm').evaluate((e) => getComputedStyle(e).opacity)) > .9); await shot('card-b');
});
await step('interview card: cards fan out and the top one flips', async () => { await scrollTo('.card.c'); await page.locator('.card.c').hover(); await page.waitForTimeout(2200); const t = await page.locator('.card.c .qc:nth-child(4)').evaluate((e) => getComputedStyle(e).transform); assert.ok(t !== 'none'); await shot('card-c'); });
await step('job board: the card moves from Applied toward Interview', async () => { await scrollTo('.card.d'); const x = () => page.locator('.card.d .mover').evaluate((e) => e.getBoundingClientRect().left); const b = await x(); await page.locator('.card.d').hover(); await page.waitForTimeout(1400); assert.ok(await x() > b + 40); await shot('card-d'); });
await step('dark section: robot approaches and fades; the closing line is shown', async () => { await scrollTo('#trust'); await page.locator('.apply').hover(); await page.waitForTimeout(1400); await shot('trust'); assert.match(await page.locator('.mine').innerText(), /always yours/); });
await step('FAQ opens smoothly and the plus becomes ×', async () => { await scrollTo('#faq'); await page.click('#q2'); await page.waitForTimeout(900); assert.equal(await page.locator('#q2').getAttribute('aria-expanded'), 'true'); assert.ok((await page.locator('#a2').boundingBox()).height > 40); await shot('faq'); });
await step('Add to Chrome explains the listing is not live', async () => { await page.click('nav.top [data-store]'); await page.waitForTimeout(700); assert.match(await page.locator('#toast').innerText(), /not live/); });
await step('keyboard: focus triggers the card effect', async () => { await scrollTo('.card.c'); await page.locator('.card.c').focus(); await page.keyboard.press('Enter'); assert.ok(await page.locator('.card.c').evaluate((e) => e.classList.contains('is-active'))); });
await step('full page', async () => { await reveal(); await shot('full', true); });
await step('no uncaught errors', async () => { assert.deepEqual(errors, []); });

// phone + reduced motion
const m = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }); const mp = await m.newPage(); const merr = []; mp.on('pageerror', (e) => merr.push(e.message));
await mp.goto('file://' + file); await mp.waitForTimeout(800);
await step('phone + reduced motion: no sideways scroll, content visible, no errors', async () => {
  assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sideways scroll'); assert.ok(Number(await mp.locator('.hero .sub').evaluate((e) => getComputedStyle(e).opacity)) > 0.5);
  await mp.locator('.card.c').tap(); await mp.waitForTimeout(300); assert.ok(await mp.locator('.card.c').evaluate((e) => e.classList.contains('is-active')), 'tap triggers the effect');
  if (SHOTS) await mp.screenshot({ path: join(SHOTS, 'onepage-mobile.png') }); assert.deepEqual(merr, []);
});
await browser.close();
