// Tiny DOM helper. Text always goes through text nodes, never innerHTML, because
// job text comes from arbitrary web pages.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'draggable') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  return append(el, ...kids);
}
export function append(el, ...kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, isErr = false) {
  const t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: isErr ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3200);
}

export const spinner = (text) => h('div', { class: 'muted', style: 'padding:24px;text-align:center' }, h('span', { class: 'spin' }), ' ', text || 'Loading…');

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export const fmtDate = (s) => { if (!s) return ''; const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
