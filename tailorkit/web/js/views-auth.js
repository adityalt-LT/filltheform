import { h } from './dom.js';
import { api, setToken } from './api.js';
import { logoMark } from './icons.js';
import { BRAND } from '../brand.js';

const point = (n, title, text) => h('li', null, h('span', { class: 'num' }, n), h('div', null, h('div', { style: 'font-weight:600' }, title), h('div', { style: 'opacity:.8;font-size:13.5px' }, text)));

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
        h('div', { class: 'logo', style: 'padding-left:0;padding-bottom:34px' }, logoMark(), BRAND.name),
        h('h1', null, mode === 'signup' ? 'Create your account' : 'Welcome back'),
        h('p', { class: 'sub' }, mode === 'signup' ? 'Start tailoring your resume to every job in minutes.' : 'Sign in to continue to your workspace.'),
        form,
        h('p', { class: 'small muted', style: 'text-align:center;margin-top:20px' }, mode === 'signup' ? 'Already have an account? ' : 'New here? ',
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = mode === 'signup' ? 'login' : 'signup'; render(); } }, mode === 'signup' ? 'Sign in' : 'Create an account')),
        h('p', { class: 'small faint', style: 'text-align:center' }, 'The same account signs you in to the Chrome extension.'))),
      h('div', { class: 'authpanel' },
        h('h2', null, 'Apply with a resume that ', h('em', null, 'fits'), ' every job.'),
        h('ul', null, point('01', 'Your layout, kept', 'Same sections, fonts and spacing. We only reorder and highlight.'), point('02', 'Measured against the job', 'A fit score and the exact skills a screener may look for.'), point('03', 'Briefed for the interview', 'Company research and answers drafted from your resume.')),
        h('div', { class: 'fit-art' }, h('div', { class: 'tag' },
          h('div', { class: 'row between', style: 'padding-right:22px;align-items:flex-start' }, h('div', null, h('div', { style: 'font-family:var(--display);font-size:20px;font-weight:520;letter-spacing:-.01em' }, 'Product Manager'), h('div', { style: 'color:#6c6453;font-size:13px' }, 'Acme Inc · Bengaluru')), h('span', { class: 'stamp' }, 'Fit 87')),
          h('div', { class: 'tape', style: 'margin-top:20px;height:34px' }, h('div', { class: 'ticks' }), h('i', { class: 'pin', style: '--pct:87' })),
          h('div', { style: 'font-size:12.5px;color:#6c6453;margin-top:14px' }, '5 of 7 must-have skills covered. Two to confirm.')))));
  };
  render();
  return host;
}
