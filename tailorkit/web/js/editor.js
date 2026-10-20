// Resume editor: edit text, remove/reorder bullets, accept AI rewrites, live preview.
// Used for tailored resumes and for the master resume on the Profile page.
import { h, append, clear, debounce, toast } from './dom.js';
import { apiText } from './api.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (x) => JSON.parse(JSON.stringify(x));

export function resumeEditor({ resume, suggestions = [], onSave, onDownload, aiEnabled = false, title = '' }) {
  let state = clone(resume);
  let sugs = clone(suggestions);
  const history = [];
  let dirty = false;

  const root = h('div');
  const formHost = h('div');
  const sugHost = h('div');
  const frame = h('iframe', { title: 'Resume preview', sandbox: '' });
  const status = h('span', { class: 'muted small' }, 'Saved');
  const undoBtn = h('button', { class: 'btn sm ghost', disabled: true, onclick: undo }, '↶ Undo');

  const refreshPreview = debounce(async () => {
    try { frame.srcdoc = await apiText('/api/preview', { method: 'POST', body: { resume: state } }); } catch { /* keep the last preview */ }
  }, 450);

  function touch(structural) {
    dirty = true; status.textContent = 'Unsaved changes';
    if (structural) { undoBtn.disabled = false; }
    refreshPreview();
  }
  function snapshot() { history.push(clone(state)); if (history.length > 40) history.shift(); undoBtn.disabled = false; }
  function undo() { const prev = history.pop(); if (!prev) return; state = prev; undoBtn.disabled = !history.length; renderForm(); renderSugs(); touch(false); }

  const input = (value, onInput, attrs = {}) => h('input', { type: 'text', value, oninput: (e) => { onInput(e.target.value); touch(false); }, ...attrs });
  function area(value, onInput, attrs = {}) {
    const t = h('textarea', { rows: 2, oninput: (e) => { onInput(e.target.value); touch(false); grow(t); }, ...attrs });
    t.value = value; queueMicrotask(() => grow(t));
    return t;
  }
  const grow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 260)}px`; };
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; snapshot(); [arr[i], arr[j]] = [arr[j], arr[i]]; renderForm(); touch(true); };
  const remove = (arr, i) => { snapshot(); arr.splice(i, 1); renderForm(); touch(true); };

  function renderForm() {
    clear(formHost);
    append(formHost, h('div', { class: 'sec' },
      h('label', { class: 'field' }, 'Name', input(state.header.name, (v) => { state.header.name = v; })),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Contact lines (one per line)',
        area(state.header.lines.join('\n'), (v) => { state.header.lines = v.split('\n').map((x) => x.trim()).filter(Boolean); }))));

    state.sections.forEach((sec, si) => {
      const box = h('div', { class: 'sec' });
      box.append(h('div', { class: 'sh' },
        input(sec.heading, (v) => { sec.heading = v; }, { 'aria-label': 'Section heading' }),
        h('button', { class: 'btn sm ghost', title: 'Move section up', 'aria-label': 'Move section up', onclick: () => move(state.sections, si, -1) }, '↑'),
        h('button', { class: 'btn sm ghost', title: 'Move section down', 'aria-label': 'Move section down', onclick: () => move(state.sections, si, 1) }, '↓'),
        h('button', { class: 'btn sm ghost danger', title: 'Remove section', 'aria-label': 'Remove section', onclick: () => { if (confirm(`Remove the "${sec.heading}" section from this resume?`)) remove(state.sections, si); } }, '✕')));

      sec.items.forEach((it, ii) => {
        if (sec.kind === 'summary') { box.append(area(it.text || '', (v) => { it.text = v; }, { 'aria-label': 'Summary' })); return; }
        if (sec.kind === 'skills') {
          box.append(h('div', { class: 'bul' },
            input(it.label || '', (v) => { it.label = v; }, { placeholder: 'Group (optional)', style: 'width:32%', 'aria-label': 'Skill group' }),
            input((it.skills || []).join(', '), (v) => { it.skills = v.split(',').map((s) => s.trim()).filter(Boolean); }, { placeholder: 'Comma-separated skills', style: 'flex:1', 'aria-label': 'Skills' }),
            h('button', { class: 'btn sm ghost danger', 'aria-label': 'Remove skill row', onclick: () => remove(sec.items, ii) }, '✕')));
          return;
        }
        const ent = h('div', { class: 'ent' });
        ent.append(h('div', { class: 'grid2' },
          h('label', { class: 'field' }, 'Title', input(it.title || '', (v) => { it.title = v; })),
          h('label', { class: 'field' }, 'Organisation / detail', input(it.subtitle || '', (v) => { it.subtitle = v; }))));
        ent.append(h('div', { class: 'row', style: 'margin-top:8px' },
          h('label', { class: 'field grow' }, 'Dates', input(it.date || '', (v) => { it.date = v; })),
          h('button', { class: 'btn sm ghost', onclick: () => move(sec.items, ii, -1), 'aria-label': 'Move entry up' }, '↑'),
          h('button', { class: 'btn sm ghost', onclick: () => move(sec.items, ii, 1), 'aria-label': 'Move entry down' }, '↓'),
          h('button', { class: 'btn sm ghost danger', onclick: () => remove(sec.items, ii), 'aria-label': 'Remove entry' }, 'Remove entry')));
        (it.bullets || []).forEach((b, bi) => {
          ent.append(h('div', { class: 'bul' },
            area(b.text, (v) => { b.text = v; }, { 'aria-label': 'Bullet' }),
            h('div', { class: 'stack', style: 'display:flex;flex-direction:column;gap:2px' },
              h('button', { class: 'btn sm ghost', onclick: () => move(it.bullets, bi, -1), 'aria-label': 'Move bullet up' }, '↑'),
              h('button', { class: 'btn sm ghost', onclick: () => move(it.bullets, bi, 1), 'aria-label': 'Move bullet down' }, '↓')),
            h('button', { class: 'btn sm ghost danger', title: 'Remove this bullet', 'aria-label': 'Remove bullet', onclick: () => remove(it.bullets, bi) }, '✕')));
        });
        ent.append(h('button', { class: 'btn sm ghost', style: 'margin-top:6px', onclick: () => { snapshot(); (it.bullets ||= []).push({ id: uid(), text: '' }); renderForm(); touch(true); } }, '+ Add bullet'));
        box.append(ent);
      });

      const addLabel = sec.kind === 'skills' ? '+ Add skill row' : sec.kind === 'summary' ? null : '+ Add entry';
      if (addLabel) box.append(h('button', { class: 'btn sm ghost', style: 'margin-top:10px', onclick: () => {
        snapshot();
        sec.items.push(sec.kind === 'skills' ? { id: uid(), label: '', skills: [] } : { id: uid(), title: '', subtitle: '', date: '', location: '', bullets: [] });
        renderForm(); touch(true);
      } }, addLabel));
      formHost.append(box);
    });
  }

  function findBullet(itemId, bulletId) {
    for (const s of state.sections) for (const it of s.items) if (it.id === itemId) return (it.bullets || []).find((b) => b.id === bulletId);
    for (const s of state.sections) for (const it of s.items) { const b = (it.bullets || []).find((x) => x.id === bulletId); if (b) return b; }
    return null;
  }

  function renderSugs() {
    clear(sugHost);
    const pending = sugs.filter((s) => s.status === 'pending');
    if (!suggestions.length && !sugs.length) {
      sugHost.append(h('p', { class: 'muted small' }, aiEnabled ? 'No rewording suggestions for this job.' : 'AI rewording suggestions are off on this server. Your bullets were reordered by relevance instead.'));
      return;
    }
    sugHost.append(h('h3', null, `Suggested rewordings (${pending.length})`));
    sugHost.append(h('p', { class: 'muted small' }, 'These reuse the job’s wording for work you already described. Numbers are never changed. Accept only what is true.'));
    for (const s of pending) {
      sugHost.append(h('div', { class: 'sug' },
        h('del', null, s.original), h('ins', null, s.proposed),
        s.reason && h('div', { class: 'muted small', style: 'margin-top:4px' }, s.reason),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn sm primary', onclick: () => {
            const b = findBullet(s.itemId, s.bulletId);
            if (!b) { toast('That bullet no longer exists.', true); s.status = 'rejected'; renderSugs(); return; }
            snapshot(); b.text = s.proposed; s.status = 'accepted'; renderForm(); renderSugs(); touch(true);
          } }, 'Accept'),
          h('button', { class: 'btn sm', onclick: () => { s.status = 'rejected'; renderSugs(); touch(false); } }, 'Reject'))));
    }
  }

  async function save() {
    status.textContent = 'Saving…';
    try { await onSave(state, sugs); dirty = false; status.textContent = 'Saved'; toast('Saved'); return true; }
    catch (e) { status.textContent = 'Not saved'; toast(e.message, true); return false; }
  }

  root.append(
    h('div', { class: 'sticky-actions row between' },
      h('div', { class: 'row' }, title && h('strong', null, title), status),
      h('div', { class: 'row' }, undoBtn,
        h('button', { class: 'btn', onclick: save }, 'Save'),
        onDownload && h('button', { class: 'btn primary', onclick: async () => { if (dirty && !(await save())) return; await onDownload(); } }, 'Download PDF'))),
    h('div', { class: 'editor' },
      h('div', null, sugHost, formHost),
      h('div', { class: 'preview' }, h('h3', null, 'Preview (what the PDF looks like)'), frame)));

  renderForm(); renderSugs(); refreshPreview();
  return { el: root, isDirty: () => dirty };
}
