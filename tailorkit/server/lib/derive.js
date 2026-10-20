// Everything the profile needs, read from the resume so onboarding only asks for the resume.

import { findSkills } from './skills.js';
import { estimateYears } from './match.js';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const isPhone = (p) => { const d = p.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 && /^[+\d\s().-]+$/.test(p); };
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/|[a-z0-9-]+\.(?:dev|io|me|com)\/)[^\s|,;]+/gi;

export function deriveProfile(resume) {
  const headerText = [resume.header.name, ...resume.header.lines].join(' | ');
  const parts = headerText.split(/\s*[|•·]\s*|\n/).map((s) => s.trim()).filter(Boolean);
  const email = (headerText.match(EMAIL) || [''])[0];
  const phone = (parts.find((p) => !EMAIL.test(p) && isPhone(p)) || '').trim();
  const links = [...new Set((headerText.match(URL_RE) || []).map((u) => u.replace(/[.,;]+$/, '')))];
  const location = parts.find((p) => p !== resume.header.name && p !== email && p !== phone && !links.some((l) => p.includes(l)) && !EMAIL.test(p) && !/\d{5}/.test(p.replace(/\D/g, '')) && p.length <= 60 && /^[A-Za-z .,'-]+$/.test(p)) || '';

  const exp = resume.sections.find((s) => s.kind === 'experience')?.items?.[0];
  const edu = resume.sections.find((s) => s.kind === 'education')?.items?.[0];
  const text = JSON.stringify(resume);
  const skillCounts = new Map();
  for (const s of findSkills(text)) skillCounts.set(s, (text.toLowerCase().split(s.toLowerCase()).length - 1) || 1);
  const skills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 14);

  return {
    name: resume.header.name,
    email, phone, location, links,
    headline: exp ? [exp.title, exp.subtitle && exp.subtitle.split(',')[0]].filter(Boolean).join(' · ') : '',
    currentRole: exp?.title || '',
    currentCompany: exp?.subtitle ? exp.subtitle.split(',')[0].trim() : '',
    yearsExperience: estimateYears(resume),
    education: edu ? [edu.title, edu.subtitle].filter(Boolean).join(' · ') : '',
    skills,
    counts: { sections: resume.sections.length, roles: resume.sections.find((s) => s.kind === 'experience')?.items.length || 0 },
  };
}
