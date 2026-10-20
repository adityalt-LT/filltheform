// Job description -> structured requirements.

import { findSkills, canonicalSkill } from './skills.js';
import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';

const NICE_RE = /(nice[- ]to[- ]have|good[- ]to[- ]have|preferred|bonus|a plus|is a plus|desirable|added advantage|advantage|optional)/i;
const MUST_SECTION_RE = /^(requirements?|qualifications?|what you('|’)?ll need|must[- ]have|skills required|required skills|responsibilities|what you will do|about you|who you are|key skills|eligibility)\b/i;

// Social-feed chrome that is not part of the job ("Priya Nair • 1st • Talent Acquisition at …", "Like Comment Repost").
const NOISE_RE = /\s\S{1,4}\s(1st|2nd|3rd\+?)(\s\S{1,4}\s|$)|^(like|comment|repost|send|share|follow|connect|promoted|reply)(\s+(like|comment|repost|send|share|follow|connect|reply))*$|^\d+\s+(likes?|comments?|reposts?|reactions?)\b|^(see more|…more|\.\.\.more)$/i;
const NICE_MARK_RE = new RegExp(NICE_RE.source, 'ig');

export function extractBasic(text, hints = {}) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !NOISE_RE.test(l));
  const body = lines.join('\n');
  const must = new Set();
  const nice = new Set();
  const anyOf = [];
  let niceMode = false;
  for (const line of lines) {
    if (MUST_SECTION_RE.test(line.replace(/[:：]$/, '')) && line.length < 60) niceMode = false;
    else if (NICE_RE.test(line) && line.length < 60) niceMode = true;
    collectAlternatives(line, anyOf);
    // Inside a longer line (e.g. a hiring post), only what comes AFTER "nice to have" / "preferred" is optional.
    NICE_MARK_RE.lastIndex = 0;
    const mark = niceMode ? 0 : (NICE_MARK_RE.exec(line)?.index ?? -1);
    const before = mark > 0 ? line.slice(0, mark) : (mark === 0 ? '' : line);
    const after = mark >= 0 ? line.slice(mark) : '';
    for (const sk of findSkills(before)) { must.add(sk); nice.delete(sk); }
    for (const sk of findSkills(after)) if (!must.has(sk)) nice.add(sk);
  }
  const yrs = parseYears(body);
  return {
    title: hints.title || guessTitle(lines, body),
    company: hints.company || guessCompany(body),
    location: hints.location || '',
    mustHave: [...must],
    niceToHave: [...nice],
    anyOf: anyOf.filter((g) => g.every((x) => must.has(x) || nice.has(x))),
    minYears: yrs.min,
    maxYears: yrs.max,
    applyEmail: (String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0],
    summary: '',
    mode: 'basic',
  };
}

// "Django or FastAPI" means either one satisfies the requirement.
function collectAlternatives(line, groups) {
  const parts = line.split(/\s+or\s+/i);
  for (let i = 0; i < parts.length - 1; i++) {
    const left = findSkills(parts[i]);
    const right = findSkills(parts[i + 1]);
    if (!left.length || !right.length) continue;
    const pair = [left[left.length - 1], right[0]];
    const existing = groups.find((g) => pair.some((p) => g.includes(p)));
    if (existing) for (const p of pair) { if (!existing.includes(p)) existing.push(p); } else groups.push(pair);
  }
}

export function parseYears(text) {
  const t = String(text || '');
  const m = t.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i)
    || t.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:['’]s)?\s*(?:of\s*)?(?:relevant\s*|professional\s*|hands[- ]on\s*)?(?:experience|exp)/i);
  if (!m) return { min: null, max: null };
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : null;
  return { min, max };
}

const ROLE_WORD = /\b(engineer|developer|manager|analyst|designer|executive|associate|intern|lead|consultant|specialist|architect|scientist|officer|administrator|recruiter|writer|marketer|accountant|representative|tester|head|director|coordinator|supervisor|technician|assistant|strategist|advisor|trainee)\b/i;

function guessTitle(lines, body) {
  // Hiring posts: "We're hiring! Product Analyst (2-4 years) at …"
  const m = body.match(/\b(?:hiring|looking for|opening for|vacancy for|openings? for|role of|position of|role|position)\s*[:!\-–]?\s*(?:an?\s+)?([A-Z][\w/&+.\- ]{3,50}?)(?=\s*(?:\(|\bat\b|\bin\b|\bfor\b|[,.!|:\n]|$))/);
  if (m && ROLE_WORD.test(m[1])) return m[1].trim();
  const first = lines.find((l) => l.length > 3 && l.length <= 90 && ROLE_WORD.test(l));
  if (first) return first;
  return lines.find((l) => l.length > 3 && l.length < 90) || '';
}

function guessCompany(body) {
  const m = body.match(/\bat[ \t]+((?:[A-Z][\w&.\-]*)(?:[ \t]+(?:[A-Z][\w&.\-]*|&)){0,3})/);
  return m ? m[1].trim().replace(/[.,]$/, '') : '';
}

export async function extractJob(text, hints = {}) {
  const body = String(text || '').slice(0, 14000);
  const ai = await askJSON(
    `You extract structured data from a job posting or a LinkedIn hiring post. ${DATA_ONLY_RULE}
Schema: {"title":string,"company":string,"location":string,"mustHave":string[],"niceToHave":string[],"minYears":number|null,"maxYears":number|null,"applyEmail":string,"summary":string}
mustHave/niceToHave are concrete skills, tools, or qualifications (2-4 words each), not sentences. summary is one sentence. Use "" or null when unknown; never guess.`,
    fence('job_page', body),
  );
  const basic = extractBasic(body, hints);
  if (!ai || !Array.isArray(ai.mustHave)) return basic;

  const norm = (arr) => [...new Set((arr || []).map((s) => canonicalSkill(String(s)) || String(s).trim()).filter(Boolean))].slice(0, 25);
  const must = norm(ai.mustHave);
  const nice = norm(ai.niceToHave).filter((s) => !must.includes(s));
  return {
    title: hints.title || ai.title || basic.title,
    company: hints.company || ai.company || basic.company,
    location: hints.location || ai.location || '',
    mustHave: must.length ? must : basic.mustHave,
    niceToHave: nice,
    anyOf: [],
    minYears: ai.minYears ?? basic.minYears,
    maxYears: ai.maxYears ?? basic.maxYears,
    applyEmail: ai.applyEmail || basic.applyEmail,
    summary: ai.summary || '',
    mode: 'ai',
  };
}
