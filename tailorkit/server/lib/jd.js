// Job description -> structured requirements. Rule-based reading lives in jd-basic.js; this adds the AI pass.

import { canonicalSkill } from './skills.js';
import { askJSON, fence, DATA_ONLY_RULE } from './ai.js';
import { extractBasic } from './jd-basic.js';
export * from './jd-basic.js';

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
