import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { buildSite, placeholderProblems } from '../site/build.mjs';
import { BRAND } from '../web/brand.js';

const real = { ...BRAND, name: 'Darzi', domain: 'darzi.test', supportEmail: 'hi@darzi.test', grievanceEmail: 'g@darzi.test', legalName: 'Darzi Labs Pvt Ltd', address: '1 MG Road, Bengaluru 560001' };
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const htmlOf = (dir) => walk(dir).filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));

// A link is fine when it resolves to a file in the build (clean URLs resolve to index.html in a folder).
function resolves(dir, fromFile, href, prod) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return true;
  const target = clean.startsWith('/') ? join(dir, clean) : resolve(dirname(fromFile), clean);
  return [target, join(target, 'index.html')].some((p) => existsSync(p) && statSync(p).isFile());
}

for (const mode of ['preview', 'production']) {
  test(`${mode} build: links, SEO basics and structured data`, async () => {
    const out = mkdtempSync(join(tmpdir(), 'site-'));
    const r = await buildSite({ mode, out, brand: real, today: '2026-10-28' });
    const files = htmlOf(out);
    assert.ok(files.length >= 12, 'expected the full page set');
    const titles = new Set();
    for (const f of files) {
      const html = readFileSync(f, 'utf8');
      const title = /<title>(.*?)<\/title>/.exec(html)?.[1]; assert.ok(title && title.length <= 70, `title length in ${f}: ${title}`);
      assert.ok(!titles.has(title), `duplicate title: ${title}`); titles.add(title);
      const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1]; assert.ok(desc && desc.length >= 60 && desc.length <= 175, `description length ${desc?.length} in ${f}`);
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `exactly one h1 in ${f}`);
      assert.match(html, /<html lang="en-IN">/);
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.ok(JSON.parse(m[1])['@graph'].length >= 2, 'structured data parses');
      for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
        const href = m[1];
        if (/^(https?:|mailto:|tel:)/.test(href)) continue;
        assert.ok(resolves(out, f, href, mode === 'production'), `broken link ${href} in ${f}`);
      }
      assert.ok(!/lorem ipsum/i.test(html));
      if (mode === 'production') assert.ok(/<link rel="canonical" href="https:\/\/darzi\.test/.test(html) || /noindex/.test(html), `canonical or noindex in ${f}`);
      else assert.match(html, /noindex/);
    }
    if (mode === 'production') {
      const sm = readFileSync(join(out, 'sitemap.xml'), 'utf8');
      assert.match(sm, /https:\/\/darzi\.test\/pricing\//); assert.ok(!/privacy/.test(sm), 'legal pages stay out of the sitemap');
      assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/darzi\.test\/sitemap\.xml/);
      assert.match(readFileSync(join(out, 'rss.xml'), 'utf8'), /<item>/);
      assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /data-endpoint="https:\/\/app\.darzi\.test\/api\/waitlist"/);
    } else assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Disallow: \//);
    assert.ok(r.draftMarks.includes('privacy'), 'legal drafts are flagged for completion');
  });
}

test('production build refuses placeholder company details', async () => {
  assert.ok(placeholderProblems(BRAND).length >= 4);
  await assert.rejects(buildSite({ mode: 'production', out: mkdtempSync(join(tmpdir(), 'site-')) }), /placeholder/);
});

test('copy makes no claims we cannot back up', async () => {
  const out = mkdtempSync(join(tmpdir(), 'site-'));
  await buildSite({ mode: 'preview', out, brand: real });
  const text = htmlOf(out).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const banned of [/guarantee(d)? (an? )?(interview|job|offer|shortlist)/i, /beat the ats/i, /\b\d{2,3}% (more|higher) (interviews|callbacks)/i, /thousands of (users|candidates)/i, /testimonial/i]) assert.ok(!banned.test(text.replace(/does not guarantee|cannot guarantee|No tool can promise|Does it guarantee/gi, '')), `banned claim ${banned}`);
});
