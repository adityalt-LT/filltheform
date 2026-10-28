import { h, clear, spinner, toast } from './dom.js';
import { api, getToken, setToken } from './api.js';
import { icon, logoMark } from './icons.js';
import { BRAND } from '../brand.js';
import { authView } from './views-auth.js';
import { welcomeView, profileView, masterEditorView } from './views-profile.js';
import { trackingView } from './views-tracking.js';
import { jobView } from './views-job.js';
import { resumesView, resumeEditorView, gapsView, settingsView } from './views-misc.js';

const root = document.getElementById('app');
let me = null;
const GROUPS = [
  ['Workspace', [['#/tracking', 'Tracking', 'board'], ['#/resumes', 'Resumes', 'file'], ['#/gaps', 'Skill gaps', 'target']]],
  ['Account', [['#/profile', 'Profile', 'user'], ['#/settings', 'Settings', 'settings']]],
];
const CRUMBS = { tracking: ['Tracking'], job: ['Tracking', 'Job'], resumes: ['Resumes'], resume: ['Resumes', 'Editor'], gaps: ['Skill gaps'], profile: ['Profile'], settings: ['Settings'], welcome: ['Get started'] };

// Setting the same hash again fires no hashchange, so re-render directly in that case.
function go(hash) { if (location.hash === hash || (!location.hash && hash === '#/tracking')) route(); else location.hash = hash; }
const initials = (e) => String(e || '?').slice(0, 2).toUpperCase();
const navLink = (hash, [href, label, ic]) => h('a', { href, class: `navitem ${hash.startsWith(href) ? 'active' : ''}` }, icon(ic), label);

function shell(hash, page, arg, main) {
  const q = me.quota;
  const pct = q.limit ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
  let menu = null;
  const userBtn = h('button', { class: 'userrow', 'aria-haspopup': 'menu', onclick: (e) => {
    e.stopPropagation();
    if (menu) { menu.remove(); menu = null; return; }
    menu = h('div', { class: 'menu', role: 'menu' },
      h('a', { href: '#/profile' }, icon('user', 16), 'Profile'), h('a', { href: '#/settings' }, icon('settings', 16), 'Settings'),
      h('button', { onclick: async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already out */ } setToken(''); go('#/login'); } }, icon('logout', 16), 'Sign out'));
    side.append(menu);
    setTimeout(() => document.addEventListener('click', () => { menu?.remove(); menu = null; }, { once: true }));
  } }, h('span', { class: 'avatar' }, initials(me.user.email)), h('span', { class: 'grow', style: 'overflow:hidden' }, h('div', { style: 'font-weight:550;overflow:hidden;text-overflow:ellipsis' }, me.user.email.split('@')[0]), h('div', { class: 'small muted' }, me.user.plan === 'free' ? 'Free plan' : me.user.plan)), icon('chevron', 16));
  const side = h('aside', { class: 'sidebar', style: 'position:sticky' },
    h('div', { class: 'logo' }, logoMark(), BRAND.name),
    GROUPS.map(([label, items]) => [h('div', { class: 'navlabel' }, label), items.map((n) => navLink(hash, n))]),
    h('div', { class: 'side-foot' },
      q.limit != null && h('div', { class: 'plan' }, h('div', { class: 'row between small' }, h('strong', null, 'Free plan'), h('span', { class: 'muted' }, `${q.used} / ${q.limit} resumes`)), h('div', { class: 'meter' }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Tailored resumes this month')),
      h('a', { href: '#/settings', class: 'small', style: 'display:flex;gap:8px;align-items:center;padding:0 10px' },
        me.aiEnabled ? h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI on') : h('span', { class: 'chip' }, 'Basic mode'), !me.aiEnabled && h('span', null, 'Turn on AI')),
      userBtn));
  const crumbs = CRUMBS[page] || [];
  const top = h('header', { class: 'topbar' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, crumbs.map((c, i) => [i > 0 && h('span', null, '/'), i === crumbs.length - 1 ? h('b', null, c) : h('a', { href: page === 'job' ? '#/tracking' : '#/resumes' }, c)])),
    h('div', { class: 'row tight' }, me.aiEnabled && h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI on'), h('a', { class: 'btn sm', href: '#/settings' }, icon('puzzle', 15), 'Extension')));
  const mobile = h('nav', { class: 'mobilebar', 'aria-label': 'Main' }, GROUPS.flatMap(([, items]) => items).map((n) => navLink(hash, n)));
  return h('div', { class: 'app' }, side, h('div', null, mobile, top, main));
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
  clear(root); root.append(shell(hash, needsResume ? 'welcome' : page, arg, main));
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
