import { h, toast, fmtDate, clear } from './dom.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { pageHead, emptyState } from './ui.js';
import { EXT_STEPS } from './views-profile.js';

export const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', screening: 'Screening call', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
export const bandOf = (m) => m?.band || 'unknown';
export const scorePill = (m) => h('span', { class: `pill ${bandOf(m)}`, title: m?.note || '' }, m?.score == null ? 'n/a' : `${m.score}%`);

const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// Paste a job description instead of using the extension: same pipeline (/api/capture), so it is also the quickest way to try the product.
function addJobPanel(go) {
  const text = h('textarea', { rows: 8, placeholder: 'Paste the full job description here…', 'aria-label': 'Job description' });
  const url = h('input', { type: 'text', placeholder: 'Link to the posting (optional)', 'aria-label': 'Posting link' });
  const err = h('div', { class: 'error', hidden: true, role: 'alert' });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      const r = await api('/api/capture', { method: 'POST', body: { text: text.value, url: url.value.trim(), source: 'pasted' } });
      toast(r.quotaExceeded ? 'Saved and scored. You have used this month’s free tailored resumes.' : 'Job added with a tailored resume');
      go(`#/job/${r.job.id}`);
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  } }, 'Add job');
  return h('div', { class: 'card', id: 'add-job', hidden: true, style: 'margin-bottom:20px' },
    h('div', { class: 'cardhead' }, h('div', null, h('h2', null, 'Add a job'), h('p', null, 'Paste the description. We score it against your resume and create a tailored version.'))),
    h('div', { class: 'stack' }, text, url, err, h('div', { class: 'row' }, btn, h('button', { class: 'btn ghost', onclick: () => { document.getElementById('add-job').hidden = true; } }, 'Cancel'))));
}
const toggleAdd = () => { const el = document.getElementById('add-job'); el.hidden = !el.hidden; if (!el.hidden) el.querySelector('textarea').focus(); };

export async function trackingView(me, go) {
  const { jobs, statuses } = await api('/api/jobs');
  const host = h('div');
  const addBtn = h('button', { class: 'btn primary', onclick: toggleAdd }, icon('plus', 16), 'Add job');
  if (!jobs.length) {
    host.append(pageHead('Tracking', 'Every job you capture shows up here with a match score and a tailored resume.', addBtn), addJobPanel(go),
      emptyState(icon('board', 22), 'No jobs yet', 'Paste a job description, or open any job page or LinkedIn hiring post and capture it with the extension.', h('button', { class: 'btn primary', onclick: toggleAdd }, 'Paste a job description'), h('a', { class: 'btn', href: '#/settings' }, 'Install the extension')),
      h('div', { class: 'card', style: 'max-width:640px;margin:16px auto 0' }, h('h2', null, 'How it works'), EXT_STEPS()));
    return host;
  }

  const scored = jobs.filter((j) => j.match?.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, j) => a + j.match.score, 0) / scored.length) : null;
  const applied = jobs.filter((j) => j.status !== 'saved').length;
  const interviews = jobs.filter((j) => ['screening', 'interview', 'offer'].includes(j.status)).length;
  const kpi = (l, v, s) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 's' }, s));

  let view = store.get('tk_view', 'board'); let q = ''; let stage = 'all';
  const body = h('div');
  const search = h('input', { type: 'search', placeholder: 'Search role or company', 'aria-label': 'Search jobs', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const filter = h('select', { 'aria-label': 'Filter by stage', onchange: (e) => { stage = e.target.value; draw(); } }, h('option', { value: 'all' }, 'All stages'), statuses.map((s) => h('option', { value: s }, STATUS_LABEL[s])));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
    h('button', { class: view === 'board' ? 'on' : '', onclick: () => setView('board') }, 'Board'), h('button', { class: view === 'table' ? 'on' : '', onclick: () => setView('table') }, 'Table'));
  const setView = (v) => { view = v; store.set('tk_view', v); [...seg.children].forEach((b) => b.classList.toggle('on', b.textContent.toLowerCase() === v)); draw(); };

  const move = async (id, st) => { try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: st } }); toast(`Moved to ${STATUS_LABEL[st]}`); go('#/tracking'); } catch (x) { toast(x.message, true); } };
  const visible = () => jobs.filter((j) => (stage === 'all' || j.status === stage) && (!q || `${j.title} ${j.company}`.toLowerCase().includes(q)));

  function board(list) {
    const el = h('div', { class: 'board' });
    for (const st of statuses) {
      const col = h('div', { class: 'col', 'data-status': st,
        ondragover: (e) => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); const job = jobs.find((j) => String(j.id) === id); if (job && job.status !== st) move(id, st); } },
        h('h3', null, h('span', null, STATUS_LABEL[st]), h('b', null, list.filter((j) => j.status === st).length)), h('div', { class: 'rail', 'aria-hidden': 'true' }));
      for (const j of list.filter((x) => x.status === st)) {
        col.append(h('a', { class: 'jcard', href: `#/job/${j.id}`, draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', String(j.id)) },
          h('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap;align-items:flex-start' }, h('div', { class: 't' }, j.title || 'Untitled role'), scorePill(j.match)),
          h('div', { class: 'c' }, [j.company, j.location].filter(Boolean).join(' · ') || j.source || 'Company not detected'),
          h('div', { class: 'row tight', style: 'margin-top:8px' }, j.resumes.length ? h('span', { class: 'chip good' }, 'Resume ready') : h('span', { class: 'chip' }, 'No resume'), h('span', { class: 'muted small' }, fmtDate(j.createdAt)))));
      }
      el.append(col);
    }
    return el;
  }

  function table(list) {
    if (!list.length) return h('div', { class: 'card empty' }, h('p', { class: 'muted', style: 'margin:0' }, 'No jobs match your filters.'));
    return h('div', { class: 'card flush', style: 'overflow-x:auto' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Role', 'Match', 'Stage', 'Resume', 'Added'].map((x) => h('th', null, x)))),
      h('tbody', null, list.map((j) => h('tr', { onclick: (e) => { if (!e.target.closest('select')) location.hash = `#/job/${j.id}`; } },
        h('td', null, h('div', { style: 'font-weight:600' }, j.title || 'Untitled role'), h('div', { class: 'muted small' }, [j.company, j.location].filter(Boolean).join(' · ') || 'Company not detected')),
        h('td', null, scorePill(j.match)),
        h('td', null, h('select', { 'aria-label': 'Stage', onchange: (e) => move(j.id, e.target.value) }, statuses.map((s) => h('option', { value: s, selected: s === j.status }, STATUS_LABEL[s])))),
        h('td', null, j.resumes.length ? h('span', { class: 'chip good' }, 'Ready') : h('span', { class: 'chip' }, 'None')),
        h('td', { class: 'muted nowrap' }, fmtDate(j.createdAt)))))));
  }

  function draw() { clear(body); const list = visible(); body.append(view === 'board' ? board(list) : table(list)); }
  host.append(pageHead('Tracking', 'Every job you capture, with its match score and tailored resume.', h('a', { class: 'btn', href: '#/settings' }, icon('puzzle', 15), 'Extension help'), addBtn), addJobPanel(go),
    h('div', { class: 'kpis' }, kpi('Jobs tracked', String(jobs.length), `${jobs.filter((j) => j.resumes.length).length} with a tailored resume`), kpi('Applied', String(applied), 'moved past Saved'), kpi('In conversation', String(interviews), 'screening, interview or offer'), kpi('Average match', avg == null ? '–' : `${avg}%`, 'across scored jobs')),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search), filter, h('div', { class: 'grow' }), seg), body);
  draw();
  return host;
}
