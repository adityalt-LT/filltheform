// Resume model -> HTML -> PDF. The template follows the structure detected from
// the candidate's own resume (heading case, bullet glyph, header alignment).
// Keep everything in normal flow (no positioned elements): Chrome paints positioned
// boxes last, which scrambles the PDF text order that ATS parsers read.

import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

export function renderHtml(resume) {
  const st = resume.structure || {};
  const upper = st.headingCase === 'upper';
  const align = st.headerAlign === 'left' ? 'left' : 'center';
  const bullet = esc(st.bulletChar || '•');

  const sectionHtml = resume.sections.map((s) => {
    const heading = `<h2>${esc(upper ? s.heading.toUpperCase() : s.heading)}</h2>`;
    let body = '';
    for (const it of s.items) {
      if (s.kind === 'skills') {
        body += `<p class="skills">${it.label ? `<span class="lbl">${esc(it.label)}:</span> ` : ''}${esc((it.skills || []).join(', '))}</p>`;
      } else if (it.text !== undefined && !it.bullets) {
        body += `<p>${highlightMetrics(it.text)}</p>`;
      } else {
        const head = [it.title, it.subtitle].filter(Boolean);
        body += `<div class="entry">`;
        if (head.length || it.date) {
          body += `<div class="row"><span class="t">${esc(it.title || '')}${it.subtitle ? `<span class="sub"> — ${esc(it.subtitle)}</span>` : ''}</span>${it.date ? `<span class="d">${esc(it.date)}</span>` : ''}</div>`;
        }
        if (it.bullets?.length) body += `<ul>${it.bullets.map((b) => `<li>${highlightMetrics(b.text)}</li>`).join('')}</ul>`;
        body += `</div>`;
      }
    }
    return `<section>${heading}${body}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(resume.header.name)} — Resume</title><style>
@page{size:A4;margin:14mm 15mm}
*{box-sizing:border-box}
body{font:10pt/1.38 Arial,"Helvetica Neue",Helvetica,sans-serif;color:#111;margin:0;background:#fff}
header{text-align:${align};margin-bottom:8px}
h1{font-size:19pt;margin:0 0 3px;letter-spacing:.2px}
header p{margin:0;font-size:9.5pt;color:#333}
h2{font-size:10.5pt;margin:12px 0 5px;padding-bottom:2px;border-bottom:1px solid #222;${upper ? 'letter-spacing:.6px;' : ''}}
p{margin:0 0 4px}
.entry{margin-bottom:7px;break-inside:avoid-page}
.row{display:flex;justify-content:space-between;gap:12px;font-weight:700}
.row .d{font-weight:400;white-space:nowrap}
.sub{font-weight:400}
ul{margin:2px 0 0;padding:0;list-style:none}
li{padding-left:14px;text-indent:-11px;margin-bottom:2px}
li::before{content:"${bullet} "}
b{font-weight:700}
.lbl{font-weight:700}
</style></head><body><header><h1>${esc(resume.header.name)}</h1>${(resume.header.lines || []).map((l) => `<p>${esc(l)}</p>`).join('')}</header>${sectionHtml}</body></html>`;
}

function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (existsSync(`${root}/chromium`)) return `${root}/chromium`;
    for (const d of readdirSync(root)) {
      const p = `${root}/${d}/chrome-linux/chrome`;
      if (d.startsWith('chromium') && existsSync(p)) return p;
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) if (existsSync(p)) return p;
  return undefined;
}

let browserPromise;
async function getBrowser() {
  browserPromise ??= chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  try { return await browserPromise; } catch (e) { browserPromise = undefined; throw e; }
}

export async function renderPdf(resume) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(renderHtml(resume), { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = undefined;
  await b?.close();
}
