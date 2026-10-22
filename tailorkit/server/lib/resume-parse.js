// Resume file -> structured model that remembers the candidate's own layout.
//
// Pipeline: file -> blocks (paragraphs with style/indent) -> sections and entries.
//   PDF  : layout-aware (positions, bold/italic, indentation, page size) via pdf-layout.js
//   DOCX : mammoth HTML (bold/italic, lists)
//   TXT  : line heuristics
// Inline emphasis is kept as light markup in the text: **bold**, *italic*, ***both***.

import { randomUUID } from 'node:crypto';
import mammoth from 'mammoth';
import { splitDate } from './dates.js';
import { readPdfLines, layoutToBlocks } from './pdf-layout.js';

const id = () => randomUUID().slice(0, 8);

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

const GLYPH_RE = /^\s*([•●▪▫◦‣⁃∙·■➢✓✔○*\-–—>])\s+/;
const NUMBERED = /^\d{1,2}[.)]\s+/;
const LABEL = /^[A-Z][\w &/'’.-]{1,28}:\s/;
export const stripMd = (s) => String(s || '').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/\*+/g, '');

const DEFAULT_META = {
  pageSize: 'A4', margins: { top: 14, right: 15, bottom: 14, left: 15 }, fontFamily: 'arimo', fontName: '', fontSize: 10, lineHeight: 1.38,
  bulletChar: '•', headerAlign: 'center', headingAlign: 'left', headingCase: 'title', dateStyle: 'right', nameSize: 19, baseSize: 10,
};

// ---------------------------------------------------------------- extractors
export function blocksFromText(rawText) {
  const text = String(rawText).replace(/\r/g, '').replace(/ /g, ' ').replace(/[​-‍﻿]/g, '');
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t+/g, '  ').trimEnd();
    if (!line.trim()) continue;
    const g = line.match(GLYPH_RE);
    const body = (g ? line.replace(GLYPH_RE, '') : line).trim();
    const prev = blocks.at(-1);
    // A lowercase start right after a block is a wrapped continuation of it.
    // (only inside sections: header lines such as a LinkedIn URL on its own line are not continuations)
    if (prev && !g && !prev.headingLike && blocks.some((b) => b.headingLike) && /^[a-z(]/.test(body) && !/^(www\.|https?:|[a-z0-9.-]+\.(com|in|io|me|dev|site)\b)/i.test(body) && !splitDate(prev.plain).date) { prev.text += ` ${body}`; prev.plain += ` ${body}`; continue; }
    const caps = /[A-Z]/.test(body) && body === body.toUpperCase() && !/\d/.test(body) && body.length <= 40;
    blocks.push({
      text: body, plain: stripMd(body), bullet: !!g, glyph: g ? g[1] : '', numbered: !g && NUMBERED.test(body), label: !g && LABEL.test(body),
      bold: false, italic: false, size: 10, x0: 0, x1: 0, indent: 0, align: 'left', headingLike: !g && (caps || !!classifyHeading(body)) && body.length <= 40, page: 1, dateRight: true,
    });
  }
  const glyphs = {}; for (const b of blocks) if (b.glyph) glyphs[b.glyph] = (glyphs[b.glyph] || 0) + 1;
  const top = Object.entries(glyphs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const heads = blocks.filter((b) => b.headingLike);
  return { blocks, meta: { ...DEFAULT_META, bulletChar: top && /[•●▪◦‣∙·■]/.test(top) ? top : '•', headingCase: heads.length && heads.filter((b) => b.plain === b.plain.toUpperCase()).length / heads.length >= 0.5 ? 'upper' : 'title' } };
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
export function blocksFromHtml(html) {
  const blocks = [];
  const re = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[1].toLowerCase();
    let inner = m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<(strong|b)\b[^>]*>/gi, '\u0001').replace(/<\/(strong|b)>/gi, '\u0002').replace(/<(em|i)\b[^>]*>/gi, '\u0003').replace(/<\/(em|i)>/gi, '\u0004').replace(/<[^>]+>/g, '');
    inner = decode(inner).replace(/[​-‍﻿]/g, '');
    const plain = inner.replace(/[\u0001-\u0004]/g, '').replace(/\s+/g, ' ').trim();
    if (!plain) continue;
    const boldChars = [...inner.matchAll(/\u0001([^\u0002]*)\u0002/g)].reduce((a, x) => a + x[1].replace(/[\u0001-\u0004]/g, '').trim().length, 0);
    const italicChars = [...inner.matchAll(/\u0003([^\u0004]*)\u0004/g)].reduce((a, x) => a + x[1].replace(/[\u0001-\u0004]/g, '').trim().length, 0);
    const bold = boldChars / plain.length >= 0.85; const italic = italicChars / plain.length >= 0.85;
    let text = inner.replace(/\s+/g, ' ').trim();
    text = bold ? text.replace(/[\u0001\u0002]/g, '') : text.replace(/\u0001([^\u0002]*)\u0002/g, (_, t) => (t.trim() ? `**${t.trim()}** ` : t));
    text = italic ? text.replace(/[\u0003\u0004]/g, '') : text.replace(/\u0003([^\u0004]*)\u0004/g, (_, t) => (t.trim() ? `*${t.trim()}* ` : t));
    text = text.replace(/[\u0001-\u0004]/g, '').replace(/\s+/g, ' ').trim();
    const caps = /[A-Z]/.test(plain) && plain === plain.toUpperCase() && !/\d|@/.test(plain) && plain.length <= 40;
    const g = tag === 'li';
    blocks.push({ text, plain, bullet: g, glyph: g ? '•' : '', numbered: !g && NUMBERED.test(plain), label: !g && LABEL.test(plain), bold, italic, size: 10, x0: 0, x1: 0, indent: g ? 12 : 0, align: 'left',
      headingLike: !g && (tag[0] === 'h' || ((caps || !!classifyHeading(plain)) && (bold || caps))) && plain.length <= 40, page: 1, dateRight: true });
  }
  const heads = blocks.filter((b) => b.headingLike);
  return { blocks, meta: { ...DEFAULT_META, headingCase: heads.length && heads.filter((b) => b.plain === b.plain.toUpperCase()).length / heads.length >= 0.5 ? 'upper' : 'title' } };
}

export async function extractText(buffer, filename = '') {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf') || buffer.slice(0, 4).toString() === '%PDF') {
    let layout = null;
    try { layout = layoutToBlocks(await readPdfLines(buffer), { isHeadingText: (t) => !!classifyHeading(t) }); } catch (e) { console.warn('[resume] layout read failed, using plain text:', e.message); }
    if (layout?.blocks.length >= 5) return { ...layout, text: blocksToText(layout.blocks), format: 'pdf' };
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText();
      const text = r.text.replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '');
      return { ...blocksFromText(text), text, format: 'pdf' };
    } finally { await parser.destroy?.(); }
  }
  if (name.endsWith('.docx')) {
    const { value } = await mammoth.convertToHtml({ buffer });
    const out = blocksFromHtml(value);
    return { ...out, text: blocksToText(out.blocks), format: 'docx' };
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || !name.includes('.')) {
    const text = buffer.toString('utf8');
    return { ...blocksFromText(text), text, format: 'txt' };
  }
  const err = new Error('Unsupported file type. Upload a PDF, DOCX or TXT resume.');
  err.status = 415;
  throw err;
}

const blocksToText = (blocks) => blocks.map((b) => `${b.bullet ? `${b.glyph || '•'} ` : ''}${b.plain}`).join('\n');

// ---------------------------------------------------------------- builder
const looksLikeSkillList = (plain) => {
  const rest = plain.replace(/^[^:]{2,40}:\s*/, '');
  const tokens = rest.split(/\s*[,;|•·]\s*/).map((t) => t.trim()).filter(Boolean);
  return tokens.length >= 2 && plain.length <= 220 && tokens.every((t) => t.length <= 32 && t.split(/\s+/).length <= 4);
};

function splitTitle(text) {
  const pipe = text.split(/\s+\|\s+/);
  if (pipe.length >= 2) return { title: pipe[0].trim(), subtitle: pipe.slice(1).join(' | ').trim(), sep: ' | ' };
  const dash = text.match(/^(.{2,}?)\s+([—–-])\s+(.{2,})$/);
  if (dash && !/^\d/.test(dash[3])) return { title: dash[1].trim(), subtitle: dash[3].trim(), sep: ` ${dash[2]} ` };
  return { title: text.trim(), subtitle: '', sep: ' | ' };
}

export function buildResume({ blocks, meta }) {
  const m = { ...DEFAULT_META, ...(meta || {}) };
  const isHeading = (b) => b.headingLike || (!b.bullet && b.plain.length <= 40 && !!classifyHeading(b.plain) && (b.bold || b.plain === b.plain.toUpperCase()));
  const name = blocks[0]?.plain || '';
  let i = 1;
  const headerLines = [];
  while (i < blocks.length && !isHeading(blocks[i])) headerLines.push(blocks[i++].plain);
  const sections = [];
  while (i < blocks.length) {
    const h = blocks[i++];
    const body = [];
    while (i < blocks.length && !isHeading(blocks[i])) body.push(blocks[i++]);
    sections.push(buildSection(h.plain.replace(/[:：]\s*$/, ''), classifyHeading(h.plain) || 'list', body));
  }
  const dated = blocks.filter((b) => !b.bullet && !b.headingLike && splitDate(b.plain).date);
  const bracketed = dated.filter((b) => splitDate(b.plain).bracketed).length;
  return {
    header: { name, lines: headerLines },
    sections,
    structure: {
      headingCase: m.headingCase, bulletChar: m.bulletChar, headerAlign: m.headerAlign, headingAlign: m.headingAlign, headingStyle: m.headingAlign === 'center' ? 'bar' : 'rule',
      sectionOrder: sections.map((s) => s.heading), dateStyle: m.dateStyle, dateBrackets: dated.length > 0 && bracketed / dated.length >= 0.5,
      bulletHang: m.bulletHang || 0, pageSize: m.pageSize, margins: m.margins, fontFamily: m.fontFamily, fontName: m.fontName, fontSize: m.fontSize, lineHeight: m.lineHeight, nameSize: m.nameSize,
    },
  };
}

function buildSection(heading, kind, body) {
  const sec = { id: id(), heading, kind, items: [] };
  if (kind === 'summary') { sec.items = [{ id: id(), text: body.map((b) => b.text).join(' ') }]; return sec; }
  if (kind === 'skills') {
    sec.items = body.map((b) => {
      if (!b.bullet && looksLikeSkillList(b.plain) || (b.bullet && looksLikeSkillList(b.plain))) {
        const mm = b.plain.match(/^([^:]{2,40}):\s*(.+)$/);
        const label = mm ? mm[1].trim() : '';
        return { id: id(), label, skills: (mm ? mm[2] : b.plain).split(/\s*[,;|•·]\s*/).map((s) => s.trim()).filter(Boolean) };
      }
      return { id: id(), text: b.text, style: b.bullet ? 'bullet' : 'text', indent: Math.round(Math.min(80, b.indent)) };
    });
    return sec;
  }
  // In documents with no bold text at all (plain text, simple DOCX) an entry title is just a short line above its bullets.
  const unstyled = !body.some((x) => x.bold);
  let cur = null;
  const start = (title, subtitle, date, extra = {}) => { cur = { id: id(), title, subtitle, date, location: '', bullets: [], ...extra }; sec.items.push(cur); return cur; };
  body.forEach((b, k) => {
    const next = body[k + 1];
    const d = splitDate(b.plain);
    const isHeader = !b.bullet && !b.numbered && b.plain.length <= 140 && (
      (d.date && !(b.label && !b.bold) && (b.bold || b.dateRight || !cur || kind === 'education'))
      || ((b.bold || (unstyled && kind !== 'summary')) && b.plain.length <= 80 && !b.label && !/[.:;]$/.test(b.plain) && next && (next.bullet || next.numbered || next.label)));
    if (isHeader) {
      const t = splitTitle(d.date ? d.text : b.plain);
      start(t.title, t.subtitle, d.date, { sep: t.sep, dateBrackets: d.bracketed });
      return;
    }
    if (!cur) start('', '', '');
    cur.bullets.push({ id: id(), text: b.text, style: b.bullet ? 'bullet' : (b.numbered ? 'sub' : 'text'), indent: Math.round(Math.max(0, Math.min(80, b.indent))) });
  });
  sec.items = sec.items.filter((it) => it.title || it.bullets.length);
  return sec;
}

export function parseResumeText(text) { return buildResume(blocksFromText(text)); }

// One call for the upload route: bytes in, model + display text out.
export async function parseResumeFile(buffer, filename) {
  const ex = await extractText(buffer, filename);
  return { resume: buildResume(ex), text: ex.text, format: ex.format };
}

export function parseWarnings(model) {
  const w = [];
  if (!model.header.name) w.push('Could not find your name at the top.');
  if (!model.sections.length) w.push('No section headings were detected (Experience, Education, Skills…).');
  const kinds = new Set(model.sections.map((s) => s.kind));
  if (!kinds.has('experience') && !kinds.has('projects')) w.push('No Experience or Projects section found.');
  if (!kinds.has('skills')) w.push('No Skills section found; matching will rely on skills mentioned in the text.');
  if (!/@/.test([model.header.name, ...model.header.lines].join(' '))) w.push('No email address found in the header.');
  return w;
}

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
