import { h, toast, fmtDate, clear } from './dom.js';
import { api } from './api.js';
import { EXT_STEPS } from './views-profile.js';

export const STATUS_LABEL = { saved: 'Saved', applied: 'Applied', screening: 'Screening call', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
export const bandOf = (m) => m?.band || 'unknown';
export const scorePill = (m) => h('span', { class: `pill ${bandOf(m)}`, title: m?.note || '' }, m?.score == null ? 'n/a' : `${m.score}%`);

export async function trackingView(me, go) {
  const { jobs, statuses } = await api('/api/jobs');
  const host = h('div', { class: 'stack' });
  host.append(h('div', { class: 'row between' },
    h('div', null, h('h1', null, 'Tracking'), h('p', { class: 'muted' }, 'Every job you capture lands here. Drag a card to update its stage.')),
    h('div', { class: 'muted small' }, `${jobs.length} job${jobs.length === 1 ? '' : 's'}`)));

  if (!jobs.length) {
    host.append(h('div', { class: 'card empty' }, h('h2', null, 'No jobs yet'),
      h('p', { class: 'muted' }, 'Open any job page or LinkedIn hiring post, click the extension and capture it. It will show up here with a match score and a tailored resume.'),
      h('div', { style: 'text-align:left;max-width:560px;margin:14px auto 0' }, EXT_STEPS())));
    return host;
  }

  const board = h('div', { class: 'board' });
  for (const st of statuses) {
    const list = jobs.filter((j) => j.status === st);
    const col = h('div', { class: 'col', 'data-status': st,
      ondragover: (e) => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
      ondrop: async (e) => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain'); const job = jobs.find((j) => String(j.id) === id);
        if (!job || job.status === st) return;
        try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: st } }); toast(`Moved to ${STATUS_LABEL[st]}`); go('#/tracking', true); } catch (x) { toast(x.message, true); }
      } },
      h('h3', null, h('span', null, STATUS_LABEL[st]), h('span', null, list.length)));
    for (const j of list) {
      col.append(h('a', { class: 'jcard', href: `#/job/${j.id}`, draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', String(j.id)) },
        h('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap;align-items:flex-start' }, h('div', { class: 't' }, j.title || 'Untitled role'), scorePill(j.match)),
        h('div', { class: 'c' }, [j.company, j.location].filter(Boolean).join(' · ') || j.source || ''),
        h('div', { class: 'row', style: 'margin-top:6px;gap:6px' },
          j.resumes.length ? h('span', { class: 'chip good' }, 'Resume ready') : h('span', { class: 'chip' }, 'No resume yet'),
          h('span', { class: 'muted small' }, fmtDate(j.createdAt)))));
    }
    board.append(col);
  }
  host.append(board);
  host.append(h('p', { class: 'small muted' }, 'On a phone? Open a job and use the Stage menu.'));
  return host;
}
