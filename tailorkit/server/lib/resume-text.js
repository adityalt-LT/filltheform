// Pure text helpers for the resume model. No Node-only imports, so the dashboard demo can run them in a browser.

const SECTION_KINDS = [
  ['summary', /^(professional\s+)?(summary|profile|objective|career objective|about( me)?|executive summary)$/],
  ['experience', /^((professional|work|relevant|industry)\s+)?(experience|history|employment( history)?)$|^internships?$/],
  ['education', /^(education|academics?|academic (background|qualifications?)|qualifications?|educational background)$/],
  ['skills', /^((technical|core|key|professional)\s+)?(skills?|competenc(y|ies)|technologies|tech stack|tools( & technologies| and technologies)?|skills (& |and )?(tools|expertise)|skills and expertise|expertise)$/],
  ['projects', /^((academic|personal|key|selected)\s+)?projects?$/],
  ['list', /^(certifications?|certificates|licenses?( & certifications?)?|achievements?|awards?( & honou?rs)?|accomplishments|honou?rs|publications|languages|interests|hobbies|extra[- ]?curricular( activities)?|activities|volunteer(ing)?( experience)?|responsibilities|positions of responsibility|courses|training|competitions?)$/],
];

export function classifyHeading(line) {
  const t = String(line).trim().replace(/[:：]\s*$/, '').toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 3 || t.length > 45) return null;
  for (const [kind, re] of SECTION_KINDS) if (re.test(t)) return kind;
  return null;
}

export const stripMd = (s) => String(s || '').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/\*+/g, '');

export function resumePlainText(model) {
  const out = [model.header.name, ...model.header.lines];
  for (const s of model.sections) {
    out.push(s.heading);
    for (const it of s.items) {
      if (it.text) out.push(stripMd(it.text));
      if (it.label || it.skills) out.push(`${it.label || ''} ${(it.skills || []).join(', ')}`.trim());
      if (it.title) out.push([it.title, it.subtitle, it.date].filter(Boolean).join(' | '));
      for (const b of it.bullets || []) out.push(stripMd(b.text));
    }
  }
  return out.join('\n');
}
