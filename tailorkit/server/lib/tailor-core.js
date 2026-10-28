// Tailoring keeps the candidate's own structure. It only:
//  - reorders skills and bullets so the job-relevant ones come first,
//  - adds skills the candidate explicitly confirmed they have,
//  - (optionally, with AI) proposes rewordings the candidate accepts or rejects.
// It never invents experience. Pure (no Node imports): also runs in the browser.

import { findSkills } from './skills.js';
import { stripMd } from './resume-text.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const id = () => globalThis.crypto.randomUUID().slice(0, 8);

export function jobKeywords(job) {
  return [...new Set([...(job.mustHave || []), ...(job.niceToHave || [])])];
}

export function relevance(text, keywords) {
  text = stripMd(text);
  if (!text) return 0;
  const skills = new Set(findSkills(text));
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of keywords) if (skills.has(k) || lower.includes(k.toLowerCase())) n += 1;
  return n;
}

const stableSortDesc = (arr, score) => arr.map((v, i) => ({ v, i, s: score(v) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.v);

// Reorders an entry's lines by relevance without breaking its structure:
//  - plain bullets are sorted individually;
//  - numbered projects ("1. X" + its Major Focus / How / Impact lines) move as one group and are renumbered.
function reorderEntry(item, keywords) {
  const bs = item.bullets || [];
  if (bs.some((b) => b.style === 'sub')) {
    const groups = [];
    for (const b of bs) { if (b.style === 'sub' || !groups.length) groups.push([b]); else groups.at(-1).push(b); }
    const ordered = stableSortDesc(groups, (g) => g.reduce((a, b) => a + relevance(b.text, keywords), 0));
    if (ordered.some((g, i) => g !== groups[i])) {
      let n = 0;
      for (const g of ordered) if (g[0].style === 'sub' && /^\d+[.)]\s/.test(g[0].text)) { n += 1; g[0].text = g[0].text.replace(/^\d+/, String(n)); }
      item.bullets = ordered.flat();
      return true;
    }
    return false;
  }
  if (!bs.every((b) => b.style === 'bullet')) return false; // mixed lines belong together; leave them as written
  const before = bs.map((b) => b.id).join();
  item.bullets = stableSortDesc(bs, (b) => relevance(b.text, keywords));
  return before !== item.bullets.map((b) => b.id).join();
}

export function tailorResume(resume, job, { confirmedSkills = [] } = {}) {
  const out = clone(resume);
  const keywords = jobKeywords(job);
  const changes = [];

  for (const section of out.sections) {
    if (section.kind === 'skills') {
      for (const row of section.items) {
        if (!row.skills?.length) continue;
        const before = row.skills.join('|');
        row.skills = stableSortDesc(row.skills, (s) => relevance(s, keywords));
        if (before !== row.skills.join('|')) changes.push(`Moved job-relevant skills to the front of "${row.label || section.heading}".`);
      }
      addConfirmed(section, confirmedSkills, keywords, changes);
    } else if (section.kind === 'experience' || section.kind === 'projects' || section.kind === 'education' || section.kind === 'list') {
      for (const item of section.items) {
        if (section.kind === 'education' || section.kind === 'list') continue; // keep these exactly as written
        if (reorderEntry(item, keywords)) changes.push(`Reordered ${item.bullets.some((b) => b.style === 'sub') ? 'projects' : 'bullets'} under "${item.title || section.heading}" by relevance.`);
      }
      if (section.kind === 'projects') {
        const before = section.items.map((i) => i.id).join();
        section.items = stableSortDesc(section.items, (it) => relevance([it.title, it.subtitle, ...it.bullets.map((b) => b.text)].join(' '), keywords));
        if (before !== section.items.map((i) => i.id).join()) changes.push('Ordered projects by relevance to this job.');
      }
    }
  }
  return { resume: out, changes: [...new Set(changes)] };
}

function addConfirmed(section, confirmedSkills, keywords, changes) {
  const present = new Set(section.items.flatMap((r) => (r.skills || []).map((x) => x.toLowerCase())));
  const text = section.items.map((r) => stripMd(r.text || '')).join(' ').toLowerCase();
  const toAdd = confirmedSkills.filter((s) => keywords.includes(s) && !present.has(s.toLowerCase()) && !text.includes(s.toLowerCase()));
  if (!toAdd.length) return;
  const lists = section.items.filter((r) => r.skills?.length);
  if (lists.length) {
    const target = lists.find((r) => /other|tool|additional|more/i.test(r.label)) || lists[lists.length - 1];
    target.skills.push(...toAdd);
  } else {
    // A skills section written as sentences: add one line in the same style instead of inventing a list.
    const like = section.items.find((r) => r.text) || {};
    section.items.push({ id: id(), text: `**Additional skills:** ${toAdd.join(', ')}`, style: like.style || 'bullet', indent: like.indent || 0 });
  }
  changes.push(`Added skills you confirmed you have: ${toAdd.join(', ')}.`);
}


// A rewrite may not change or drop any number from the original, and may not add new ones.
export function numbersPreserved(original, proposed) {
  const nums = (s) => (s.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, '')).sort().join('|');
  return nums(original) === nums(proposed);
}
