// Builds the static dashboard demo into demo/dist: the real dashboard code plus a mock API that runs in the browser.
// Usage: npm run demo:build   (then open demo/dist/index.html through any static server, or publish it)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResumeFile } from '../server/lib/resume-parse.js';
import { deriveProfile } from '../server/lib/derive.js';
import { extractBasic } from '../server/lib/jd-basic.js';
import { scoreMatch, estimateYears } from '../server/lib/match.js';
import { tailorResume } from '../server/lib/tailor-core.js';
import { buildBasicPrep } from '../server/lib/prep-basic.js';
import { parseWarnings } from '../server/lib/resume-parse.js';
import { DEMO_JOBS } from '../demo/jobs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'demo', 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'js'), { recursive: true });
mkdirSync(join(out, 'lib'), { recursive: true });

// ---- seed: run the real pipeline on a synthetic resume and sample jobs
const resumeText = readFileSync(join(root, 'fixtures', 'sample-resume.txt'));
const parsed = await parseResumeFile(resumeText, 'sample-resume.txt');
const resume = parsed.resume;
const facts = { noticePeriod: '60 days', location: 'Bengaluru', relocation: 'Open to Pune and Hyderabad', yearsExperience: Math.round(estimateYears(resume)) };
const profile = { resume, originalText: parsed.text.slice(0, 20000), format: parsed.format, facts, confirmedSkills: [], derived: deriveProfile(resume), warnings: parseWarnings(resume) };
const jobs = []; const resumes = []; const preps = {}; const usage = [];
DEMO_JOBS.forEach((d, i) => {
  const id = i + 1;
  const requirements = extractBasic(d.text, { title: d.title, company: d.company, location: d.location });
  const match = scoreMatch({ resume, confirmedSkills: [], yearsExperience: facts.yearsExperience }, requirements);
  const { resume: tailored, changes } = tailorResume(resume, requirements, { confirmedSkills: [] });
  jobs.push({ id, title: d.title, company: d.company, location: d.location, url: d.url, source: d.source, status: d.status, notes: d.notes, jdText: d.text, requirements, match, daysAgo: d.daysAgo });
  resumes.push({ id, jobId: id, label: `${d.company} – ${d.title}`, resume: tailored, changes, suggestions: [] });
  usage.push(`job:${id}`);
  if (i < 2) preps[id] = { prep: buildBasicPrep({ resume: tailored, derived: profile.derived, job: { ...requirements, title: d.title, company: d.company, location: d.location }, match, research: null }), research: null };
});
writeFileSync(join(out, 'seed.json'), JSON.stringify({ user: { email: 'demo@example.com' }, profile, jobs, resumes, preps, usage }));

// ---- web assets (copied, then adapted for a page that cannot use "#/path" hashes)
cpSync(join(root, 'web', 'fonts'), join(out, 'fonts'), { recursive: true });
cpSync(join(root, 'web', 'icon.png'), join(out, 'icon.png'));
cpSync(join(root, 'web', 'brand.js'), join(out, 'brand.js'));
const hashes = (s) => s.replace(/#\/([a-z]+)\//g, '#d-$1-').replace(/#\/([a-z]+)/g, '#d-$1');
for (const f of readdirSync(join(root, 'web', 'js'))) {
  if (f === 'api.js') continue;
  let src = readFileSync(join(root, 'web', 'js', f), 'utf8');
  src = hashes(src).replace('/^#\\/([\\w-]+)(?:\\/(.+))?$/', '/^#d-([a-z]+)(?:-(.+))?$/');
  src = src.replace(/if \(!confirm\([^)]*\)\) return;\s*/g, ''); // confirm() is blocked inside published previews
  writeFileSync(join(out, 'js', f), src);
}
let css = readFileSync(join(root, 'web', 'styles.css'), 'utf8').replace('url("/fonts/', 'url("fonts/');
const dark = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}\n\}/.exec(css);
if (dark) css += `\n:root[data-theme="dark"] {${dark[1]}\n}\n`;
css = css.replace(/(:root:not\(\[data-theme="light"\]\) \{)/, '$1\n    color-scheme: dark;');
css += `\n:root{color-scheme:light} :root[data-theme="dark"]{color-scheme:dark}\n.demo-pill{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));z-index:50;display:flex;gap:10px;align-items:center;background:var(--ink);color:var(--canvas);padding:8px 8px 8px 14px;border-radius:999px;font-size:12.5px;box-shadow:var(--shadow-lg);max-width:calc(100vw - 24px)}\n.demo-pill button{border:0;border-radius:999px;background:var(--canvas);color:var(--ink);padding:5px 12px;cursor:pointer;font-weight:600}\n`;
writeFileSync(join(out, 'styles.css'), css);

// ---- pure server modules, used as-is by the mock API
for (const f of ['skills', 'match', 'resume-text', 'derive', 'jd-basic', 'tailor-core', 'render-html', 'model', 'prep-basic']) cpSync(join(root, 'server', 'lib', `${f}.js`), join(out, 'lib', `${f}.js`));

// ---- mock API replaces api.js; fonts for the resume preview are embedded once
const faces = (fam) => [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']].map(([w, st]) => `@font-face{font-family:TK;font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${readFileSync(join(root, 'server', 'fonts', `${fam}-${w}-${st}.woff2`)).toString('base64')}) format("woff2")}`).join('');
writeFileSync(join(out, 'js', 'demo-fonts.js'), `export const FONT_CSS = ${JSON.stringify(Object.fromEntries(['arimo', 'carlito', 'tinos'].map((f) => [f, faces(f)])))};\n`);
cpSync(join(root, 'demo', 'mock-api.js'), join(out, 'js', 'api.js'));

// ---- pages: index.html (full document, for any static host) and artifact.html (fragment for the Artifact tool)
const pill = `<div class="demo-pill" role="note"><span>Demo with sample data. Nothing is saved or sent. AI replies are scripted.</span><button id="demo-reset" type="button">Reset</button></div>
<script type="module">import { resetDemo } from './js/api.js'; document.getElementById('demo-reset').addEventListener('click', () => { resetDemo(); location.hash = '#d-tracking'; location.reload(); });</script>`;
const body = `<div id="app"></div>\n<div id="toasts" aria-live="polite"></div>\n${pill}\n<script type="module" src="js/app.js"></script>`;
const title = 'Tailor and Apply Demo';
writeFileSync(join(out, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" type="image/png" href="icon.png"><link rel="stylesheet" href="styles.css"></head><body>\n${body}\n</body></html>\n`);
writeFileSync(join(out, 'artifact.html'), `<title>${title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="stylesheet" href="styles.css">\n${body}\n`);
console.log(`Demo built in ${out}`);
