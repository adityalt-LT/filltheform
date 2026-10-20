// "You got the screening call" prep. Answers are drafted only from the candidate's
// own profile; anything we do not know is flagged for them to fill in.

import { findSkills, canonicalSkill } from './skills.js';

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const METRIC = /\d[\d,.]*\s?(%|x|k|lakh|crore|cr|million|users|customers|clients|transactions|hours|days)|₹|\$/i;

function evidenceFor(skill, resume) {
  const out = [];
  for (const s of resume.sections) {
    for (const it of s.items) {
      for (const b of it.bullets || []) {
        // Dictionary skills match by their aliases only ("SQL" must not match "PostgreSQL"); other phrases by text.
        const hit = canonicalSkill(skill) ? findSkills(b.text).includes(skill) : b.text.toLowerCase().includes(skill.toLowerCase());
        if (hit) out.push({ text: b.text, where: it.title || s.heading });
      }
    }
  }
  return out.slice(0, 3);
}

function latestRole(resume) {
  const exp = resume.sections.find((s) => s.kind === 'experience');
  return exp?.items[0] || null;
}

export function buildScreening({ resume, facts = {}, job, match }) {
  const q = [];
  const fact = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const role = latestRole(resume);
  const years = match?.yearsExperience;

  const topMetricBullets = [];
  for (const s of resume.sections) if (s.kind === 'experience' || s.kind === 'projects') for (const it of s.items) for (const b of it.bullets) if (METRIC.test(b.text)) topMetricBullets.push({ ...b, where: it.title || s.heading });

  // 1. Introduction
  q.push({
    category: 'Opening',
    question: 'Tell me about yourself.',
    answer: role
      ? `I'm ${role.title ? `a ${role.title}` : 'a professional'}${years ? ` with about ${years} years of experience` : ''}${role.subtitle ? `, most recently at ${role.subtitle.split(',')[0]}` : ''}. ${topMetricBullets[0] ? `One thing I'm proud of: ${lowerFirst(topMetricBullets[0].text)}` : ''}`.trim()
      : null,
    tips: ['Keep it under 90 seconds: present, past, why this role.', `Finish with why ${job.title || 'this role'} fits you. Add your own reason; we don't guess motivation.`],
    needsInput: !role,
  });

  // 2. Practical questions from profile facts
  const practical = [
    ['What is your notice period?', fact(facts.noticePeriod), 'Notice period'],
    ['What is your current CTC?', fact(facts.currentCtc), 'Current CTC'],
    ['What is your expected CTC?', fact(facts.expectedCtc), 'Expected CTC'],
    ['Where are you based, and are you open to relocating?', [fact(facts.location), fact(facts.relocation)].filter(Boolean).join('. ') || null, 'Location'],
  ];
  for (const [question, answer, field] of practical) {
    q.push({ category: 'Practical', question, answer, tips: answer ? [] : [`Add "${field}" in your Profile so this is ready next time.`], needsInput: !answer });
  }
  q.push({
    category: 'Practical',
    question: 'Why are you looking for a change?',
    answer: null,
    tips: ['Talk about what you want to grow into, not what you dislike about your employer.', 'Keep it one or two sentences.'],
    needsInput: true,
  });
  if (job.minYears != null && years != null) {
    q.push({
      category: 'Practical',
      question: `This role asks for ${job.minYears}+ years. How does your experience fit?`,
      answer: years >= job.minYears ? `I have about ${years} years of experience, which meets the ${job.minYears}+ requirement.` : `I have about ${years} years. I'm a bit under the ${job.minYears}+ asked, and I can point to ${topMetricBullets[0] ? 'results like ' + lowerFirst(topMetricBullets[0].text) : 'my results so far'}.`,
      tips: [], needsInput: false,
    });
  }

  // 3. Skills you cover: be ready to back each up
  for (const skill of (match?.matchedMust || []).slice(0, 5)) {
    const ev = evidenceFor(skill, resume);
    q.push({
      category: 'Skills you have',
      question: `Tell me about your experience with ${skill}.`,
      answer: ev.length ? `Talking points from your resume: ${ev.map((e) => e.text.replace(/\.$/, '')).join('; ')}.` : null,
      points: ev.map((e) => ({ text: e.text, where: e.where })),
      tips: ['Use the situation → what you did → result format.', 'Be ready to go one level deeper than the resume line.'],
      needsInput: !ev.length,
    });
  }

  // 4. Gaps: prepare an honest answer
  for (const skill of (match?.missingMust || []).slice(0, 4)) {
    q.push({
      category: 'Gaps to prepare for',
      question: `Have you worked with ${skill}?`,
      answer: null,
      tips: [
        `If you haven't, say so plainly. Don't claim ${skill}.`,
        'Name the closest thing you have actually done, and how fast you picked up similar tools before.',
        `If you do have ${skill} experience that is missing from your resume, confirm it on the job page so it is added.`,
      ],
      needsInput: true,
    });
  }

  // 5. Claims on the resume
  for (const b of topMetricBullets.slice(0, 3)) {
    q.push({
      category: 'Your resume claims',
      question: `Walk me through this: "${b.text}"`,
      answer: null,
      tips: ['What was the starting point, what exactly did you do, and how was the number measured?', 'Be clear about your own part versus the team\'s.'],
      needsInput: true,
    });
  }

  q.push({
    category: 'Closing',
    question: `Why ${job.company ? job.company : 'this company'}, and why this role?`,
    answer: null,
    tips: ['Read the job description once more and pick two things that genuinely interest you.', 'Add your own reason. We do not make this up for you.'],
    needsInput: true,
  });
  q.push({ category: 'Closing', question: 'Do you have any questions for us?', answer: null, tips: ['Ask about the team, what success looks like in 90 days, and the interview process.'], needsInput: false });

  return {
    disclaimer: 'These are likely questions based on your resume and this job description. They are predictions, not what the recruiter will definitely ask.',
    questions: q,
  };
}
