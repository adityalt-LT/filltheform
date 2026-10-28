// Static website generator. Usage:
//   node site/build.mjs                      preview build (relative .html links, noindex, placeholders allowed) -> site/dist
//   node site/build.mjs --mode production    clean URLs, absolute canonicals, sitemap; refuses placeholder company details
//   --demo=<url>   link the live demo from the home page      --out=<dir>   output folder
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '../web/brand.js';
import { PAGES, GUIDES } from './pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The brand mark: a sewing button with a cross-stitch (the same drawing the dashboard uses).
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="10.2" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.6 2.2" opacity=".55"/><path d="M11.6 11.6l8.8 8.8M20.4 11.6l-8.8 8.8" stroke="var(--thread)" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="11.6" cy="11.6" r="2" fill="currentColor"/><circle cx="20.4" cy="11.6" r="2" fill="currentColor"/><circle cx="11.6" cy="20.4" r="2" fill="currentColor"/><circle cx="20.4" cy="20.4" r="2" fill="currentColor"/></svg>';
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#151a3a"/><circle cx="16" cy="16" r="11" fill="none" stroke="#ece4d4" stroke-width="2"/><path d="M11.8 11.8l8.4 8.4M20.2 11.8l-8.4 8.4" stroke="#ff7a5a" stroke-width="2.4" stroke-linecap="round"/><circle cx="11.8" cy="11.8" r="1.8" fill="#ece4d4"/><circle cx="20.2" cy="11.8" r="1.8" fill="#ece4d4"/><circle cx="11.8" cy="20.2" r="1.8" fill="#ece4d4"/><circle cx="20.2" cy="20.2" r="1.8" fill="#ece4d4"/></svg>';
const PLACEHOLDER = /example\.com|\[[^\]]+\]/;

export function placeholderProblems(B = BRAND) {
  return ['domain', 'supportEmail', 'grievanceEmail', 'legalName', 'address'].filter((k) => PLACEHOLDER.test(B[k] || '')).map((k) => `BRAND.${k} is still a placeholder: "${B[k]}"`);
}

export async function buildSite({ mode = 'preview', out = join(here, 'dist'), demo = '', brand = BRAND, today = new Date().toISOString().slice(0, 10) } = {}) {
  const prod = mode === 'production';
  const problems = placeholderProblems(brand);
  const draftMarks = [];
  if (prod && problems.length) throw new Error(`Production build refused:\n  ${problems.join('\n  ')}`);
  const B = brand;
  const origin = `https://${B.domain}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets', 'lib'), { recursive: true });

  const guides = GUIDES.map((g) => ({ ...g, path: g.slug }));
  const all = [...PAGES.map((p) => ({ ...p, path: p.slug })), ...guides.map((g) => ({ ...g, isGuide: true }))];
  const fileOf = (slug) => (prod ? (slug === 'index' ? 'index.html' : `${slug}/index.html`) : `${slug}.html`);
  const urlPath = (slug) => (slug === 'index' ? '/' : `/${slug}/`);
  const abs = (slug) => origin + urlPath(slug);

  for (const p of all) {
    const depth = prod ? 0 : p.path.split('/').length - 1; // relative prefix for preview builds
    const up = '../'.repeat(depth);
    const u = (slug) => {
      if (!all.some((x) => x.path === slug)) throw new Error(`Broken link target "${slug}" in ${p.path}`);
      if (prod) return urlPath(slug);
      return up + (slug === 'index' ? 'index.html' : `${slug}.html`);
    };
    const asset = (f) => (prod ? `/assets/${f}` : `${up}assets/${f}`);
    const ctx = { B, u, abs, asset, demo, guides, waitlistUrl: prod ? `https://app.${B.domain}/api/waitlist` : '' };
    const title = typeof p.title === 'function' ? p.title(B) : p.title;
    const body = p.isGuide ? guideBody(p, ctx) : p.body(ctx);
    const schema = [
      { '@type': 'Organization', name: B.name, url: origin, ...(B.linkedin ? { sameAs: [B.linkedin] } : {}) },
      { '@type': 'WebSite', name: B.name, url: origin },
      ...(p.isGuide ? [{ '@type': 'Article', headline: p.h1, description: p.desc, datePublished: p.date, dateModified: p.date, author: { '@type': 'Organization', name: B.name }, publisher: { '@type': 'Organization', name: B.name }, mainEntityOfPage: abs(p.path) }] : []),
      ...(p.schema ? p.schema({ ...ctx, B }) : []),
      ...(p.path !== 'index' ? [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: abs('index') }, { '@type': 'ListItem', position: 2, name: p.isGuide ? p.h1 : title, item: abs(p.path) }] }] : []),
    ];
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': schema }).replace(/</g, '\\u003c');
    const canonical = prod ? `<link rel="canonical" href="${abs(p.path)}">` : '';
    const robots = prod && !p.legal ? '' : '<meta name="robots" content="noindex">';
    const ogImg = prod ? `<meta property="og:image" content="${origin}/assets/og.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${origin}/assets/og.png">` : '';
    const nav = all.filter((x) => x.nav).map((x) => `<a href="${u(x.path)}"${x.path === p.path || (p.isGuide && x.path === 'guides') ? ' aria-current="page"' : ''}>${x.nav}</a>`).join('');
    const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(p.desc)}">${canonical}${robots}
<meta property="og:type" content="${p.isGuide ? 'article' : 'website'}"><meta property="og:site_name" content="${esc(B.name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${abs(p.path)}"><meta property="og:locale" content="en_IN">${ogImg}
<link rel="icon" type="image/svg+xml" href="${asset('icon.svg')}"><link rel="apple-touch-icon" href="${asset('icon.png')}"><meta name="theme-color" content="#151a3a"><script>document.documentElement.classList.add("js")</script><link rel="stylesheet" href="${asset('site.css')}">${prod ? `<link rel="alternate" type="application/rss+xml" title="${esc(B.name)} guides" href="/rss.xml">` : ''}
<script type="application/ld+json">${ld}</script></head>
<body>${prod ? '' : '<div class="preview-bar">Preview build: not indexed, waitlist not connected, company details are placeholders.</div>'}
<header class="site"><div class="wrap"><a class="logo" href="${u('index')}"><span class="logomark">${MARK}</span>${esc(B.name)}</a><nav class="main" aria-label="Main">${nav}<a class="btn primary sm" href="${u('index')}#waitlist">Join the waitlist</a></nav></div></header>
<main>${body}</main>
<footer class="site"><div class="wrap"><div class="cols">
<div><a class="logo" href="${u('index')}"><span class="logomark">${MARK}</span>${esc(B.name)}</a><p style="margin-top:14px;max-width:30ch;color:var(--rail-muted)">${esc(B.tagline)}</p></div>
<div><h3>Product</h3><ul><li><a href="${u('how-it-works')}">How it works</a></li><li><a href="${u('pricing')}">Pricing</a></li><li><a href="${u('faq')}">FAQ</a></li><li><a href="${u('tools/resume-keyword-checker')}">Keyword checker</a></li></ul></div>
<div><h3>Learn</h3><ul>${guides.map((g) => `<li><a href="${u(g.path)}">${esc(g.tag)}</a></li>`).join('')}<li><a href="${u('guides')}">All guides</a></li></ul></div>
<div><h3>Company</h3><ul><li><a href="${u('about')}">About</a></li><li><a href="${u('contact')}">Contact</a></li><li><a href="${u('privacy')}">Privacy</a></li><li><a href="${u('terms')}">Terms</a></li><li><a href="${u('refund')}">Refunds</a></li></ul></div>
</div><div class="big" aria-hidden="true">${esc(B.name)}</div><div class="fine">© ${today.slice(0, 4)} ${esc(B.legalName)}. ${esc(B.address)}${B.gstin && !PLACEHOLDER.test(B.gstin) ? `. GSTIN ${esc(B.gstin)}` : ''}. ${esc(B.name)} does not apply to jobs on your behalf and cannot guarantee interviews or offers.</div></div></footer>
<script type="module" src="${asset('site.js')}"></script>${p.script ? `<script type="module" src="${asset(p.script + '.js')}"></script>` : ''}
</body></html>
`;
    const file = join(out, fileOf(p.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    if (p.legal && /\[[^\]]+\]/.test(html)) draftMarks.push(p.path);
  }

  // 404 (Cloudflare Pages / Netlify / most static hosts serve /404.html)
  const first = readFileSync(join(out, fileOf('index')), 'utf8');
  writeFileSync(join(out, '404.html'), first.replace(/<title>[\s\S]*?<\/title>/, `<title>Page not found | ${esc(B.name)}</title>`).replace(/<main>[\s\S]*<\/main>/, `<main><div class="wrap narrow prose" style="padding-block:80px"><h1>Page not found</h1><p>That page does not exist. Try the <a href="${prod ? '/' : 'index.html'}">home page</a>.</p></div></main>`).replace(/<link rel="canonical"[^>]*>/, '').replace(/<script type="module" src="[^"]*checker.js"><\/script>/, ''));

  // assets
  writeFileSync(join(out, 'assets', 'icon.svg'), FAVICON);
  cpSync(join(here, 'assets', 'site.css'), join(out, 'assets', 'site.css'));
  cpSync(join(here, 'assets', 'site.js'), join(out, 'assets', 'site.js'));
  cpSync(join(here, 'assets', 'checker.js'), join(out, 'assets', 'checker.js'));
  cpSync(join(root, 'web', 'icon.png'), join(out, 'assets', 'icon.png'));
  for (const f of ['shot-job.jpg', 'shot-board.jpg']) if (existsSync(join(here, 'assets', f))) cpSync(join(here, 'assets', f), join(out, 'assets', f));
  cpSync(join(root, 'web', 'fonts'), join(out, 'assets', 'fonts'), { recursive: true });
  cpSync(join(root, 'server', 'lib', 'skills.js'), join(out, 'assets', 'lib', 'skills.js'));
  cpSync(join(root, 'server', 'lib', 'jd-basic.js'), join(out, 'assets', 'lib', 'jd-basic.js'));

  if (prod) {
    const indexable = all.filter((p) => !p.legal);
    writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${p.date || today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
    writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
    writeFileSync(join(out, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(B.name)} guides</title><link>${origin}/guides/</link><description>${esc(B.description)}</description>\n${guides.map((g) => `<item><title>${esc(g.h1)}</title><link>${abs(g.path)}</link><guid>${abs(g.path)}</guid><pubDate>${new Date(g.date).toUTCString()}</pubDate><description>${esc(g.desc)}</description></item>`).join('\n')}\n</channel></rss>\n`);
    await ogImage(out, B);
  } else {
    writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }
  return { pages: all.map((p) => fileOf(p.path)), problems, draftMarks, mode };
}

function guideBody(g, c) {
  return `<article class="wrap narrow guide"><div class="crumbs"><a href="${c.u('index')}">Home</a> / <a href="${c.u('guides')}">Guides</a></div>
<span class="eyebrow">${esc(g.tag)}</span><h1>${esc(g.h1)}</h1><div class="meta">Updated ${esc(g.date)} · ${esc(c.B.name)}</div><div class="prose">${g.body(c)}</div>
<div class="band" style="margin-top:56px;padding:36px"><h2 style="font-size:2rem">Get early access</h2><p>${esc(c.B.tagline)}</p><div><a class="btn" href="${c.u('index')}#waitlist">Join the waitlist</a></div></div></article>`;
}

async function ogImage(out, B) {
  try {
    const { chromium } = await import('playwright-core');
    const { existsSync } = await import('node:fs');
    const exe = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
    const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(`<body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:0 90px;box-sizing:border-box;background:#f6f7ff;font-family:Inter,Arial,sans-serif;color:#0f1424"><div style="display:flex;align-items:center;gap:16px;font-weight:700;font-size:38px"><span style="display:grid;place-items:center;width:64px;height:64px;border-radius:18px;background:#4f46e5;color:#fff">${esc(B.mark)}</span>${esc(B.name)}</div><div style="font-size:68px;font-weight:700;line-height:1.1;letter-spacing:-2px;max-width:960px">${esc(B.tagline)}</div><div style="font-size:30px;color:#3a4157">Match score · tailored resume · interview prep</div></body>`);
    writeFileSync(join(out, 'assets', 'og.png'), await page.screenshot());
    await b.close();
  } catch (e) { console.warn('OG image skipped:', e.message); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : arg('mode') || 'preview';
  try {
    const r = await buildSite({ mode, demo: arg('demo') || '', out: arg('out') || join(here, 'dist') });
    console.log(`Built ${r.pages.length} pages (${r.mode}) into ${arg('out') || join(here, 'dist')}`);
    if (r.problems.length) console.log(`Placeholders still to fill before a production build:\n  ${r.problems.join('\n  ')}`);
    if (r.draftMarks.length) console.log(`Legal drafts with [bracketed] text to complete: ${r.draftMarks.join(', ')}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
