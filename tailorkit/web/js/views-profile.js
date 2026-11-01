import { h, toast, clear, append, spinner } from './dom.js';
import { api, apiText } from './api.js';
import { icon } from './icons.js';
import { resumeEditor } from './editor.js';
import { pageHead, stepper, nextStep } from './ui.js';

export const EXT_STEPS = () => h('ol', { class: 'steps' },
  h('li', null, h('div', null, 'Open ', h('code', null, 'chrome://extensions'), ' and switch on ', h('strong', null, 'Developer mode'), '.')),
  h('li', null, h('div', null, 'Click ', h('strong', null, 'Load unpacked'), ' and choose the ', h('code', null, 'tailorkit/extension'), ' folder.')),
  h('li', null, h('div', null, 'Open the extension, sign in with this account, then click ', h('strong', null, 'Capture this job'), ' on any job page.')));

function dropzone(onFile) {
  const input = h('input', { type: 'file', accept: '.pdf,.docx,.txt', hidden: true, onchange: () => input.files[0] && onFile(input.files[0]) });
  const zone = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': 'Upload your resume',
    onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); } },
    icon('upload'), h('strong', null, 'Drop your resume here'), h('div', { class: 'muted' }, 'or click to choose a file'), h('div', { class: 'faint small', style: 'margin-top:10px' }, 'PDF, DOCX or TXT'), input);
  return zone;
}

const upload = (file) => { const form = new FormData(); form.append('file', file); return api('/api/profile/resume', { method: 'POST', form }); };
const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Everything here is read from the resume; the candidate is not asked to type any of it.
function profileSummary(d) {
  const row = (k, v) => v ? [h('dt', null, k), h('dd', null, v)] : null;
  return h('div', { class: 'card profile-card' },
    h('div', { class: 'row', style: 'gap:16px;flex-wrap:nowrap' }, h('div', { class: 'avatar lg' }, initials(d.name)),
      h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, d.name || 'Your name'), h('div', { class: 'muted' }, d.headline || ''))),
    h('dl', { class: 'kv' },
      row('Experience', d.yearsExperience ? `About ${d.yearsExperience} years` : null), row('Location', d.location), row('Email', d.email), row('Phone', d.phone),
      row('Links', d.links?.length ? d.links.join('  ·  ') : null), row('Education', d.education)),
    d.skills?.length > 0 && h('div', { style: 'margin-top:14px' }, h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'Skills we found'), h('div', { class: 'reqs' }, d.skills.map((s) => h('span', { class: 'chip' }, s)))));
}
export { profileSummary };

function compareDetails({ originalText }) {
  const frame = h('iframe', { title: 'Rebuilt resume', sandbox: '' });
  apiText('/api/profile/html').then((t) => { frame.srcdoc = t; }).catch(() => {});
  return h('details', { class: 'card soft' }, h('summary', { class: 'row between' }, h('span', null, h('strong', null, 'See how we read it')), icon('list')),
    
    h('div', { class: 'compare' }, h('div', null, h('h3', null, 'What we read'), h('pre', { class: 'jd' }, originalText)), h('div', null, h('h3', null, 'Rebuilt'), frame)));
}

export async function welcomeView(me, go) {
  const host = h('div', { class: 'welcome' });
  const steps = ['Reading your resume', 'Finding your skills', 'Building your profile'];
  const show = (...kids) => { clear(host); append(host, ...kids); };

  const showUpload = () => show(
    stepper(0),
    h('h1', null, 'Upload your resume'),
    h('p', { class: 'sub' }, 'We build your profile from it.'),
    dropzone(async (file) => {
      const lines = steps.map((t) => h('div', { class: 'stepline' }, h('span', { class: 'spin' }), t));
      show(stepper(0), h('h1', null, 'Reading your resume…'), h('div', { class: 'progress' }, lines));
      try {
        const r = await upload(file);
        for (const l of lines) { l.classList.add('done'); l.replaceChild(icon('check'), l.firstChild); await new Promise((res) => setTimeout(res, 180)); }
        showReview(r);
      } catch (e) { toast(e.message, true); showUpload(); }
    }));

  const showReview = (r) => show(
    stepper(1),
    h('h1', null, 'Does this look right?'),
    h('p', { class: 'sub' }, 'You can fix anything later.'),
    r.warnings.length > 0 && h('div', { class: 'notice', style: 'text-align:left;margin-bottom:14px' }, r.warnings.join(' ')),
    profileSummary(r.derived),
    h('div', { style: 'margin:14px 0;text-align:left' }, compareDetails(r)),
    h('div', { class: 'row', style: 'justify-content:center' },
      h('button', { class: 'btn primary lg', onclick: () => { me.hasResume = true; go('#/tracking'); } }, 'Looks good'),
      h('button', { class: 'btn lg', onclick: () => { me.hasResume = true; go('#/profile/resume'); } }, 'Fix details')));

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
  const drawChips = () => { clear(chips); confirmed.length ? confirmed.forEach((s) => chips.append(h('span', { class: 'chip good' }, s, h('button', { class: 'btn sm ghost', style: 'padding:0 4px', 'aria-label': `Remove ${s}`, onclick: () => { confirmed.splice(confirmed.indexOf(s), 1); drawChips(); } }, '✕')))) : chips.append(h('span', { class: 'muted small' }, 'None yet. When a job asks for a skill you have but your resume lacks, tap “I have this” on the job page.')); };
  drawChips();
  const save = async () => {
    const facts = {}; for (const [k, el] of Object.entries(fields)) facts[k] = el.value.trim();
    try { await api('/api/profile', { method: 'PUT', body: { facts, confirmedSkills: confirmed } }); toast('Saved'); } catch (e) { toast(e.message, true); }
  };
  const reupload = dropzone(async (file) => {
    clear(host); host.append(spinner('Reading your resume…'));
    try { const r = await upload(file); clear(host); host.append(h('div', { class: 'welcome', style: 'margin-top:0' }, h('h1', null, 'Does this look right?'), profileSummary(r.derived), h('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, h('button', { class: 'btn primary lg', onclick: () => go('#/tracking') }, 'Looks good')))); }
    catch (e) { toast(e.message, true); location.reload(); }
  });
  append(host,
    pageHead('Profile'),
    nextStep({ title: 'Is everything correct?', sub: 'Every tailored resume starts from this one.', actions: [h('button', { class: 'btn primary', onclick: () => go('#/profile/resume') }, 'Edit resume')] }),
    profile.warnings.length > 0 && h('div', { class: 'notice' }, profile.warnings.join(' ')),
    profileSummary(profile.derived),
    h('div', { class: 'card' }, h('h2', null, 'Skills you’ve confirmed'), chips, h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn sm', onclick: save }, 'Save changes'))),
    h('details', { class: 'card' }, h('summary', { class: 'row between' }, h('strong', null, 'Optional details'), h('span', { class: 'muted small' }, 'Used in interview prep')),
      h('div', { class: 'grid3' }, field('noticePeriod', 'Notice period', 'e.g. 30 days'), field('currentCtc', 'Current CTC', 'e.g. 12 LPA'), field('expectedCtc', 'Expected CTC', 'e.g. 16 LPA'),
        field('location', 'Location', profile.derived.location || ''), field('relocation', 'Open to relocate?', ''), field('yearsExperience', 'Years of experience', profile.derived.yearsExperience ? `Detected ${profile.derived.yearsExperience}` : '', 'number')),
      h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn primary sm', onclick: save }, 'Save'))),
    h('div', { class: 'card' }, h('h2', null, 'Replace your resume'), h('p', { class: 'muted small' }, 'Your tailored versions stay.'), reupload));
  return host;
}

export async function masterEditorView(go) {
  const { profile } = await api('/api/profile');
  if (!profile) { go('#/welcome'); return h('div'); }
  const me = await api('/api/me');
  const ed = resumeEditor({ resume: profile.resume, aiEnabled: me.aiEnabled, title: 'Master resume', onSave: async (resume) => { await api('/api/profile', { method: 'PUT', body: { resume } }); } });
  return h('div', null, pageHead('Edit resume', 'Applies to new tailored resumes.'), ed.el);
}
