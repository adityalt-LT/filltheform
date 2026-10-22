// Browser test of the AI-mode screens (company research, AI prep, streaming chat) with a fake Anthropic client,
// so the full UI can be exercised without a key. Run: npm run e2e:ai   (E2E_SHOTS=dir saves screenshots)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
import { setClientForTests } from '../../server/lib/ai.js';
import { closeBrowser } from '../../server/lib/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.E2E_SHOTS;
const text = (t, extra = {}) => ({ type: 'text', text: t, ...extra });

const research = {
  company: { summary: 'Acme Payments is a Bengaluru-based payments company serving online merchants.', industry: 'Fintech', size: '1,000-5,000 employees', hq: 'Bengaluru, India' },
  culture: { summary: 'Reviews describe a fast-moving, engineering-led culture with high ownership.', pros: ['Strong engineering peers', 'Real ownership early'], cons: ['Long hours around launches', 'Ambiguous priorities'], ratingNotes: 'Review sites show mixed-to-positive sentiment; sample sizes are small.' },
  interview: { process: ['Recruiter screen (30 min)', 'Take-home or live coding', 'System design round', 'Hiring manager conversation'], commonQuestions: ['Design a payment reconciliation service', 'Tell me about a production incident you owned'], tips: ['Expect questions on idempotency and retries'] },
  compensation: { notes: 'Public salary reports for this role suggest a wide band; confirm with the recruiter.' },
  news: [{ headline: 'Acme Payments raises Series C', why: 'Signals growth hiring across platform teams' }],
  watchOuts: ['Some reviews mention weekend on-call'], coverage: { reviews: 'partial', interview: 'good' }, gaps: ['No verified salary data for Bengaluru'],
};
const prep = {
  brief: { oneLiner: 'Senior Backend Engineer building high-throughput payment services; they want Python, Django and Kubernetes depth.', whatTheyWant: ['Python and Django in production', 'Kubernetes and Docker', 'Payments or reconciliation experience'], yourEdge: ['Built reconciliation handling 2 million transactions a day', 'Cut API latency by 38%'], stretchAreas: [{ skill: 'Kubernetes', howToFrame: 'Say you run containers with Docker today and have not operated clusters; describe how you would ramp up.' }], resumeAdvice: ['Lead with the reconciliation work'] },
  questions: [
    { category: 'Opening', question: 'Tell me about yourself.', whyTheyAsk: 'To hear your story.', answer: 'I am a backend engineer with six years of experience, most recently at PayNest, where I built a reconciliation service handling 2 million transactions a day.', evidence: ['Built payment reconciliation services in Python and Django handling 2 million transactions a day.'] },
    { category: 'Company', question: 'Why Acme Payments?', whyTheyAsk: 'To test real interest.', answer: 'Acme is scaling payments for merchants after its recent Series C, and my reconciliation work maps directly to that growth.', evidence: [] },
    { category: 'Role fit', question: 'Walk me through your caching work.', whyTheyAsk: 'To verify the 38% claim.', answer: 'I profiled the slowest endpoints, added Redis caching for hot reads and tuned PostgreSQL queries, which cut API latency by 38%.', evidence: ['Reduced API latency by 38%'] },
  ],
  askThem: ['How do you handle on-call?'], negotiation: { notice: 'State your real notice period and whether it can be bought out.', ctc: 'Give a range anchored on the public band.' },
};
const chatReply = ['Here is how I would approach it:\n\n', '1. Lead with the **reconciliation service** (2 million transactions a day).\n', '2. Mention the `38%` latency win.\n\n', 'Keep it under 90 seconds.'];

setClientForTests({
  beta: { messages: { create: async (p) => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(p.tools ? research : prep), p.tools ? { citations: [{ type: 'web_search_result_location', url: 'https://reviews.example/acme', title: 'Acme Payments reviews' }, { type: 'web_search_result_location', url: 'https://interviews.example/acme', title: 'Acme interview experiences' }] } : {})] }) } },
  messages: { create: async () => ({ stop_reason: 'end_turn', content: [text('{}')] }), stream: () => ({
    [Symbol.asyncIterator]: async function* () { for (const t of chatReply) { await new Promise((r) => setTimeout(r, 120)); yield { type: 'content_block_delta', delta: { type: 'text_delta', text: t } }; } },
    finalMessage: async () => ({ stop_reason: 'end_turn' }),
  }) },
});

const tmp = mkdtempSync(join(tmpdir(), 'tailorkit-ai-'));
const server = createApp({ dbPath: ':memory:' }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const DASH = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: process.env.E2E_MOBILE ? { width: 390, height: 800 } : { width: 1280, height: 900 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name, full = true) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `ai-${name}.png`), fullPage: full }); };
let failed = false;
const step = async (name, fn) => { try { await fn(); console.log('✔', name); } catch (e) { failed = true; console.log('✖', name, '\n   ', e.message.split('\n')[0]); } };

try {
  await page.goto(DASH);
  await page.fill('input[type=email]', 'ai@example.com'); await page.fill('input[type=password]', 'correct horse'); await page.click('button[type=submit]');
  await page.waitForSelector('.drop');
  await page.setInputFiles('input[type=file]', join(root, 'fixtures', 'sample-resume.txt'));
  await page.waitForSelector('.profile-card'); await page.click('text=Looks good, continue'); await page.waitForSelector('.empty');
  const token = await page.evaluate(() => localStorage.getItem('tk_token'));
  const cap = await (await fetch(`${DASH}/api/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: readFileSync(join(root, 'fixtures', 'sample-jd.txt'), 'utf8'), url: 'https://j.example/1', hints: { company: 'Acme Payments' } }) })).json();

  await step('sidebar shows AI on', async () => { await page.goto(`${DASH}/#/job/${cap.job.id}`); await page.waitForSelector('.ring'); assert.match(await page.locator('.sidebar').innerText(), /AI on/); });

  await step('AI interview prep: research with sources and coverage, brief, drafted answers', async () => {
    await page.click('.tabs >> text=Interview prep');
    await page.waitForSelector('.oneliner', { timeout: 20000 });
    const t = await page.locator('main').innerText();
    for (const want of ['Fintech', 'Strong engineering peers', 'Long hours around launches', 'Recruiter screen', 'Design a payment reconciliation service', 'Series C', 'Not found:', 'No verified salary data', 'Reviews: partial', 'Interview reports: good coverage']) assert.ok(t.includes(want), `shows "${want}"`);
    assert.doesNotMatch(t, /needs your input/i); assert.doesNotMatch(t, /Turn on AI/);
    const links = await page.locator('.src a').evaluateAll((as) => as.map((a) => [a.href, a.rel, a.target]));
    assert.deepEqual(links.map((l) => l[0]), ['https://reviews.example/acme', 'https://interviews.example/acme']);
    assert.ok(links.every((l) => l[1].includes('noopener') && l[2] === '_blank'));
    assert.doesNotMatch(t, /undefined|NaN|\[object|(^|\s)false(\s|$)/);
    await shot('prep');
  });

  await step('prep is saved: reopening shows it instantly without another run', async () => {
    await page.goto(`${DASH}/#/tracking`); await page.waitForSelector('.board');
    await page.click('.jcard'); await page.waitForSelector('.ring'); await page.click('.tabs >> text=Interview prep');
    await page.waitForSelector('.oneliner', { timeout: 5000 });
  });

  await step('Ask AI: suggestions, streamed answer rendered as formatted text, follow-up works', async () => {
    await page.click('.tabs >> text=Ask AI');
    await shot('chat-empty', false);
    await page.click('.suggest button >> nth=0');
    await page.waitForSelector('.msg.ai .cursor', { timeout: 5000 });
    await page.waitForSelector('.msg.ai strong:has-text("reconciliation service")', { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.msg.ai .cursor'), null, { timeout: 8000 });
    assert.equal(await page.locator('.suggest').isVisible(), false, 'suggestions hide once the chat starts');
    assert.equal(await page.locator('.msg.ai ol li').count(), 2);
    assert.equal(await page.locator('.msg.ai code').innerText(), '38%');
    await shot('chat', false);
    await page.fill('.composer textarea', 'And how long should it take?'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.msg.ai').length === 2 && !document.querySelector('.msg.ai .cursor'), null, { timeout: 8000 });
    assert.equal(await page.locator('.msg.user').count(), 2);
  });

  await step('settings shows AI on', async () => { await page.goto(`${DASH}/#/settings`); await page.click('.tabs >> text=AI'); await page.waitForSelector('main .ai-badge'); assert.match(await page.locator('main').innerText(), /On · claude-opus-5-5/); await shot('settings'); });
  await step('no uncaught page errors', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close(); server.close(); await closeBrowser(); rmSync(tmp, { recursive: true, force: true }); setClientForTests(null);
}
process.exit(failed ? 1 : 0);
