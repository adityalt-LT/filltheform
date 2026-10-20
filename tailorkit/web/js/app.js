import { h, clear, spinner, toast } from './dom.js';
import { api, getToken, setToken } from './api.js';
import { authView } from './views-auth.js';
import { welcomeView, profileView, masterEditorView } from './views-profile.js';
import { trackingView } from './views-tracking.js';
import { jobView } from './views-job.js';
import { resumesView, resumeEditorView, gapsView, settingsView } from './views-misc.js';

const root = document.getElementById('app');
let me = null;
const NAV = [['#/tracking', 'Tracking'], ['#/resumes', 'Resumes'], ['#/gaps', 'Skill gaps'], ['#/profile', 'Profile'], ['#/settings', 'Settings']];

// Setting the same hash again fires no hashchange, so re-render directly in that case.
function go(hash) { if (location.hash === hash || (!location.hash && hash === '#/tracking')) route(); else location.hash = hash; }

async function route() {
  const hash = location.hash || '#/tracking';
  if (!getToken()) { clear(root); root.append(authView(async () => { me = null; go('#/tracking'); route(); })); return; }
  if (hash === '#/login') { setToken(''); return route(); }
  try {
    me = await api('/api/me');
  } catch (e) { if (e.status !== 401) toast(e.message, true); return; }

  const [, page, arg] = hash.match(/^#\/([\w-]+)(?:\/(.+))?$/) || [];
  const main = h('main', null, spinner());
  const shell = h('div', { class: 'shell' },
    h('header', { class: 'topbar' }, h('div', { class: 'brand' }, 'Tailor', h('span', null, ' & Apply')),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map(([href, label]) => h('a', { href, class: hash.startsWith(href) ? 'active' : '' }, label))),
      me.quota.limit != null && h('span', { class: 'chip', title: 'Tailored resumes used this month' }, `${me.quota.used}/${me.quota.limit} free`)),
    main);
  clear(root); root.append(shell);

  const needsResume = !me.hasResume && !['profile', 'settings', 'welcome'].includes(page);
  try {
    let view;
    if (needsResume || page === 'welcome') view = welcomeView(me, go);
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
