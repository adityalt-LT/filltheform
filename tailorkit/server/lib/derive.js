// Everything the profile needs, read from the resume so onboarding only asks for the resume.

import { findSkills } from './skills.js';
import { estimateYears } from './match.js';
import { resumePlainText } from './resume-parse.js';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const isPhone = (p) => { const d = p.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 && /^[+\d\s().-]+$/.test(p); };
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/|[a-z0-9-]+\.(?:dev|io|me|com)\/)[^\s|,;]+/gi;

const ROLE = /\b(engineer|developer|manager|analyst|designer|executive|associate|intern|lead|consultant|specialist|architect|scientist|officer|administrator|recruiter|writer|marketer|accountant|representative|tester|head|director|coordinator|supervisor|technician|assistant|strategist|advisor|trainee|founder|owner|president|vp)\b/i;
// A location is "City, State/Country" or a well-known city on its own. Anything else in the header (a tagline, a degree) is not one.
const CITIES = /^(bengaluru|bangalore|mumbai|delhi|new delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|surat|kochi|indore|chandigarh|lucknow|nagpur|remote|london|singapore|dubai|new york|san francisco|toronto|berlin|sydney)$/i;
const looksLikePlace = (p) => CITIES.test(p) || /^[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*,\s*[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*$/.test(p);
const LABELLED = /^(phone|mobile|tel|email|e-mail|linkedin|github|portfolio|website|web|location|address)\s*:\s*/i;

export function deriveProfile(resume) {
  const headerText = [resume.header.name, ...resume.header.lines].join(' | ');
  // "Phone: +91… | Email: … | LinkedIn: …" -> separate, label-free parts
  const parts = headerText.split(/\s*[|•·]\s*|\n/).map((s) => s.replace(LABELLED, '').trim()).filter(Boolean);
  const email = (headerText.match(EMAIL) || [''])[0];
  const phone = (parts.find((p) => !EMAIL.test(p) && isPhone(p)) || '').trim();
  const links = [...new Set((headerText.match(URL_RE) || []).map((u) => u.replace(/[.,;]+$/, '')))];
  const isLoc = (p) => looksLikePlace(p) && p !== resume.header.name && p !== email && p !== phone && !links.some((l) => p.includes(l)) && !EMAIL.test(p) && !/\d{5}/.test(p.replace(/\D/g, ''))
    && p.length <= 60 && /^[A-Za-z .,'-]+$/.test(p) && !ROLE.test(p) && !(/\.[a-z]{2,}$/i.test(p) && !/\s/.test(p)) && !/\b(university|institute|college|school|iit|nit|bits)\b/i.test(p) && p.split(/\s+/).length <= 5;
  const location = parts.find(isLoc) || '';

  const exp = resume.sections.find((s) => s.kind === 'experience')?.items?.[0];
  const edu = resume.sections.find((s) => s.kind === 'education')?.items?.[0];
  // Entries are written "Role, Company" or "Company, City | Role": whichever side names a role is the role.
  let role = ''; let company = '';
  if (exp) {
    const a = exp.title || ''; const b = exp.subtitle || '';
    if (b && ROLE.test(b) && !ROLE.test(a)) { role = b; company = a; } else if (ROLE.test(a)) { role = a; company = b; } else { role = a; company = b; }
    company = company.split(',')[0].trim();
    if (!b) company = '';
    if (role.includes(',') && !ROLE.test(role.split(',')[0]) && b) role = role.split(',')[0];
  }
  const text = resumePlainText(resume);
  const skillCounts = new Map();
  for (const s of findSkills(text)) skillCounts.set(s, (text.toLowerCase().split(s.toLowerCase()).length - 1) || 1);
  const skills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 14);

  return {
    name: resume.header.name,
    email, phone, location, links,
    headline: [role, company].filter(Boolean).join(' · '),
    currentRole: role,
    currentCompany: company.split(',')[0].trim(),
    yearsExperience: estimateYears(resume),
    education: edu ? [edu.title, edu.subtitle].filter(Boolean).join(' · ') : '',
    skills,
    counts: { sections: resume.sections.length, roles: resume.sections.find((s) => s.kind === 'experience')?.items.length || 0 },
  };
}
