// Job description -> structured requirements (rule-based, pure: also runs in the browser).

import { findSkills, canonicalSkill } from './skills.js';

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
    company: hints.company || guessCompany(body, lines),
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

const NOT_COMPANY = /\b(requirements?|responsibilit|qualifications?|about|apply|location|remote|hybrid|full[- ]time|part[- ]time|posted|salary|experience|skills?|benefits?|description|overview|summary|job|jobs|hiring)\b/i;

// "at Acme Corp" in running text, else a short capitalised line right next to the title ("Nike" under "Product Manager").
function guessCompany(body, lines = []) {
  const m = body.match(/\bat[ \t]+((?:[A-Z][\w&.\-]*)(?:[ \t]+(?:[A-Z][\w&.\-]*|&)){0,3})/);
  if (m) return m[1].trim().replace(/[.,]$/, '');
  const t = lines.findIndex((l) => l.length <= 90 && ROLE_WORD.test(l));
  for (const i of [t + 1, t - 1]) {
    if (t < 0 || i < 0 || i >= lines.length) continue;
    const name = lines[i].split(/\s+[·•|\-–—]\s+|,\s+/)[0].trim();
    if (name && name.length <= 40 && /^[A-Z0-9]/.test(name) && name.split(/\s+/).length <= 4 && !/\d{3,}/.test(name) && !ROLE_WORD.test(name) && !NOT_COMPANY.test(name) && !/[.!?:]$/.test(name)) return name;
  }
  return '';
}

// ---- Page scraping can pick up the wrong element (a card in a job list, site chrome, a stale heading).
// A title is only trusted if it is actually about the text we captured.
const JUNK_PREFIX = /^(selected|viewed|saved|new|promoted|verified|actively recruiting|easy apply)[,:]\s*/i;
const SITE_CHROME = /^(linkedin|jobs?|job search|home|feed|search|notifications|messaging|naukri(\.com)?|indeed|glassdoor|careers?|apply|menu|about the job|about us|about the role|job description|description|overview|requirements?|responsibilit\w*|qualifications?|skills?|\(\d+\).*)$/i;
export const cleanTitle = (t) => String(t || '').replace(/\s+/g, ' ').replace(JUNK_PREFIX, '').trim().slice(0, 120);
const wordSet = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/).filter(Boolean));

export function titleOnPage(title, text) {
  const tokens = [...wordSet(title)];
  if (!tokens.length || SITE_CHROME.test(title.trim())) return false;
  const words = wordSet(String(text).slice(0, 8000));
  return tokens.filter((w) => words.has(w)).length / tokens.length >= 0.9;
}

// Picks the first candidate that matches the captured text, preferring ones that look like a job title.
export function pickTitle(candidates, text) {
  const ok = [...new Set((candidates || []).map(cleanTitle).filter((c) => c.length >= 3))].filter((c) => titleOnPage(c, text));
  return ok.find((c) => ROLE_WORD.test(c)) || ok[0] || '';
}

// ---- Company: several weak signals from the page; the server keeps the best one that makes sense.
const JOB_BOARDS = /\b(linkedin|naukri|indeed|glassdoor|foundit|monster|instahyre|wellfound|angellist|cutshort|shine|timesjobs|apna|internshala|greenhouse|lever|workday|myworkdayjobs|ashby|workable|smartrecruiters|jobvite|icims|taleo)\b/i;
const SOURCE_WEIGHT = { link: 5, meta: 3, title: 2, url: 1 };
const cleanCompany = (n) => String(n || '').replace(/\s+/g, ' ').replace(/\s+(company\s+)?(logo|icon|image)$/i, '').replace(/^(careers?|jobs?|work)\s+(at|with|@)\s+/i, '').replace(/^join\s+/i, '').replace(/\s+[-–|]\s*(careers?|jobs?|hiring)$/i, '').replace(/\s+(careers?|jobs?)$/i, '').replace(/\s*\|\s*linkedin$/i, '').trim();

export function pickCompany(candidates, { title = '', text = '', allowUnverified = false } = {}) {
  const t = String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const low = String(text).toLowerCase();
  const scored = (Array.isArray(candidates) ? candidates : []).slice(0, 12).map((c, i) => ({ name: cleanCompany(c?.name), w: SOURCE_WEIGHT[c?.source] || 0, i, source: c?.source }))
    .filter((c) => c.name.length >= 2 && c.name.length <= 60
      && c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== t
      && !SITE_CHROME.test(c.name) && !JOB_BOARDS.test(c.name) && !/^(easy apply|apply|save|follow|promoted|new|\d+ .*)$/i.test(c.name)
      && !(c.source !== 'link' && ROLE_WORD.test(c.name) && c.name.split(/\s+/).length >= 2));
  for (const c of scored) { c.inText = low.includes(c.name.toLowerCase()); c.s = c.w + (c.inText ? 2 : 0); }
  // A company-page link in the same panel is trusted. Site names, page titles and URL slugs only count when the text
  // backs them up, unless nothing better exists (allowUnverified).
  const pool = scored.filter((c) => c.source === 'link' || c.inText || allowUnverified);
  pool.sort((a, b) => b.s - a.s || a.i - b.i);
  return pool[0]?.name || '';
}

