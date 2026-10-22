import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, destroySession, rateLimiter } from './auth.js';
import { parseResumeFile, parseWarnings } from './lib/resume-parse.js';
import { sanitizeResume, httpError } from './lib/model.js';
import { extractJob, pickTitle, cleanTitle, pickCompany } from './lib/jd.js';
import { scoreMatch, estimateYears } from './lib/match.js';
import { tailorResume, suggestRewrites } from './lib/tailor.js';
import { renderHtml, renderPdf } from './lib/render.js';
import { aiEnabled, aiLastError, aiModel, streamChat } from './lib/ai.js';
import { deriveProfile } from './lib/derive.js';
import { getCompanyResearch } from './lib/research.js';
import { buildPrep, chatSystem } from './lib/prep.js';
import { createHash } from 'node:crypto';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
export const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'];
const j = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const month = () => new Date().toISOString().slice(0, 7);

// ---- job identity: the same posting captured twice is one job; a different posting is never merged into it.
const TRACKING = /^(utm_|trk|trackingid|refid|ref$|referrer|fbclid|gclid|li_fat_id|lipi|ebp|midtoken|midsig|recommendedflavor|originalsubdomain)/i;
export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch { return String(raw || '').trim(); }
}
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 400));
export function similarText(a, b) {
  const x = words(String(a).slice(0, 2500)); const y = words(String(b).slice(0, 2500));
  if (!x.size || !y.size) return 0;
  let inter = 0; for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function sameJob(existing, reqs, text) {
  if (existing.title && reqs.title && norm(existing.title) === norm(reqs.title)) return true;
  return similarText(existing.jd_text, text) >= 0.6;
}
const shortHash = (t) => createHash('sha1').update(String(t)).digest('hex').slice(0, 8);

function sseStart(res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  return (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
}

export function createApp({ dbPath = process.env.DB_PATH || 'data/tailorkit.db', freeLimit = Number(process.env.FREE_MONTHLY_LIMIT || 10) } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  const authLimit = rateLimiter({ max: 15 });

  // --- CORS: the dashboard is same-origin; the Chrome extension calls with a bearer token (no cookies).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    if (origin && (origin.startsWith('chrome-extension://') || allowed.includes(origin))) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' });
    }
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const auth = (req, res, next) => {
    const h = req.headers.authorization || '';
    const user = userFromToken(db, h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    req.user = user; req.token = h.slice(7);
    next();
  };

  // ---------- helpers
  const getProfile = (userId) => {
    const r = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    if (!r) return null;
    return { resume: j(r.resume, null), originalText: r.original_text, format: r.source_format, facts: j(r.facts, {}), confirmedSkills: j(r.confirmed_skills, []) };
  };
  const needProfile = (userId) => {
    const p = getProfile(userId);
    if (!p) throw httpError(409, 'Upload your resume first (Profile → Upload resume).');
    return p;
  };
  const quota = (user) => {
    const used = db.prepare('SELECT COUNT(*) c FROM usage WHERE user_id = ? AND month = ?').get(user.id, month()).c;
    const limit = user.plan === 'free' ? freeLimit : null;
    return { plan: user.plan, used, limit, remaining: limit == null ? null : Math.max(0, limit - used) };
  };
  const jobRow = (userId, id) => {
    const r = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!r) throw httpError(404, 'Job not found.');
    return r;
  };
  const jobOut = (r) => {
    const resumes = db.prepare('SELECT id, label, created_at, updated_at FROM resumes WHERE job_id = ? ORDER BY id DESC').all(r.id);
    return { id: r.id, title: r.title, company: r.company, location: r.location, url: r.url, source: r.source, status: r.status, notes: r.notes,
      requirements: j(r.requirements, {}), match: j(r.match, {}), resumes, createdAt: r.created_at, updatedAt: r.updated_at, appliedAt: r.applied_at };
  };
  const rescore = (profile, req) => scoreMatch({ resume: profile.resume, confirmedSkills: profile.confirmedSkills, yearsExperience: profile.facts.yearsExperience ?? null }, req);

  async function tailorJob(user, profile, jobR, { force } = {}) {
    const req = j(jobR.requirements, {});
    const key = `job:${jobR.id}`;
    const already = db.prepare('SELECT 1 FROM usage WHERE user_id = ? AND month = ? AND job_key = ?').get(user.id, month(), key);
    if (!already) {
      const q = quota(user);
      if (q.limit != null && q.remaining <= 0) return { quotaExceeded: true, quota: q };
    }
    const { resume, changes } = tailorResume(profile.resume, req, { confirmedSkills: profile.confirmedSkills });
    const suggestions = await suggestRewrites(resume, req);
    const label = [jobR.company, jobR.title].filter(Boolean).join(' – ') || 'Tailored resume';
    const info = db.prepare('INSERT INTO resumes (user_id, job_id, label, data, changes, suggestions) VALUES (?,?,?,?,?,?)')
      .run(user.id, jobR.id, label, JSON.stringify(resume), JSON.stringify(changes), JSON.stringify(suggestions));
    db.prepare('INSERT OR IGNORE INTO usage (user_id, month, job_key) VALUES (?,?,?)').run(user.id, month(), key);
    return { resumeId: Number(info.lastInsertRowid), changes, suggestions, quota: quota(user) };
  }

  // ---------- auth
  app.post('/api/auth/signup', authLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'An account with this email already exists. Sign in instead.');
    const { salt, hash } = hashPassword(password);
    const info = db.prepare('INSERT INTO users (email, salt, pass_hash) VALUES (?,?,?)').run(email, salt, hash);
    res.status(201).json({ token: createSession(db, Number(info.lastInsertRowid)), user: { email, plan: 'free' } });
  });

  app.post('/api/auth/login', authLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !verifyPassword(String(req.body?.password || ''), u.salt, u.pass_hash)) throw httpError(401, 'Wrong email or password.');
    res.json({ token: createSession(db, u.id), user: { email: u.email, plan: u.plan } });
  });

  app.post('/api/auth/logout', auth, (req, res) => { destroySession(db, req.token); res.json({ ok: true }); });

  app.get('/api/me', auth, (req, res) => {
    const p = getProfile(req.user.id);
    res.json({ user: { email: req.user.email, plan: req.user.plan }, quota: quota(req.user), hasResume: !!p, aiEnabled: aiEnabled(), aiModel: aiEnabled() ? aiModel() : null, aiError: aiLastError() });
  });

  // ---------- profile
  app.post('/api/profile/resume', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Choose a resume file (PDF, DOCX or TXT).');
    let parsed;
    try { parsed = await parseResumeFile(req.file.buffer, req.file.originalname); }
    catch (e) { console.warn('[resume]', e.message); throw e.status ? e : httpError(422, 'We could not read that file. Try a different PDF/DOCX, or paste it as .txt.'); }
    if (parsed.text.replace(/\s/g, '').length < 80) throw httpError(422, 'That file has almost no readable text (is it a scanned image?). Upload a text-based PDF or a DOCX.');
    const resume = parsed.resume;
    const extracted = { text: parsed.text, format: parsed.format };
    const prev = getProfile(req.user.id);
    db.prepare(`INSERT INTO profiles (user_id, resume, original_text, source_format, facts, confirmed_skills) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET resume = excluded.resume, original_text = excluded.original_text, source_format = excluded.source_format, updated_at = datetime('now')`)
      .run(req.user.id, JSON.stringify(resume), extracted.text.slice(0, 60000), extracted.format, JSON.stringify(prev?.facts || {}), JSON.stringify(prev?.confirmedSkills || []));
    res.status(201).json({ resume, derived: deriveProfile(resume), warnings: parseWarnings(resume), format: extracted.format, originalText: extracted.text.slice(0, 20000) });
  });

  app.get('/api/profile', auth, (req, res) => {
    const p = getProfile(req.user.id);
    if (!p) return res.json({ profile: null });
    res.json({ profile: { ...p, derived: deriveProfile(p.resume), warnings: parseWarnings(p.resume), yearsEstimate: estimateYears(p.resume) } });
  });

  app.put('/api/profile', auth, (req, res) => {
    const p = needProfile(req.user.id);
    const resume = req.body.resume ? sanitizeResume(req.body.resume) : p.resume;
    const f = req.body.facts || p.facts;
    const facts = {};
    for (const k of ['noticePeriod', 'currentCtc', 'expectedCtc', 'location', 'relocation', 'yearsExperience']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') continue;
      facts[k] = k === 'yearsExperience' ? Math.max(0, Math.min(60, Number(f[k]) || 0)) : String(f[k]).slice(0, 120);
    }
    const confirmed = Array.isArray(req.body.confirmedSkills) ? req.body.confirmedSkills.map((s) => String(s).slice(0, 60)).slice(0, 200) : p.confirmedSkills;
    db.prepare("UPDATE profiles SET resume = ?, facts = ?, confirmed_skills = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(resume), JSON.stringify(facts), JSON.stringify(confirmed), req.user.id);
    res.json({ ok: true });
  });

  app.get('/api/profile/html', auth, (req, res) => {
    const p = needProfile(req.user.id);
    sendResumeHtml(res, p.resume);
  });

  // ---------- capture (called by the extension)
  app.post('/api/capture', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const text = String(req.body?.text || '').trim().slice(0, 60000);
    if (text.length < 80) throw httpError(422, 'Not enough text on this page. Select the job description and try again.');
    const url = String(req.body?.url || '').slice(0, 1000);
    const source = String(req.body?.source || '').slice(0, 60);
    // Hints come from scraping the page, which can grab the wrong element. Structured data is trusted; anything else
    // must be about the text we captured, otherwise we work the title out from the text (or the AI does).
    const hin = req.body?.hints || {};
    const trusted = hin.titleTrusted === true && !!clean(hin.title);
    const title = trusted ? clean(hin.title) : pickTitle([hin.title, ...(Array.isArray(hin.titleCandidates) ? hin.titleCandidates.slice(0, 12) : [])], text);
    const lowText = text.toLowerCase();
    const mentioned = (v) => !!clean(v) && lowText.includes(clean(v).toLowerCase());
    const finalTitle = cleanTitle(title);
    const company = (hin.companyTrusted === true && clean(hin.company)) || pickCompany(hin.companyCandidates, { title: finalTitle, text }) || (trusted || title || mentioned(hin.company) ? clean(hin.company) : '');
    const weakCompany = () => pickCompany(hin.companyCandidates, { title: finalTitle, text, allowUnverified: true });
    const believe = (v) => (trusted || title || mentioned(v)) ? clean(v) : '';
    const hints = { title: finalTitle, company, location: believe(hin.location) };
    const reqs = await extractJob(text, hints);
    if (!reqs.company) reqs.company = weakCompany(); // last resort: site name / page title / URL slug
    const match = rescore(profile, reqs);
    const externalId = String(req.body?.externalId || '').slice(0, 80);
    let host = ''; try { host = new URL(url).host.toLowerCase(); } catch { /* not a URL */ }
    const baseKey = externalId ? `${host}:${externalId}` : canonicalUrl(url);
    let jobKey = baseKey;
    let existing = null;
    if (baseKey) {
      // Candidates: the plain key, keys disambiguated with "#hash" (several postings on one address), and pre-upgrade rows.
      const prefix = `${baseKey}#`;
      const rows = db.prepare("SELECT * FROM jobs WHERE user_id = ? AND (job_key = ? OR substr(job_key, 1, ?) = ? OR (job_key = '' AND url = ?)) ORDER BY id DESC").all(req.user.id, baseKey, prefix.length, prefix, url);
      existing = rows.find((row) => sameJob(row, reqs, text)) || null;
      // Same address but a different posting (single-page sites, stale pages): keep it as its own job.
      if (!existing && rows.length) jobKey = `${prefix}${shortHash(text)}`;
    }
    let jobId;
    if (existing) {
      jobId = existing.id;
      db.prepare("UPDATE jobs SET title=?, company=?, location=?, jd_text=?, requirements=?, match=?, job_key=?, updated_at=datetime('now') WHERE id=?")
        .run(reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), text, JSON.stringify(reqs), JSON.stringify(match), existing.job_key || baseKey, jobId);
    } else {
      const info = db.prepare('INSERT INTO jobs (user_id, title, company, location, url, source, jd_text, requirements, match, job_key) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(req.user.id, reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), url, source, text, JSON.stringify(reqs), JSON.stringify(match), jobKey);
      jobId = Number(info.lastInsertRowid);
    }
    const jobR = jobRow(req.user.id, jobId);
    const t = await tailorJob(req.user, profile, jobR);
    res.status(existing ? 200 : 201).json({ job: jobOut(jobRow(req.user.id, jobId)), resumeId: t.resumeId ?? null, quotaExceeded: !!t.quotaExceeded, quota: t.quota ?? quota(req.user), existing: !!existing });
  });

  // ---------- jobs / tracking
  app.get('/api/jobs', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 500').all(req.user.id);
    res.json({ jobs: rows.map(jobOut), statuses: STATUSES });
  });

  app.get('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    res.json({ job: { ...jobOut(r), jdText: r.jd_text } });
  });

  app.patch('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    const b = req.body || {};
    const status = b.status === undefined ? r.status : b.status;
    if (!STATUSES.includes(status)) throw httpError(400, 'Unknown status.');
    const appliedAt = status !== 'saved' && !r.applied_at ? new Date().toISOString() : r.applied_at;
    db.prepare("UPDATE jobs SET status=?, notes=?, title=?, company=?, location=?, applied_at=?, updated_at=datetime('now') WHERE id=?")
      .run(status, b.notes === undefined ? r.notes : String(b.notes).slice(0, 4000), b.title === undefined ? r.title : String(b.title).slice(0, 200), b.company === undefined ? r.company : String(b.company).slice(0, 120), b.location === undefined ? r.location : String(b.location).slice(0, 120), appliedAt, r.id);
    res.json({ job: jobOut(jobRow(req.user.id, r.id)) });
  });

  app.delete('/api/jobs/:id', auth, (req, res) => {
    const r = jobRow(req.user.id, req.params.id);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // Confirm (or deny) a missing skill. Confirmed skills go into the profile and are used for every future job.
  app.post('/api/jobs/:id/gaps', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const skill = String(req.body?.skill || '').trim().slice(0, 60);
    const reqs = j(r.requirements, {});
    const known = [...(reqs.mustHave || []), ...(reqs.niceToHave || [])];
    if (!known.includes(skill)) throw httpError(400, 'That skill is not part of this job.');
    if (req.body?.has === true && !profile.confirmedSkills.includes(skill)) {
      profile.confirmedSkills.push(skill);
      db.prepare("UPDATE profiles SET confirmed_skills = ?, updated_at = datetime('now') WHERE user_id = ?").run(JSON.stringify(profile.confirmedSkills), req.user.id);
    }
    const match = rescore(profile, reqs);
    db.prepare("UPDATE jobs SET match = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(match), r.id);
    res.json({ job: jobOut(jobRow(req.user.id, r.id)) });
  });

  app.post('/api/jobs/:id/tailor', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const t = await tailorJob(req.user, profile, r);
    res.status(t.quotaExceeded ? 402 : 201).json(t.quotaExceeded ? { error: 'You have used all free tailored resumes this month.', ...t } : t);
  });

  // ---------- interview prep (company research + brief + questions), cached per job
  const prepContextFor = (user, profile, r) => {
    const job = jobOut(r);
    const best = db.prepare('SELECT data FROM resumes WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
    return {
      resume: best ? j(best.data, profile.resume) : profile.resume,
      derived: deriveProfile(profile.resume), jdText: r.jd_text, match: job.match,
      job: { ...job.requirements, title: job.title || job.requirements.title, company: job.company || job.requirements.company, location: job.location },
    };
  };

  app.get('/api/jobs/:id/prep', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const row = db.prepare('SELECT data, created_at FROM job_prep WHERE job_id = ?').get(r.id);
    if (!row) return res.json({ prep: null, aiEnabled: aiEnabled() });
    const stored = j(row.data, null);
    const profAt = db.prepare('SELECT updated_at FROM profiles WHERE user_id = ?').get(req.user.id)?.updated_at || '';
    const stale = profAt > row.created_at || (stored?.prep?.mode === 'basic' && aiEnabled());
    res.json({ prep: stored.prep, research: stored.research, createdAt: row.created_at, stale, aiEnabled: aiEnabled() });
  });

  app.post('/api/jobs/:id/prep', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const send = sseStart(res);
    try {
      const ctx = prepContextFor(req.user, profile, r);
      send({ type: 'step', label: 'Reading the job description…' });
      let research = null;
      if (ctx.job.company) research = await getCompanyResearch(db, { company: ctx.job.company, role: ctx.job.title, location: ctx.job.location, refresh: !!req.body?.refresh, onStep: (label) => send({ type: 'step', label }) });
      send({ type: 'step', label: aiEnabled() ? 'Writing your personalised prep…' : 'Building your prep…' });
      const prep = await buildPrep({ ...ctx, research });
      db.prepare("INSERT INTO job_prep (job_id, data, created_at) VALUES (?,?,datetime('now')) ON CONFLICT(job_id) DO UPDATE SET data=excluded.data, created_at=excluded.created_at").run(r.id, JSON.stringify({ prep, research }));
      send({ type: 'result', prep, research, stale: false });
    } catch (e) {
      console.error('[prep]', e);
      send({ type: 'error', message: 'Could not build your prep. Please try again.' });
    }
    res.end();
  });

  app.post('/api/jobs/:id/chat', auth, async (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    if (!aiEnabled()) throw httpError(409, 'Ask AI needs an Anthropic API key. See Settings.');
    // Keep a valid alternating history that starts and ends with the user.
    const cleaned = [];
    for (const m of (Array.isArray(req.body?.messages) ? req.body.messages : []).slice(-14)) {
      if (!['user', 'assistant'].includes(m?.role)) continue;
      const content = String(m.content || '').slice(0, 4000).trim();
      if (!content) continue;
      if (cleaned.length && cleaned.at(-1).role === m.role) cleaned.at(-1).content += `\n${content}`; else cleaned.push({ role: m.role, content });
    }
    while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
    if (!cleaned.length || cleaned.at(-1).role !== 'user') throw httpError(400, 'Ask a question first.');
    const ctx = prepContextFor(req.user, profile, r);
    const stored = j(db.prepare('SELECT data FROM job_prep WHERE job_id = ?').get(r.id)?.data, null);
    const send = sseStart(res);
    try {
      await streamChat({ system: chatSystem({ ...ctx, research: stored?.research || null }), messages: cleaned, onText: (text) => send({ type: 'text', text }) });
      send({ type: 'done' });
    } catch (e) {
      console.warn('[chat]', e.message);
      send({ type: 'error', message: e.status === 401 ? 'The API key was rejected.' : 'The AI request failed. Please try again.' });
    }
    res.end();
  });

  app.get('/api/skill-gaps', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ?').all(req.user.id);
    const map = new Map();
    for (const r of rows) {
      const reqs = j(r.requirements, {});
      const m = rescore(profile, reqs);
      for (const [list, kind] of [[m.missingMust, 'must'], [m.missingNice, 'nice']]) for (const skill of list) {
        const e = map.get(skill) || { skill, jobs: 0, must: 0, nice: 0, examples: [] };
        e.jobs += 1; e[kind] += 1; if (e.examples.length < 3) e.examples.push(`${r.title}${r.company ? ' @ ' + r.company : ''}`);
        map.set(skill, e);
      }
    }
    res.json({ totalJobs: rows.length, gaps: [...map.values()].sort((a, b) => b.must - a.must || b.jobs - a.jobs) });
  });

  // ---------- resumes
  const resumeRow = (userId, id) => {
    const r = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!r) throw httpError(404, 'Resume not found.');
    return r;
  };
  const resumeOut = (r) => ({ id: r.id, jobId: r.job_id, label: r.label, resume: j(r.data, null), changes: j(r.changes, []), suggestions: j(r.suggestions, []), createdAt: r.created_at, updatedAt: r.updated_at });

  app.get('/api/resumes', auth, (req, res) => {
    const rows = db.prepare('SELECT r.id, r.job_id, r.label, r.created_at, r.updated_at, j.title, j.company FROM resumes r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 500').all(req.user.id);
    res.json({ resumes: rows.map((r) => ({ id: r.id, jobId: r.job_id, label: r.label, title: r.title, company: r.company, createdAt: r.created_at, updatedAt: r.updated_at })) });
  });

  app.get('/api/resumes/:id', auth, (req, res) => res.json(resumeOut(resumeRow(req.user.id, req.params.id))));

  app.put('/api/resumes/:id', auth, (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    const data = sanitizeResume(req.body?.resume);
    const suggestions = Array.isArray(req.body?.suggestions) ? req.body.suggestions.slice(0, 30).map((s) => ({ itemId: String(s.itemId || ''), bulletId: String(s.bulletId || ''), original: String(s.original || '').slice(0, 1500), proposed: String(s.proposed || '').slice(0, 1500), reason: String(s.reason || '').slice(0, 200), status: ['pending', 'accepted', 'rejected'].includes(s.status) ? s.status : 'pending' })) : j(r.suggestions, []);
    db.prepare("UPDATE resumes SET data = ?, suggestions = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(data), JSON.stringify(suggestions), r.id);
    res.json({ ok: true });
  });

  app.delete('/api/resumes/:id', auth, (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    db.prepare('DELETE FROM resumes WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // Preview of unsaved edits: the editor posts its current model and gets HTML back.
  app.post('/api/preview', auth, (req, res) => sendResumeHtml(res, sanitizeResume(req.body?.resume)));
  app.get('/api/resumes/:id/html', auth, (req, res) => sendResumeHtml(res, j(resumeRow(req.user.id, req.params.id).data, null)));

  app.get('/api/resumes/:id/pdf', auth, async (req, res) => {
    const r = resumeRow(req.user.id, req.params.id);
    const data = j(r.data, null);
    let pdf;
    try { pdf = await renderPdf(data); } catch (e) { console.error('[pdf]', e.message); throw httpError(500, 'Could not generate the PDF. Please try again.'); }
    const name = (r.label || data.header.name || 'resume').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'resume';
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` }).send(Buffer.from(pdf));
  });

  // ---------- account
  app.get('/api/export', auth, (req, res) => {
    const id = req.user.id;
    res.set('Content-Disposition', 'attachment; filename="tailorkit-export.json"').json({
      user: { email: req.user.email, plan: req.user.plan }, profile: getProfile(id),
      jobs: db.prepare('SELECT * FROM jobs WHERE user_id = ?').all(id), resumes: db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(id),
    });
  });

  app.delete('/api/account', auth, (req, res) => {
    if (req.body?.confirm !== req.user.email) throw httpError(400, 'Type your email address to confirm deleting your account.');
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  // ---------- dashboard (static)
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use(express.static(WEB_DIR, { extensions: ['html'] }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : err.message });
  });

  app.locals.db = db;
  return app;
}

function sendResumeHtml(res, resume) {
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" }).send(renderHtml(resume));
}

const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
