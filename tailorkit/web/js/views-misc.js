import { h, fmtDate, toast } from './dom.js';
import { api, download, setToken } from './api.js';
import { resumeEditor } from './editor.js';
import { EXT_STEPS } from './views-profile.js';

export async function resumesView() {
  const { resumes } = await api('/api/resumes');
  const host = h('div', { class: 'stack' }, h('div', null, h('h1', null, 'Resumes'), h('p', { class: 'muted' }, 'Every tailored version, one per job. Your master resume lives under Profile.')));
  if (!resumes.length) { host.append(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'Tailored resumes appear here after you capture a job with the extension.'))); return host; }
  host.append(h('div', { class: 'card', style: 'overflow-x:auto' }, h('table', { class: 't' },
    h('thead', null, h('tr', null, ['Job', 'Company', 'Created', ''].map((x) => h('th', null, x)))),
    h('tbody', null, resumes.map((r) => h('tr', null,
      h('td', null, r.jobId ? h('a', { href: `#/job/${r.jobId}` }, r.title || r.label) : r.label),
      h('td', null, r.company || '—'), h('td', null, fmtDate(r.createdAt)),
      h('td', { style: 'text-align:right;white-space:nowrap' },
        h('a', { class: 'btn sm', href: `#/resume/${r.id}` }, 'Edit'), ' ',
        h('button', { class: 'btn sm primary', onclick: () => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true)) }, 'PDF'), ' ',
        h('button', { class: 'btn sm ghost danger', onclick: async (e) => { if (!confirm('Delete this tailored resume?')) return; await api(`/api/resumes/${r.id}`, { method: 'DELETE' }); e.target.closest('tr').remove(); } }, 'Delete'))))))));
  return host;
}

export async function resumeEditorView(id) {
  const [data, me] = await Promise.all([api(`/api/resumes/${id}`), api('/api/me')]);
  const ed = resumeEditor({
    resume: data.resume, suggestions: data.suggestions, aiEnabled: me.aiEnabled, title: data.label || 'Tailored resume',
    onSave: async (resume, suggestions) => { await api(`/api/resumes/${id}`, { method: 'PUT', body: { resume, suggestions } }); },
    onDownload: () => download(`/api/resumes/${id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true)),
  });
  return h('div', { class: 'stack' },
    h('div', null, data.jobId ? h('a', { class: 'small', href: `#/job/${data.jobId}` }, '← Back to job') : h('a', { class: 'small', href: '#/resumes' }, '← Resumes'),
      h('h1', null, data.label || 'Tailored resume')),
    data.changes.length > 0 && h('div', { class: 'info' }, h('strong', null, 'What we changed: '), data.changes.join(' ')),
    ed.el);
}

export async function gapsView() {
  const { gaps, totalJobs } = await api('/api/skill-gaps');
  const host = h('div', { class: 'stack' }, h('div', null, h('h1', null, 'Skill gaps'), h('p', { class: 'muted' }, `Across the ${totalJobs} job${totalJobs === 1 ? '' : 's'} you've saved, these are the things your resume is missing most often.`)));
  if (!gaps.length) { host.append(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, totalJobs ? 'No gaps found. Your resume covers everything the saved jobs ask for.' : 'Capture a few jobs to see which skills keep coming up.'))); return host; }
  host.append(h('div', { class: 'card' }, gaps.map((g) => h('div', { class: 'gap' },
    h('span', { class: `chip ${g.must ? 'bad' : 'warn'}` }, g.skill),
    h('div', { class: 'grow' }, h('strong', null, `Missing in ${g.jobs} of ${totalJobs} jobs`), h('div', { class: 'small muted' }, g.must ? `Required in ${g.must}` : 'Only nice-to-have', g.examples.length ? ` · e.g. ${g.examples.join('; ')}` : ''))))),
    h('p', { class: 'small muted' }, 'If you already have a skill, open one of those jobs and tap “I have this”. If you don’t, this list is a short learning plan.'));
  return host;
}

export async function settingsView(me, go) {
  const del = h('input', { type: 'text', placeholder: 'Type your email to confirm', style: 'min-width:260px' });
  return h('div', { class: 'stack' }, h('h1', null, 'Settings'),
    h('div', { class: 'card' }, h('h2', null, 'Account'), h('p', null, me.user.email, ' ', h('span', { class: 'chip' }, me.user.plan === 'free' ? 'Free plan' : me.user.plan)),
      me.quota.limit != null && h('p', { class: 'muted small' }, `${me.quota.used} of ${me.quota.limit} free tailored resumes used this month.`),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already out */ } setToken(''); go('#/login'); } }, 'Sign out'),
        h('button', { class: 'btn', onclick: () => download('/api/export', 'tailorkit-export.json').catch((e) => toast(e.message, true)) }, 'Export my data'))),
    h('div', { class: 'card' }, h('h2', null, 'Chrome extension'), EXT_STEPS(), h('p', { class: 'small muted' }, me.aiEnabled ? 'AI features: on.' : 'AI features are off on this server (rule-based mode). Set ANTHROPIC_API_KEY to turn on AI job reading and rewording suggestions.')),
    h('div', { class: 'card' }, h('h2', null, 'Delete account'), h('p', { class: 'muted small' }, 'Permanently deletes your resume, jobs and tailored versions.'),
      h('div', { class: 'row' }, del, h('button', { class: 'btn danger', onclick: async () => { try { await api('/api/account', { method: 'DELETE', body: { confirm: del.value.trim() } }); setToken(''); go('#/login'); } catch (e) { toast(e.message, true); } } }, 'Delete everything'))));
}
