// Stand-in for the server in the static demo. It answers the same /api routes the dashboard calls, in the browser,
// using the real matching, tailoring, rendering and prep code. Nothing leaves the page and nothing is stored.
import { toast } from './dom.js';
import { scoreMatch, estimateYears } from '../lib/match.js';
import { extractBasic, pickTitle, cleanTitle } from '../lib/jd-basic.js';
import { tailorResume } from '../lib/tailor-core.js';
import { renderHtml } from '../lib/render-html.js';
import { sanitizeResume } from '../lib/model.js';
import { deriveProfile } from '../lib/derive.js';
import { buildBasicPrep } from '../lib/prep-basic.js';
import { FONT_CSS } from './demo-fonts.js';

const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'];
const FREE_LIMIT = 10;
const clone = (v) => JSON.parse(JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });

let seed = null; let S = null; let token = 'demo';
const load = async () => {
  if (S) return S;
  seed ??= await (await fetch(new URL('../seed.json', import.meta.url))).json();
  S = clone(seed);
  S.nextJob = Math.max(0, ...S.jobs.map((j) => j.id)) + 1;
  S.nextResume = Math.max(0, ...S.resumes.map((r) => r.id)) + 1;
  for (const j of S.jobs) { j.createdAt = iso(j.daysAgo); j.updatedAt = j.createdAt; j.appliedAt = j.status === 'saved' ? null : iso(Math.max(0, j.daysAgo - 1)); }
  for (const r of S.resumes) { r.createdAt = r.updatedAt = S.jobs.find((j) => j.id === r.jobId)?.createdAt || iso(1); }
  return S;
};
export const resetDemo = () => { S = null; };

export const getToken = () => token;
export const setToken = (t) => { token = t || ''; };

const rescore = (reqs) => scoreMatch({ resume: S.profile.resume, confirmedSkills: S.profile.confirmedSkills, yearsExperience: S.profile.facts.yearsExperience ?? null }, reqs);
const resumesOf = (jobId) => S.resumes.filter((r) => r.jobId === jobId).sort((a, b) => b.id - a.id).map((r) => ({ id: r.id, label: r.label, created_at: r.createdAt, updated_at: r.updatedAt }));
const jobOut = (j) => ({ id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, source: j.source, status: j.status, notes: j.notes, requirements: j.requirements, match: j.match, resumes: resumesOf(j.id), createdAt: j.createdAt, updatedAt: j.updatedAt, appliedAt: j.appliedAt });
const jobOf = (id) => { const j = S.jobs.find((x) => x.id === Number(id)); if (!j) throw fail(404, 'Job not found.'); return j; };
const resumeOf = (id) => { const r = S.resumes.find((x) => x.id === Number(id)); if (!r) throw fail(404, 'Resume not found.'); return r; };
const quota = () => { const used = new Set(S.usage).size; return { plan: 'free', used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) }; };
const me = () => ({ user: { email: S.user.email, plan: 'free' }, quota: quota(), hasResume: true, aiEnabled: true, aiModel: 'demo', aiError: null });

function tailorJob(j) {
  const key = `job:${j.id}`;
  if (!S.usage.includes(key) && quota().remaining <= 0) return { quotaExceeded: true, quota: quota() };
  const { resume, changes } = tailorResume(S.profile.resume, j.requirements, { confirmedSkills: S.profile.confirmedSkills });
  const label = [j.company, j.title].filter(Boolean).join(' – ') || 'Tailored resume';
  const r = { id: S.nextResume++, jobId: j.id, label, resume, changes, suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  S.resumes.push(r); S.usage.push(key);
  return { resumeId: r.id, changes, suggestions: [], quota: quota() };
}

const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 400));
function similar(a, b) {
  const x = words(String(a).slice(0, 2500)); const y = words(String(b).slice(0, 2500));
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n);
}

function capture(body) {
  const text = String(body?.text || '').trim().slice(0, 60000);
  if (text.length < 80) throw fail(422, 'Not enough text on this page. Select the job description and try again.');
  const title = cleanTitle(pickTitle([], text));
  const reqs = extractBasic(text, { title });
  const match = rescore(reqs);
  const existing = S.jobs.find((j) => (j.title && reqs.title && j.title.toLowerCase() === reqs.title.toLowerCase()) || similar(j.jdText, text) >= 0.6);
  let j = existing;
  if (j) Object.assign(j, { title: reqs.title, company: reqs.company, location: reqs.location, jdText: text, requirements: reqs, match, updatedAt: new Date().toISOString() });
  else {
    j = { id: S.nextJob++, title: reqs.title, company: reqs.company, location: reqs.location, url: String(body?.url || ''), source: 'Pasted', status: 'saved', notes: '', jdText: text, requirements: reqs, match, daysAgo: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), appliedAt: null };
    S.jobs.unshift(j);
  }
  const t = tailorJob(j);
  return { job: jobOut(j), resumeId: t.resumeId ?? null, quotaExceeded: !!t.quotaExceeded, quota: t.quota ?? quota(), existing: !!existing };
}

function prepContext(j) {
  const best = S.resumes.filter((r) => r.jobId === j.id).sort((a, b) => b.id - a.id)[0];
  return { resume: best ? best.resume : S.profile.resume, derived: deriveProfile(S.profile.resume), match: j.match, job: { ...j.requirements, title: j.title, company: j.company, location: j.location }, research: null };
}

// Scripted answers for the demo chat, built from the same sample data. The live product sends these questions to Claude.
function chatReply(question, j) {
  const q = question.toLowerCase();
  const ctx = prepContext(j); const m = j.match;
  const note = '(Demo reply: scripted from this job’s real match data. In the live app Claude answers using your resume, this job and company research.)\n\n';
  if (/weak|gap|missing/.test(q)) return `${note}For ${j.title}, your resume is weakest on: ${m.missingMust?.length ? m.missingMust.join(', ') : 'nothing required'}. ${m.missingMust?.length ? 'If you have used any of these, confirm them on the Overview tab and your score and resume update. If not, say so plainly in the interview and point to the closest thing you have done.' : 'Every must-have is covered, so spend your time on the strongest metrics.'}`;
  if (/recruiter|message|draft|email/.test(q)) return `${note}Hi, I’m ${S.profile.derived.name || 'a candidate'}. I saw the ${j.title} role at ${j.company || 'your company'} and my background in ${(m.matchedMust || []).slice(0, 3).join(', ') || 'backend engineering'} looks like a close fit. I’ve attached a resume tailored to the role. Could we find 15 minutes this week to talk?`;
  if (/know|company|before/.test(q)) return `${note}This demo does not search the web, so there is nothing sourced about ${j.company || 'the company'} to show. The live app researches the company with cited sources: what it does, employee review themes, news and reported interview questions.`;
  const top = buildBasicPrep({ ...ctx, job: ctx.job }).questions.slice(0, 3);
  return `${note}Likely questions for this role:\n\n${top.map((x, i) => `${i + 1}. ${x.question}`).join('\n')}\n\nOpen the Interview prep tab for a drafted answer to each, built from your resume.`;
}

async function handle(method, path, body) {
  await load();
  const [p, qs] = path.split('?'); void qs;
  let m;
  if (p === '/api/me') return me();
  if (p === '/api/auth/signup' || p === '/api/auth/login') { token = 'demo'; return { token, user: { email: S.user.email, plan: 'free' } }; }
  if (p === '/api/auth/logout') { token = ''; return { ok: true }; }
  if (p === '/api/waitlist') return { ok: true };
  if (p === '/api/profile/resume') return { resume: S.profile.resume, derived: deriveProfile(S.profile.resume), warnings: S.profile.warnings, format: 'txt', originalText: S.profile.originalText };
  if (p === '/api/profile' && method === 'GET') return { profile: { ...S.profile, derived: deriveProfile(S.profile.resume), yearsEstimate: estimateYears(S.profile.resume) } };
  if (p === '/api/profile' && method === 'PUT') {
    if (body.resume) S.profile.resume = sanitizeResume(body.resume);
    if (body.facts) S.profile.facts = body.facts;
    if (Array.isArray(body.confirmedSkills)) S.profile.confirmedSkills = body.confirmedSkills;
    return { ok: true };
  }
  if (p === '/api/capture') return capture(body);
  if (p === '/api/jobs' && method === 'GET') return { jobs: S.jobs.map(jobOut), statuses: STATUSES };
  if ((m = p.match(/^\/api\/jobs\/(\d+)$/))) {
    const j = jobOf(m[1]);
    if (method === 'GET') return { job: { ...jobOut(j), jdText: j.jdText } };
    if (method === 'DELETE') { S.jobs = S.jobs.filter((x) => x !== j); S.resumes = S.resumes.filter((r) => r.jobId !== j.id); return { ok: true }; }
    if (method === 'PATCH') {
      if (body.status !== undefined) { if (!STATUSES.includes(body.status)) throw fail(400, 'Unknown status.'); j.status = body.status; if (j.status !== 'saved' && !j.appliedAt) j.appliedAt = new Date().toISOString(); }
      for (const k of ['notes', 'title', 'company', 'location']) if (body[k] !== undefined) j[k] = String(body[k]).slice(0, k === 'notes' ? 4000 : 200);
      return { job: jobOut(j) };
    }
  }
  if ((m = p.match(/^\/api\/jobs\/(\d+)\/gaps$/))) {
    const j = jobOf(m[1]);
    const known = [...(j.requirements.mustHave || []), ...(j.requirements.niceToHave || [])];
    if (!known.includes(body.skill)) throw fail(400, 'That skill is not part of this job.');
    if (body.has === true && !S.profile.confirmedSkills.includes(body.skill)) S.profile.confirmedSkills.push(body.skill);
    j.match = rescore(j.requirements);
    return { job: jobOut(j) };
  }
  if ((m = p.match(/^\/api\/jobs\/(\d+)\/tailor$/))) {
    const t = tailorJob(jobOf(m[1]));
    if (t.quotaExceeded) throw Object.assign(fail(402, 'You have used all free tailored resumes this month.'), { data: t });
    return t;
  }
  if ((m = p.match(/^\/api\/jobs\/(\d+)\/prep$/)) && method === 'GET') {
    const j = jobOf(m[1]); const row = S.preps[j.id];
    return row ? { prep: row.prep, research: row.research, createdAt: iso(1), stale: false, aiEnabled: true } : { prep: null, aiEnabled: true };
  }
  if (p === '/api/skill-gaps') {
    const map = new Map();
    for (const j of S.jobs) { const mm = rescore(j.requirements); for (const [list, kind] of [[mm.missingMust, 'must'], [mm.missingNice, 'nice']]) for (const skill of list) {
      const e = map.get(skill) || { skill, jobs: 0, must: 0, nice: 0, examples: [] }; e.jobs += 1; e[kind] += 1; if (e.examples.length < 3) e.examples.push(`${j.title}${j.company ? ' @ ' + j.company : ''}`); map.set(skill, e); } }
    return { totalJobs: S.jobs.length, gaps: [...map.values()].sort((a, b) => b.must - a.must || b.jobs - a.jobs) };
  }
  if (p === '/api/resumes' && method === 'GET') return { resumes: [...S.resumes].sort((a, b) => b.id - a.id).map((r) => { const j = S.jobs.find((x) => x.id === r.jobId); return { id: r.id, jobId: r.jobId, label: r.label, title: j?.title, company: j?.company, createdAt: r.createdAt, updatedAt: r.updatedAt }; }) };
  if ((m = p.match(/^\/api\/resumes\/(\d+)$/))) {
    const r = resumeOf(m[1]);
    if (method === 'GET') return { id: r.id, jobId: r.jobId, label: r.label, resume: r.resume, changes: r.changes, suggestions: r.suggestions || [], createdAt: r.createdAt, updatedAt: r.updatedAt };
    if (method === 'PUT') { r.resume = sanitizeResume(body.resume); r.updatedAt = new Date().toISOString(); return { ok: true }; }
    if (method === 'DELETE') { S.resumes = S.resumes.filter((x) => x !== r); return { ok: true }; }
  }
  if (p === '/api/export') throw fail(400, 'Export is turned off in the demo.');
  if (p === '/api/account') throw fail(400, 'Deleting an account is turned off in the demo.');
  throw fail(404, 'Not found.');
}

export async function api(path, { method = 'GET', body } = {}) {
  await sleep(60);
  try { return await handle(method, path, body ? clone(body) : body); } catch (e) { if (!e.status) throw e; if (e.status === 401) setToken(''); throw e; }
}

export async function apiText(path, { body } = {}) {
  await load();
  let m;
  if (path === '/api/preview') return renderHtml(sanitizeResume(body.resume), { fontCss: FONT_CSS[body.resume?.structure?.fontFamily] ?? FONT_CSS.arimo });
  if (path === '/api/profile/html') return renderHtml(S.profile.resume, { fontCss: FONT_CSS[S.profile.resume.structure?.fontFamily] ?? FONT_CSS.arimo });
  if ((m = path.match(/^\/api\/resumes\/(\d+)\/html$/))) return renderHtml(resumeOf(m[1]).resume, { fontCss: FONT_CSS[resumeOf(m[1]).resume.structure?.fontFamily] ?? FONT_CSS.arimo });
  throw new Error('Could not load preview.');
}

// Browsers block downloads inside a published preview, so say so instead of failing silently.
export async function download(path, fallbackName) {
  toast(`Downloads are switched off in this preview. The real app saves ${fallbackName || 'the file'} here. Run it locally to try the PDF.`);
}

export async function streamPost(path, body, onEvent) {
  await load();
  let m;
  if ((m = path.match(/^\/api\/jobs\/(\d+)\/prep$/))) {
    const j = jobOf(m[1]);
    for (const label of ['Reading the job description…', 'Matching it to your resume…', 'Drafting answers from your resume…']) { onEvent({ type: 'step', label }); await sleep(450); }
    const prep = buildBasicPrep(prepContext(j));
    S.preps[j.id] = { prep, research: null };
    onEvent({ type: 'result', prep, research: null, stale: false });
    return;
  }
  if ((m = path.match(/^\/api\/jobs\/(\d+)\/chat$/))) {
    const j = jobOf(m[1]);
    const last = [...(body.messages || [])].reverse().find((x) => x.role === 'user');
    const reply = chatReply(String(last?.content || ''), j);
    for (let i = 0; i < reply.length; i += 14) { onEvent({ type: 'text', text: reply.slice(i, i + 14) }); await sleep(18); }
    onEvent({ type: 'done' });
    return;
  }
  throw new Error('Not available in the demo.');
}
