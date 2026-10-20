import { h, toast } from './dom.js';
import { api, setToken } from './api.js';

export function authView(onDone) {
  let mode = 'signup';
  const host = h('div', { class: 'auth' });
  const render = () => {
    host.replaceChildren();
    const err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email' });
    const pass = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password' });
    const btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%;justify-content:center' }, mode === 'signup' ? 'Create account' : 'Sign in');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.hidden = true;
      try {
        const r = await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } });
        setToken(r.token); onDone();
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } },
      h('label', { class: 'field' }, 'Email', email),
      h('label', { class: 'field' }, 'Password', pass, mode === 'signup' && h('span', { class: 'small muted' }, 'At least 8 characters')),
      err, btn);
    host.append(
      h('div', { class: 'brand', style: 'font-size:22px;margin-bottom:6px' }, 'Tailor', h('span', null, ' & Apply')),
      h('h1', null, mode === 'signup' ? 'Apply with a resume that fits each job.' : 'Welcome back'),
      h('p', { class: 'muted' }, 'Keep your resume’s own structure. We reorder and highlight what matters for each job, and show you what’s missing.'),
      h('div', { class: 'card' },
        h('div', { class: 'tabs', role: 'tablist' },
          h('button', { class: mode === 'signup' ? 'on' : '', role: 'tab', onclick: () => { mode = 'signup'; render(); } }, 'Sign up'),
          h('button', { class: mode === 'login' ? 'on' : '', role: 'tab', onclick: () => { mode = 'login'; render(); } }, 'Sign in')),
        form),
      h('p', { class: 'small muted', style: 'margin-top:12px' }, 'The same account signs you in to the Chrome extension.'));
  };
  render();
  return host;
}
