// Interview prep for one job: a brief, likely questions with drafted answers, and what to ask back.
// Nothing here asks the candidate to fill anything in. Answers come from the resume (and, in AI mode,
// the job description and company research). Facts a resume cannot contain (notice period, CTC) get a
// strategy, never an invented number.

import { findSkills, canonicalSkill } from './skills.js';
import { resumePlainText, stripMd } from './resume-parse.js';
import { askJSON, aiEnabled, aiLastError, fence, DATA_ONLY_RULE } from './ai.js';

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const trimDot = (s) => String(s).replace(/[.\s]+$/, '');
const METRIC = /\d[\d,.]*\s?(%|x|k|lakh|crore|cr|million|users|customers|clients|transactions|hours|days)|₹|\$/i;

function evidenceFor(skill, resume) {
  const out = [];
  for (const s of resume.sections) for (const it of s.items) for (const b of [...(it.bullets || []), ...(it.text && !it.bullets ? [{ text: it.text }] : [])]) {
    // Dictionary skills match by alias only ("SQL" must not match "PostgreSQL"); other phrases by text.
    const plain = stripMd(b.text);
    const hit = canonicalSkill(skill) ? findSkills(plain).includes(skill) : plain.toLowerCase().includes(skill.toLowerCase());
    if (hit) out.push({ text: plain, where: it.title || s.heading });
  }
  return out.slice(0, 3);
}

function metricBullets(resume) {
  const out = [];
  for (const s of resume.sections) if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items) for (const b of it.bullets) if (b.style !== 'sub' && METRIC.test(stripMd(b.text))) out.push({ text: stripMd(b.text), where: it.title || s.heading });
  return out;
}

export function buildBasicPrep({ resume, derived, job, match, research }) {
  const must = job.mustHave || [];
  const matched = match?.matchedMust || [];
  const missing = match?.missingMust || [];
  const years = derived?.yearsExperience ?? match?.yearsExperience;
  const metrics = metricBullets(resume);
  const company = job.company || 'the company';
  const role = job.title || 'this role';
  const q = [];
  const add = (category, question, whyTheyAsk, answer, evidence = []) => q.push({ category, question, whyTheyAsk, answer, evidence });

  add('Opening', 'Tell me about yourself.', 'To hear your story in your own words and check it matches the role.',
    `I'm ${derived?.currentRole ? `a ${derived.currentRole}` : 'a professional'}${years ? ` with about ${years} years of experience` : ''}${derived?.currentCompany ? `, currently at ${derived.currentCompany}` : ''}. ${metrics[0] ? `One result I'm proud of: ${lowerFirst(trimDot(metrics[0].text))}. ` : ''}${matched.length ? `The work I do most is around ${matched.slice(0, 3).join(', ')}, which is what ${role} at ${company} asks for.` : `That's why ${role} caught my interest.`}`,
    metrics[0] ? [metrics[0].text] : []);

  const edge = matched[0] ? evidenceFor(matched[0], resume)[0] : null;
  add('Company', `Why ${company}, and why this role?`, 'To test real interest, not a generic answer.',
    `${research?.company?.summary ? `${trimDot(research.company.summary.split('. ')[0])}, and I want to work on that. ` : ''}The role matches work I've already done${edge ? `: ${lowerFirst(trimDot(edge.text))}` : ''}. I'd like to take that further at ${company}.`,
    edge ? [edge.text] : []);

  for (const skill of matched.slice(0, 4)) {
    const ev = evidenceFor(skill, resume);
    add('Role fit', `Tell me about your experience with ${skill}.`, `${skill} is a must-have for this role.`,
      ev.length ? `Lead with the strongest example: ${trimDot(ev[0].text)}.${ev[1] ? ` Then add: ${trimDot(ev[1].text)}.` : ''} Close with what you'd do differently now.` : `Describe the most recent project where you used ${skill}: the problem, what you did, the result.`,
      ev.map((e) => e.text));
  }
  for (const b of metrics.slice(0, 2)) {
    add('Behavioural', `Walk me through: "${trimDot(b.text)}".`, 'To check that your resume numbers are yours and you understand them.',
      `Start with the result (${trimDot(b.text)}). Then: what the situation was, what you personally did, how the number was measured, and what the team did versus you.`, [b.text]);
  }
  for (const skill of missing.slice(0, 3)) {
    add('Gaps', `Have you worked with ${skill}?`, `${skill} is listed as required and isn't visible on your resume.`,
      `Be direct: "I haven't used ${skill} in production yet." Then bridge: name the closest tool you've used and how quickly you picked it up, and say how you'd get productive in ${skill}. Don't claim experience you don't have.`, []);
  }

  add('Practical', 'What is your notice period, and can it be shortened?', 'To plan the start date.',
    'State your actual notice period plainly, then say whether it is negotiable or can be bought out. Employers value a clear, honest answer more than an optimistic one.');
  add('Practical', 'What are your current and expected CTC?', 'To check the offer fits budget.',
    `Share your current CTC honestly if asked. For expected, anchor on the role's scope and the market range rather than a single number: give a range with the lower end at what you'd happily accept.${research?.compensation?.notes ? ` Public data found: ${research.compensation.notes}` : ' Check current ranges for the role before the call.'}`);
  add('Practical', 'Why are you looking for a change?', 'To understand motivation and any red flags.',
    `Talk about what you want to grow into (${missing[0] || must[0] || 'bigger scope'}), not what you dislike about your current employer. Keep it to two sentences.`);
  add('Closing', 'Do you have any questions for us?', 'To see how seriously you are evaluating the role.', 'Ask two or three of the questions listed below.');

  const askThem = [
    `What would success look like in the first 90 days for ${role}?`,
    'How is the team structured, and who would I work with most closely?',
    'What are the biggest challenges the team is facing right now?',
    'What does the interview process look like from here?',
    ...(research?.news?.[0] ? [`I saw "${research.news[0].headline}". How does that affect this team?`] : []),
  ].slice(0, 5);

  return {
    mode: 'basic',
    brief: {
      oneLiner: `${role}${job.company ? ` at ${job.company}` : ''}: ${must.slice(0, 4).join(', ') || 'requirements not detected'}${job.minYears ? `, ${job.minYears}+ years` : ''}.`,
      whatTheyWant: must.slice(0, 8).map((s) => `Hands-on ${s}`),
      yourEdge: matched.slice(0, 5).map((s) => { const e = evidenceFor(s, resume)[0]; return e ? `${s}: ${trimDot(e.text)}` : s; }),
      stretchAreas: missing.slice(0, 4).map((s) => ({ skill: s, howToFrame: `Say plainly you haven't used ${s} yet, then connect it to the closest tool you have used.` })),
      resumeAdvice: missing.length
        ? [`If you have used ${missing.slice(0, 2).join(' or ')} even briefly, confirm it on the job page so it appears on your resume.`]
        : ['Your resume already covers every requirement we detected.'],
    },
    questions: q,
    askThem,
    negotiation: {
      notice: 'Be exact about your notice period and what is negotiable. A confirmed buyout option is a real advantage.',
      ctc: research?.compensation?.notes || 'Research the range for this role first, then give a range, not a single number.',
    },
  };
}

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
