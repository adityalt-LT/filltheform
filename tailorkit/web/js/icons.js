const NS = 'http://www.w3.org/2000/svg';
const P = {
  board: [['rect', { x: 3, y: 3, width: 7, height: 18, rx: 2 }], ['rect', { x: 14, y: 3, width: 7, height: 10, rx: 2 }]],
  file: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5M9 13h6M9 17h6' }]],
  target: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 5 }], ['circle', { cx: 12, cy: 12, r: 1 }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  settings: [['path', { d: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0' }], ['circle', { cx: 16, cy: 6, r: 2 }], ['circle', { cx: 8, cy: 12, r: 2 }], ['circle', { cx: 18, cy: 18, r: 2 }]],
  sparkle: [['path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' }], ['path', { d: 'M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z' }]],
  send: [['path', { d: 'M12 19V5M5 12l7-7 7 7' }]],
  check: [['path', { d: 'M20 6L9 17l-5-5' }]],
  copy: [['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  external: [['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3' }]],
  refresh: [['path', { d: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5' }]],
  upload: [['path', { d: 'M12 16V4M7 9l5-5 5 5M4 20h16' }]],
  chat: [['path', { d: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z' }]],
  building: [['path', { d: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4' }]],
  list: [['path', { d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' }]],
  menu: [['path', { d: 'M4 6h16M4 12h16M4 18h16' }]],
};
export function icon(name, size) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.style.width = svg.style.height = `${size}px`; }
  for (const [tag, attrs] of P[name] || []) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}
