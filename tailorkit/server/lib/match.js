// Deterministic match between a candidate's verified profile and a job's
// requirements. The score is explainable: every point comes from a listed check.

import { findSkills, normalize } from './skills.js';
import { resumePlainText } from './resume-parse.js';

export function profileSkillSet(resume, confirmedSkills = []) {
  const text = resumePlainText(resume);
  const set = new Set(findSkills(text));
  for (const s of confirmedSkills) set.add(s);
  // Direct evidence of a broader skill: a CI tool on the resume is CI/CD experience.
  if (['Jenkins'].some((x) => set.has(x))) set.add('CI/CD');
  return { skills: set, text: normalize(text) };
}

function has(req, profile) {
  if (profile.skills.has(req)) return true;
  // Requirement not in the dictionary (e.g. an AI-extracted phrase): fall back to text search.
  const n = normalize(req);
  return n.length > 2 && profile.text.includes(n);
}

export function estimateYears(resume) {
  const now = new Date();
  const spans = [];
  for (const s of resume.sections) {
    if (s.kind !== 'experience') continue;
    for (const it of s.items) {
      const m = String(it.date || '').match(/((?:[a-z]{3,9}\.?\s*)?\d{4})\s*(?:-|–|—|to|until)\s*((?:[a-z]{3,9}\.?\s*)?\d{4}|present|current|now|till date|ongoing)/i);
      if (!m) continue;
      const a = toDate(m[1]);
      const b = /\d{4}/.test(m[2]) ? toDate(m[2]) : now;
      if (a && b && b >= a) spans.push([a.getTime(), b.getTime()]);
    }
  }
  if (!spans.length) return null;
  spans.sort((x, y) => x[0] - y[0]);
  let total = 0; let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) { if (s <= ce) ce = Math.max(ce, e); else { total += ce - cs; cs = s; ce = e; } }
  total += ce - cs;
  return Math.round((total / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

function toDate(s) {
  const d = new Date(String(s).replace(/\./g, '') + ' 1');
  if (!Number.isNaN(d.getTime())) return d;
  const y = String(s).match(/\d{4}/);
  return y ? new Date(Number(y[0]), 0, 1) : null;
}

function titleTokens(s) {
  const stop = new Set(['the', 'and', 'of', 'for', 'a', 'an', 'in', 'at', 'to', 'senior', 'junior', 'sr', 'jr', 'lead', 'i', 'ii', 'iii']);
  return new Set(normalize(s).split(' ').filter((t) => t.length > 1 && !stop.has(t)));
}

export function scoreMatch({ resume, confirmedSkills = [], yearsExperience = null }, job) {
  const profile = profileSkillSet(resume, confirmedSkills);
  const must = job.mustHave || [];
  const nice = job.niceToHave || [];
  // "A or B" requirements: covered when any member of the group is covered.
  const covered = (r) => has(r, profile) || (job.anyOf || []).some((g) => g.includes(r) && g.some((x) => has(x, profile)));
  const matchedMust = must.filter(covered);
  const missingMust = must.filter((r) => !covered(r));
  const matchedNice = nice.filter(covered);
  const missingNice = nice.filter((r) => !covered(r));

  const parts = [];
  if (must.length) parts.push({ key: 'skills', label: 'Must-have skills', weight: 60, ratio: matchedMust.length / must.length, detail: `${matchedMust.length} of ${must.length} covered` });
  if (nice.length) parts.push({ key: 'nice', label: 'Nice-to-have skills', weight: 10, ratio: matchedNice.length / nice.length, detail: `${matchedNice.length} of ${nice.length} covered` });

  const years = yearsExperience ?? estimateYears(resume);
  if (job.minYears != null && years != null) {
    const ratio = years >= job.minYears ? 1 : Math.max(0, years / job.minYears);
    parts.push({ key: 'experience', label: 'Experience', weight: 20, ratio, detail: `${years} yrs vs ${job.minYears}+ asked` });
  }

  if (job.title) {
    const jt = titleTokens(job.title);
    const mine = new Set();
    for (const s of resume.sections) if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items) for (const t of titleTokens(`${it.title} ${it.subtitle}`)) mine.add(t);
    if (jt.size) {
      const overlap = [...jt].filter((t) => mine.has(t)).length;
      parts.push({ key: 'title', label: 'Role similarity', weight: 10, ratio: Math.min(1, overlap / Math.min(jt.size, 2)), detail: overlap ? 'Similar titles in your history' : 'No similar title in your history' });
    }
  }

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = totalWeight ? Math.round((parts.reduce((a, p) => a + p.weight * p.ratio, 0) / totalWeight) * 100) : null;
  const band = score == null ? 'unknown' : score >= 75 ? 'strong' : score >= 50 ? 'partial' : 'weak';
  const likelyYears = years;
  return {
    score,
    band,
    breakdown: parts.map((p) => ({ key: p.key, label: p.label, detail: p.detail, points: Math.round((p.weight * p.ratio / totalWeight) * 100), max: Math.round((p.weight / totalWeight) * 100) })),
    matchedMust, missingMust, matchedNice, missingNice,
    yearsExperience: likelyYears,
    note: score == null
      ? 'No clear requirements were found on this page. Select the job text and capture again.'
      : 'A match score against this job description, not a guarantee of how a recruiter or any ATS will rank you.',
  };
}
