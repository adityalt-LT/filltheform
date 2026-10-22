import { h } from './dom.js';

export const pageHead = (title, desc, ...actions) => h('div', { class: 'pagehead' }, h('div', null, h('h1', null, title), desc && h('p', null, desc)), actions.length > 0 && h('div', { class: 'row' }, actions));

export function stepper(current) {
  const steps = ['Resume', 'Review', 'Extension'];
  return h('div', { class: 'stepper', 'aria-label': 'Progress' }, steps.map((s, i) => [i > 0 && h('em'), h('span', { class: i === current ? 'on' : i < current ? 'done' : '' }, h('i', null, i < current ? '✓' : String(i + 1)), s)]));
}

export const emptyState = (ic, title, text, ...actions) => h('div', { class: 'card empty' }, h('div', { class: 'iconbox' }, ic), h('h2', null, title), h('p', { class: 'muted', style: 'max-width:460px;margin:6px auto 16px' }, text), actions.length > 0 && h('div', { class: 'row', style: 'justify-content:center' }, actions));
