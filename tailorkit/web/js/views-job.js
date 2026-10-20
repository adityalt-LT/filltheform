import { h, append, clear, toast, spinner, fmtDate, copyText } from './dom.js';
import { api, download, streamPost } from './api.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { STATUS_LABEL, scorePill, bandOf } from './views-tracking.js';

const aiBadge = () => h('span', { class: 'ai-badge' }, icon('sparkle'), 'AI');

export async function jobView(id, me, go) {
  const host = h('div');
  let job; let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'overview';
  const state = { prep: null, research: null, stale: false, createdAt: '', running: false, steps: [], error: '', loaded: false };
  const chat = { messages: [], busy: false };
  let editing = false;

  const load = async () => { ({ job } = await api(`/api/jobs/${id}`)); };
  await load();
  const body = h('div');

  const latest = () => job.resumes[0];
  const dl = (r) => download(`/api/resumes/${r.id}/pdf`, 'resume.pdf').catch((e) => toast(e.message, true));

  async function tailor() {
    try { await api(`/api/jobs/${id}/tailor`, { method: 'POST' }); toast('Tailored resume ready'); await load(); draw(); }
    catch (e) { toast(e.status === 402 ? 'You have used all free tailored resumes this month.' : e.message, true); }
  }

  // ---------- Overview
  function overview() {
    const m = job.match || {};
    const el = h('div', { class: 'stack' });
    el.append(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'gap:20px;flex-wrap:nowrap' },
        h('div', { class: `ring ${bandOf(m)}`, style: `--pct:${m.score ?? 0}`, 'aria-label': `Match score ${m.score ?? 'unknown'}` }, h('div', null, m.score == null ? '–' : m.score)),
        h('div', { class: 'grow' },
          h('h2', { style: 'margin:0' }, { strong: 'Strong match', partial: 'Partial match', weak: 'Weak match', unknown: 'No clear requirements found' }[bandOf(m)]),
          h('p', { class: 'muted small', style: 'margin:4px 0 0' }, m.note), m.yearsExperience != null && h('p', { class: 'muted small', style: 'margin:2px 0 0' }, `Experience counted: ${m.yearsExperience} yrs`))),
      (m.breakdown?.length > 0) && h('div', { class: 'stack', style: 'margin-top:16px' }, m.breakdown.map((b) => h('div', null,
        h('div', { class: 'row between small' }, h('strong', null, b.label), h('span', { class: 'muted' }, b.detail)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': b.points, 'aria-valuemax': b.max }, h('i', { style: `width:${b.max ? Math.round((b.points / b.max) * 100) : 0}%` })))))));

    const gapRow = (skill, kind) => h('div', { class: 'gap' },
      h('span', { class: `chip ${kind === 'must' ? 'bad' : 'warn'}` }, skill),
      h('span', { class: 'grow small muted' }, kind === 'must' ? 'Required, not on your resume' : 'Nice to have, not on your resume'),
      h('button', { class: 'btn sm', onclick: async () => { try { const r = await api(`/api/jobs/${id}/gaps`, { method: 'POST', body: { skill, has: true } }); job = { ...job, ...r.job }; toast(`${skill} added to your profile`); draw(); } catch (e) { toast(e.message, true); } } }, 'I have this'),
      h('button', { class: 'btn sm ghost', onclick: () => toast(`Noted. ${skill} won't be added to your resume.`) }, 'Not yet'));
    const missing = [...(m.missingMust || []).map((s) => gapRow(s, 'must')), ...(m.missingNice || []).map((s) => gapRow(s, 'nice'))];
    el.append(h('div', { class: 'card' }, h('h2', null, 'What’s missing from your resume'),
      missing.length ? [h('p', { class: 'muted small' }, 'These are the likely reasons a screener may skip your resume for this job. If you do have one, confirm it and we’ll add it. We never add a skill you haven’t confirmed.'), ...missing]
        : h('p', { class: 'muted' }, m.score == null ? 'Nothing to compare yet.' : 'Your resume covers every requirement we found.'),
      (m.matchedMust?.length > 0) && h('div', { style: 'margin-top:12px' }, h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'Covered'), h('div', { class: 'reqs' }, [...m.matchedMust, ...(m.matchedNice || [])].map((s) => h('span', { class: 'chip good' }, s))))));

    const r = latest();
    el.append(h('div', { class: 'card' }, h('h2', null, 'Tailored resume'),
      r ? h('div', { class: 'stack' },
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => dl(r) }, 'Download PDF'), h('a', { class: 'btn', href: `#/resume/${r.id}` }, 'Edit & preview'), h('button', { class: 'btn', onclick: tailor }, icon('refresh'), 'Re-tailor')),
        h('p', { class: 'muted small' }, `Latest version created ${fmtDate(r.created_at)}. Re-tailor after confirming skills; old versions are kept.`),
        job.resumes.length > 1 && h('div', { class: 'small' }, 'Earlier versions: ', job.resumes.slice(1).map((x) => h('a', { href: `#/resume/${x.id}`, style: 'margin-right:8px' }, fmtDate(x.created_at) || `#${x.id}`))))
        : h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'No tailored resume yet for this job.'), h('div', null, h('button', { class: 'btn primary', onclick: tailor }, 'Create tailored resume')))));
    return el;
  }

  // ---------- Interview prep (company research + brief + questions)
  // Returns true only when it actually loaded (so the caller redraws once, never in a loop).
  async function loadPrep() {
    if (state.loaded) return false;
    state.loaded = true;
    try {
      const r = await api(`/api/jobs/${id}/prep`);
      if (r.prep) Object.assign(state, { prep: r.prep, research: r.research, stale: r.stale, createdAt: r.createdAt });
      else { runPrep(false); return false; }
    } catch (e) { state.error = e.message; }
    return true;
  }

  async function runPrep(refresh) {
    state.running = true; state.steps = []; state.error = '';
    if (tab === 'prep') draw();
    try {
      await streamPost(`/api/jobs/${id}/prep`, { refresh }, (ev) => {
        if (ev.type === 'step') { state.steps.push(ev.label); if (tab === 'prep') draw(); }
        if (ev.type === 'result') Object.assign(state, { prep: ev.prep, research: ev.research, stale: false, createdAt: new Date().toISOString() });
        if (ev.type === 'error') state.error = ev.message;
      });
    } catch (e) { state.error = e.message; }
    state.running = false;
    if (tab === 'prep') draw();
  }

  const list = (items, ordered) => items?.length ? h(ordered ? 'ol' : 'ul', { class: 'tidy' }, items.map((x) => h('li', null, x))) : null;
  const sec = (title, ic) => h('div', { class: 'sec-title' }, ic && icon(ic, 15), title);

  function companyCard(r) {
    if (!r) return null;
    const c = r.company || {};
    const hasReviews = !!(r.culture && (r.culture.summary || r.culture.pros?.length || r.culture.cons?.length));
    const cov = (label, v) => h('span', { class: `chip ${v === 'good' ? 'good' : v === 'partial' ? 'warn' : ''}` }, `${label}: ${v === 'good' ? 'good coverage' : v === 'partial' ? 'partial' : 'not found'}`);
    return h('div', null,
      sec(`About ${job.company || 'the company'}`, 'building'),
      h('div', { class: 'card stack' },
        h('div', { class: 'row' }, r.mode === 'ai' ? aiBadge() : h('span', { class: 'chip' }, 'Basic mode'), r.mode === 'ai' && cov('Reviews', r.coverage?.reviews || 'none'), r.mode === 'ai' && cov('Interview reports', r.coverage?.interview || 'none'),
          r.cached && h('span', { class: 'muted small' }, 'from a recent lookup')),
        c.summary ? h('p', { style: 'margin:0' }, c.summary) : h('p', { class: 'muted', style: 'margin:0' }, 'No public company summary was found.'),
        !!(c.industry || c.size || c.hq) && h('div', { class: 'reqs' }, [c.industry, c.size, c.hq].filter(Boolean).map((x) => h('span', { class: 'chip' }, x))),
        hasReviews && h('div', { class: 'cols2' },
          h('div', null, h('h3', null, 'What employees tend to like'), list(r.culture.pros) || h('p', { class: 'muted small' }, 'Nothing consistent found.')),
          h('div', null, h('h3', null, 'Common complaints'), list(r.culture.cons) || h('p', { class: 'muted small' }, 'Nothing consistent found.'))),
        r.culture?.summary && h('p', { class: 'muted', style: 'margin:0' }, r.culture.summary),
        r.culture?.ratingNotes && h('p', { class: 'muted small', style: 'margin:0' }, r.culture.ratingNotes),
        r.watchOuts?.length > 0 && h('div', null, h('h3', null, 'Watch-outs'), list(r.watchOuts)),
        r.compensation?.notes && h('div', null, h('h3', null, 'Pay'), h('p', { style: 'margin:0' }, r.compensation.notes)),
        r.news?.length > 0 && h('div', null, h('h3', null, 'In the news'), h('ul', { class: 'tidy' }, r.news.map((n) => h('li', null, h('strong', null, n.headline), n.why ? ` — ${n.why}` : '')))),
        r.interview?.process?.length > 0 && h('div', null, h('h3', null, 'Reported interview process'), list(r.interview.process, true)),
        r.interview?.commonQuestions?.length > 0 && h('div', null, h('h3', null, 'Questions candidates report being asked'), list(r.interview.commonQuestions)),
        r.interview?.tips?.length > 0 && h('div', null, h('h3', null, 'Tips from candidates'), list(r.interview.tips)),
        r.gaps?.length > 0 && h('div', { class: 'info small' }, h('strong', null, 'Not found: '), r.gaps.join(' ')),
        r.sources?.length > 0 && h('div', null, h('h3', null, 'Sources'), h('div', { class: 'src' }, r.sources.map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', null, s.title || s.url), icon('external', 13)))),
          h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Reviews are individual opinions found on public pages. We summarise themes; open the sources to read them yourself.'))));
  }

  function prepView() {
    const el = h('div');
    loadPrep().then((loaded) => { if (loaded && tab === 'prep') draw(); });
    if (state.running || (!state.prep && !state.error)) {
      const steps = state.steps.length ? state.steps : ['Getting started…'];
      return h('div', { class: 'card', style: 'max-width:640px' },
        h('div', { class: 'row' }, aiBadge(), h('strong', null, me.aiEnabled ? 'Researching and preparing your interview brief' : 'Preparing your interview brief')),
        h('div', { class: 'progress', style: 'margin:18px 0 6px;max-width:none' }, steps.map((t, i) => h('div', { class: `stepline ${i < steps.length - 1 ? 'done' : ''}` }, i < steps.length - 1 ? icon('check') : h('span', { class: 'spin' }), t))),
        h('div', { class: 'shimmer', style: 'width:90%' }), h('div', { class: 'shimmer', style: 'width:75%' }), h('div', { class: 'shimmer', style: 'width:82%' }),
        me.aiEnabled && h('p', { class: 'muted small' }, 'Searching the web can take a minute the first time. Results are saved.'));
    }
    if (state.error && !state.prep) return h('div', { class: 'card stack' }, h('div', { class: 'error' }, state.error), h('div', null, h('button', { class: 'btn primary', onclick: () => runPrep(false) }, 'Try again')));

    const p = state.prep; const b = p.brief || {};
    append(el,
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, p.mode === 'ai' ? aiBadge() : h('span', { class: 'chip' }, 'Basic mode'), h('span', { class: 'muted small' }, state.createdAt ? `Prepared ${fmtDate(state.createdAt)}` : '')),
        h('button', { class: 'btn sm', onclick: () => runPrep(true) }, icon('refresh', 15), 'Refresh')),
      state.stale && h('div', { class: 'notice', style: 'margin-top:12px' }, 'Your resume or settings changed since this was prepared. Refresh to update it.'),
      p.aiFailed && h('div', { class: 'notice', style: 'margin-top:12px' }, `AI couldn’t be used for this one (${p.aiFailed}). Showing the basic version.`),
      !me.aiEnabled && h('div', { class: 'card soft', style: 'margin-top:12px' }, h('div', { class: 'row between' }, h('div', null, h('strong', null, 'Turn on AI for the full picture'), h('div', { class: 'muted small' }, 'Employee review themes, reported interview questions, news and answers written around this company.')), h('a', { class: 'btn primary sm', href: '#/settings' }, 'Set up AI'))),
      sec('The role in one line', 'target'), h('div', { class: 'oneliner' }, b.oneLiner || job.title),
      h('div', { class: 'cols2', style: 'margin-top:14px' },
        h('div', { class: 'card' }, h('h3', null, 'What they’re looking for'), list(b.whatTheyWant) || h('p', { class: 'muted small' }, 'No clear requirements detected.')),
        h('div', { class: 'card' }, h('h3', null, 'Where you’re strong'), list(b.yourEdge) || h('p', { class: 'muted small' }, 'Capture the full job text for a sharper read.'))),
      b.stretchAreas?.length > 0 && h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', null, 'Gaps, and how to frame them honestly'), h('ul', { class: 'tidy' }, b.stretchAreas.map((x) => h('li', null, h('strong', null, x.skill), ': ', x.howToFrame)))),
      b.resumeAdvice?.length > 0 && h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', null, 'Resume advice'), list(b.resumeAdvice)),
      companyCard(state.research),
      sec('Likely questions, with answers drafted from your resume', 'chat'),
      h('div', null, p.questions.map((q, i) => h('details', { class: 'q', open: i === 0 },
        h('summary', null, h('span', { class: 'chip' }, q.category), h('span', { class: 'qt' }, q.question)),
        h('div', { class: 'body' },
          q.whyTheyAsk && h('div', { class: 'why' }, h('strong', null, 'Why they ask: '), q.whyTheyAsk),
          h('div', null, h('div', { class: 'row between', style: 'margin-bottom:6px' }, h('strong', { class: 'small' }, 'Suggested answer'), h('button', { class: 'btn sm ghost', onclick: () => copyText(q.answer) }, icon('copy', 14), 'Copy')), h('div', { class: 'ans' }, q.answer)),
          q.evidence?.length > 0 && h('div', null, h('div', { class: 'small muted' }, 'From your resume'), q.evidence.map((e) => h('div', { class: 'ev' }, e))))))),
      p.askThem?.length > 0 && h('div', null, sec('Questions to ask them', 'list'), h('div', { class: 'card' }, list(p.askThem))),
      (p.negotiation?.notice || p.negotiation?.ctc) && h('div', null, sec('Notice period and pay', 'user'), h('div', { class: 'card cols2' },
        h('div', null, h('h3', null, 'Notice period'), h('p', { style: 'margin:0' }, p.negotiation.notice)), h('div', null, h('h3', null, 'CTC'), h('p', { style: 'margin:0' }, p.negotiation.ctc)))),
      h('p', { class: 'muted small', style: 'margin-top:18px' }, 'These are likely questions based on your resume, this job description and public information. They are predictions, not what the recruiter will definitely ask.'));
    return el;
  }

  // ---------- Ask AI (streaming chat)
  function chatView() {
    if (!me.aiEnabled) return h('div', { class: 'card stack', style: 'max-width:640px' }, h('div', { class: 'row' }, aiBadge(), h('strong', null, 'Ask AI needs an API key')),
      h('p', { class: 'muted', style: 'margin:0' }, 'Chat with an assistant that has read this job, your resume and the company research. Ask it to rehearse answers, draft a message to the recruiter, or explain a requirement.'),
      h('div', null, h('a', { class: 'btn primary', href: '#/settings' }, 'Set up AI')));
    const thread = h('div', { class: 'thread' });
    const input = h('textarea', { rows: 1, placeholder: 'Ask anything about this job…', 'aria-label': 'Message' });
    const send = h('button', { class: 'send', 'aria-label': 'Send', disabled: true }, icon('send', 18));
    const suggest = h('div', { class: 'suggest' }, [
      'What will they probably ask me, and how should I answer?',
      `What should I know about ${job.company || 'this company'} before the interview?`,
      'Where is my resume weakest for this role?',
      'Draft a short message to the recruiter.',
    ].map((q) => h('button', { onclick: () => ask(q) }, q)));

    const bubble = (m) => m.role === 'user'
      ? h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, m.content))
      : h('div', { class: 'msg ai' }, h('div', { class: 'av' }, icon('sparkle')), h('div', { class: 'text' }));
    const redraw = () => {
      clear(thread);
      for (const m of chat.messages) {
        const b = bubble(m);
        if (m.role === 'assistant') { const t = b.querySelector('.text'); append(t, renderMarkdown(m.content || ''), m.pending && h('span', { class: 'cursor' })); if (m.error) t.append(h('div', { class: 'error' }, m.error)); }
        thread.append(b);
      }
      suggest.hidden = chat.messages.length > 0;
      thread.lastElementChild?.scrollIntoView({ block: 'end' });
    };
    async function ask(text) {
      text = (text || input.value).trim(); if (!text || chat.busy) return;
      input.value = ''; grow(); chat.busy = true; send.disabled = true;
      chat.messages.push({ role: 'user', content: text });
      const reply = { role: 'assistant', content: '', pending: true }; chat.messages.push(reply); redraw();
      try {
        await streamPost(`/api/jobs/${id}/chat`, { messages: chat.messages.filter((m) => !m.error && m !== reply).map(({ role, content }) => ({ role, content })) }, (ev) => {
          if (ev.type === 'text') { reply.content += ev.text; redraw(); }
          if (ev.type === 'error') reply.error = ev.message;
        });
      } catch (e) { reply.error = e.message; }
      reply.pending = false; chat.busy = false; send.disabled = !input.value.trim(); redraw();
    }
    const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
    input.addEventListener('input', () => { grow(); send.disabled = chat.busy || !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
    send.addEventListener('click', () => ask());
    queueMicrotask(redraw);
    return h('div', { class: 'chat', style: 'max-width:760px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, aiBadge(), h('span', { class: 'muted small' }, `Knows this job, your resume${state.research ? ' and the company research' : ''}.`)),
      suggest, thread, h('div', { class: 'composer' }, input, send));
  }

  // Safety net: if extraction got the title/company/location wrong, fix it here. Prep and matching use these.
  function editForm() {
    const f = { title: h('input', { type: 'text', value: job.title }), company: h('input', { type: 'text', value: job.company }), location: h('input', { type: 'text', value: job.location }) };
    return h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { class: 'grid3' },
      h('label', { class: 'field' }, 'Job title', f.title), h('label', { class: 'field' }, 'Company', f.company), h('label', { class: 'field' }, 'Location', f.location)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary sm', onclick: async () => {
        try { const r = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { title: f.title.value, company: f.company.value, location: f.location.value } }); job = { ...job, ...r.job }; editing = false; state.stale = true; toast('Details updated'); draw(); } catch (e) { toast(e.message, true); }
      } }, 'Save'), h('span', { class: 'muted small' }, 'Interview prep will refresh for the new company and role.')));
  }

  function jdTab() { return h('div', { class: 'card' }, h('h2', null, 'Captured job text'), h('p', { class: 'muted small' }, 'Exactly what the extension read from the page.'), h('pre', { class: 'jd' }, job.jdText || '')); }

  function draw() {
    clear(host);
    const status = h('select', { 'aria-label': 'Stage', style: 'width:auto', onchange: async (e) => { try { const r = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { status: e.target.value } }); job = { ...job, ...r.job }; toast(`Moved to ${STATUS_LABEL[e.target.value]}`); } catch (x) { toast(x.message, true); } } },
      Object.entries(STATUS_LABEL).map(([v, l]) => h('option', { value: v, selected: v === job.status }, l)));
    const notes = h('textarea', { rows: 2, placeholder: 'Notes: recruiter name, referral, anything…' }); notes.value = job.notes || '';
    append(host,
      h('a', { href: '#/tracking', class: 'small muted' }, '← Tracking'),
      h('div', { class: 'row between', style: 'margin-top:8px;align-items:flex-start' },
        h('div', null, h('h1', null, job.title || 'Untitled role'), h('div', { class: 'muted' }, [job.company, job.location, job.source].filter(Boolean).join(' · ') || 'Company not detected'),
          h('div', { class: 'row', style: 'gap:12px' }, job.url && h('a', { class: 'small', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open original posting ↗'),
            h('button', { class: 'btn sm ghost', onclick: () => { editing = !editing; draw(); } }, editing ? 'Cancel' : 'Edit details'))),
        h('div', { class: 'row' }, scorePill(job.match), status,
          h('button', { class: 'btn sm ghost danger', onclick: async () => { if (!confirm('Delete this job and its tailored resumes?')) return; await api(`/api/jobs/${id}`, { method: 'DELETE' }); toast('Deleted'); go('#/tracking'); } }, 'Delete'))),
      editing && editForm(),
      h('div', { class: 'tabs', role: 'tablist' }, [['overview', 'Overview', null], ['prep', 'Interview prep', 'sparkle'], ['chat', 'Ask AI', 'chat'], ['jd', 'Job text', null]].map(([k, l, ic]) =>
        h('button', { class: tab === k ? 'on' : '', role: 'tab', onclick: () => { tab = k; draw(); } }, ic && icon(ic, 16), l))));
    if (tab === 'overview') host.append(overview(), h('div', { class: 'card' }, h('h3', null, 'Notes'), notes, h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { notes: notes.value } }); toast('Notes saved'); } catch (e) { toast(e.message, true); } } }, 'Save notes'))));
    else if (tab === 'prep') host.append(prepView());
    else if (tab === 'chat') host.append(chatView());
    else host.append(jdTab());
  }
  draw();
  return host;
}
