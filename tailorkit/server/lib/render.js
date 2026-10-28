// Resume model -> HTML -> PDF. The template follows the structure detected from
// the candidate's own resume (heading case, bullet glyph, header alignment).
// Keep everything in normal flow (no positioned elements): Chrome paints positioned
// boxes last, which scrambles the PDF text order that ATS parsers read.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { renderHtml as renderHtmlPure, highlightMetrics, renderInline } from './render-html.js';
export { highlightMetrics, renderInline };

// Fonts: metric-compatible open fonts so the rebuilt resume wraps exactly like the original
// (Carlito = Calibri, Arimo = Arial/Helvetica, Tinos = Times New Roman). Embedded so it looks the same on any machine.
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const fontCache = new Map();
function fontFaces(family) {
  if (!fontCache.has(family)) {
    const faces = [];
    for (const [w, st] of [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) {
      try { faces.push(`@font-face{font-family:TK;font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${readFileSync(join(FONT_DIR, `${family}-${w}-${st}.woff2`)).toString('base64')}) format("woff2")}`); } catch { /* font file missing: fall back to system fonts */ }
    }
    fontCache.set(family, faces.join(''));
  }
  return fontCache.get(family);
}

export function renderHtml(resume) {
  return renderHtmlPure(resume, { fontCss: fontFaces(resume.structure?.fontFamily || 'arimo') });
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

export const embeddedFontCss = (family) => fontFaces(family);

// Used by tests to build fixture PDFs from hand-written HTML.
export async function renderHtmlPdf(html) {
  const page = await (await getBrowser()).newPage();
  try { await page.setContent(html, { waitUntil: 'load' }); return await page.pdf({ printBackground: true, preferCSSPageSize: true }); } finally { await page.close(); }
}

export async function renderPdf(resume) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(renderHtml(resume), { waitUntil: 'load' });
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
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
