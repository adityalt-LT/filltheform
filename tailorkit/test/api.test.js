import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { closeBrowser } from '../server/lib/render.js';

const resumeTxt = readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url));
const jdTxt = readFileSync(new URL('../fixtures/sample-jd.txt', import.meta.url), 'utf8');
let server; let base; let token;
const api = async (path, { method = 'GET', body, headers = {}, raw } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  return { status: res.status, data: await res.json().catch(() => null) };
};
const uploadForm = (buf, name) => { const f = new FormData(); f.append('file', new Blob([buf]), name); return f; };

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const app = createApp({ dbPath: ':memory:', freeLimit: 2 });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await closeBrowser(); });

test('rejects unauthenticated calls and bad signups', async () => {
  assert.equal((await api('/api/jobs')).status, 401);
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { email: 'nope', password: 'longenough' } })).status, 400);
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: 'short' } })).status, 400);
});

test('signup, login, duplicate', async () => {
  const s = await api('/api/auth/signup', { method: 'POST', body: { email: 'Rahul@Example.com', password: 'correct horse' } });
  assert.equal(s.status, 201);
  token = s.data.token;
  assert.equal((await api('/api/auth/signup', { method: 'POST', body: { email: 'rahul@example.com', password: 'correct horse' } })).status, 409);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'rahul@example.com', password: 'wrong password' } })).status, 401);
  const l = await api('/api/auth/login', { method: 'POST', body: { email: 'rahul@example.com', password: 'correct horse' } });
  assert.equal(l.status, 200);
  const me = await api('/api/me');
  assert.equal(me.data.hasResume, false);
});

test('capture before uploading a resume is refused with guidance', async () => {
  const r = await api('/api/capture', { method: 'POST', body: { text: jdTxt, url: 'https://x.example/1' } });
  assert.equal(r.status, 409);
});

test('resume upload keeps the original structure', async () => {
  const r = await api('/api/profile/resume', { method: 'POST', body: uploadForm(resumeTxt, 'resume.txt') });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.resume.sections.map((s) => s.heading), ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS']);
  assert.equal(r.data.resume.structure.headingCase, 'upper');
  assert.deepEqual(r.data.warnings, []);
  assert.equal((await api('/api/profile/resume', { method: 'POST', body: uploadForm(Buffer.from('x'), 'a.exe') })).status, 415);
});

let jobId; let resumeId;
test('capture scores the job and creates a tailored resume without inventing skills', async () => {
  const r = await api('/api/capture', { method: 'POST', body: { text: jdTxt, url: 'https://jobs.example/acme/1', source: 'linkedin', hints: { company: 'Acme Payments' } } });
  assert.equal(r.status, 201);
  jobId = r.data.job.id; resumeId = r.data.resumeId;
  assert.equal(r.data.job.company, 'Acme Payments');
  assert.ok(r.data.job.match.score > 50);
  assert.deepEqual(r.data.job.match.missingMust, ['Kubernetes']);
  const rs = await api(`/api/resumes/${resumeId}`);
  const skills = rs.data.resume.sections.find((s) => s.kind === 'skills').items.flatMap((i) => i.skills);
  assert.ok(!skills.includes('Kubernetes'), 'must not add unconfirmed skills');
  assert.equal(r.data.quota.used, 1);
});

test('re-capturing the same URL reuses the job and does not use quota', async () => {
  const r = await api('/api/capture', { method: 'POST', body: { text: jdTxt, url: 'https://jobs.example/acme/1' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.existing, true);
  assert.equal(r.data.quota.used, 1);
});

test('confirming a gap updates the score and the next tailored resume includes it', async () => {
  const before = (await api(`/api/jobs/${jobId}`)).data.job.match.score;
  const g = await api(`/api/jobs/${jobId}/gaps`, { method: 'POST', body: { skill: 'Kubernetes', has: true } });
  assert.equal(g.status, 200);
  assert.ok(g.data.job.match.score > before);
  assert.deepEqual(g.data.job.match.missingMust, []);
  assert.equal((await api(`/api/jobs/${jobId}/gaps`, { method: 'POST', body: { skill: 'Cobol', has: true } })).status, 400);
  const t = await api(`/api/jobs/${jobId}/tailor`, { method: 'POST' });
  assert.equal(t.status, 201);
  assert.equal(t.data.quota.used, 1, 're-tailoring the same job is free');
  const rs = await api(`/api/resumes/${t.data.resumeId}`);
  assert.ok(rs.data.resume.sections.find((s) => s.kind === 'skills').items.some((i) => i.skills.includes('Kubernetes')));
});

test('PDF is real, and HTML highlights metrics', async () => {
  const pdf = await api(`/api/resumes/${resumeId}/pdf`, { raw: true });
  assert.equal(pdf.status, 200);
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.equal(buf.slice(0, 4).toString(), '%PDF');
  const html = await (await api(`/api/resumes/${resumeId}/html`, { raw: true })).text();
  assert.match(html, /<b>38%<\/b>/);
  assert.match(html, /<b>2 million<\/b>/);
  assert.doesNotMatch(html, /<b>2022<\/b>/);
});

test('a generated PDF can be uploaded again (round trip) and keeps its sections', async () => {
  const pdf = Buffer.from(await (await api(`/api/resumes/${resumeId}/pdf`, { raw: true })).arrayBuffer());
  const r = await api('/api/profile/resume', { method: 'POST', body: uploadForm(pdf, 'resume.pdf') });
  assert.equal(r.status, 201);
  const headings = r.data.resume.sections.map((s) => s.heading);
  assert.deepEqual(headings, ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS']);
  // The PDF text layer must keep bullets under the right job (ATS parsers read this order).
  const exp = r.data.resume.sections.find((x) => x.kind === 'experience').items;
  assert.deepEqual(exp.map((i) => i.bullets.length), [4, 3]);
  assert.equal(exp[0].date, 'Jul 2022 – Present');
  assert.equal(r.data.resume.sections.find((x) => x.kind === 'education').items.length, 1);
  // restore the clean profile for later tests
  await api('/api/profile/resume', { method: 'POST', body: uploadForm(resumeTxt, 'resume.txt') });
});

test('tracking: status changes, screening prep, skill gaps', async () => {
  const p = await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: { status: 'applied' } });
  assert.equal(p.data.job.status, 'applied');
  assert.ok(p.data.job.appliedAt);
  assert.equal((await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: { status: 'bogus' } })).status, 400);
  const s = await api(`/api/jobs/${jobId}/screening`);
  assert.equal(s.status, 200);
  const qs = s.data.questions.map((q) => q.question);
  assert.ok(qs.includes('What is your notice period?'));
  assert.ok(s.data.questions.find((q) => q.question === 'What is your notice period?').needsInput);
  assert.ok(qs.some((q) => q.startsWith('Walk me through')));
  const g = await api('/api/skill-gaps');
  assert.equal(g.data.totalJobs, 1);
});

test('free plan limit blocks new tailoring but still logs the job', async () => {
  const ok = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Backend Engineer II'), url: 'https://jobs.example/b/2' } });
  assert.equal(ok.data.quota.used, 2);
  const over = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Platform Engineer'), url: 'https://jobs.example/c/3' } });
  assert.equal(over.status, 201);
  assert.equal(over.data.quotaExceeded, true);
  assert.equal(over.data.resumeId, null);
  assert.equal((await api('/api/jobs')).data.jobs.length, 3);
});

test('users cannot read each other\'s data', async () => {
  const other = await api('/api/auth/signup', { method: 'POST', body: { email: 'other@example.com', password: 'another pass' } });
  const mine = token; token = other.data.token;
  assert.equal((await api(`/api/jobs/${jobId}`)).status, 404);
  assert.equal((await api(`/api/resumes/${resumeId}`)).status, 404);
  assert.equal((await api(`/api/resumes/${resumeId}/pdf`, { raw: true })).status, 404);
  token = mine;
});

test('editor payloads are sanitised and preview works on unsaved edits', async () => {
  const rs = await api(`/api/resumes/${resumeId}`);
  const edited = rs.data.resume;
  edited.sections[1].items[0].bullets.splice(1, 1);
  edited.sections[1].items[0].title = '<img src=x onerror=alert(1)>';
  const put = await api(`/api/resumes/${resumeId}`, { method: 'PUT', body: { resume: edited } });
  assert.equal(put.status, 200);
  const html = await (await api(`/api/resumes/${resumeId}/html`, { raw: true })).text();
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  const prev = await api('/api/preview', { method: 'POST', body: { resume: edited }, raw: true });
  assert.match(prev.headers.get('content-security-policy'), /sandbox/);
});

test('account deletion needs confirmation and removes data', async () => {
  assert.equal((await api('/api/account', { method: 'DELETE', body: {} })).status, 400);
  assert.equal((await api('/api/account', { method: 'DELETE', body: { confirm: 'rahul@example.com' } })).status, 200);
  assert.equal((await api('/api/me')).status, 401);
});
