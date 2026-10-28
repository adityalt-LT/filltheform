// Free keyword-gap checker. Runs entirely in the browser: nothing you paste is sent anywhere.
import { findSkills } from './lib/skills.js';
import { extractBasic } from './lib/jd-basic.js';

const $ = (id) => document.getElementById(id);
const chips = (el, items, cls) => { el.replaceChildren(...items.map((t) => Object.assign(document.createElement('span'), { className: `chip ${cls}`, textContent: t }))); if (!items.length) el.textContent = 'None'; };

$('check').addEventListener('click', () => {
  const resume = $('resume').value; const jd = $('jd').value;
  const out = $('result');
  if (resume.trim().length < 80 || jd.trim().length < 80) { out.hidden = false; $('summary').textContent = 'Paste both your resume and the job description (at least a few lines each).'; chips($('have'), [], ''); chips($('missing'), [], ''); chips($('niceMissing'), [], ''); $('score').textContent = ''; return; }
  const reqs = extractBasic(jd, {});
  const mine = new Set(findSkills(resume));
  const groups = reqs.anyOf || [];
  const covered = (r) => mine.has(r) || groups.some((g) => g.includes(r) && g.some((x) => mine.has(x)));
  const must = reqs.mustHave || []; const nice = reqs.niceToHave || [];
  const have = must.filter(covered); const missing = must.filter((r) => !covered(r)); const niceMissing = nice.filter((r) => !covered(r));
  out.hidden = false;
  if (!must.length) { $('score').textContent = ''; $('summary').textContent = 'We could not find a list of required skills in that text. Paste the full description including the requirements section.'; chips($('have'), [], ''); chips($('missing'), [], ''); chips($('niceMissing'), [], ''); return; }
  const pct = Math.round((have.length / must.length) * 100);
  $('score').textContent = `${pct}% of required keywords found`;
  $('summary').textContent = missing.length
    ? `${have.length} of ${must.length} required skills appear in your resume. Add a missing one only if you genuinely have it, in a bullet that shows where you used it.`
    : 'Every required skill we detected appears in your resume. Check that the strongest ones are near the top.';
  chips($('have'), have, 'good'); chips($('missing'), missing, 'bad'); chips($('niceMissing'), niceMissing, 'nice');
});
