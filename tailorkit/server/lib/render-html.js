// Resume model -> HTML. Pure (no Node imports) so it also runs in the browser for the dashboard demo.
// Keep everything in normal flow (no positioned elements): Chrome paints positioned
// boxes last, which scrambles the PDF text order that ATS parsers read.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Highlights real achievements: percentages, currency, multipliers, and counts
// with a unit. Bare years and phone-like numbers are deliberately not matched.
const METRIC_RE = new RegExp([
  String.raw`(?:₹|Rs\.?\s?|INR\s?|\$|€|£)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|L|M|B|Cr|cr|crore|crores|lakh|lakhs|lacs|mn|million|billion)?`,
  String.raw`\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|X\b)`,
  String.raw`\d[\d,]*(?:\.\d+)?\s?(?:k|K|L|M|B|Cr|cr|crore|crores|lakh|lakhs|lacs|mn|million|billion)\+?(?![a-z])`,
  String.raw`\d[\d,]*\+?\s(?:users|customers|clients|members|engineers|people|employees|developers|projects|applications|apps|requests|transactions|stores|leads|orders|countries|cities|hours|days|weeks|months|accounts|candidates|vendors|services|teams|reports|tickets|releases)\b`,
].join('|'), 'g');

export function highlightMetrics(text) {
  let out = ''; let last = 0;
  for (const m of String(text).matchAll(METRIC_RE)) {
    out += esc(text.slice(last, m.index)) + '<b>' + esc(m[0].trim()) + '</b>' + (m[0].endsWith(' ') ? ' ' : '');
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// **bold**, *italic*, ***both*** from the candidate's own resume are kept; metrics in plain text are bolded on top.
const MD = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
export function renderInline(md, { highlight = true } = {}) {
  const src = String(md ?? '');
  let out = ''; let last = 0;
  const plain = (t) => (highlight ? highlightMetrics(t) : esc(t));
  for (const m of src.matchAll(MD)) {
    out += plain(src.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('***')) out += `<b><i>${esc(t.slice(3, -3))}</i></b>`;
    else if (t.startsWith('**')) out += `<b>${esc(t.slice(2, -2))}</b>`;
    else out += `<i>${highlight ? highlightMetrics(t.slice(1, -1)) : esc(t.slice(1, -1))}</i>`;
    last = m.index + t.length;
  }
  return out + plain(src.slice(last));
}

export function renderHtml(resume, { fontCss = '' } = {}) {
  const st = resume.structure || {};
  const upper = st.headingCase === 'upper';
  const align = st.headerAlign === 'left' ? 'left' : 'center';
  const bullet = esc(st.bulletChar || '•');
  const fs = st.fontSize || 10; const lh = st.lineHeight || 1.38;
  const family = st.fontFamily || 'arimo';
  const mg = st.margins || { top: 14, right: 15, bottom: 14, left: 15 };
  const bar = st.headingStyle === 'bar';
  const inlineDate = st.dateStyle === 'inline';
  const hang = st.bulletHang > 0 ? st.bulletHang : fs * 1.2;

  const bulletBlock = (b) => {
    const pad = Math.max(0, Number(b.indent) || 0);
    const text = renderInline(b.text);
    if (b.style === 'text') return `<div class="tx" style="margin-left:${pad}pt">${text}</div>`;
    if (b.style === 'sub') return `<div class="sub" style="margin-left:${pad}pt"><i>${text}</i></div>`;
    return `<div class="li" style="margin-left:${pad}pt">${text}</div>`;
  };

  const sectionHtml = resume.sections.map((s) => {
    const heading = `<h2>${esc(upper ? s.heading.toUpperCase() : s.heading)}</h2>`;
    let body = '';
    for (const it of s.items) {
      if (s.kind === 'skills') {
        body += it.skills?.length
          ? `<div class="tx"><b>${it.label ? `${esc(it.label)}:` : ''}</b> ${esc(it.skills.join(', '))}</div>`
          : bulletBlock({ text: it.text || '', style: it.style, indent: it.indent });
      } else if (it.text !== undefined && !it.bullets) {
        body += `<p>${renderInline(it.text)}</p>`;
      } else {
        const sep = it.sep || ' | ';
        const titleHtml = `${esc(it.title || '')}${it.subtitle ? `${esc(sep)}${esc(it.subtitle)}` : ''}`;
        const dateText = it.date ? (it.dateBrackets || (st.dateBrackets && inlineDate) ? `[${esc(it.date)}]` : esc(it.date)) : '';
        body += `<div class="entry">`;
        if (it.title || it.date) {
          body += inlineDate
            ? `<div class="hd"><b>${titleHtml}</b>${dateText ? ` <b><i>${dateText}</i></b>` : ''}</div>`
            : `<div class="row"><span><b>${esc(it.title || '')}</b>${it.subtitle ? `<span class="sub-t">${esc(sep)}${esc(it.subtitle)}</span>` : ''}</span>${dateText ? `<span class="d">${dateText}</span>` : ''}</div>`;
        }
        for (const b of it.bullets || []) body += bulletBlock(b);
        body += `</div>`;
      }
    }
    return `<section>${heading}${body}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(resume.header.name)} — Resume</title><style>${fontCss}
@page{size:${st.pageSize === 'Letter' ? 'Letter' : 'A4'};margin:${mg.top}mm ${mg.right}mm ${mg.bottom}mm ${mg.left}mm}
*{box-sizing:border-box}
body{font:${fs}pt/${lh} TK,${family === 'tinos' ? '"Times New Roman",Times,serif' : family === 'carlito' ? 'Calibri,Carlito,Arial,sans-serif' : 'Arial,Helvetica,sans-serif'};color:#111;margin:0;background:#fff}
header{text-align:${align};margin-bottom:${fs * 0.5}pt}
h1{font-size:${st.nameSize || 19}pt;margin:0 0 2pt;font-weight:700}
header p{margin:0;font-size:${fs}pt}
h2{font-size:${(fs * 1.1).toFixed(1)}pt;margin:${fs * (bar ? 1.2 : 1.1)}pt 0 ${fs * (bar ? 0.9 : 0.5)}pt;font-weight:700;text-align:${st.headingAlign === 'center' ? 'center' : 'left'};${bar ? 'background:#eceef1;padding:2pt 4pt;' : 'padding-bottom:1.5pt;border-bottom:1px solid #222;'}${upper ? 'letter-spacing:.4pt;' : ''}}
p{margin:0 0 3pt}
.entry{margin-top:${fs * 0.6}pt}.entry:first-of-type{margin-top:0}
.row{display:flex;justify-content:space-between;gap:12pt;font-weight:700}.row .d{font-weight:400;white-space:nowrap}.sub-t{font-weight:400}
.hd{margin-top:${fs * 0.15}pt}
.li,.tx,.sub{margin-top:${fs * 0.15}pt;break-inside:avoid}
.li{padding-left:${hang.toFixed(1)}pt;text-indent:-${hang.toFixed(1)}pt}
.li::before{content:"${bullet}";display:inline-block;width:${hang.toFixed(1)}pt;text-indent:0;font-size:${fs * 0.8}pt;vertical-align:1pt}
b{font-weight:700}
</style></head><body><header><h1>${esc(resume.header.name)}</h1>${(resume.header.lines || []).map((l) => `<p>${esc(l)}</p>`).join('')}</header>${sectionHtml}</body></html>`;
}

