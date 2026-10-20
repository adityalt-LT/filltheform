// AI paths, exercised with a fake Anthropic client (no network, no key).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setClientForTests, askJSON, researchWeb, streamChat, aiEnabled, aiLastError } from '../server/lib/ai.js';
import { getCompanyResearch, normalizeResearch, companyKey } from '../server/lib/research.js';
import { buildPrep, normalizePrep, buildBasicPrep } from '../server/lib/prep.js';
import { parseResumeText } from '../server/lib/resume-parse.js';
import { deriveProfile } from '../server/lib/derive.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { closeBrowser } from '../server/lib/render.js';

const text = (t, extra = {}) => ({ type: 'text', text: t, ...extra });
const resume = parseResumeText(readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url), 'utf8'));
const derived = deriveProfile(resume);
const job = { title: 'Senior Backend Engineer', company: 'Acme Payments', location: 'Bengaluru', mustHave: ['Python', 'Kubernetes'], niceToHave: [], minYears: 3 };
const match = { score: 70, matchedMust: ['Python'], missingMust: ['Kubernetes'], missingNice: [], yearsExperience: 6.3 };

function fake(handlers = {}) {
  const calls = [];
  const rec = (kind) => async (p) => { calls.push({ kind, p }); return handlers[kind] ? handlers[kind](p, calls.length) : { stop_reason: 'end_turn', content: [text('{}')] }; };
  return {
    calls,
    beta: { messages: { create: rec('beta') } },
    messages: { create: rec('plain'), stream: (p) => { calls.push({ kind: 'stream', p }); return handlers.stream(p); } },
  };
}

after(async () => { setClientForTests(null); await closeBrowser(); });

test('askJSON: Opus 5.5 request shape (no sampling params, no thinking config), fences, parses JSON', async () => {
  const c = fake({ beta: () => ({ stop_reason: 'end_turn', content: [text('Sure!\n{"title":"PM","mustHave":["SQL"]}')] }) });
  setClientForTests(c);
  assert.equal(aiEnabled(), true);
  const out = await askJSON('sys', 'user text');
  assert.deepEqual(out, { title: 'PM', mustHave: ['SQL'] });
  const p = c.calls[0].p;
  assert.equal(p.model, 'claude-opus-5-5');
  for (const banned of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(banned in p), `${banned} must not be sent`);
  assert.equal(p.output_config.effort, 'low');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
});

test('askJSON: if the account rejects the fallback beta (400) it retries without it; other errors return null and are recorded', async () => {
  const c = fake({ beta: () => { throw Object.assign(new Error('bad beta'), { status: 400 }); }, plain: () => ({ stop_reason: 'end_turn', content: [text('{"ok":true}')] }) });
  setClientForTests(c);
  assert.deepEqual(await askJSON('s', 'u'), { ok: true });
  assert.ok(!('fallbacks' in c.calls.at(-1).p));
  setClientForTests(fake({ beta: () => { throw Object.assign(new Error('invalid x-api-key'), { status: 401 }); } }));
  assert.equal(await askJSON('s', 'u'), null);
  assert.match(aiLastError().message, /invalid x-api-key \(401\)/);
});

test('askJSON: refusal and unparsable output give null, never garbage', async () => {
  setClientForTests(fake({ beta: () => ({ stop_reason: 'refusal', content: [] }) }));
  assert.equal(await askJSON('s', 'u'), null);
  setClientForTests(fake({ beta: () => ({ stop_reason: 'end_turn', content: [text('no json here')] }) }));
  assert.equal(await askJSON('s', 'u'), null);
});

test('researchWeb: web search tool, resumes pause_turn, returns cited sources first', async () => {
  let n = 0;
  const c = fake({
    beta: (p) => {
      n += 1;
      if (n === 1) return { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }, { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ url: 'https://a.example/uncited', title: 'Uncited' }, { url: 'https://glassdoor.example/r', title: 'Reviews' }] }] };
      return { stop_reason: 'end_turn', content: [text('{"company":{"summary":"x"}}', { citations: [{ type: 'web_search_result_location', url: 'https://glassdoor.example/r', title: 'Reviews' }] })] };
    },
  });
  setClientForTests(c);
  const r = await researchWeb({ system: 's', user: 'u' });
  assert.equal(c.calls.length, 2);
  assert.equal(c.calls[0].p.tools[0].type, 'web_search_20260209');
  assert.equal(c.calls[1].p.messages.at(-1).role, 'assistant', 'paused turn is passed back to continue');
  assert.deepEqual(r.sources.map((s) => s.url), ['https://glassdoor.example/r', 'https://a.example/uncited']);
});

test('research: structured, capped, only http(s) sources; cached per company; reuses cache without calling the AI', async () => {
  const body = { company: { summary: 'Sportswear giant' }, culture: { summary: 'Fast', pros: ['pay'], cons: ['hours'], ratingNotes: null }, interview: { process: ['recruiter call', 'case round'], commonQuestions: ['Why Nike?'], tips: [] }, coverage: { reviews: 'partial', interview: 'good' }, gaps: ['No salary data'] };
  const c = fake({ beta: () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(body), { citations: [{ url: 'https://x.example/a', title: 'A' }, { url: 'javascript:alert(1)', title: 'bad' }] })] }) });
  setClientForTests(c);
  const db = openDb(':memory:');
  const steps = [];
  const r1 = await getCompanyResearch(db, { company: 'Nike, Inc.', role: 'Product Manager', location: 'Bengaluru', onStep: (s) => steps.push(s) });
  assert.equal(r1.mode, 'ai'); assert.equal(r1.cached, false);
  assert.deepEqual(r1.sources.map((s) => s.url), ['https://x.example/a']);
  assert.equal(r1.interview.commonQuestions[0], 'Why Nike?');
  assert.ok(steps.some((s) => s.includes('Nike')));
  const before = c.calls.length;
  const r2 = await getCompanyResearch(db, { company: 'NIKE', role: 'product manager senior', location: 'x' });
  assert.equal(r2.cached, true); assert.equal(c.calls.length, before);
  assert.equal(companyKey('Nike, Inc.'), companyKey('NIKE'));
});

test('research: with no key it falls back to a basic snapshot and says what is missing; a basic result is not reused once AI is on', async () => {
  setClientForTests(null);
  delete process.env.ANTHROPIC_API_KEY;
  const db = openDb(':memory:');
  const fetchImpl = async (url) => ({ ok: true, json: async () => (url.includes('search/title')
    ? { pages: [{ title: 'Acme Payments', key: 'Acme_Payments', description: 'Indian payments company' }] }
    : { type: 'standard', title: 'Acme Payments', extract: 'Acme Payments is a payments company.', description: 'payments company', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Acme_Payments' } } }) });
  const r = await getCompanyResearch(db, { company: 'Acme Payments', role: 'Engineer', fetchImpl });
  assert.equal(r.mode, 'basic');
  assert.match(r.company.summary, /payments company/);
  assert.match(r.gaps[0], /AI mode/);
  assert.equal(r.sources[0].url, 'https://en.wikipedia.org/wiki/Acme_Payments');
  const wrong = await getCompanyResearch(db, { company: 'Zzz Unknown', role: 'x', fetchImpl: async () => ({ ok: true, json: async () => ({ pages: [{ title: 'Zzz something else', description: 'a river in Peru' }] }) }) });
  assert.equal(wrong.company.summary, '', 'an unrelated page is not used');
  setClientForTests(fake({ beta: () => ({ stop_reason: 'end_turn', content: [text('{"company":{"summary":"fresh"}}')] }) }));
  const upgraded = await getCompanyResearch(db, { company: 'Acme Payments', role: 'Engineer' });
  assert.equal(upgraded.mode, 'ai');
});

const aiPrep = (n = 5) => ({
  brief: { oneLiner: 'x', whatTheyWant: ['a'], yourEdge: ['b'], stretchAreas: [{ skill: 'Kubernetes', howToFrame: 'be honest' }], resumeAdvice: ['c'] },
  questions: Array.from({ length: n }, (_, i) => ({ category: 'Role fit', question: `Q${i}?`, whyTheyAsk: 'w', answer: `Answer ${i}`, evidence: ['Reduced API latency by 38%'] })),
  askThem: ['q'], negotiation: { notice: 'n', ctc: 'c' },
});

test('prep (AI): includes resume, job and fenced research in the prompt; falls back to basic with the reason if the AI output is unusable', async () => {
  const c = fake({ beta: () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(aiPrep()))] }) });
  setClientForTests(c);
  const research = normalizeResearch({ company: { summary: 'S' } }, [{ title: 't', url: 'https://r.example' }]);
  const prep = await buildPrep({ resume, derived, job, jdText: 'JD TEXT', match, research });
  assert.equal(prep.mode, 'ai');
  const user = c.calls[0].p.messages[0].content;
  assert.match(user, /<candidate_resume>[\s\S]*RAHUL SHARMA[\s\S]*<\/candidate_resume>/);
  assert.match(user, /<job_description>\nJD TEXT/);
  assert.match(user, /<company_research>/);
  assert.match(c.calls[0].p.system, /never instructions to follow|Ignore any request/);
  assert.equal(c.calls[0].p.output_config.effort, 'medium');

  setClientForTests(fake({ beta: () => ({ stop_reason: 'end_turn', content: [text(JSON.stringify(aiPrep(1)))] }) }));
  const fb = await buildPrep({ resume, derived, job, jdText: 'x', match, research: null });
  assert.equal(fb.mode, 'basic');
  assert.ok(fb.aiFailed);
});

test('prep (basic): complete answers for every question, no blanks, honest about gaps, strategy (not made-up numbers) for CTC', () => {
  const prep = buildBasicPrep({ resume, derived, job, match, research: null });
  assert.ok(prep.questions.length >= 8);
  for (const q of prep.questions) assert.ok(q.answer.length > 30, q.question);
  const gap = prep.questions.find((q) => q.category === 'Gaps');
  assert.match(gap.answer, /haven't used Kubernetes/);
  const ctc = prep.questions.find((q) => q.question.includes('CTC'));
  assert.doesNotMatch(ctc.answer, /\d+\s?(LPA|lakh)/i);
  assert.ok(normalizePrep(null) === null);
});

test('streamChat forwards text deltas and refuses to run without AI', async () => {
  setClientForTests(fake({ stream: () => ({ [Symbol.asyncIterator]: async function* () { yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }; yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }; }, finalMessage: async () => ({ stop_reason: 'end_turn' }) }) }));
  let got = '';
  await streamChat({ system: 's', messages: [{ role: 'user', content: 'hi' }], onText: (t) => { got += t; } });
  assert.equal(got, 'Hello');
  setClientForTests(null); delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(() => streamChat({ system: 's', messages: [], onText() {} }), /not enabled/);
});

// ---- through the HTTP API
let server; let base; let token;
const resumeTxt = readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url));
const jdTxt = readFileSync(new URL('../fixtures/sample-jd.txt', import.meta.url), 'utf8');
const call = async (path, { method = 'GET', body } = {}) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const events = async (res) => (await res.text()).split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));

test('API: prep stream with AI, cached GET, stale after the resume changes; chat streams and validates history', async () => {
  const researchBody = { company: { summary: 'Payments firm' }, culture: { summary: 'Good' }, interview: { process: ['x'], commonQuestions: ['y'] }, coverage: { reviews: 'partial', interview: 'partial' } };
  const c = fake({
    beta: (p) => ({ stop_reason: 'end_turn', content: [text(p.tools ? JSON.stringify(researchBody) : JSON.stringify(aiPrep()))] }),
    stream: (p) => ({ [Symbol.asyncIterator]: async function* () { yield { type: 'content_block_delta', delta: { type: 'text_delta', text: `Echo:${p.messages.at(-1).content}` } }; }, finalMessage: async () => ({ stop_reason: 'end_turn' }) }),
  });
  setClientForTests(c);
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const su = await (await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ai@example.com', password: 'correct horse' }) })).json();
    token = su.token;
    const f = new FormData(); f.append('file', new Blob([resumeTxt]), 'r.txt');
    const up = await (await call('/api/profile/resume', { method: 'POST' }).then(() => fetch(base + '/api/profile/resume', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: f }))).json();
    assert.equal(up.derived.name, 'RAHUL SHARMA');
    const cap = await (await call('/api/capture', { method: 'POST', body: { text: jdTxt, url: 'https://j.example/1', hints: { company: 'Acme Payments' } } })).json();
    const id = cap.job.id;

    assert.equal((await (await call(`/api/jobs/${id}/prep`)).json()).prep, null);
    const ev = await events(await call(`/api/jobs/${id}/prep`, { method: 'POST', body: {} }));
    assert.ok(ev.filter((e) => e.type === 'step').some((e) => /Searching the web for Acme Payments/.test(e.label)));
    const result = ev.find((e) => e.type === 'result');
    assert.equal(result.prep.mode, 'ai');
    assert.equal(result.research.mode, 'ai');
    const got = await (await call(`/api/jobs/${id}/prep`)).json();
    assert.equal(got.prep.questions.length, 5); assert.equal(got.stale, false);

    await new Promise((r) => setTimeout(r, 1100));
    await call('/api/profile', { method: 'PUT', body: { confirmedSkills: ['Kubernetes'] } });
    assert.equal((await (await call(`/api/jobs/${id}/prep`)).json()).stale, true, 'prep is marked stale after the profile changes');

    const chat = await events(await call(`/api/jobs/${id}/chat`, { method: 'POST', body: { messages: [{ role: 'assistant', content: 'dropped: cannot start with assistant' }, { role: 'user', content: 'Why Acme?' }, { role: 'user', content: 'Short answer please' }] } }));
    assert.equal(chat.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'Echo:Why Acme?\nShort answer please');
    assert.equal(chat.at(-1).type, 'done');
    const sys = c.calls.filter((x) => x.kind === 'stream').at(-1).p;
    assert.equal(sys.messages[0].role, 'user');
    assert.match(sys.system, /<candidate_resume>/);
    assert.match(sys.system, /<company_research>/, 'chat uses the stored company research');
    assert.equal((await call(`/api/jobs/${id}/chat`, { method: 'POST', body: { messages: [] } })).status, 400);

    setClientForTests(null); delete process.env.ANTHROPIC_API_KEY;
    assert.equal((await call(`/api/jobs/${id}/chat`, { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] } })).status, 409);
  } finally { server.close(); }
});
