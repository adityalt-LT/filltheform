import { h, toast, clear } from './dom.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { pageHead, emptyState, nextStep } from './ui.js';

export const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', screening: 'Screening call', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
export const bandOf = (m) => m?.band || 'unknown';
export const scorePill = (m) => h('span', { class: `pill ${bandOf(m)}`, title: m?.note || '' }, m?.score == null ? 'n/a' : `${m.score}%`);

const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// Paste a job description instead of using the extension: same pipeline (/api/capture).
function addJobPanel(go) {
  const text = h('textarea', { rows: 8, placeholder: 'Paste the job description', 'aria-label': 'Job description' });
  const url = h('input', { type: 'text', placeholder: 'Link to the job (optional)', 'aria-label': 'Job link' });
  const err = h('div', { class: 'error', hidden: true, role: 'alert' });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      const r = await api('/api/capture', { method: 'POST', body: { text: text.value, url: url.value.trim(), source: 'pasted' } });
      toast(r.quotaExceeded ? 'Saved. You have used this month’s free resumes.' : 'Job added');
      go(`#/job/${r.job.id}`);
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  } }, 'Add job');
  return h('div', { class: 'card', id: 'add-job', hidden: true, style: 'margin-bottom:26px' },
    h('div', { class: 'cardhead' }, h('div', null, h('h2', null, 'Add a job'), h('p', null, 'Paste the description. We do the rest.'))),
    h('div', { class: 'stack' }, text, url, err, h('div', { class: 'row' }, btn, h('button', { class: 'btn ghost', onclick: () => { document.getElementById('add-job').hidden = true; } }, 'Cancel'))));
}
const toggleAdd = () => { const el = document.getElementById('add-job'); el.hidden = !el.hidden; if (!el.hidden) el.querySelector('textarea').focus(); };

// Called by the "Add job" button in the top bar, from any screen.
let wantAdd = false;
export function requestAdd(go) {
  if (document.getElementById('add-job')) { toggleAdd(); return; }
  wantAdd = true; go('#/tracking');
}

// One sentence about what to do now.
function suggestion(jobs, open) {
  const label = (j) => [j.title, j.company].filter(Boolean).join(' at ');
  const best = jobs.filter((j) => j.status === 'saved').sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))[0];
  const talk = jobs.find((j) => ['screening', 'interview'].includes(j.status));
  if (talk) return nextStep({ label: 'Next', title: `Prepare for ${label(talk)}`, sub: STATUS_LABEL[talk.status], actions: [h('a', { class: 'btn primary', href: `#/job/${talk.id}` }, 'Open prep')] });
  if (best) return nextStep({ label: 'Next', title: `Apply to ${label(best)}`, sub: best.match?.score != null ? `${best.match.score}% fit${best.resumes.length ? ', resume ready' : ''}` : 'Review the job', actions: [h('a', { class: 'btn primary', href: `#/job/${best.id}` }, 'Open job')] });
  return nextStep({ label: 'Next', title: 'Add your next job', sub: 'Paste a description or use the extension', actions: [h('button', { class: 'btn primary', onclick: open }, 'Add job')] });
}

export async function trackingView(me, go) {
  const { jobs, statuses } = await api('/api/jobs');
  const host = h('div');
  if (!jobs.length) {
    host.append(pageHead('Jobs'), addJobPanel(go),
      emptyState(icon('board', 22), 'Add your first job', 'Paste a job description or use the extension.', h('button', { class: 'btn primary lg', onclick: toggleAdd }, 'Paste a job')));
    if (wantAdd) { wantAdd = false; queueMicrotask(toggleAdd); }
    return host;
  }

  const applied = jobs.filter((j) => j.status !== 'saved').length;
  const talking = jobs.filter((j) => ['screening', 'interview', 'offer'].includes(j.status)).length;
  let view = store.get('tk_view', 'board'); let q = ''; let stage = 'all';
  const body = h('div');
  const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search jobs', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const filter = h('select', { 'aria-label': 'Filter by stage', onchange: (e) => { stage = e.target.value; draw(); } }, h('option', { value: 'all' }, 'All stages'), statuses.map((s) => h('option', { value: s }, STATUS_LABEL[s])));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
    h('button', { class: view === 'board' ? 'on' : '', onclick: () => setView('board') }, 'Board'), h('button', { class: view === 'table' ? 'on' : '', onclick: () => setView('table') }, 'List'));
  const setView = (v) => { view = v; store.set('tk_view', v); [...seg.children].forEach((b) => b.classList.toggle('on', b.textContent === (v === 'board' ? 'Board' : 'List'))); draw(); };

  const move = async (id, st) => { try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: st } }); toast(`Moved to ${STATUS_LABEL[st]}`); go('#/tracking'); } catch (x) { toast(x.message, true); } };
  const visible = () => jobs.filter((j) => (stage === 'all' || j.status === stage) && (!q || `${j.title} ${j.company}`.toLowerCase().includes(q)));

  function board(list) {
    const el = h('div', { class: 'board' });
    for (const st of statuses) {
      const col = h('div', { class: 'col', 'data-status': st,
        ondragover: (e) => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); const job = jobs.find((j) => String(j.id) === id); if (job && job.status !== st) move(id, st); } },
        h('h3', null, h('span', null, STATUS_LABEL[st]), h('b', null, list.filter((j) => j.status === st).length)));
      for (const j of list.filter((x) => x.status === st)) {
        col.append(h('a', { class: 'jcard', href: `#/job/${j.id}`, draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', String(j.id)) },
          h('div', { class: 'row between', style: 'gap:8px;flex-wrap:nowrap;align-items:flex-start' }, h('div', { class: 't' }, j.title || 'Untitled role'), scorePill(j.match)),
          h('div', { class: 'c' }, j.company || 'Company not detected')));
      }
      el.append(col);
    }
    return el;
  }

  function table(list) {
    if (!list.length) return h('div', { class: 'card empty' }, h('p', { class: 'muted', style: 'margin:0' }, 'No jobs match.'));
    return h('div', { class: 'card flush', style: 'overflow-x:auto' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Role', 'Fit', 'Stage'].map((x) => h('th', null, x)))),
      h('tbody', null, list.map((j) => h('tr', { onclick: (e) => { if (!e.target.closest('select')) location.hash = `#/job/${j.id}`; } },
        h('td', null, h('div', { style: 'font-weight:600' }, j.title || 'Untitled role'), h('div', { class: 'muted small' }, j.company || 'Company not detected')),
        h('td', null, scorePill(j.match)),
        h('td', null, h('select', { 'aria-label': 'Stage', onchange: (e) => move(j.id, e.target.value) }, statuses.map((s) => h('option', { value: s, selected: s === j.status }, STATUS_LABEL[s])))))))));
  }

  function draw() { clear(body); const list = visible(); body.append(view === 'board' ? board(list) : table(list)); }
  host.append(pageHead('Jobs', `${jobs.length} saved · ${applied} applied · ${talking} in conversation`), addJobPanel(go), suggestion(jobs, toggleAdd),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search), filter, h('div', { class: 'grow' }), seg), body);
  draw();
  if (wantAdd) { wantAdd = false; queueMicrotask(toggleAdd); }
  return host;
}
