import { h } from './dom.js';
import { api, setToken } from './api.js';

export function authView(onDone) {
  let mode = 'signup';
  const host = h('div', { class: 'center' });
  const render = () => {
    host.replaceChildren();
    const err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'Email address' });
    const pass = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', placeholder: mode === 'signup' ? 'Password (8+ characters)' : 'Password' });
    const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%;justify-content:center' }, mode === 'signup' ? 'Create account' : 'Continue');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.hidden = true;
      try { const r = await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } }); setToken(r.token); onDone(); }
      catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, email, pass, err, btn);
    host.append(h('div', { class: 'auth' },
      h('div', { class: 'logo', style: 'justify-content:center;padding-bottom:24px' }, h('i', null, 'T'), 'Tailor & Apply'),
      h('h1', null, mode === 'signup' ? 'Create your account' : 'Welcome back'),
      h('p', { class: 'sub' }, mode === 'signup' ? 'Apply with a resume that fits every job.' : 'Sign in to continue.'),
      form,
      h('p', { class: 'small muted', style: 'text-align:center;margin-top:18px' }, mode === 'signup' ? 'Already have an account? ' : 'New here? ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = mode === 'signup' ? 'login' : 'signup'; render(); } }, mode === 'signup' ? 'Sign in' : 'Create an account')),
      h('p', { class: 'small muted', style: 'text-align:center' }, 'The same account signs you in to the Chrome extension.')));
  };
  render();
  return host;
}
