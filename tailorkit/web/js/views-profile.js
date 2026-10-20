import { h, toast, spinner, clear, append } from './dom.js';
import { api, apiText } from './api.js';
import { resumeEditor } from './editor.js';

const EXT_STEPS = () => h('ol', { class: 'steps' },
  h('li', null, h('div', null, 'Open ', h('code', null, 'chrome://extensions'), ' and switch on ', h('strong', null, 'Developer mode'), '.')),
  h('li', null, h('div', null, 'Click ', h('strong', null, 'Load unpacked'), ' and choose the ', h('code', null, 'tailorkit/extension'), ' folder.')),
  h('li', null, h('div', null, 'Open the extension, sign in with this same account, then click ', h('strong', null, 'Capture this job'), ' on any job page.')));
export { EXT_STEPS };

function dropzone(onFile) {
  const input = h('input', { type: 'file', accept: '.pdf,.docx,.txt', hidden: true, onchange: () => input.files[0] && onFile(input.files[0]) });
  const zone = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': 'Upload your resume',
    onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); } },
    h('div', { style: 'font-size:30px' }, '📄'), h('strong', null, 'Drop your resume here, or click to choose'), h('div', { class: 'muted small' }, 'PDF, DOCX or TXT, up to 5 MB'), input);
  return zone;
}

async function upload(file) {
  const form = new FormData(); form.append('file', file);
  return api('/api/profile/resume', { method: 'POST', form });
}

// Step shown right after upload: does the rebuilt resume look like yours?
function confirmStep({ warnings, originalText, resume }, onContinue, onEdit) {
  const frame = h('iframe', { title: 'Rebuilt resume', sandbox: '' });
  apiText('/api/profile/html').then((t) => { frame.srcdoc = t; }).catch(() => {});
  const sections = resume.sections.map((s) => `${s.heading} (${s.items.length})`).join(' · ');
  return h('div', { class: 'stack' },
    h('div', null, h('h1', null, 'Does this look like your resume?'), h('p', { class: 'muted' }, 'We keep your section order and headings. Check that nothing was lost or merged. You can fix anything in the editor.')),
    warnings.length ? h('div', { class: 'notice' }, h('strong', null, 'Check these: '), warnings.join(' ')) : h('div', { class: 'info' }, `Sections found: ${sections}`),
    h('div', { class: 'compare' },
      h('div', { class: 'card' }, h('h3', null, 'What we read from your file'), h('pre', { class: 'jd' }, originalText)),
      h('div', { class: 'card' }, h('h3', null, 'How we’ll rebuild it'), frame)),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: onContinue }, 'Looks right, continue'), h('button', { class: 'btn', onclick: onEdit }, 'Fix it in the editor')));
}

export function welcomeView(me, go) {
  const host = h('div', { class: 'stack' });
  const showUpload = () => {
    clear(host);
    append(host, h('div', null, h('h1', null, 'Let’s set up your resume'), h('p', { class: 'muted' }, 'Upload the resume you already use. We learn its structure, so every tailored version looks like yours.')),
      h('div', { class: 'card' }, dropzone(async (f) => {
        clear(host); host.append(spinner('Reading your resume…'));
        try {
          const r = await upload(f);
          clear(host); host.append(confirmStep(r, () => { me.hasResume = true; go('#/tracking'); }, () => { me.hasResume = true; go('#/profile/resume'); }));
        } catch (e) { toast(e.message, true); showUpload(); }
      })),
      h('div', { class: 'card' }, h('h2', null, 'Then install the Chrome extension'), EXT_STEPS()));
  };
  showUpload();
  return host;
}

export async function profileView(me, go) {
  const { profile } = await api('/api/profile');
  if (!profile) return welcomeView(me, go);
  const host = h('div', { class: 'stack' });
  const f = profile.facts || {};
  const fields = {};
  const field = (key, label, ph, type = 'text') => h('label', { class: 'field' }, label, (fields[key] = h('input', { type, value: f[key] ?? '', placeholder: ph || '' })));
  const confirmed = [...profile.confirmedSkills];
  const chips = h('div', { class: 'reqs' });
  const drawChips = () => { clear(chips); confirmed.length ? confirmed.forEach((s) => chips.append(h('span', { class: 'chip good' }, s, ' ', h('button', { class: 'btn sm ghost', style: 'padding:0 4px', 'aria-label': `Remove ${s}`, onclick: () => { confirmed.splice(confirmed.indexOf(s), 1); drawChips(); } }, '✕')))) : chips.append(h('span', { class: 'muted small' }, 'None yet. When a job asks for a skill you have but your resume lacks, confirm it on the job page.')); };
  drawChips();

  const save = async () => {
    const facts = {}; for (const [k, el] of Object.entries(fields)) facts[k] = el.value.trim();
    try { await api('/api/profile', { method: 'PUT', body: { facts, confirmedSkills: confirmed } }); toast('Profile saved'); } catch (e) { toast(e.message, true); }
  };

  const reupload = dropzone(async (file) => {
    clear(host); host.append(spinner('Reading your resume…'));
    try { const r = await upload(file); clear(host); host.append(confirmStep(r, () => go('#/tracking'), () => go('#/profile/resume'))); }
    catch (e) { toast(e.message, true); location.reload(); }
  });

  append(host,
    h('div', { class: 'row between' }, h('div', null, h('h1', null, 'Profile'), h('p', { class: 'muted' }, 'This is the source of truth for every tailored resume.')),
      h('button', { class: 'btn primary', onclick: () => go('#/profile/resume') }, 'Edit master resume')),
    profile.warnings.length > 0 && h('div', { class: 'notice' }, profile.warnings.join(' ')),
    h('div', { class: 'card' }, h('h2', null, 'Facts for screening calls'), h('p', { class: 'muted small' }, 'Used to prepare your screening-call answers. We never guess these.'),
      h('div', { class: 'grid3' }, field('noticePeriod', 'Notice period', 'e.g. 30 days'), field('currentCtc', 'Current CTC', 'e.g. 12 LPA'), field('expectedCtc', 'Expected CTC', 'e.g. 16 LPA'),
        field('location', 'Current location', 'e.g. Bengaluru'), field('relocation', 'Open to relocate?', 'e.g. Yes, to Pune/Hyderabad'), field('yearsExperience', 'Years of experience', profile.yearsEstimate != null ? `Estimated ${profile.yearsEstimate} from your dates` : '', 'number')),
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: save }, 'Save'))),
    h('div', { class: 'card' }, h('h2', null, 'Skills you confirmed'), chips, h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: save }, 'Save changes'))),
    h('div', { class: 'card' }, h('h2', null, 'Replace your resume'), h('p', { class: 'muted small' }, `Current file type: ${profile.format || 'unknown'}. Uploading a new file replaces the master resume (your tailored versions stay).`), reupload));
  return host;
}

export async function masterEditorView(go) {
  const { profile } = await api('/api/profile');
  if (!profile) { go('#/welcome'); return h('div'); }
  const me = await api('/api/me');
  const ed = resumeEditor({
    resume: profile.resume, aiEnabled: me.aiEnabled, title: 'Master resume',
    onSave: async (resume) => { await api('/api/profile', { method: 'PUT', body: { resume } }); },
  });
  return h('div', { class: 'stack' }, h('div', null, h('h1', null, 'Edit master resume'), h('p', { class: 'muted' }, 'Changes here apply to resumes tailored from now on. Existing tailored versions are not changed.')), ed.el);
}
