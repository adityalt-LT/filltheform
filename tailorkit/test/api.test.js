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
const sse = async (path, body = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  return (await res.text()).split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
};
const uploadForm = (buf, name) => { const f = new FormData(); f.append('file', new Blob([buf]), name); return f; };

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const app = createApp({ dbPath: ':memory:', freeLimit: 4 });
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
  const proj = r.data.resume.sections.find((x) => x.kind === 'projects').items;
  assert.deepEqual([proj.length, proj[0].title, proj[0].bullets.length], [1, 'Expense Tracker API', 1], 'a plain project title is an entry title, not a bullet');
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
  const pr = await sse(`/api/jobs/${jobId}/prep`);
  const result = pr.find((e) => e.type === 'result');
  assert.ok(result, 'prep stream ends with a result');
  assert.equal(result.prep.mode, 'basic');
  assert.ok(pr.some((e) => e.type === 'step'));
  const qs = result.prep.questions.map((q) => q.question);
  assert.ok(qs.some((q) => q.includes('notice period')));
  // The candidate is never asked to fill anything in: every question has a drafted answer.
  assert.ok(result.prep.questions.every((q) => q.answer && q.answer.length > 20), 'every question has an answer');
  assert.ok(qs.some((q) => q.startsWith('Walk me through')));
  const cached = await api(`/api/jobs/${jobId}/prep`);
  assert.equal(cached.data.prep.questions.length, result.prep.questions.length);
  const g = await api('/api/skill-gaps');
  assert.equal(g.data.totalJobs, 1);
});

test('capture identity: tracking params do not duplicate; a different posting at the same address is its own job', async () => {
  const before = (await api('/api/jobs')).data.jobs.length;
  const a = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Product Manager Growth'), url: 'https://spa.example/jobs/search/?currentJobId=111&utm_source=x&trk=abc', externalId: '111' } });
  assert.equal(a.status, 201);
  const again = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Product Manager Growth'), url: 'https://spa.example/jobs/search/?currentJobId=111&trk=zzz', externalId: '111' } });
  assert.equal(again.status, 200);
  assert.equal(again.data.job.id, a.data.job.id);
  // Same externalId/address, but the page now shows a totally different job (single-page app): must NOT overwrite the first.
  const nike = 'Product Management Intern\nNike\nRequirements\n- SQL and Excel\n- Stakeholder management and A/B testing\nGood to have\n- Tableau\nYou will own the roadmap for athlete experiences across apps and run experiments with design and engineering.';
  const other = await api('/api/capture', { method: 'POST', body: { text: nike, url: 'https://spa.example/jobs/search/?currentJobId=111', externalId: '111' } });
  assert.equal(other.data.existing, false);
  assert.notEqual(other.data.job.id, a.data.job.id);
  assert.equal(other.data.job.company, 'Nike');
  assert.equal((await api(`/api/jobs/${a.data.job.id}`)).data.job.title, 'Product Manager Growth', 'first job untouched');
  assert.equal((await api('/api/jobs')).data.jobs.length, before + 2);
  // Re-capturing the second one finds it again (not a third copy).
  const re = await api('/api/capture', { method: 'POST', body: { text: nike, url: 'https://spa.example/jobs/search/?currentJobId=111', externalId: '111' } });
  assert.equal(re.data.existing, true);
  assert.equal(re.data.job.id, other.data.job.id);
});

test('free plan limit blocks new tailoring but still logs the job', async () => {
  const ok = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Backend Engineer II'), url: 'https://jobs.example/b/2' } });
  assert.equal(ok.data.quota.used, 4);
  const over = await api('/api/capture', { method: 'POST', body: { text: jdTxt.replace('Senior Backend Engineer', 'Platform Engineer'), url: 'https://jobs.example/c/3' } });
  assert.equal(over.status, 201);
  assert.equal(over.data.quotaExceeded, true);
  assert.equal(over.data.resumeId, null);
  assert.equal((await api('/api/jobs')).data.jobs.length, 5);
});

test('title hints are verified against the captured text: a card from a job list, site chrome or a stale heading is not the job', async () => {
  const kuku = 'Product Manager II\nKuku\nBengaluru, Karnataka\nAbout the job\nOwn the roadmap for the audio app. You will work with SQL, A/B testing and stakeholder management every day.';
  const r = await api('/api/capture', { method: 'POST', body: { text: kuku, url: 'https://li.example/jobs/collections/recommended/?currentJobId=999', externalId: '999', hints: { company: 'Kuku', titleCandidates: ['Selected, Nykaa - Product Manager II', 'Jobs', 'LinkedIn', 'Product Manager II', 'Kuku'] } } });
  assert.equal(r.data.job.title, 'Product Manager II');
  assert.equal(r.data.job.company, 'Kuku');
  // every candidate is wrong: the title is worked out from the text instead of using a wrong one
  const r2 = await api('/api/capture', { method: 'POST', body: { text: kuku.replace('Kuku', 'Orbit').replace('audio app', 'travel app'), url: 'https://li.example/jobs/view/1000', externalId: '1000', hints: { company: 'Wrong Co', titleCandidates: ['Selected, Nykaa - Senior Designer', 'Feed | LinkedIn'] } } });
  assert.equal(r2.data.job.title, 'Product Manager II');
  assert.notEqual(r2.data.job.company, 'Wrong Co', 'a company hint that is not on the page is not believed when the title hint was wrong');
  // structured data is trusted as given
  const r3 = await api('/api/capture', { method: 'POST', body: { text: kuku + ' extra words to make it different from the others entirely', url: 'https://li.example/jobs/view/1001', externalId: '1001', hints: { title: 'Head of Product', titleTrusted: true, company: 'Zed' } } });
  assert.equal(r3.data.job.title, 'Head of Product');
});

test('company: the best verified candidate wins; a list card, the job title, a job board or a generic word never does', async () => {
  const { pickCompany } = await import('../server/lib/jd.js');
  const text = 'About the job. We build audio stories at scale.';
  assert.equal(pickCompany([{ name: 'Kuku', source: 'link' }, { name: 'Product Manager II | Kuku', source: 'title' }, { name: 'LinkedIn', source: 'meta' }], { title: 'Product Manager II', text }), 'Kuku');
  const weak = [{ name: 'LinkedIn', source: 'meta' }, { name: 'Jobs', source: 'title' }, { name: 'Product Manager II', source: 'title' }, { name: 'Nike', source: 'url' }];
  assert.equal(pickCompany(weak, { title: 'Product Manager II', text }), '', 'a URL slug the text does not back up is not trusted outright');
  assert.equal(pickCompany(weak, { title: 'Product Manager II', text, allowUnverified: true }), 'Nike', 'but is used as a last resort');
  assert.equal(pickCompany([{ name: 'SomeBoard', source: 'title' }, { name: 'Nike', source: 'url' }], { title: 'x', text: 'We are Nike, and we are hiring.' }), 'Nike', 'a company named in the text beats a site name');
  assert.equal(pickCompany([{ name: 'Kuku logo', source: 'link' }], { title: 'x', text }), 'Kuku', 'alt text of a logo image is cleaned');
  assert.equal(pickCompany([{ name: 'Careers at Acme Corp', source: 'title' }], { title: 'x', text, allowUnverified: true }), 'Acme Corp');
  assert.equal(pickCompany([{ name: 'Easy Apply', source: 'link' }, { name: 'greenhouse', source: 'url' }], { title: 'x', text, allowUnverified: true }), '');
  const r = await api('/api/capture', { method: 'POST', body: { text: 'Designer\nWe are hiring a designer to work on Figma prototypes and UX research with product and engineering every day.', url: 'https://boards.example.com/orbit-labs/jobs/77', externalId: '77', hints: { companyCandidates: [{ name: 'Orbit Labs', source: 'url' }, { name: 'LinkedIn', source: 'meta' }] } } });
  assert.equal(r.data.job.company, 'Orbit Labs');
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
