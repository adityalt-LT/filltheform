import { h, clear, spinner, toast } from './dom.js';
import { api, getToken, setToken } from './api.js';
import { icon } from './icons.js';
import { authView } from './views-auth.js';
import { welcomeView, profileView, masterEditorView } from './views-profile.js';
import { trackingView } from './views-tracking.js';
import { jobView } from './views-job.js';
import { resumesView, resumeEditorView, gapsView, settingsView } from './views-misc.js';

const root = document.getElementById('app');
let me = null;
const NAV = [['#/tracking', 'Tracking', 'board'], ['#/resumes', 'Resumes', 'file'], ['#/gaps', 'Skill gaps', 'target'], ['#/profile', 'Profile', 'user'], ['#/settings', 'Settings', 'settings']];

// Setting the same hash again fires no hashchange, so re-render directly in that case.
function go(hash) { if (location.hash === hash || (!location.hash && hash === '#/tracking')) route(); else location.hash = hash; }

const navLink = (hash, [href, label, ic], cls = '') => h('a', { href, class: `navitem ${hash.startsWith(href) ? 'active' : ''} ${cls}` }, icon(ic), label);

function shell(hash, main) {
  const q = me.quota;
  const pct = q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  const side = h('aside', { class: 'sidebar' },
    h('div', { class: 'logo' }, h('i', null, 'T'), 'Tailor & Apply'),
    NAV.map((n) => navLink(hash, n)),
    h('div', { class: 'side-foot' },
      q.limit != null && h('div', null, h('div', { class: 'row between small', style: 'margin-bottom:6px' }, h('span', null, 'Free tailored resumes'), h('span', { class: 'muted' }, `${q.used}/${q.limit}`)), h('div', { class: 'meter' }, h('i', { style: `width:${pct}%` }))),
      h('a', { href: '#/settings', class: 'small', style: 'text-decoration:none;display:flex;gap:8px;align-items:center' },
        me.aiEnabled ? h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI on') : h('span', { class: 'chip' }, 'Basic mode'),
        h('span', { class: 'muted' }, me.aiEnabled ? '' : 'Turn on AI')),
      h('div', { class: 'small muted', style: 'overflow:hidden;text-overflow:ellipsis' }, me.user.email)));
  const mobile = h('nav', { class: 'mobilebar', 'aria-label': 'Main' }, NAV.map((n) => navLink(hash, n)));
  return h('div', { class: 'app' }, side, h('div', null, mobile, main));
}

async function route() {
  const hash = location.hash || '#/tracking';
  if (!getToken()) { clear(root); root.append(authView(() => { me = null; go('#/tracking'); })); return; }
  if (hash === '#/login') { setToken(''); return route(); }
  try { me = await api('/api/me'); } catch (e) { if (e.status !== 401) toast(e.message, true); return; }

  const [, page, arg] = hash.match(/^#\/([\w-]+)(?:\/(.+))?$/) || [];
  const needsResume = !me.hasResume && !['profile', 'settings', 'welcome'].includes(page);
  const wide = ['resume', 'job', 'tracking'].includes(page) && !needsResume;
  const main = h('main', { class: `main ${wide ? '' : 'narrow'}` }, spinner());
  clear(root); root.append(shell(hash, main));
  try {
    let view;
    if (needsResume || page === 'welcome') view = await welcomeView(me, go);
    else if (page === 'tracking' || !page) view = await trackingView(me, go);
    else if (page === 'job') view = await jobView(arg, me, go);
    else if (page === 'resumes') view = await resumesView();
    else if (page === 'resume') view = await resumeEditorView(arg);
    else if (page === 'gaps') view = await gapsView();
    else if (page === 'profile' && arg === 'resume') view = await masterEditorView(go);
    else if (page === 'profile') view = await profileView(me, go);
    else if (page === 'settings') view = await settingsView(me, go);
    else view = h('div', { class: 'card empty' }, h('h2', null, 'Page not found'), h('a', { href: '#/tracking' }, 'Go to Tracking'));
    clear(main); main.append(view);
  } catch (e) {
    clear(main); main.append(h('div', { class: 'error' }, e.message), h('p', null, h('a', { href: '#/tracking' }, 'Back to Tracking')));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
