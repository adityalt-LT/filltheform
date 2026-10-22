// Layout-aware resume reading, tested on a synthetic PDF with the traits of a real Google-Docs resume:
// centred heading bars, bracketed dates, numbered projects with indented "Major Focus / How / Impact" lines
// that wrap, ● bullets with a hanging indent, sentence-style skills and a Letter page.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtmlPdf, embeddedFontCss, renderPdf, renderHtml, closeBrowser } from '../server/lib/render.js';
import { parseResumeFile, stripMd } from '../server/lib/resume-parse.js';
import { tailorResume } from '../server/lib/tailor.js';
import { sanitizeResume } from '../server/lib/model.js';
import { estimateYears } from '../server/lib/match.js';
import { deriveProfile } from '../server/lib/derive.js';

after(closeBrowser);

const LONG = 'across the merchant dashboard and the ordering flow, working with design and engineering on the first release and the follow-up fixes that came out of early customer feedback';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${embeddedFontCss('carlito')}
@page{size:Letter;margin:10mm}body{font:9.5pt/1.22 TK;margin:0}
.c{text-align:center}.h{text-align:center;font-weight:700;background:#dde;padding:3pt 0;margin:10pt 0 6pt}
.co{font-weight:700;margin-top:6pt}.co i{font-weight:700}.sub{font-style:italic;margin-top:3pt}
.lab{margin:2pt 0 0 36pt}.lab b{font-style:italic}.li{margin:2pt 0 0 18pt;padding-left:18pt;text-indent:-18pt}
</style></head><body>
<div class="c" style="font-size:15pt;font-weight:700">JORDAN LEE</div>
<div class="c">Product Manager | Fintech and Payments</div>
<div class="c">Phone: +91-9000000000 | Email: jordan.lee@example.com | LinkedIn: linkedin.com/in/jordan-lee-demo</div>
<div class="h">SUMMARY</div>
<div>Product Manager with <b>payments and checkout</b> experience. I own PRDs, UX and delivery, and I work closely with engineering to turn ambiguous problems into shipped products that move conversion and retention for consumer apps in India.</div>
<div class="h">WORK EXPERIENCE</div>
<div class="co">Acme Corp, Pune, India | Product Manager <i>[Jan '25 - Present]</i></div>
<div class="sub">1. <b>Checkout</b> | Rebuilt the checkout flow for the consumer app</div>
<div class="lab"><b>Major Focus:</b> Drove the redesign ${LONG}</div>
<div class="lab"><b>How:</b> Wrote <b>PRDs</b> and prototypes in Figma, partnered with engineering on ${LONG}</div>
<div class="lab"><b>Impact:</b> Raised conversion by <b>12%</b> and cut drop-offs at the payment step</div>
<div class="sub">2. <b>Analytics</b> | Built the experimentation and reporting stack with SQL</div>
<div class="lab"><b>Major Focus:</b> Set up A/B testing and dashboards for the growth team</div>
<div class="lab"><b>How:</b> Defined events and metrics, built SQL reports and a weekly review ritual</div>
<div class="lab"><b>Impact:</b> Shortened experiment readouts from <b>10 days</b> to <b>3 days</b></div>
<div class="co">Globex, Mumbai, India | Associate PM <i>[Jun '23 - Dec '24]</i></div>
<div class="li">●&nbsp; Shipped <b>8+ features</b> on the merchant app and fixed 40+ bugs with QA</div>
<div class="li">●&nbsp; Interviewed 25 merchants across three cities and wrote the roadmap that became the next two quarters of work, then ran the weekly review with engineering and design so that every decision had a clear owner</div>
<div class="h">COMPETITION</div>
<div class="co">Winner of "The PM Run" | PM School <i>[Sep '24]</i></div>
<div class="li">●&nbsp; Secured <b>1st place</b> in a 15-day product challenge</div>
<div class="h">SKILLS AND EXPERTISE</div>
<div class="li">●&nbsp; Hands-on with Figma prototyping, user testing and writing detailed PRDs for fintech products</div>
<div class="li">●&nbsp; Comfortable with SQL, Jira, Agile and analytics tools such as Mixpanel and Google Analytics</div>
<div class="h">EDUCATION</div>
<div class="co">Bachelor of Technology from NIT Surat <i>[2022]</i></div>
<div class="li">●&nbsp; Graduated with a CGPA of <b>8.1/10</b></div>
</body></html>`;

let fixture; let parsed;
test('reads the structure of a Google-Docs-style resume', async () => {
  fixture = await renderHtmlPdf(html);
  parsed = (await parseResumeFile(Buffer.from(fixture), 'jordan.pdf')).resume;
  assert.deepEqual(parsed.sections.map((s) => [s.heading, s.kind]), [['SUMMARY', 'summary'], ['WORK EXPERIENCE', 'experience'], ['COMPETITION', 'list'], ['SKILLS AND EXPERTISE', 'skills'], ['EDUCATION', 'education']]);
  assert.equal(parsed.header.name, 'JORDAN LEE');
  const st = parsed.structure;
  assert.equal(st.pageSize, 'Letter'); assert.equal(st.headingAlign, 'center'); assert.equal(st.headingStyle, 'bar'); assert.equal(st.headingCase, 'upper');
  assert.equal(st.fontFamily, 'carlito'); assert.equal(st.dateStyle, 'inline'); assert.equal(st.dateBrackets, true); assert.equal(st.bulletChar, '●');
  assert.ok(st.bulletHang >= 10 && st.bulletHang <= 24, `hang ${st.bulletHang}`);
});

test('entries: company | role [date] with brackets removed from the date; numbered projects and labelled lines kept in order', () => {
  const exp = parsed.sections[1].items;
  assert.equal(exp.length, 2);
  assert.deepEqual([exp[0].title, exp[0].subtitle, exp[0].date, exp[0].dateBrackets], ['Acme Corp, Pune, India', 'Product Manager', "Jan '25 - Present", true]);
  assert.deepEqual(exp[0].bullets.map((b) => b.style), ['sub', 'text', 'text', 'text', 'sub', 'text', 'text', 'text']);
  assert.match(exp[0].bullets[0].text, /^1\. \*\*Checkout\*\* \| Rebuilt the checkout flow/);
  assert.ok(exp[0].bullets[1].indent >= 30, 'labelled lines are indented');
  assert.equal(exp[0].bullets[0].indent, 0);
  assert.deepEqual(exp[1].bullets.map((b) => b.style), ['bullet', 'bullet']);
});

test('wrapped lines are merged into one paragraph; inline bold and bold-italic labels survive', () => {
  const how = parsed.sections[1].items[0].bullets[2].text;
  assert.match(how, /^\*\*\*How:\*\*\* Wrote \*\*\*PRDs\*\*\* and prototypes in Figma/); // (bold-italic here because the fixture styles every <b> in a labelled line italic)
  assert.ok(how.includes('follow-up fixes that came out of early customer feedback'), 'text after the wrap is in the same block');
  assert.equal(parsed.sections[1].items[0].bullets.length, 8, 'no wrapped line became its own item');
});

test('skills written as sentences stay sentences (not split into comma "chips")', () => {
  const rows = parsed.sections[3].items;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.text && !r.skills?.length && r.style === 'bullet'));
  assert.match(stripMd(rows[1].text), /SQL, Jira, Agile/);
});

test('competition / education entries with bracketed dates', () => {
  assert.deepEqual([parsed.sections[2].items[0].title, parsed.sections[2].items[0].subtitle, parsed.sections[2].items[0].date], ['Winner of "The PM Run"', 'PM School', "Sep '24"]);
  assert.deepEqual([parsed.sections[4].items[0].title, parsed.sections[4].items[0].date], ['Bachelor of Technology from NIT Surat', '2022']);
});

test('profile summary: role/company from "Company | Role" entries, phone from a labelled header, experience from \'YY dates', () => {
  const d = deriveProfile(parsed);
  assert.equal(d.currentRole, 'Product Manager'); assert.equal(d.currentCompany, 'Acme Corp');
  assert.equal(d.phone, '+91-9000000000'); assert.equal(d.email, 'jordan.lee@example.com');
  assert.equal(d.location, '', 'no location is invented when the header has none');
  assert.ok(estimateYears(parsed) > 2.5 && estimateYears(parsed) < 5, `years ${estimateYears(parsed)}`);
});

test('tailoring moves numbered projects as groups and renumbers them; labelled lines never separate from their project', () => {
  const { resume } = tailorResume(parsed, { mustHave: ['SQL', 'A/B Testing'], niceToHave: [] });
  const b = resume.sections[1].items[0].bullets;
  assert.match(b[0].text, /^1\. \*\*Analytics\*\*/);
  assert.match(b[4].text, /^2\. \*\*Checkout\*\*/);
  assert.deepEqual(b.map((x) => x.style), ['sub', 'text', 'text', 'text', 'sub', 'text', 'text', 'text']);
  assert.ok(stripMd(b[1].text).startsWith('Major Focus: Set up A/B testing'), 'its own labelled lines follow it');
  assert.deepEqual(resume.sections[4], parsed.sections[4], 'education untouched');
});

test('rebuilt HTML keeps the original page size, margins, bar headings, bullet glyph, inline bracket dates and italics', () => {
  const out = renderHtml(sanitizeResume(parsed)).replace(/base64,[^)]*/g, 'base64,…');
  assert.match(out, /size:Letter/);
  assert.match(out, /background:#eceef1/);
  assert.match(out, /<b>Acme Corp, Pune, India \| Product Manager<\/b> <b><i>\[Jan &#39;25 - Present\]<\/i><\/b>/);
  assert.match(out, /<div class="sub"[^>]*><i>1\. <b>Checkout<\/b>/);
  assert.match(out, /content:"●"/);
  assert.match(out, /<b><i>How:<\/i><\/b>/);
});

test('round trip: the rebuilt PDF has the same page count and parses to the same structure', async () => {
  const again = await renderPdf(sanitizeResume(parsed));
  const re = (await parseResumeFile(Buffer.from(again), 'again.pdf')).resume;
  assert.deepEqual(re.sections.map((s) => s.heading), parsed.sections.map((s) => s.heading));
  assert.deepEqual(re.sections[1].items.map((i) => i.bullets.map((b) => b.style).join()), parsed.sections[1].items.map((i) => i.bullets.map((b) => b.style).join()));
  assert.equal(re.structure.pageSize, 'Letter');
  const pages = (buf) => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages(again), pages(fixture), 'same number of pages as the original');
});
