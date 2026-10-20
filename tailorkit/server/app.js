import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, destroySession, rateLimiter } from './auth.js';
import { extractText, parseResumeText, parseWarnings, resumePlainText } from './lib/resume-parse.js';
import { sanitizeResume, httpError } from './lib/model.js';
import { extractJob } from './lib/jd.js';
import { scoreMatch, estimateYears } from './lib/match.js';
import { tailorResume, suggestRewrites } from './lib/tailor.js';
import { renderHtml, renderPdf } from './lib/render.js';
import { buildScreening } from './lib/screening.js';
import { aiEnabled } from './lib/ai.js';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
export const STATUSES = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected'];
const j = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const month = () => new Date().toISOString().slice(0, 7);

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
    res.json({ user: { email: req.user.email, plan: req.user.plan }, quota: quota(req.user), hasResume: !!p, aiEnabled: aiEnabled() });
  });

  // ---------- profile
  app.post('/api/profile/resume', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Choose a resume file (PDF, DOCX or TXT).');
    let extracted;
    try { extracted = await extractText(req.file.buffer, req.file.originalname); }
    catch (e) { throw e.status ? e : httpError(422, 'We could not read that file. Try a different PDF/DOCX, or paste it as .txt.'); }
    if (extracted.text.replace(/\s/g, '').length < 80) throw httpError(422, 'That file has almost no readable text (is it a scanned image?). Upload a text-based PDF or a DOCX.');
    const resume = parseResumeText(extracted.text);
    const prev = getProfile(req.user.id);
    db.prepare(`INSERT INTO profiles (user_id, resume, original_text, source_format, facts, confirmed_skills) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET resume = excluded.resume, original_text = excluded.original_text, source_format = excluded.source_format, updated_at = datetime('now')`)
      .run(req.user.id, JSON.stringify(resume), extracted.text.slice(0, 60000), extracted.format, JSON.stringify(prev?.facts || {}), JSON.stringify(prev?.confirmedSkills || []));
    res.status(201).json({ resume, warnings: parseWarnings(resume), format: extracted.format, originalText: extracted.text.slice(0, 20000) });
  });

  app.get('/api/profile', auth, (req, res) => {
    const p = getProfile(req.user.id);
    if (!p) return res.json({ profile: null });
    res.json({ profile: { ...p, warnings: parseWarnings(p.resume), yearsEstimate: estimateYears(p.resume) } });
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
    const hints = { title: clean(req.body?.hints?.title), company: clean(req.body?.hints?.company), location: clean(req.body?.hints?.location) };

    const reqs = await extractJob(text, hints);
    const match = rescore(profile, reqs);
    const existing = url ? db.prepare('SELECT * FROM jobs WHERE user_id = ? AND url = ?').get(req.user.id, url) : null;
    let jobId;
    if (existing) {
      jobId = existing.id;
      db.prepare("UPDATE jobs SET title=?, company=?, location=?, jd_text=?, requirements=?, match=?, updated_at=datetime('now') WHERE id=?")
        .run(reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), text, JSON.stringify(reqs), JSON.stringify(match), jobId);
    } else {
      const info = db.prepare('INSERT INTO jobs (user_id, title, company, location, url, source, jd_text, requirements, match) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(req.user.id, reqs.title.slice(0, 200), reqs.company.slice(0, 120), reqs.location.slice(0, 120), url, source, text, JSON.stringify(reqs), JSON.stringify(match));
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

  app.get('/api/jobs/:id/screening', auth, (req, res) => {
    const profile = needProfile(req.user.id);
    const r = jobRow(req.user.id, req.params.id);
    const job = jobOut(r);
    const best = db.prepare('SELECT data FROM resumes WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
    res.json(buildScreening({ resume: best ? j(best.data, profile.resume) : profile.resume, facts: { ...profile.facts, yearsExperience: profile.facts.yearsExperience }, job: { ...job.requirements, title: job.title, company: job.company }, match: job.match }));
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
