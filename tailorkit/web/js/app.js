import { h, clear, spinner, toast } from './dom.js';
import { api, getToken, setToken } from './api.js';
import { icon } from './icons.js';
import { brandLogo, armLogo, replayLogo, logoPlaying } from './logo.js';
import { BRAND } from '../brand.js';
import { authView } from './views-auth.js';
import { welcomeView, profileView, masterEditorView } from './views-profile.js';
import { trackingView, requestAdd } from './views-tracking.js';
import { jobView } from './views-job.js';
import { resumesView, resumeEditorView, gapsView, settingsView } from './views-misc.js';

const root = document.getElementById('app');
let me = null;
const TABS = [['#/tracking', 'Jobs'], ['#/resumes', 'Resumes'], ['#/gaps', 'Skills'], ['#/profile', 'Profile']];
const TAB_OF = { tracking: '#/tracking', job: '#/tracking', resumes: '#/resumes', resume: '#/resumes', gaps: '#/gaps', profile: '#/profile' };

// Setting the same hash again fires no hashchange, so re-render directly in that case.
function go(hash) { if (location.hash === hash || (!location.hash && hash === '#/tracking')) route(); else location.hash = hash; }
const initials = (e) => String(e || '?').slice(0, 2).toUpperCase();

function shell(page, main) {
  const q = me.quota;
  let menu = null;
  const close = () => { menu?.remove(); menu = null; };
  const avatar = h('button', { class: 'avatar', 'aria-haspopup': 'menu', 'aria-label': 'Account menu', onclick: (e) => {
    e.stopPropagation();
    if (menu) { close(); return; }
    menu = h('div', { class: 'menu', role: 'menu' },
      h('div', { class: 'who' }, h('b', null, me.user.email), h('span', null, q.limit != null ? `Free plan · ${q.used} of ${q.limit} resumes used` : me.user.plan)),
      h('hr'), h('a', { href: '#/settings' }, icon('settings', 16), 'Settings'), h('a', { href: '#/settings' }, icon('puzzle', 16), 'Chrome extension'),
      h('hr'), h('button', { onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already out */ } setToken(''); go('#/login'); } }, icon('logout', 16), 'Sign out'));
    wrap.append(menu);
    setTimeout(() => document.addEventListener('click', close, { once: true }));
  } }, initials(me.user.email));
  const wrap = h('div', { style: 'position:relative' }, avatar);
  const active = TAB_OF[page] || '';
  const nav = h('header', { class: 'nav' }, h('div', { class: 'nav-in' },
    h('a', { class: 'logo', href: '#/tracking', 'aria-label': `${BRAND.name} home`, // Hover (or keyboard focus) plays the logo again, unless it is already playing. Clicking just goes to Jobs.
      onmouseenter: (e) => { const svg = e.currentTarget.querySelector('svg'); if (svg && !logoPlaying(svg)) replayLogo(svg); },
      onfocus: (e) => { const svg = e.currentTarget.querySelector('svg'); if (svg && !logoPlaying(svg)) replayLogo(svg); },
      onclick: (e) => { const svg = e.currentTarget.querySelector('svg'); if (svg && logoPlaying(svg)) armLogo(); },
    }, brandLogo({ height: 32, label: BRAND.name })),
    h('nav', { class: 'navtabs', 'aria-label': 'Main' }, TABS.map(([href, label]) => h('a', { href, class: `navitem ${href === active ? 'active' : ''}` }, label))),
    h('div', { class: 'nav-actions' }, me.aiEnabled && h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI on'),
      h('button', { class: 'btn primary sm', onclick: () => requestAdd(go) }, icon('plus', 15), 'Add job'), wrap)));
  return h('div', { class: 'app' }, nav, main);
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
  clear(root); root.append(shell(needsResume ? 'welcome' : page, main));
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
