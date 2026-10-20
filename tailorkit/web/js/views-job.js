import { h, append, clear, toast, spinner, fmtDate } from './dom.js';
import { api, download } from './api.js';
import { STATUS_LABEL, scorePill, bandOf } from './views-tracking.js';

export async function jobView(id, me, go) {
  const host = h('div', { class: 'stack' });
  let job; let tab = 'overview';
  let screening = null;

  const load = async () => { ({ job } = await api(`/api/jobs/${id}`)); };
  await load();
  const body = h('div');

  async function tailor() {
    try {
      const r = await api(`/api/jobs/${id}/tailor`, { method: 'POST' });
      toast('Tailored resume ready'); await load(); draw();
      return r;
    } catch (e) { toast(e.status === 402 ? 'You have used all free tailored resumes this month.' : e.message, true); }
  }

  const latest = () => job.resumes[0];
  const dl = (r) => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true));

  function overview() {
    const m = job.match || {}; const q = job.requirements || {};
    const el = h('div', { class: 'stack' });
    el.append(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'gap:18px' },
        h('div', { class: `ring ${bandOf(m)}`, style: `--pct:${m.score ?? 0}`, 'aria-label': `Match score ${m.score ?? 'unknown'}` }, h('div', null, m.score == null ? '–' : m.score)),
        h('div', { class: 'grow' },
          h('h2', { style: 'margin:0' }, { strong: 'Strong match', partial: 'Partial match', weak: 'Weak match', unknown: 'No clear requirements found' }[bandOf(m)]),
          h('p', { class: 'muted small', style: 'margin:4px 0 0' }, m.note),
          m.yearsExperience != null && h('p', { class: 'muted small', style: 'margin:2px 0 0' }, `Experience counted: ${m.yearsExperience} yrs`))),
      (m.breakdown?.length > 0) && h('div', { class: 'stack', style: 'margin-top:14px' }, m.breakdown.map((b) => h('div', null,
        h('div', { class: 'row between small' }, h('strong', null, b.label), h('span', { class: 'muted' }, b.detail)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': b.points, 'aria-valuemax': b.max }, h('i', { style: `width:${b.max ? Math.round((b.points / b.max) * 100) : 0}%` })))))));

    const gapRow = (skill, kind) => h('div', { class: 'gap' },
      h('span', { class: `chip ${kind === 'must' ? 'bad' : 'warn'}` }, skill),
      h('span', { class: 'grow small muted' }, kind === 'must' ? 'Required, but not on your resume' : 'Nice to have, not on your resume'),
      h('button', { class: 'btn sm', onclick: async () => { try { const r = await api(`/api/jobs/${id}/gaps`, { method: 'POST', body: { skill, has: true } }); job = { ...job, ...r.job }; toast(`${skill} added to your profile`); draw(); } catch (e) { toast(e.message, true); } } }, 'I have this'),
      h('button', { class: 'btn sm ghost', onclick: () => toast(`Noted. We won't add ${skill} to your resume.`) }, 'Not yet'));

    const missing = [...(m.missingMust || []).map((s) => gapRow(s, 'must')), ...(m.missingNice || []).map((s) => gapRow(s, 'nice'))];
    el.append(h('div', { class: 'card' }, h('h2', null, 'What’s missing from your resume'),
      missing.length ? [h('p', { class: 'muted small' }, 'These are likely reasons a screener may skip your resume for this job. If you do have one of these skills, confirm it and we’ll add it. We never add a skill you haven’t confirmed.'), ...missing]
        : h('p', { class: 'muted' }, m.score == null ? 'Nothing to compare yet.' : 'Your resume covers every requirement we found. 🎉'),
      (m.matchedMust?.length > 0) && h('div', { style: 'margin-top:10px' }, h('div', { class: 'small muted' }, 'Covered:'), h('div', { class: 'reqs' }, [...m.matchedMust, ...(m.matchedNice || [])].map((s) => h('span', { class: 'chip good' }, s))))));

    const r = latest();
    el.append(h('div', { class: 'card' }, h('h2', null, 'Tailored resume'),
      r ? h('div', { class: 'stack' },
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => dl(r) }, 'Download PDF'), h('a', { class: 'btn', href: `#/resume/${r.id}` }, 'Edit & preview'),
          h('button', { class: 'btn', title: 'Re-generate using your latest confirmed skills', onclick: tailor }, 'Re-tailor')),
        h('p', { class: 'muted small' }, `Latest version created ${fmtDate(r.created_at)}. Re-tailor after confirming skills above; it creates a new version and keeps the old ones.`),
        job.resumes.length > 1 && h('div', { class: 'small' }, 'Earlier versions: ', job.resumes.slice(1).map((x) => h('a', { href: `#/resume/${x.id}`, style: 'margin-right:8px' }, fmtDate(x.created_at) || `#${x.id}`))))
        : h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'No tailored resume yet for this job.'), h('div', null, h('button', { class: 'btn primary', onclick: tailor }, 'Create tailored resume'))),
      me.quota.limit != null && h('p', { class: 'small muted' }, `Free plan: ${me.quota.used}/${me.quota.limit} jobs tailored this month. Re-tailoring a job you already tailored doesn’t use another.`)));
    return el;
  }

  async function screeningTab() {
    const el = h('div', { class: 'card' }, spinner('Preparing your screening call questions…'));
    if (!screening) { try { screening = await api(`/api/jobs/${id}/screening`); } catch (e) { clear(el); el.append(h('div', { class: 'error' }, e.message)); return el; } }
    clear(el);
    el.append(h('h2', null, 'If you get the screening call'), h('p', { class: 'muted small' }, screening.disclaimer));
    let lastCat = '';
    for (const q of screening.questions) {
      if (q.category !== lastCat) { el.append(h('h3', { style: 'margin-top:18px' }, q.category)); lastCat = q.category; }
      el.append(h('div', { class: 'qa' },
        h('div', { class: 'row between', style: 'align-items:flex-start' }, h('div', { class: 'q' }, q.question), q.needsInput && h('span', { class: 'chip warn' }, 'Needs your input')),
        q.answer && h('div', { class: 'a' }, q.answer),
        q.points?.length > 0 && h('ul', null, q.points.map((p) => h('li', null, p.text, h('span', { class: 'small' }, ` (${p.where})`)))),
        q.tips?.length > 0 && h('ul', null, q.tips.map((t) => h('li', null, t)))));
    }
    el.append(h('p', { class: 'small muted', style: 'margin-top:14px' }, 'Fill in notice period, CTC and location on your ', h('a', { href: '#/profile' }, 'Profile'), ' and they will appear above next time.'));
    return el;
  }

  function jdTab() {
    return h('div', { class: 'card' }, h('h2', null, 'Captured job text'), h('p', { class: 'muted small' }, 'This is exactly what the extension read from the page.'), h('pre', { class: 'jd' }, job.jdText || ''));
  }

  async function draw() {
    clear(host);
    const status = h('select', { 'aria-label': 'Stage', onchange: async (e) => { try { const r = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: e.target.value } }); job = { ...job, ...r.job }; toast(`Moved to ${STATUS_LABEL[e.target.value]}`); } catch (x) { toast(x.message, true); } } },
      Object.entries(STATUS_LABEL).map(([v, l]) => h('option', { value: v, selected: v === job.status }, l)));
    const notes = h('textarea', { rows: 2, placeholder: 'Notes (recruiter name, referral, anything)…' }); notes.value = job.notes || '';
    append(host,
      h('a', { href: '#/tracking', class: 'small' }, '← Tracking'),
      h('div', { class: 'row between' },
        h('div', null, h('h1', null, job.title || 'Untitled role'), h('div', { class: 'muted' }, [job.company, job.location, job.source].filter(Boolean).join(' · ') || 'Company not detected'),
          job.url && h('a', { class: 'small', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open original posting ↗')),
        h('div', { class: 'row' }, scorePill(job.match), h('label', { class: 'field', style: 'min-width:160px' }, 'Stage', status),
          h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm('Delete this job and its tailored resumes?')) return; await api(`/api/jobs/${id}`, { method: 'DELETE' }); toast('Deleted'); go('#/tracking'); } }, 'Delete'))),
      h('div', { class: 'tabs', role: 'tablist' }, [['overview', 'Overview'], ['screening', 'Screening prep'], ['jd', 'Job text']].map(([k, l]) =>
        h('button', { class: tab === k ? 'on' : '', role: 'tab', onclick: () => { tab = k; draw(); } }, l))));
    if (tab === 'overview') { host.append(overview(), h('div', { class: 'card' }, h('h3', null, 'Notes'), notes, h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { notes: notes.value } }); toast('Notes saved'); } catch (e) { toast(e.message, true); } } }, 'Save notes')))); }
    else if (tab === 'screening') host.append(await screeningTab());
    else host.append(jdTab());
  }
  await draw();
  return host;
}
