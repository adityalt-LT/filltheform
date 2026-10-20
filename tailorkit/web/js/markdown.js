// Minimal, safe Markdown -> DOM for AI answers (paragraphs, lists, **bold**, *italic*, `code`). Never uses innerHTML.
import { h } from './dom.js';

function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(h('strong', null, t.slice(2, -2)));
    else if (t.startsWith('`')) out.push(h('code', null, t.slice(1, -1)));
    else out.push(h('em', null, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(src) {
  const root = h('div');
  const lines = String(src).replace(/\r/g, '').split('\n');
  let list = null; let para = [];
  const flushPara = () => { if (para.length) { root.append(h('p', null, inline(para.join(' ')))); para = []; } };
  const flushList = () => { list = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/); const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag); root.append(list); }
      list.append(h('li', null, inline((ul || ol)[1])));
    } else if (!line.trim()) { flushPara(); flushList(); }
    else if (/^#{1,4}\s/.test(line)) { flushPara(); flushList(); root.append(h('p', null, h('strong', null, line.replace(/^#{1,4}\s+/, '')))); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara();
  return root;
}
