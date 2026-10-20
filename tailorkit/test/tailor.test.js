import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResumeText, resumePlainText } from '../server/lib/resume-parse.js';
import { tailorResume, numbersPreserved } from '../server/lib/tailor.js';
import { scoreMatch } from '../server/lib/match.js';
import { highlightMetrics } from '../server/lib/render.js';
import { buildScreening } from '../server/lib/screening.js';

const resume = parseResumeText(readFileSync(new URL('../fixtures/sample-resume.txt', import.meta.url), 'utf8'));
const job = { title: 'Backend Engineer', mustHave: ['Docker', 'Kubernetes', 'Airflow'], niceToHave: [], anyOf: [], minYears: 3 };

test('tailoring keeps sections, headings and every bullet; it only reorders', () => {
  const { resume: t } = tailorResume(resume, job);
  assert.deepEqual(t.sections.map((s) => s.heading), resume.sections.map((s) => s.heading));
  const bullets = (r) => r.sections.flatMap((s) => s.items.flatMap((i) => (i.bullets || []).map((b) => b.text))).sort();
  assert.deepEqual(bullets(t), bullets(resume));
  assert.deepEqual(t.structure, resume.structure);
});

test('relevant bullets move first; skills the job names move first', () => {
  const { resume: t } = tailorResume(resume, job);
  const cloud = t.sections.find((s) => s.kind === 'experience').items[1].bullets[0].text;
  assert.match(cloud, /Airflow|Docker/);
  const tools = t.sections.find((s) => s.kind === 'skills').items.find((i) => i.label === 'Tools').skills;
  assert.deepEqual(tools.slice(0, 2), ['Docker', 'Airflow']);
});

test('never adds a skill the candidate has not confirmed; adds confirmed ones', () => {
  const plain = resumePlainText(tailorResume(resume, job).resume);
  assert.doesNotMatch(plain, /Kubernetes/);
  const withK = resumePlainText(tailorResume(resume, job, { confirmedSkills: ['Kubernetes'] }).resume);
  assert.match(withK, /Kubernetes/);
  // a confirmed skill the job does not ask for is not injected
  assert.doesNotMatch(resumePlainText(tailorResume(resume, job, { confirmedSkills: ['Tableau'] }).resume), /Tableau/);
});

test('rewrites may not change numbers', () => {
  assert.ok(numbersPreserved('Cut latency by 38% across 14 services', 'Reduced latency 38% over 14 services'));
  assert.ok(!numbersPreserved('Cut latency by 38%', 'Cut latency by 48%'));
  assert.ok(!numbersPreserved('Cut latency by 38%', 'Cut latency by 38% and saved 2 crore'));
});

test('metrics are highlighted, years and phone numbers are not', () => {
  const h = highlightMetrics('Cut cost by ₹2.5 Cr, grew 3x, served 120,000 users, since 2021, call +91 98765 43210. <script>');
  assert.match(h, /<b>₹2\.5 Cr<\/b>/); assert.match(h, /<b>3x<\/b>/); assert.match(h, /<b>120,000 users<\/b>/);
  assert.doesNotMatch(h, /<b>2021/); assert.doesNotMatch(h, /<b>98765/);
  assert.match(h, /&lt;script&gt;/);
});

test('score is explainable and "A or B" requirements are satisfied by either', () => {
  const m = scoreMatch({ resume }, { title: 'x', mustHave: ['Django', 'FastAPI'], niceToHave: [], anyOf: [['Django', 'FastAPI']], minYears: null });
  assert.deepEqual(m.missingMust, []);
  assert.equal(m.score, 100 - 0);
  const m2 = scoreMatch({ resume }, { title: '', mustHave: ['Kubernetes', 'Docker'], niceToHave: [], anyOf: [], minYears: null });
  assert.equal(m2.score, 50);
  assert.deepEqual(m2.missingMust, ['Kubernetes']);
});

test('screening prep: SQL evidence does not borrow PostgreSQL bullets; unknown facts need input', () => {
  const s = buildScreening({ resume, facts: {}, job: { title: 'Analyst', company: 'Zeta', minYears: 2 }, match: { matchedMust: ['SQL'], missingMust: ['Tableau'], yearsExperience: 6 } });
  const sql = s.questions.find((q) => q.question.includes('experience with SQL'));
  assert.equal(sql.points.length, 0);
  assert.ok(s.questions.find((q) => q.question.startsWith('What is your notice period')).needsInput);
  const s2 = buildScreening({ resume, facts: { noticePeriod: '30 days' }, job: { title: 'Analyst', company: 'Zeta' }, match: { matchedMust: [], missingMust: [] } });
  const np = s2.questions.find((q) => q.question.startsWith('What is your notice period'));
  assert.equal(np.answer, '30 days'); assert.equal(np.needsInput, false);
});
