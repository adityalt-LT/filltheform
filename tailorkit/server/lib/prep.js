// Interview prep: AI version. The rule-based version lives in prep-basic.js.

import { resumePlainText } from './resume-text.js';
import { askJSON, aiEnabled, aiLastError, fence, DATA_ONLY_RULE } from './ai.js';
import { buildBasicPrep } from './prep-basic.js';
export { buildBasicPrep };

const PREP_SYSTEM = `You are an expert interview coach preparing a candidate for one specific job. You are given the candidate's resume, the job description, a match analysis and (optionally) public research about the company.
Write prep the candidate can use directly. The candidate will NOT fill anything in, so every question needs a complete drafted answer.
Hard rules:
- Answers are first person, spoken style, 60-120 words, built ONLY from facts in the resume. Quote or paraphrase the supporting resume bullet(s) in "evidence".
- Never invent employers, projects, numbers, skills, tools or dates. If the resume lacks something the job needs, say so honestly and bridge to related real experience.
- Company-specific points (culture, news, interview process, review themes) may use ONLY the provided research. If research is missing, do not guess.
- Facts a resume cannot contain (notice period, current or expected CTC): give a short strategy and phrasing, never a made-up value.
- Reviews are individual opinions: present them as themes, not facts.
- 10 to 14 questions across: Opening, Role fit, Behavioural, Company, Gaps, Practical, Closing. Include the questions that research says this company commonly asks, when available.
- ${DATA_ONLY_RULE}
Return JSON:
{"brief":{"oneLiner":string,"whatTheyWant":string[],"yourEdge":string[],"stretchAreas":[{"skill":string,"howToFrame":string}],"resumeAdvice":string[]},
 "questions":[{"category":string,"question":string,"whyTheyAsk":string,"answer":string,"evidence":string[]}],
 "askThem":string[],
 "negotiation":{"notice":string,"ctc":string}}`;

const s = (v, n = 600) => String(v ?? '').replace(/\s+\n/g, '\n').trim().slice(0, n);
const arr = (a, n = 8, len = 300) => (Array.isArray(a) ? a : []).map((x) => s(x, len)).filter(Boolean).slice(0, n);

export function normalizePrep(o) {
  if (!o || !Array.isArray(o.questions)) return null;
  const questions = o.questions.slice(0, 16).map((x) => ({
    category: s(x.category, 40) || 'General', question: s(x.question, 300), whyTheyAsk: s(x.whyTheyAsk, 300), answer: s(x.answer, 1400), evidence: arr(x.evidence, 3, 300),
  })).filter((x) => x.question && x.answer);
  if (questions.length < 3) return null;
  return {
    mode: 'ai',
    brief: {
      oneLiner: s(o.brief?.oneLiner, 400),
      whatTheyWant: arr(o.brief?.whatTheyWant), yourEdge: arr(o.brief?.yourEdge),
      stretchAreas: (Array.isArray(o.brief?.stretchAreas) ? o.brief.stretchAreas : []).slice(0, 5).map((x) => ({ skill: s(x.skill, 60), howToFrame: s(x.howToFrame, 400) })).filter((x) => x.skill),
      resumeAdvice: arr(o.brief?.resumeAdvice, 5),
    },
    questions,
    askThem: arr(o.askThem, 6),
    negotiation: { notice: s(o.negotiation?.notice, 400), ctc: s(o.negotiation?.ctc, 500) },
  };
}

export function prepContext({ resume, derived, job, jdText, match, research }) {
  return {
    candidate: { name: derived?.name, headline: derived?.headline, yearsExperience: derived?.yearsExperience, location: derived?.location },
    job: { title: job.title, company: job.company, location: job.location, mustHave: job.mustHave, niceToHave: job.niceToHave, minYears: job.minYears },
    match: { score: match?.score, covered: match?.matchedMust, missingRequired: match?.missingMust, missingNiceToHave: match?.missingNice },
    research: research && research.mode === 'ai' ? research : (research?.company?.summary ? { company: research.company } : null),
    resumeText: resumePlainText(resume).slice(0, 7000),
    jobDescription: String(jdText || '').slice(0, 7000),
  };
}

export async function buildPrep(ctx) {
  if (!aiEnabled()) return buildBasicPrep(ctx);
  const c = prepContext(ctx);
  const raw = await askJSON(PREP_SYSTEM, [
    fence('candidate_resume', c.resumeText), fence('job_description', c.jobDescription),
    fence('analysis', JSON.stringify({ candidate: c.candidate, job: c.job, match: c.match })),
    c.research ? fence('company_research', JSON.stringify(c.research)) : 'No company research is available; do not make company claims.',
  ].join('\n'), { maxTokens: 9000, effort: 'medium' });
  const prep = normalizePrep(raw);
  if (!prep) return { ...buildBasicPrep(ctx), aiFailed: aiLastError()?.message || 'The AI response could not be used.' };
  return prep;
}

export function chatSystem(ctx) {
  const c = prepContext(ctx);
  return `You are a job-search copilot inside Tailor & Apply. You help one candidate with one specific job. Be direct, specific and concise. Use plain text with short paragraphs or simple lists.
Ground every answer in the candidate's resume, the job description and the company research below. Never invent experience, employers, numbers or skills for the candidate. If the resume does not support a claim, say so and suggest an honest way to frame it. For company claims, use only the research; if it is missing, say you don't have it. Reviews are individual opinions.
${DATA_ONLY_RULE}
${fence('candidate_resume', c.resumeText)}
${fence('job_description', c.jobDescription)}
${fence('analysis', JSON.stringify({ candidate: c.candidate, job: c.job, match: c.match }))}
${c.research ? fence('company_research', JSON.stringify(c.research)) : 'No company research is available.'}`;
}
