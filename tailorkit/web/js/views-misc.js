import { h, fmtDate, toast, copyText } from './dom.js';
import { icon } from './icons.js';
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

const codeBlock = (text) => h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap;align-items:flex-start' }, h('pre', { class: 'code grow', style: 'margin:0' }, text), h('button', { class: 'btn sm icon', 'aria-label': 'Copy', onclick: () => copyText(text) }, icon('copy', 15)));

export async function settingsView(me, go) {
  const del = h('input', { type: 'text', placeholder: 'Type your email to confirm', style: 'max-width:280px' });
  const aiCard = h('div', { class: 'card stack' },
    h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'AI'), me.aiEnabled ? h('span', { class: 'ai-badge' }, icon('sparkle'), `On · ${me.aiModel}`) : h('span', { class: 'chip' }, 'Off · basic mode')),
    me.aiEnabled
      ? h('p', { class: 'muted', style: 'margin:0' }, 'AI is reading jobs, researching companies on the public web, writing your interview prep and powering Ask AI.')
      : h('p', { class: 'muted', style: 'margin:0' }, 'Without a key everything still works with rules (matching, tailoring, a basic prep). With a key you also get: company research with review themes and interview reports (with sources), answers written around that company, better job reading, and the Ask AI chat.'),
    me.aiError && h('div', { class: 'error' }, h('strong', null, 'Last AI error: '), me.aiError.message),
    !me.aiEnabled && h('ol', { class: 'steps' },
      h('li', null, h('div', null, 'Create an API key at ', h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener noreferrer' }, 'console.anthropic.com'), '.')),
      h('li', null, h('div', null, 'In the ', h('code', null, 'tailorkit'), ' folder, create a file named ', h('code', null, '.env'), ' with this line (use your key):', codeBlock('ANTHROPIC_API_KEY=sk-ant-...'))),
      h('li', null, h('div', null, 'Stop the server (Ctrl+C in Terminal) and start it again:', codeBlock('npm start'))),
      h('li', null, h('div', null, 'Reload this page. The sidebar will show “AI on”.'))),
    h('p', { class: 'muted small', style: 'margin:0' }, 'Company research uses public web search and cites its sources. It does not log in to or scrape review sites. To change cost or speed, set TAILORKIT_MODEL in .env (for example claude-sonnet-5-5).'));
  return h('div', { class: 'stack' }, h('h1', null, 'Settings'),
    aiCard,
    h('div', { class: 'card' }, h('h2', null, 'Account'), h('p', null, me.user.email, ' ', h('span', { class: 'chip' }, me.user.plan === 'free' ? 'Free plan' : me.user.plan)),
      me.quota.limit != null && h('p', { class: 'muted small' }, `${me.quota.used} of ${me.quota.limit} free tailored resumes used this month.`),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already out */ } setToken(''); go('#/login'); } }, 'Sign out'),
        h('button', { class: 'btn', onclick: () => download('/api/export', 'tailorkit-export.json').catch((e) => toast(e.message, true)) }, 'Export my data'))),
    h('div', { class: 'card' }, h('h2', null, 'Chrome extension'), EXT_STEPS()),
    h('div', { class: 'card' }, h('h2', null, 'Delete account'), h('p', { class: 'muted small' }, 'Permanently deletes your resume, jobs and tailored versions.'),
      h('div', { class: 'row' }, del, h('button', { class: 'btn danger', onclick: async () => { try { await api('/api/account', { method: 'DELETE', body: { confirm: del.value.trim() } }); setToken(''); go('#/login'); } catch (e) { toast(e.message, true); } } }, 'Delete everything'))));
}
