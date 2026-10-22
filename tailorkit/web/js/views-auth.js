import { h } from './dom.js';
import { api, setToken } from './api.js';
import { icon } from './icons.js';

const point = (title, text) => h('li', null, h('span', { class: 'iconbox', style: 'margin:0;width:32px;height:32px;background:rgba(255,255,255,.16);color:#fff;border-radius:8px' }, icon('check', 16)), h('div', null, h('div', { style: 'font-weight:600' }, title), h('div', { style: 'opacity:.85;font-size:13.5px' }, text)));

export function authView(onDone) {
  let mode = 'signup';
  const host = h('div', { class: 'authwrap' });
  const render = () => {
    host.replaceChildren();
    const err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' });
    const pass = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', placeholder: mode === 'signup' ? 'At least 8 characters' : 'Your password' });
    const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%;justify-content:center' }, mode === 'signup' ? 'Create account' : 'Sign in');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; err.hidden = true;
      try { const r = await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } }); setToken(r.token); onDone(); }
      catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, h('label', { class: 'field' }, 'Email', email), h('label', { class: 'field' }, 'Password', pass), err, btn);
    host.append(
      h('div', { class: 'authform' }, h('div', { class: 'auth' },
        h('div', { class: 'logo', style: 'padding-left:0;padding-bottom:28px' }, h('i', null, 'T'), 'Tailor & Apply'),
        h('h1', null, mode === 'signup' ? 'Create your account' : 'Welcome back'),
        h('p', { class: 'sub' }, mode === 'signup' ? 'Start tailoring your resume to every job in minutes.' : 'Sign in to continue to your workspace.'),
        form,
        h('p', { class: 'small muted', style: 'text-align:center;margin-top:20px' }, mode === 'signup' ? 'Already have an account? ' : 'New here? ',
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = mode === 'signup' ? 'login' : 'signup'; render(); } }, mode === 'signup' ? 'Sign in' : 'Create an account')),
        h('p', { class: 'small faint', style: 'text-align:center' }, 'The same account signs you in to the Chrome extension.'))),
      h('div', { class: 'authpanel' },
        h('h2', null, 'Apply with a resume that fits every job.'),
        h('ul', null, point('Keeps your resume’s own layout', 'Same sections, fonts and spacing. We only reorder and highlight.'), point('Shows what’s missing', 'A match score and the exact skills a screener may look for.'), point('Interview brief for each job', 'Company research and answers drafted from your resume.')),
        h('div', { class: 'mock' }, h('div', { class: 'row between' }, h('div', null, h('div', { style: 'font-weight:600' }, 'Product Manager'), h('div', { style: 'opacity:.8;font-size:13px' }, 'Acme Inc · Bengaluru')), h('span', { class: 'chip', style: 'background:#fff;color:#067647;border:0' }, '87% match')),
          h('div', { class: 'meter', style: 'background:rgba(255,255,255,.25);margin:14px 0 8px' }, h('i', { style: 'width:87%;background:#fff' })), h('div', { style: 'font-size:12.5px;opacity:.85' }, '5 of 7 must-have skills covered'))));
  };
  render();
  return host;
}
