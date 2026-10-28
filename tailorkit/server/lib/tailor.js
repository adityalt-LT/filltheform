// Tailoring (reordering, confirmed skills) lives in tailor-core.js. This adds the optional AI rewording suggestions.

import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { stripMd } from './resume-text.js';
import { jobKeywords, relevance, numbersPreserved } from './tailor-core.js';
export * from './tailor-core.js';

// Optional AI: suggest rewordings of existing bullets using the job's wording.
// Returned as suggestions the candidate accepts or rejects; nothing is applied silently.
export async function suggestRewrites(resume, job, limit = 6) {
  const bullets = [];
  const keywords = jobKeywords(job);
  for (const s of resume.sections) {
    if (s.kind !== 'experience' && s.kind !== 'projects') continue;
    for (const it of s.items) for (const b of it.bullets) if (b.style !== 'sub') bullets.push({ itemId: it.id, bulletId: b.id, text: stripMd(b.text), rel: relevance(b.text, keywords) });
  }
  const top = bullets.sort((a, b) => b.rel - a.rel).slice(0, limit);
  if (!top.length) return [];
  const res = await askJSON(
    `You help a job seeker reword resume bullets to fit a job description. ${DATA_ONLY_RULE}
Hard rules: keep every fact, number, employer and date exactly as given; never add a skill, tool, metric or responsibility that is not already in the bullet; use the job's own wording only where it truthfully describes the same work; keep roughly the same length; if a bullet cannot be improved truthfully, omit it.
Schema: {"suggestions":[{"bulletId":string,"proposed":string,"reason":string}]}`,
    `${fence('job', JSON.stringify({ title: job.title, mustHave: job.mustHave, niceToHave: job.niceToHave }))}\n${fence('bullets', JSON.stringify(top.map((t) => ({ bulletId: t.bulletId, text: t.text }))))}`,
  );
  if (!res || !Array.isArray(res.suggestions)) return [];
  const byId = new Map(top.map((t) => [t.bulletId, t]));
  return res.suggestions
    .filter((s) => byId.has(s.bulletId) && typeof s.proposed === 'string' && s.proposed.trim() && s.proposed.trim() !== byId.get(s.bulletId).text)
    .filter((s) => numbersPreserved(byId.get(s.bulletId).text, s.proposed))
    .map((s) => ({ ...byId.get(s.bulletId), proposed: s.proposed.trim(), reason: String(s.reason || '').slice(0, 200), status: 'pending' }))
    .map(({ itemId, bulletId, text, proposed, reason, status }) => ({ itemId, bulletId, original: text, proposed, reason, status }));
}

