// Turns resume text into a structured model while recording the *structure*
// of the original (section order, heading style, bullet glyph) so tailored
// versions can be rendered the way the candidate wrote the resume.

import { randomUUID } from 'node:crypto';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const id = () => randomUUID().slice(0, 8);

const SECTION_KINDS = [
  ['summary', /^(professional\s+)?(summary|profile|objective|career objective|about( me)?|executive summary)$/],
  ['experience', /^((professional|work|relevant|industry)\s+)?(experience|history|employment( history)?)|^internships?$|^work experience$/],
  ['education', /^(education|academics?|academic (background|qualifications?)|qualifications?|educational background)$/],
  ['skills', /^((technical|core|key|professional)\s+)?(skills?|competenc(y|ies)|technologies|tech stack|tools( & technologies| and technologies)?|skills (& |and )?tools)$/],
  ['projects', /^((academic|personal|key|selected)\s+)?projects?$/],
  ['list', /^(certifications?|certificates|licenses?( & certifications?)?|achievements?|awards?( & honou?rs)?|accomplishments|honou?rs|publications|languages|interests|hobbies|extra[- ]?curricular( activities)?|activities|volunteer(ing)?( experience)?|responsibilities|positions of responsibility|courses|training)$/],
];

const BULLET_RE = /^\s*([•●▪▫◦‣⁃∙·■➢✓✔*\-–—>])\s+/;
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PART = `(?:${MONTH}\\.?\\s*,?\\s*'?\\d{2,4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const END_PART = `(?:present|current|now|till date|ongoing|${DATE_PART})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_PART}\\s*(?:-|–|—|to|until)\\s*${END_PART})`, 'i');
const SINGLE_DATE_RE = new RegExp(`(?:^|[\\s|,(])((?:${MONTH}\\.?\\s*,?\\s*\\d{4})|(?:19|20)\\d{2})\\s*\\)?\\s*$`, 'i');

export function classifyHeading(line) {
  const t = line.trim().replace(/[:：]\s*$/, '').toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 3 || t.length > 45) return null;
  for (const [kind, re] of SECTION_KINDS) if (re.test(t)) return kind;
  return null;
}

function looksLikeUnknownHeading(line, prevBlank) {
  const t = line.trim().replace(/[:：]\s*$/, '');
  if (t.length < 3 || t.length > 35) return false;
  if (/\d|@|https?:/.test(t)) return false;
  if (BULLET_RE.test(line)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && prevBlank;
}

export async function extractText(buffer, filename = '') {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf') || buffer.slice(0, 4).toString() === '%PDF') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText();
      return { text: r.text.replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gm, ''), format: 'pdf' };
    } finally {
      await parser.destroy?.();
    }
  }
  if (name.endsWith('.docx')) {
    const { value } = await mammoth.convertToHtml({ buffer });
    return { text: htmlToLines(value), format: 'docx' };
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || !name.includes('.')) {
    return { text: buffer.toString('utf8'), format: 'txt' };
  }
  const err = new Error('Unsupported file type. Upload a PDF, DOCX or TXT resume.');
  err.status = 415;
  throw err;
}

function htmlToLines(html) {
  return html
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|h[1-6]|li|tr|div|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

function splitDate(line) {
  // Returns { text, date } where date is the trailing/embedded date range.
  const range = line.match(DATE_RANGE_RE);
  if (range) {
    const text = line.replace(range[1], '').replace(/[\s|,–—-]+$/, '').replace(/^[\s|,–—-]+/, '').replace(/\(\s*\)/, '').trim();
    return { text, date: range[1].trim() };
  }
  const single = line.match(SINGLE_DATE_RE);
  if (single && line.trim().length > single[1].length + 2) {
    const text = line.slice(0, single.index).replace(/[\s|,–—-]+$/, '').trim();
    return { text, date: single[1].trim() };
  }
  return { text: line.trim(), date: '' };
}

const isDateOnly = (line) => { const s = splitDate(line); return !!s.date && !s.text; };
const hasDate = (line) => !!splitDate(line).date;

function parseSkillLine(line) {
  const clean = line.replace(BULLET_RE, '').trim();
  const m = clean.match(/^([^:]{2,40}):\s*(.+)$/);
  const label = m ? m[1].trim() : '';
  const rest = m ? m[2] : clean;
  const skills = rest.split(/\s*[,;|•·]\s*/).map((s) => s.trim()).filter(Boolean);
  return { id: id(), label, skills };
}

function parseEntries(lines, kind) {
  const items = [];
  let cur = null;
  let lastWasBullet = false;
  const start = (title) => { cur = { id: id(), title, subtitle: '', date: '', location: '', bullets: [] }; items.push(cur); lastWasBullet = false; return cur; };

  for (const raw of lines) {
    const line = raw.replace(/\t+/g, '  ').trimEnd();
    if (!line.trim()) { lastWasBullet = false; continue; }
    const b = line.match(BULLET_RE);
    if (b) {
      if (!cur) start('');
      cur.bullets.push({ id: id(), text: line.replace(BULLET_RE, '').trim() });
      lastWasBullet = true;
      continue;
    }
    if (lastWasBullet && cur && /^[a-z(]/.test(line.trim()) && cur.bullets.length) {
      // wrapped continuation of the previous bullet
      cur.bullets[cur.bullets.length - 1].text += ' ' + line.trim();
      continue;
    }
    if (cur && isDateOnly(line) && !cur.date && !cur.bullets.length) { cur.date = splitDate(line).date; continue; }

    const { text, date } = splitDate(line);
    // "CGPA: 8.4/10" or "Relevant coursework: ..." belongs to the education entry above it.
    if (kind === 'education' && cur && cur.title && !date && !cur.bullets.length && /^(cgpa|gpa|grade|percentage|score|marks|board|relevant coursework|coursework|specialisation|specialization)\b/i.test(text)) {
      cur.subtitle = [cur.subtitle, text].filter(Boolean).join(' | ');
      lastWasBullet = false;
      continue;
    }
    const startsNew = !cur || date || cur.bullets.length
      || kind === 'education' || kind === 'projects' || kind === 'list'
      || (cur.title && cur.subtitle);
    if (startsNew) {
      start(text); cur.date = date;
    } else {
      cur.subtitle = text;
    }
    lastWasBullet = false;
  }
  // Split "Role | Company" / "Role, Company" into title and subtitle if empty.
  for (const it of items) {
    if (!it.subtitle) {
      const parts = it.title.split(/\s+[|•·]\s+|\s+[-–—]\s+/);
      if (parts.length === 2 && parts.every((p) => p.length > 1)) { it.title = parts[0].trim(); it.subtitle = parts[1].trim(); }
    }
  }
  return items;
}

export function parseResumeText(rawText) {
  const text = rawText.replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n');

  // Locate headings
  const heads = [];
  let prevBlank = true;
  lines.forEach((line, i) => {
    const kind = line.trim() ? classifyHeading(line) : null;
    if (kind) heads.push({ i, kind, raw: line.trim().replace(/[:：]\s*$/, '') });
    else if (line.trim() && looksLikeUnknownHeading(line, prevBlank) && heads.length) heads.push({ i, kind: 'list', raw: line.trim().replace(/[:：]\s*$/, '') });
    prevBlank = !line.trim();
  });

  const firstHead = heads.length ? heads[0].i : lines.length;
  const headerLines = lines.slice(0, firstHead).map((l) => l.trim()).filter(Boolean);
  const name = headerLines[0] || '';
  const contact = headerLines.slice(1);

  const sections = heads.map((h, idx) => {
    const end = idx + 1 < heads.length ? heads[idx + 1].i : lines.length;
    const body = lines.slice(h.i + 1, end);
    return buildSection(h, body);
  });

  // Resumes without a header block: treat summary-like text before first heading as summary
  const model = {
    header: { name, lines: contact },
    sections,
    structure: detectStructure(text, heads, sections),
  };
  return model;
}

function buildSection(h, body) {
  const clean = body.filter((l) => l.trim() !== '');
  const base = { id: id(), heading: h.raw, kind: h.kind, items: [] };
  switch (h.kind) {
    case 'summary':
      base.items = [{ id: id(), text: clean.map((l) => l.trim().replace(BULLET_RE, '')).join(' ') }];
      break;
    case 'skills':
      base.items = clean.map(parseSkillLine).filter((s) => s.skills.length);
      break;
    default:
      base.items = parseEntries(body, h.kind);
  }
  return base;
}

function detectStructure(text, heads, sections) {
  const upper = heads.filter((h) => h.raw === h.raw.toUpperCase()).length;
  const glyphs = {};
  for (const l of text.split('\n')) { const m = l.match(BULLET_RE); if (m) glyphs[m[1]] = (glyphs[m[1]] || 0) + 1; }
  const top = Object.entries(glyphs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const bullet = top && /[•●▪◦‣∙·■]/.test(top) ? top : (top && '*->–—'.includes(top) ? (top === '*' ? '•' : top) : '•');
  return {
    headingCase: heads.length && upper / heads.length >= 0.5 ? 'upper' : 'title',
    bulletChar: bullet,
    headerAlign: 'center',
    sectionOrder: sections.map((s) => s.heading),
    dateAlign: 'right',
    font: 'sans',
  };
}

// Quick sanity report so the onboarding "does this look right?" step can warn
// the candidate about parts we could not read.
export function parseWarnings(model) {
  const w = [];
  if (!model.header.name) w.push('Could not find your name at the top.');
  if (!model.sections.length) w.push('No section headings were detected (Experience, Education, Skills…).');
  const kinds = new Set(model.sections.map((s) => s.kind));
  if (!kinds.has('experience') && !kinds.has('projects')) w.push('No Experience or Projects section found.');
  if (!kinds.has('skills')) w.push('No Skills section found; matching will rely on skills mentioned in the text.');
  const contactText = [model.header.name, ...model.header.lines].join(' ');
  if (!/@/.test(contactText)) w.push('No email address found in the header.');
  return w;
}

export function resumePlainText(model) {
  const out = [model.header.name, ...model.header.lines];
  for (const s of model.sections) {
    out.push(s.heading);
    for (const it of s.items) {
      if (it.text) out.push(it.text);
      if (it.label || it.skills) out.push(`${it.label || ''} ${(it.skills || []).join(', ')}`.trim());
      if (it.title) out.push([it.title, it.subtitle, it.date].filter(Boolean).join(' | '));
      for (const b of it.bullets || []) out.push(b.text);
    }
  }
  return out.join('\n');
}
