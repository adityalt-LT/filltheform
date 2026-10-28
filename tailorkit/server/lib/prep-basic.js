// Rule-based interview prep (no AI). Pure: also runs in the browser for the dashboard demo.
// Interview prep for one job: a brief, likely questions with drafted answers, and what to ask back.
// Nothing here asks the candidate to fill anything in. Answers come from the resume (and, in AI mode,
// the job description and company research). Facts a resume cannot contain (notice period, CTC) get a
// strategy, never an invented number.

import { findSkills, canonicalSkill } from './skills.js';
import { resumePlainText, stripMd } from './resume-text.js';

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
