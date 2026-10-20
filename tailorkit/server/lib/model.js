// Validation for client-supplied resume JSON. The editor sends the whole model back,
// so every field is clamped and typed before it is stored or rendered.

import { randomUUID } from 'node:crypto';

const MAX = { short: 200, text: 1500, items: 60, bullets: 40, skills: 80, sections: 20, headerLines: 8 };
const KINDS = new Set(['summary', 'experience', 'education', 'skills', 'projects', 'list']);
const str = (v, n = MAX.short) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n) : '');
const uid = (v) => (typeof v === 'string' && /^[\w-]{1,16}$/.test(v) ? v : randomUUID().slice(0, 8));

export function sanitizeResume(input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Resume data is missing.');
  const st = input.structure || {};
  return {
    header: {
      name: str(input.header?.name),
      lines: (Array.isArray(input.header?.lines) ? input.header.lines : []).slice(0, MAX.headerLines).map((l) => str(l)).filter(Boolean),
    },
    sections: (Array.isArray(input.sections) ? input.sections : []).slice(0, MAX.sections).map((s) => {
      const kind = KINDS.has(s.kind) ? s.kind : 'list';
      return {
        id: uid(s.id), heading: str(s.heading, 60), kind,
        items: (Array.isArray(s.items) ? s.items : []).slice(0, MAX.items).map((it) => {
          if (kind === 'skills') return { id: uid(it.id), label: str(it.label, 60), skills: (Array.isArray(it.skills) ? it.skills : []).slice(0, MAX.skills).map((x) => str(x, 60)).filter(Boolean) };
          if (kind === 'summary') return { id: uid(it.id), text: str(it.text, MAX.text) };
          return {
            id: uid(it.id), title: str(it.title), subtitle: str(it.subtitle), date: str(it.date, 60), location: str(it.location, 100),
            bullets: (Array.isArray(it.bullets) ? it.bullets : []).slice(0, MAX.bullets).map((b) => ({ id: uid(b?.id), text: str(b?.text, MAX.text) })).filter((b) => b.text.trim()),
          };
        }),
      };
    }),
    structure: {
      headingCase: st.headingCase === 'upper' ? 'upper' : 'title',
      bulletChar: typeof st.bulletChar === 'string' && st.bulletChar.length <= 2 ? st.bulletChar : '•',
      headerAlign: st.headerAlign === 'left' ? 'left' : 'center',
      sectionOrder: (Array.isArray(st.sectionOrder) ? st.sectionOrder : []).slice(0, MAX.sections).map((x) => str(x, 60)),
      dateAlign: 'right', font: 'sans',
    },
  };
}

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}
