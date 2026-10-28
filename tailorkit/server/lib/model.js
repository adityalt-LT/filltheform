// Validation for client-supplied resume JSON. The editor sends the whole model back,
// so every field is clamped and typed before it is stored or rendered.

const randomUUID = () => globalThis.crypto.randomUUID();

const MAX = { short: 200, text: 1800, items: 60, bullets: 40, skills: 80, sections: 20, headerLines: 8 };
const KINDS = new Set(['summary', 'experience', 'education', 'skills', 'projects', 'list']);
const STYLES = new Set(['bullet', 'sub', 'text']);
const FAMILIES = new Set(['carlito', 'arimo', 'tinos']);
const str = (v, n = MAX.short) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n) : '');
const uid = (v) => (typeof v === 'string' && /^[\w-]{1,16}$/.test(v) ? v : randomUUID().slice(0, 8));
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const style = (v) => (STYLES.has(v) ? v : 'bullet');

export function sanitizeResume(input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Resume data is missing.');
  const st = input.structure || {};
  const mg = st.margins || {};
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
          if (kind === 'skills') {
            const o = { id: uid(it.id), label: str(it.label, 60), skills: (Array.isArray(it.skills) ? it.skills : []).slice(0, MAX.skills).map((x) => str(x, 60)).filter(Boolean) };
            if (typeof it.text === 'string') { o.text = str(it.text, MAX.text); o.style = style(it.style); o.indent = num(it.indent, 0, 80, 0); }
            return o;
          }
          if (kind === 'summary') return { id: uid(it.id), text: str(it.text, MAX.text) };
          return {
            id: uid(it.id), title: str(it.title), subtitle: str(it.subtitle), date: str(it.date, 60), location: str(it.location, 100),
            sep: [' | ', ' — ', ' – ', ' - '].includes(it.sep) ? it.sep : ' | ', dateBrackets: it.dateBrackets === true,
            bullets: (Array.isArray(it.bullets) ? it.bullets : []).slice(0, MAX.bullets).map((b) => ({ id: uid(b?.id), text: str(b?.text, MAX.text), style: style(b?.style), indent: num(b?.indent, 0, 80, 0) })).filter((b) => b.text.trim()),
          };
        }),
      };
    }),
    structure: {
      headingCase: st.headingCase === 'upper' ? 'upper' : 'title',
      bulletChar: typeof st.bulletChar === 'string' && st.bulletChar.length <= 2 && st.bulletChar.length > 0 ? st.bulletChar : '•',
      headerAlign: st.headerAlign === 'left' ? 'left' : 'center',
      headingAlign: st.headingAlign === 'center' ? 'center' : 'left',
      headingStyle: st.headingStyle === 'bar' ? 'bar' : 'rule',
      sectionOrder: (Array.isArray(st.sectionOrder) ? st.sectionOrder : []).slice(0, MAX.sections).map((x) => str(x, 60)),
      dateStyle: st.dateStyle === 'inline' ? 'inline' : 'right', dateBrackets: st.dateBrackets === true,
      bulletHang: num(st.bulletHang, 0, 40, 0), pageSize: st.pageSize === 'Letter' ? 'Letter' : 'A4',
      margins: { top: num(mg.top, 5, 30, 14), right: num(mg.right, 5, 30, 15), bottom: num(mg.bottom, 5, 30, 14), left: num(mg.left, 5, 30, 15) },
      fontFamily: FAMILIES.has(st.fontFamily) ? st.fontFamily : 'arimo', fontName: str(st.fontName, 60),
      fontSize: num(st.fontSize, 7, 13, 10), lineHeight: num(st.lineHeight, 1, 1.8, 1.38), nameSize: num(st.nameSize, 12, 30, 19),
    },
  };
}

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}
