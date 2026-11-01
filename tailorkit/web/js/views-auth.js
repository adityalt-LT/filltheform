import { h } from './dom.js';
import { api, setToken } from './api.js';
import { brandLogo } from './logo.js';
import { BRAND } from '../brand.js';

export function authView(onDone) {
  let mode = 'signup';
  const host = h('div', { class: 'authwrap' });
  const render = () => {
    host.replaceChildren();
    const err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' });
    const pass = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', placeholder: mode === 'signup' ? 'At least 8 characters' : 'Your password' });
    const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%' }, mode === 'signup' ? 'Create account' : 'Sign in');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.hidden = true;
      try { const r = await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } }); setToken(r.token); onDone(); }
      catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, h('label', { class: 'field' }, 'Email', email), h('label', { class: 'field' }, 'Password', pass), err, btn);
    const switchMode = h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = mode === 'signup' ? 'login' : 'signup'; render(); } }, mode === 'signup' ? 'Sign in' : 'Create an account');
    const left = h('div', { class: 'authform' }, h('div', { class: 'auth' },
      h('div', { class: 'logo', style: 'padding-bottom:36px' }, brandLogo({ height: 38, label: BRAND.name })),
      h('h1', null, mode === 'signup' ? 'Create your account' : 'Welcome back'),
      h('p', { class: 'sub' }, mode === 'signup' ? 'Free. No card needed.' : 'Sign in to continue.'),
      form,
      h('p', { class: 'small muted', style: 'text-align:center;margin-top:22px' }, mode === 'signup' ? 'Already have an account? ' : 'New here? ', switchMode)));
    const card = h('div', { class: 'tag' },
      h('div', { class: 'row between', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('div', null, h('b', null, 'Product Manager'), h('div', { class: 'muted small' }, 'Acme · Bengaluru')), h('span', { class: 'pill strong' }, '87% match')),
      h('div', { class: 'row tight', style: 'margin-top:16px' }, h('span', { class: 'chip good' }, 'Analytics'), h('span', { class: 'chip good' }, 'Roadmaps'), h('span', { class: 'chip warn' }, 'SQL')));
    const right = h('div', { class: 'authpanel' }, h('h2', null, 'Apply smarter. ', h('em', null, 'Not more.')), card);
    host.append(left, right);
  };
  render();
  return host;
}
