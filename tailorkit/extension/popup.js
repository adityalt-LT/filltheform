// Capture runs only when the user clicks the button; the page text is read from the active tab
// (activeTab permission) and sent to the user's own Tailor & Apply server.
'use strict';

const DEFAULT_SERVER = 'http://localhost:3000';
const root = document.getElementById('root');
const store = {
  get: () => chrome.storage.local.get({ server: DEFAULT_SERVER, token: '', email: '' }),
  set: (v) => chrome.storage.local.set(v),
};

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== false && kid != null) e.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return e;
}
const show = (...nodes) => { root.replaceChildren(el('div', { class: 'wrap' }, el('div', { class: 'brand' }, 'Tailor & Apply'), ...nodes)); };

async function callApi(path, { method = 'GET', body } = {}) {
  const { server, token } = await store.get();
  let res;
  try {
    res = await fetch(server.replace(/\/$/, '') + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error(`Can't reach ${server}. Is the Tailor & Apply server running?`), { network: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

async function ensureServerPermission(server) {
  const origin = new URL(server).origin + '/*';
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

// --- runs inside the page. Must be self-contained.
function extractPage() {
  const clean = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const q = (sel) => { for (const s of sel) { const n = document.querySelector(s); if (n && n.innerText && n.innerText.trim().length > 20) return n; } return null; };
  const text1 = (sel) => { const n = q(sel); return n ? clean(n.innerText).split('\n')[0].slice(0, 160) : ''; };
  const host = location.hostname;
  const out = { url: location.href.split('#')[0], title: '', company: '', location: '', text: '', source: host.replace(/^www\./, '') };

  const sel = window.getSelection ? window.getSelection().toString() : '';
  // Structured data many career pages publish for search engines. Single-page sites (LinkedIn, Workday...) leave the
  // PREVIOUS job's data in the page when you click another job, so only trust it when it matches what is on screen.
  const visible = (document.body.innerText || '').toLowerCase();
  const onScreen = (t) => !!t && visible.includes(String(t).toLowerCase().replace(/\s+/g, ' ').trim());
  let ld = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const list = Array.isArray(data) ? data : data['@graph'] || [data];
      const jp = list.find((x) => x && (x['@type'] === 'JobPosting' || (Array.isArray(x['@type']) && x['@type'].includes('JobPosting'))) && onScreen(x.title));
      if (jp) { ld = jp; break; }
    } catch { /* ignore invalid JSON-LD */ }
  }
  if (ld) {
    // innerText on a detached node drops line breaks, which glues requirements together. Add them back before reading text.
    const html = String(ld.description || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section|table)>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    out.title = String(ld.title || '');
    out.company = String((ld.hiringOrganization && ld.hiringOrganization.name) || '');
    const addr = ld.jobLocation && (Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation);
    out.location = addr && addr.address ? [addr.address.addressLocality, addr.address.addressRegion].filter(Boolean).join(', ') : '';
    out.jsonld = clean(parsed.body.textContent);
  }

  // A stable id for "this exact posting" so two different jobs on the same page address are never confused.
  const q2 = new URLSearchParams(location.search);
  out.externalId = q2.get('currentJobId') || q2.get('jobId') || q2.get('job_id') || q2.get('gh_jid') || q2.get('jid') || q2.get('reqId')
    || (location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/) || [])[1] || (location.pathname.match(/-(\d{6,})\/?$/) || [])[1] || '';

  if (/linkedin\.com$/.test(host)) {
    if (/\/jobs\//.test(location.pathname)) out.title = out.title || text1(['.job-details-jobs-unified-top-card__job-title h1', '.jobs-unified-top-card__job-title', 'h1']);
    out.company = out.company || text1(['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name']);
    const body = q(['.jobs-description__content', '.jobs-box__html-content', '#job-details', '.feed-shared-update-v2__description', '.update-components-text', 'main']);
    out.text = body ? clean(body.innerText) : '';
  } else if (/naukri\.com$/.test(host)) {
    out.title = out.title || text1(['h1']);
    const body = q(['.styles_job-desc-container__txpYf', '[class*="job-desc"]', '[class*="JDC"]', 'main']);
    out.text = body ? clean(body.innerText) : '';
  }
  if (!out.text) {
    const body = q(['main', '[role="main"]', 'article']);
    out.text = clean((body || document.body).innerText);
  }
  if (out.jsonld && out.jsonld.length > 200) out.text = `${out.title}\n${out.company}\n${out.location}\n\n${out.jsonld}`;
  if (sel && sel.trim().length >= 80) { out.text = clean(sel); out.selection = true; }
  // Titles from structured data are trusted. Everything else is only a CANDIDATE: the server keeps one only if it
  // matches the captured text (page scraping can grab a card from a job list, a hidden heading, or site chrome).
  out.titleTrusted = !!ld && !!out.title;
  const cands = [];
  if (!out.titleTrusted && out.title) cands.push(out.title);
  for (const el of [...document.querySelectorAll('h1')].slice(0, 6)) cands.push(clean(el.innerText).split('\n')[0]);
  const og = document.querySelector('meta[property="og:title"]'); if (og) cands.push(og.content);
  for (const part of clean(document.title).split(/\s+[|\u2013\u2014-]\s+/)) cands.push(part);
  out.titleCandidates = [...new Set(cands.map((c) => String(c || '').trim()).filter((c) => c.length >= 3 && c.length <= 120))].slice(0, 12);
  out.title = out.titleTrusted ? out.title : '';
  out.text = out.text.slice(0, 40000);
  delete out.jsonld;
  return out;
}

async function capture(btn) {
  btn.disabled = true; btn.textContent = 'Reading this page…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) throw new Error('Open a job page or LinkedIn post first, then click the extension.');
    const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    if (!page || page.text.length < 80) throw new Error('Not enough text found. Select the job description on the page and try again.');
    btn.textContent = 'Matching to your resume…';
    const res = await callApi('/api/capture', { method: 'POST', body: { url: page.url, externalId: page.externalId, source: page.source, text: page.text, hints: { title: page.title, titleTrusted: page.titleTrusted && !page.selection, titleCandidates: page.titleCandidates, company: page.company, location: page.location } } });
    await showResult(res);
  } catch (e) {
    if (e.status === 401) return loginScreen('Please sign in again.');
    if (e.status === 409) return needResume(e.message);
    await home(e.message);
  }
}

async function showResult({ job, resumeId, quotaExceeded, quota, existing }) {
  const m = job.match || {};
  const color = m.band === 'strong' ? 'var(--good)' : m.band === 'partial' ? '#d9921a' : 'var(--bad)';
  const { server } = await store.get();
  const base = server.replace(/\/$/, '');
  const must = m.missingMust || []; const nice = m.missingNice || [];
  show(
    el('h1', { style: 'margin-top:10px' }, existing ? 'Updated in your tracker' : 'Saved to your tracker'),
    el('div', {}, el('div', { class: 'title' }, job.title || 'Untitled role'), el('div', { class: 'muted small' }, [job.company, job.location].filter(Boolean).join(' · ') || 'Company not detected'), el('div', { class: 'small muted', style: 'margin-top:2px' }, 'Wrong title or company? Edit it in the dashboard.')),
    el('div', { class: 'score' }, el('div', { class: 'ring', style: `--p:${m.score ?? 0};--c:${color}` }, el('i', {}, m.score == null ? '–' : String(m.score))),
      el('div', {}, el('strong', {}, { strong: 'Strong match', partial: 'Partial match', weak: 'Weak match' }[m.band] || 'No clear requirements'), el('div', { class: 'muted small' }, 'Match vs this job description'))),
    must.length > 0 && el('div', {}, el('div', { class: 'small muted' }, 'Required, missing from your resume'), el('div', { class: 'chips' }, must.slice(0, 6).map((s) => el('span', { class: 'chip' }, s)))),
    nice.length > 0 && el('div', { style: 'margin-top:8px' }, el('div', { class: 'small muted' }, 'Nice to have, missing'), el('div', { class: 'chips' }, nice.slice(0, 5).map((s) => el('span', { class: 'chip nice' }, s)))),
    !must.length && !nice.length && m.score != null && el('div', { class: 'chips' }, el('span', { class: 'chip ok' }, 'Resume covers all requirements')),
    quotaExceeded && el('div', { class: 'note' }, `You've used all ${quota.limit} free tailored resumes this month. The job is saved and scored.`),
    resumeId && el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Preparing PDF…'; try { await downloadPdf(resumeId); e.target.textContent = 'Downloaded ✓'; } catch (x) { e.target.textContent = 'Download tailored PDF'; e.target.disabled = false; alert(x.message); } } }, 'Download tailored PDF'),
    el('button', { class: 'btn', onclick: () => chrome.tabs.create({ url: `${base}/#/job/${job.id}` }) }, must.length ? 'Review gaps & edit in dashboard' : 'Open in dashboard'),
    quota && quota.limit != null && el('div', { class: 'small muted', style: 'margin-top:8px' }, `${quota.used}/${quota.limit} free tailored resumes used this month`));
}

async function downloadPdf(id) {
  const { server, token } = await store.get();
  const res = await fetch(`${server.replace(/\/$/, '')}/api/resumes/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not generate the PDF.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'resume.pdf';
  const url = URL.createObjectURL(await res.blob());
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function needResume(msg) {
  const { server } = await store.get();
  show(el('h1', { style: 'margin-top:10px' }, 'One more step'), el('p', {}, msg), el('button', { class: 'btn primary', onclick: () => chrome.tabs.create({ url: server.replace(/\/$/, '') + '/#/welcome' }) }, 'Upload your resume'));
}

async function home(errorMsg) {
  const { email } = await store.get();
  const btn = el('button', { class: 'btn primary', onclick: () => capture(btn) }, 'Capture this job');
  show(
    el('p', { class: 'muted', style: 'margin:8px 0' }, 'Open a job page or a LinkedIn hiring post, then capture it. Tip: select just the job text first if the page is cluttered.'),
    errorMsg && el('div', { class: 'err' }, errorMsg),
    btn,
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn link', style: 'width:auto', onclick: async () => chrome.tabs.create({ url: (await store.get()).server.replace(/\/$/, '') + '/#/tracking' }) }, 'Open dashboard'),
      el('button', { class: 'btn link', style: 'width:auto', onclick: () => loginScreen('', true) }, email ? `${email} · switch` : 'Sign in')));
}

async function loginScreen(msg, keep) {
  const s = await store.get();
  const email = el('input', { type: 'email', autocomplete: 'email', value: s.email });
  const pass = el('input', { type: 'password', autocomplete: 'current-password' });
  const server = el('input', { type: 'text', value: s.server });
  const err = el('div', { class: 'err', style: msg ? '' : 'display:none' }, msg || '');
  const btn = el('button', { class: 'btn primary', type: 'submit' }, 'Sign in');
  const form = el('form', { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; err.style.display = 'none';
    try {
      const url = server.value.trim().replace(/\/$/, '');
      new URL(url);
      if (!(await ensureServerPermission(url))) throw new Error('Permission to reach that server was not granted.');
      await store.set({ server: url });
      const r = await callApi('/api/auth/login', { method: 'POST', body: { email: email.value, password: pass.value } });
      await store.set({ token: r.token, email: r.user.email });
      await home();
    } catch (x) { err.textContent = x.message; err.style.display = ''; btn.disabled = false; }
  } },
    el('label', {}, 'Email (same as the dashboard)', email), el('label', {}, 'Password', pass), el('label', {}, 'Server', server),
    err, btn,
    el('button', { class: 'btn link', type: 'button', onclick: async () => chrome.tabs.create({ url: server.value.trim().replace(/\/$/, '') + '/' }) }, 'No account yet? Sign up on the dashboard'));
  show(el('h1', { style: 'margin-top:10px' }, 'Sign in'), form);
}

(async () => {
  const { token } = await store.get();
  if (!token) return loginScreen();
  home();
})();
