// Company research for interview prep.
//
// Basic mode: a short company snapshot from Wikipedia's public API.
// AI mode: Claude searches the public web (reviews, interview reports, news) and returns a
// structured summary with the sources it actually retrieved. We never scrape review sites.

import { aiEnabled, researchWeb, fence, DATA_ONLY_RULE, parseJsonObject } from './ai.js';

const SUFFIX = /\b(inc|incorporated|ltd|limited|pvt|private|llp|llc|corp|corporation|co|company|plc|gmbh)\b\.?/g;
export const companyKey = (n) => String(n || '').toLowerCase().replace(SUFFIX, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const roleKey = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['senior', 'junior', 'the', 'and', 'for'].includes(w)).slice(0, 3).join(' ');
const DAY = 24 * 3600 * 1000;
const COMPANYISH = /(company|corporation|brand|multinational|startup|firm|retailer|manufacturer|bank|conglomerate|software|platform|services|e-commerce|airline|carrier|studio|maker|provider|business)/i;

const cap = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (a, n = 8, len = 300) => (Array.isArray(a) ? a : []).map((x) => cap(typeof x === 'string' ? x : x?.text ?? x?.headline ?? '', len)).filter(Boolean).slice(0, n);

export async function wikipediaSnapshot(company, fetchImpl = fetch) {
  const key = companyKey(company);
  if (!key) return null;
  const get = async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'TailorKit/1.0 (interview prep)', Accept: 'application/json' } });
    return res.ok ? res.json() : null;
  };
  try {
    const found = await get(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(company)}&limit=4`);
    const hit = (found?.pages || []).find((p) => companyKey(p.title).split(' ')[0] === key.split(' ')[0] && COMPANYISH.test(`${p.description || ''}`));
    if (!hit) return null;
    const sum = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.key || hit.title)}`);
    if (!sum || sum.type === 'disambiguation' || !sum.extract) return null;
    return { summary: cap(sum.extract, 800), industry: cap(sum.description, 120), title: sum.title, url: sum.content_urls?.desktop?.page || '' };
  } catch { return null; }
}

const RESEARCH_SYSTEM = `You research a company for a job candidate who is preparing for an interview. Use web search on public sources only.
Search for: the company's interview process for the role; employee review themes (sites such as Glassdoor, AmbitionBox, Indeed, Reddit, Blind) ; culture and work-life balance; recent news; and salary ranges for the role if published.
Rules:
- Use only what you actually retrieved. If you cannot find something, say so in "gaps". Never invent ratings, quotes, numbers, interview questions or sources.
- Paraphrase. Do not copy long passages from review sites.
- Reviews are individual opinions; describe themes and say how consistent they are.
- ${DATA_ONLY_RULE}
Final answer: one JSON object with this shape:
{"company":{"summary":string,"industry":string,"size":string|null,"hq":string|null},
 "culture":{"summary":string,"pros":string[],"cons":string[],"ratingNotes":string|null},
 "interview":{"process":string[],"commonQuestions":string[],"tips":string[]},
 "compensation":{"notes":string|null},
 "news":[{"headline":string,"why":string}],
 "watchOuts":string[],
 "coverage":{"reviews":"good"|"partial"|"none","interview":"good"|"partial"|"none"},
 "gaps":string[]}`;

export function normalizeResearch(obj, sources, mode = 'ai') {
  const o = obj || {};
  const cov = (v) => (['good', 'partial', 'none'].includes(v) ? v : 'none');
  return {
    mode,
    company: { summary: cap(o.company?.summary, 900), industry: cap(o.company?.industry, 120), size: o.company?.size ? cap(o.company.size, 80) : null, hq: o.company?.hq ? cap(o.company.hq, 80) : null },
    culture: { summary: cap(o.culture?.summary, 700), pros: list(o.culture?.pros), cons: list(o.culture?.cons), ratingNotes: o.culture?.ratingNotes ? cap(o.culture.ratingNotes, 300) : null },
    interview: { process: list(o.interview?.process, 10), commonQuestions: list(o.interview?.commonQuestions, 12), tips: list(o.interview?.tips) },
    compensation: { notes: o.compensation?.notes ? cap(o.compensation.notes, 400) : null },
    news: (Array.isArray(o.news) ? o.news : []).slice(0, 5).map((n) => ({ headline: cap(n?.headline, 200), why: cap(n?.why, 250) })).filter((n) => n.headline),
    watchOuts: list(o.watchOuts, 6),
    coverage: { reviews: cov(o.coverage?.reviews), interview: cov(o.coverage?.interview) },
    gaps: list(o.gaps, 6),
    sources: (sources || []).slice(0, 12).map((s) => ({ title: cap(s.title, 120), url: s.url })).filter((s) => /^https?:\/\//.test(s.url)),
  };
}

export async function aiCompanyResearch({ company, role, location }) {
  const res = await researchWeb({
    system: RESEARCH_SYSTEM,
    user: `Research this employer for the candidate.\n${fence('target', JSON.stringify({ company, role, location }))}`,
  });
  if (!res) return null;
  const obj = parseJsonObject(res.text);
  if (!obj) return normalizeResearch({ company: { summary: res.text.slice(0, 900) }, gaps: ['The research summary could not be structured.'] }, res.sources);
  return normalizeResearch(obj, res.sources);
}

export async function basicResearch(company, fetchImpl) {
  const wiki = await wikipediaSnapshot(company, fetchImpl);
  return normalizeResearch({
    company: { summary: wiki?.summary || '', industry: wiki?.industry || '' },
    gaps: ['Employee reviews, interview reports and salary data are researched in AI mode (web search). Add an Anthropic API key to turn it on.'],
  }, wiki?.url ? [{ title: `${wiki.title} (Wikipedia)`, url: wiki.url }] : [], 'basic');
}

// Cached per company+role family for a week (AI) or a day (basic), shared across users because it is public information.
export async function getCompanyResearch(db, { company, role, location, refresh = false, onStep = () => {}, fetchImpl }) {
  if (!company) return null;
  const key = `${companyKey(company)}|${roleKey(role)}`;
  const row = db.prepare('SELECT data, mode, created_at FROM company_research WHERE company_key = ?').get(key);
  if (row && !refresh) {
    const age = Date.now() - new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    const fresh = row.mode === 'ai' ? age < 7 * DAY : age < DAY && !aiEnabled();
    if (fresh) return { ...JSON.parse(row.data), cached: true };
  }
  let data = null;
  if (aiEnabled()) {
    onStep(`Searching the web for ${company}: reviews, interview reports, news…`);
    data = await aiCompanyResearch({ company, role, location });
  }
  if (!data) { onStep(`Looking up ${company}…`); data = await basicResearch(company, fetchImpl); }
  db.prepare("INSERT INTO company_research (company_key, data, mode, created_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(company_key) DO UPDATE SET data=excluded.data, mode=excluded.mode, created_at=excluded.created_at")
    .run(key, JSON.stringify(data), data.mode);
  return { ...data, cached: false };
}
