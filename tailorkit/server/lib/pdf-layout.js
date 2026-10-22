// Layout-aware PDF reading. Plain text extraction loses what makes a resume look like itself (indentation,
// bold/italic, centred headings, hanging bullets, wrapped lines). This reads positions, sizes and font styles
// with pdf.js and returns paragraph-level blocks plus document metadata (page size, margins, font, spacing).

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { splitDate } from './dates.js';

const ZW = /[​-‍﻿]/g;
const GLYPH = /^[•●▪▫◦‣⁃∙·■➢✓✔○●▪●○■◦•*\-–—>]\s*/;
const NUMBERED = /^\d{1,2}[.)]\s+/;
const LABEL = /^[A-Z][\w &/'’.-]{1,28}:\s/;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

export async function readPdfLines(buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const lines = [];
  const pageInfo = [];
  try {
    const nPages = Math.min(doc.numPages, 6);
    for (let p = 1; p <= nPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      pageInfo.push({ w: vp.width, h: vp.height });
      const tc = await page.getTextContent();
      await page.getOperatorList().catch(() => {}); // loads fonts so their real names (Calibri-Bold…) are known
      const cache = new Map();
      const fontOf = (id) => {
        if (!cache.has(id)) {
          let f = null; try { f = page.commonObjs.get(id); } catch { /* font not available */ }
          const name = String(f?.name || '').replace(/^[A-Z]{6}\+/, '');
          cache.set(id, { name, bold: /bold|black|heavy|semibold|demibold/i.test(name) || !!f?.bold, italic: /italic|oblique/i.test(name) || !!f?.italic });
        }
        return cache.get(id);
      };
      const items = tc.items.filter((it) => typeof it.str === 'string' && it.str !== '').map((it) => ({
        str: it.str.replace(ZW, ''), x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height, font: fontOf(it.fontName),
      })).filter((it) => it.str !== '');
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      for (const it of items) {
        const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(1.5, it.size * 0.35));
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
        const runs = [];
        let prevEnd = null;
        for (const it of row.items) {
          let text = it.str;
          if (prevEnd !== null && it.x - prevEnd > it.size * 0.18 && !/\s$/.test(runs.at(-1)?.text || '') && !/^\s/.test(text)) text = ` ${text}`;
          const last = runs.at(-1);
          if (last && last.bold === it.font.bold && last.italic === it.font.italic) last.text += text;
          else runs.push({ text, bold: it.font.bold, italic: it.font.italic, font: it.font.name });
          prevEnd = it.x + it.w;
        }
        const real = row.items.filter((i) => i.str.trim());
        if (!real.length) continue;
        const text = runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
        if (!text || /^(page\s*)?\d{1,2}(\s*(of|\/)\s*\d{1,2})?$/i.test(text)) continue; // page numbers
        lines.push({ page: p, y: row.y, x0: real[0].x, x1: Math.max(...real.map((i) => i.x + i.w)), size: Math.max(...real.map((i) => i.size)), runs, text });
      }
    }
  } finally { await doc.destroy?.(); }
  return { lines, pageInfo };
}

function stripGlyph(line) {
  // Bullet glyph at the start of the first run(s): remove it and note it.
  let glyph = '';
  while (line.runs.length) {
    const r = line.runs[0];
    const t = r.text.replace(/^\s+/, '');
    const m = !glyph && t.match(GLYPH);
    if (m && (m[0].trim().length === 1) && /[•●▪▫◦‣⁃∙·■➢✓✔○▪●○■◦•]/.test(m[0]) || (m && /^[*\-–—>]\s/.test(t) && t.length > 2)) {
      glyph = m[0].trim(); r.text = t.slice(m[0].length);
      if (!r.text.trim()) { line.runs.shift(); continue; }
    }
    break;
  }
  if (glyph) line.text = line.runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
  return glyph;
}

export function mdFromRuns(runs, blockBold, blockItalic) {
  const merged = [];
  for (const r of runs) {
    const b = r.bold && !blockBold; const i = r.italic && !blockItalic;
    const last = merged.at(-1);
    if (last && last.b === b && last.i === i) last.t += r.text; else merged.push({ t: r.text, b, i });
  }
  const out = merged.map(({ t, b, i }) => {
    const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2] || (!b && !i)) return t;
    const mark = b && i ? '***' : b ? '**' : '*';
    return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
  });
  return out.join('').replace(/\s+/g, ' ').trim();
}

const fontKey = (name) => {
  const n = String(name).toLowerCase();
  if (/calibri|carlito/.test(n)) return 'carlito';
  if (/times|georgia|garamond|cambria|palatino|serif|minion|tinos|book antiqua/.test(n) && !/sans/.test(n)) return 'tinos';
  return 'arimo';
};

export function layoutToBlocks({ lines, pageInfo }, { isHeadingText = () => false } = {}) {
  if (!lines.length) return { blocks: [], meta: null };
  const pw = pageInfo[0].w; const ph = pageInfo[0].h;
  const wide = lines.filter((l) => l.text.length > 25);
  const sample = wide.length >= 3 ? wide : lines;
  const L = pct(sample.map((l) => l.x0), 0.05);
  const R = Math.max(...sample.map((l) => l.x1));
  const sizes = []; for (const l of sample) for (let i = 0; i < Math.min(l.text.length, 80); i++) sizes.push(l.size);
  const base = median(sizes) || 10;
  const pitches = []; for (let i = 1; i < lines.length; i++) { const d = lines[i - 1].y - lines[i].y; if (lines[i].page === lines[i - 1].page && d > base * 0.9 && d < base * 1.8) pitches.push(d); }
  const pitch = pct(pitches, 0.2) || base * 1.2; // wrapped lines are the tightest spacing: that is the line height
  // A line wrapped (rather than ended) when the next line's first word would not have fitted in the space left.
  const wrapsInto = (a, b) => {
    const first = b.ln.text.split(' ')[0] || '';
    const avg = (b.ln.x1 - b.ln.x0) / Math.max(1, b.ln.text.length);
    return R - a.ln.x1 < first.length * avg + b.ln.size * 0.3 + 4;
  };

  const ratio = (ln, k) => { let a = 0; let t = 0; for (const r of ln.runs) { const n = r.text.trim().length; t += n; if (r[k]) a += n; } return t ? a / t : 0; };
  const info = lines.map((ln) => {
    const glyph = stripGlyph(ln);
    const caps = /[A-Z]/.test(ln.text) && ln.text === ln.text.toUpperCase() && !/[a-z]/.test(ln.text);
    const bold = ratio(ln, 'bold');
    const center = (ln.x0 + ln.x1) / 2;
    return {
      ln, glyph, caps, bold, italic: ratio(ln, 'italic'), numbered: NUMBERED.test(ln.text), label: LABEL.test(ln.text),
      centered: Math.abs(center - pw / 2) < 5 && ln.x0 - L >= 40 && R - ln.x1 >= 40,
      headingLike: !glyph && ln.text.length >= 3 && ln.text.length <= 40 && !/\d|@/.test(ln.text) && ((caps && (bold > 0.6 || ln.size > base * 1.05)) || (isHeadingText(ln.text) && bold > 0.5)),
      dated: !glyph && splitDate(ln.text).date !== '' && (bold > 0.15 || ln.x1 >= R - 14 || ln.runs[0]?.bold),
    };
  });

  const blocks = []; let cur = null;
  info.forEach((x, i) => {
    const prev = i ? info[i - 1] : null;
    const samePage = prev && prev.ln.page === x.ln.page;
    const gap = samePage && prev.ln.y - x.ln.y > pitch * 1.55;
    const prevFull = prev && wrapsInto(prev, x);
    const starts = !cur || x.glyph || x.numbered || x.label || x.headingLike || x.dated || prev.headingLike || (x.centered !== prev.centered) || gap
      || !prevFull || (x.ln.x0 < cur.lastX0 - 8 && !x.glyph && !cur.bullet && x.ln.x0 < cur.x0 - 4);
    if (starts) {
      cur = { lines: [x], bullet: !!x.glyph, glyph: x.glyph, x0: x.ln.x0, lastX0: x.ln.x0, page: x.ln.page, headingLike: x.headingLike, centered: x.centered, numbered: x.numbered, label: x.label };
      blocks.push(cur);
    } else { cur.lines.push(x); cur.lastX0 = x.ln.x0; }
  });

  const out = blocks.map((b) => {
    const lns = b.lines.map((x) => x.ln);
    const runs = []; lns.forEach((ln, k) => { if (k) runs.push({ text: ' ', bold: false, italic: false }); runs.push(...ln.runs); });
    const chars = runs.reduce((a, r) => a + r.text.trim().length, 0) || 1;
    const bold = runs.reduce((a, r) => a + (r.bold ? r.text.trim().length : 0), 0) / chars >= 0.85;
    const italic = runs.reduce((a, r) => a + (r.italic ? r.text.trim().length : 0), 0) / chars >= 0.85;
    const md = mdFromRuns(runs, bold, italic);
    const plain = md.replace(/\*+/g, '');
    const last = lns.at(-1);
    return {
      text: md, plain, bullet: b.bullet, glyph: b.glyph, numbered: b.numbered && !b.bullet, label: b.label, bold, italic, size: Math.max(...lns.map((l) => l.size)),
      x0: b.x0, x1: last.x1, indent: b.x0 - L, align: b.centered ? 'center' : 'left', headingLike: b.headingLike, page: b.page,
      dateRight: splitDate(plain).date !== '' && last.x1 >= R - 14,
    };
  });

  const hangs = [];
  blocks.forEach((b) => { if (b.bullet && b.lines.length > 1) { const d = b.lines[1].ln.x0 - b.lines[0].ln.x0; if (d > 4 && d < 40) hangs.push(d); } });
  const glyphs = {}; for (const b of out) if (b.glyph) glyphs[b.glyph] = (glyphs[b.glyph] || 0) + 1;
  const topGlyph = Object.entries(glyphs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const fontChars = {}; for (const ln of sample) for (const r of ln.runs) { const k = fontKey(r.font); fontChars[k] = (fontChars[k] || 0) + r.text.length; }
  const fam = Object.entries(fontChars).sort((a, b) => b[1] - a[1])[0]?.[0] || 'arimo';
  const rawFont = lines.flatMap((l) => l.runs).find((r) => r.font)?.font || '';
  const firstTop = ph - (lines[0].y + lines[0].size * 0.8);
  const mm = (pt) => Math.round(pt * 0.3528 * 10) / 10;
  const headingBlocks = out.filter((b) => b.headingLike);
  const meta = {
    pageSize: Math.abs(pw - 612) < 6 && Math.abs(ph - 792) < 6 ? 'Letter' : 'A4',
    margins: { top: Math.min(25, Math.max(8, mm(firstTop))), right: Math.min(25, Math.max(8, mm(pw - R))), bottom: Math.min(25, Math.max(8, mm(firstTop))), left: Math.min(25, Math.max(8, mm(L))) },
    fontFamily: fam, fontName: rawFont.replace(/[-,](Bold|Italic|Regular|BoldItalic|BoldMT|ItalicMT|MT)$/i, ''), fontSize: Math.round(base * 10) / 10,
    lineHeight: Math.min(1.6, Math.max(1.05, Math.round((pitch / base) * 100) / 100)),
    bulletChar: topGlyph || '•', bulletHang: hangs.length ? Math.round(median(hangs) * 10) / 10 : 0,
    headerAlign: out.slice(0, 3).filter((b) => b.align === 'center').length >= 2 ? 'center' : 'left',
    headingAlign: headingBlocks.length && headingBlocks.filter((b) => b.align === 'center').length / headingBlocks.length > 0.5 ? 'center' : 'left',
    headingCase: headingBlocks.length && headingBlocks.filter((b) => b.plain === b.plain.toUpperCase()).length / headingBlocks.length >= 0.5 ? 'upper' : 'title',
    dateStyle: out.filter((b) => b.dateRight).length >= out.filter((b) => splitDate(b.plain).date && !b.bullet && !b.headingLike).length / 2 ? 'right' : 'inline',
    nameSize: out[0]?.size || base * 1.6, baseSize: base,
  };
  return { blocks: out, meta };
}
