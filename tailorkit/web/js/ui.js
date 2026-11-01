import { h } from './dom.js';

export const pageHead = (title, desc, ...actions) => h('div', { class: 'pagehead' }, h('div', null, h('h1', null, title), desc && h('p', null, desc)), actions.length > 0 && h('div', { class: 'row' }, actions));

// The one thing to do on this screen: a dark card with a single sentence and one or two buttons.
export const nextStep = ({ label = 'Next', title, sub, actions = [] }) =>
  h('div', { class: 'next' }, h('div', null, h('div', { class: 'k' }, label), h('div', { class: 't' }, title), sub && h('div', { class: 's' }, sub)), actions.length > 0 && h('div', { class: 'row' }, actions));

// Where this job is on the path from "found it" to "applied". `now` is the index of the current step.
export function path(steps, now) {
  return h('div', { class: 'path', 'aria-label': 'Progress' }, steps.map((s, i) => h('span', { class: i < now ? 'done' : i === now ? 'now' : '' }, h('i', null, i < now ? '✓' : String(i + 1)), s)));
}

const NS = 'http://www.w3.org/2000/svg';
// Score ring. Starts empty and fills, like the one on the website.
export function ring(score) {
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx', 60); c.setAttribute('cy', 60); c.setAttribute('r', 54); svg.append(c); return c; };
  mk('bg'); const arc = mk('arc'); arc.style.strokeDashoffset = '339.3';
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = String(339.3 * (1 - (score ?? 0) / 100)); }));
  return h('div', { class: 'ringbox', role: 'img', 'aria-label': `Match score ${score ?? 'unknown'} out of 100` }, svg, h('div', { class: 'n' }, score == null ? '–' : score, score != null && h('small', null, '%')));
}

export function stepper(current) {
  const steps = ['Resume', 'Check', 'Extension'];
  return h('div', { class: 'stepper', 'aria-label': 'Progress' }, steps.map((s, i) => [i > 0 && h('em'), h('span', { class: i === current ? 'on' : i < current ? 'done' : '' }, h('i', null, i < current ? '✓' : String(i + 1)), s)]));
}

export const emptyState = (ic, title, text, ...actions) => h('div', { class: 'card empty' }, h('div', { class: 'iconbox' }, ic), h('h2', null, title), text && h('p', { class: 'muted', style: 'max-width:440px;margin:6px auto 22px' }, text), actions.length > 0 && h('div', { class: 'row', style: 'justify-content:center' }, actions));
