// Website content. Bodies are functions of the build context: { B (brand), u(slug) (link to a page), demo, shot(name) }.
// Rules for the copy: say only what the product does today, no invented numbers, no testimonials, no guarantees about ATS or hiring.

const check = '<span class="tick" aria-label="Included">✓</span>';
const dash = '<span class="dash" aria-label="Not included">–</span>';

const waitlist = (c, source) => `<form class="waitlist" data-endpoint="${c.waitlistUrl}" data-source="${source}" novalidate>
  <label class="hp" aria-hidden="true">Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
  <input type="email" name="email" placeholder="you@example.com" aria-label="Email address" autocomplete="email" required>
  <button class="btn primary" type="submit">Join the waitlist</button>
  <div class="msg" role="status" aria-live="polite" style="flex-basis:100%"></div>
</form>`;

const faqItems = (c) => [
  ['Does it apply to jobs for me?', 'No. It never submits anything. You open a job, capture it, and download a tailored resume. You apply yourself, so every application is one you chose.'],
  ['Will it change my resume layout?', 'It reads your own resume and rebuilds it with the same headings, order, bullets and date style. It then reorders bullets and skills so the most relevant ones come first. Colours and hyperlinks are not reproduced yet, so check the preview before you send.'],
  ['Does it invent experience or skills?', 'No. It only reorders, highlights numbers and adds a skill you have confirmed yourself. Nothing is written into your resume that you have not approved.'],
  ['Which job sites does the extension work on?', 'Any page with a job description, including LinkedIn jobs and hiring posts, Naukri and company career pages, because it reads the text on the page you have open. You can also paste a description straight into the dashboard.'],
  ['Does it guarantee that I will pass an ATS or get shortlisted?', 'No tool can promise that. The match score compares your resume with the job description. It tells you which required skills your resume does and does not mention. How a recruiter or a company\'s system ranks you is outside our control.'],
  ['What does the AI do, and what happens without it?', 'With AI on, it researches the company with sources, writes a brief and drafts an answer to each likely question from your resume. Without AI, the match score, tailoring, tracking and a rule-based prep all still work.'],
  ['What happens to my resume and data?', 'Your resume and jobs are stored against your account so the dashboard can show them. You can export everything or delete your account from Settings. See the privacy policy for details.'],
  ['What does it cost?', 'The free plan includes 10 tailored resumes a month. The paid plan is planned at ₹299 a month, with a 3-month option, and prices include GST. Billing is not open yet: join the waitlist and we will tell you first.'],
];

export const PAGES = [
  {
    slug: 'index', nav: false, title: (B) => `${B.name}: tailor your resume to every job`, desc: 'A Chrome extension and dashboard that tailors your resume to each job in your own layout, shows missing skills and prepares you for the interview.',
    schema: (c) => [{ '@type': 'SoftwareApplication', name: c.B.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Chrome', description: c.B.description, offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'INR', name: 'Free' }, { '@type': 'Offer', price: '299', priceCurrency: 'INR', name: 'Pro (monthly)' }] }],
    body: (c) => `
<div class="wrap hero">
  <span class="eyebrow">For job seekers in India</span>
  <h1>${c.B.tagline}</h1>
  <p class="lead">Open any job. ${c.B.name} reads it, scores it against your resume, and gives you a tailored copy in <em>your</em> layout, plus an interview brief for that company. You stay in control and press apply yourself.</p>
  <div class="row"><a class="btn primary" href="#waitlist">Join the waitlist</a>${c.demo ? `<a class="btn" href="${c.demo}" target="_blank" rel="noopener">Try the live demo</a>` : `<a class="btn" href="${c.u('how-it-works')}">How it works</a>`}</div>
  <p class="muted small">Free plan: 10 tailored resumes a month. No card needed.</p>
</div>
<section class="block alt"><div class="wrap">
  <div class="sechead"><span class="eyebrow">The problem</span><h2>Sending the same resume everywhere is why most applications go quiet</h2><p>A job description lists what the company needs. Your resume lists everything you have done. Matching the two by hand for every role takes an evening, so most people skip it, and the skills that matter end up on page two.</p></div>
  <div class="grid">
    <div class="card"><h3>You cannot see the gap</h3><p class="muted">Is Kubernetes a must-have or a nice-to-have? Do you mention it at all? Reading ten descriptions closely is slow work.</p></div>
    <div class="card"><h3>Reformatting breaks resumes</h3><p class="muted">Generic resume builders replace your layout with a template. Then you have to rebuild the look you already trust.</p></div>
    <div class="card"><h3>Applications disappear</h3><p class="muted">A spreadsheet of links does not tell you what you sent where, or what to prepare before the call.</p></div>
  </div>
</div></section>
<section class="block"><div class="wrap">
  <div class="sechead"><span class="eyebrow">What you get</span><h2>One extension, one dashboard, one login</h2></div>
  <div class="grid">
    <div class="card"><span class="num">1</span><h3>Match score you can explain</h3><p class="muted">Every point comes from a listed check: required skills, nice-to-haves, years of experience and role similarity. You see exactly what is missing.</p></div>
    <div class="card"><span class="num">2</span><h3>A resume that fits the job</h3><p class="muted">Same headings, bullets and dates as yours. Relevant bullets move up, numbers are highlighted, and skills you confirm are added. It never invents anything.</p></div>
    <div class="card"><span class="num">3</span><h3>Interview prep for that company</h3><p class="muted">Likely questions with answers drafted from your own resume, what the company does, and what to ask back. With AI on, the research cites its sources.</p></div>
    <div class="card"><span class="num">4</span><h3>A board for your search</h3><p class="muted">Saved, applied, screening call, interview, offer. Every job keeps its score, its tailored resume and your notes.</p></div>
  </div>
</div></section>
<section class="block alt"><div class="wrap">
  <div class="sechead"><span class="eyebrow">How it works</span><h2>From job page to tailored PDF in minutes</h2></div>
  <div class="grid">
    <div class="card plain"><span class="num">1</span><h3>Upload your resume once</h3><p class="muted">PDF, DOCX or text. Your profile is built from it, so you are not filling long forms.</p></div>
    <div class="card plain"><span class="num">2</span><h3>Capture a job</h3><p class="muted">Click the extension on any job page or LinkedIn hiring post. Or paste the description.</p></div>
    <div class="card plain"><span class="num">3</span><h3>Review and download</h3><p class="muted">See the score and gaps, edit anything, download the PDF, and apply on the company's site.</p></div>
  </div>
  <p style="margin-top:24px"><a href="${c.u('how-it-works')}">Read the full walkthrough →</a></p>
</div></section>
<section class="block"><div class="wrap narrow">
  <div class="sechead"><span class="eyebrow">Free tool</span><h2>Check your resume against a job description now</h2><p>Paste both and see which required skills your resume mentions. It runs in your browser: nothing you paste is uploaded.</p></div>
  <a class="btn" href="${c.u('tools/resume-keyword-checker')}">Open the keyword checker</a>
</div></section>
<section class="block alt" id="waitlist"><div class="wrap narrow">
  <div class="sechead"><span class="eyebrow">Early access</span><h2>Be first in when it opens</h2><p>We are letting people in gradually. Leave your email and we will write when your spot is ready. One email, no spam, and you can leave any time.</p></div>
  ${waitlist(c, 'home')}
</div></section>`,
  },
  {
    slug: 'how-it-works', nav: 'How it works', title: () => 'How it works: capture a job, tailor your resume', desc: 'Upload your resume once, capture any job with the extension, review the score and gaps, download a tailored PDF and prepare for the interview.',
    body: (c) => `
<div class="wrap narrow prose" style="padding-block:56px 80px">
  <h1>How it works</h1>
  <p class="muted">Five steps. The first one takes a minute, the rest repeat for every job.</p>
  <h2>1. Upload your resume</h2><p>Upload a PDF, DOCX or text file. We read the layout: headings, bullet style, date format, fonts and spacing. Your profile (name, contact details, experience, skills) is built from it, so there is no long form to fill. You confirm what we found and fix anything that is off.</p>
  <h2>2. Capture a job</h2><p>Open a job page or a LinkedIn hiring post and click the extension. It reads the visible text, finds the title and company, and sends it to your dashboard. You can also paste a description directly into the dashboard. Capturing the same job twice updates it rather than adding a duplicate.</p>
  <h2>3. See the match and the gaps</h2><p>The score is built from four checks with fixed weights: required skills, nice-to-have skills, years of experience and role similarity. Each missing skill is listed. If you do have one, click “I have this” and it is saved to your profile, the score updates, and the skill is added to future tailored resumes.</p>
  <div class="callout">We never add a skill you have not confirmed. The tailoring step only reorders, highlights and uses what is already true.</div>
  <h2>4. Tailor and download</h2><p>A tailored copy keeps your layout and puts the most relevant bullets first, highlights your numbers and moves matching skills forward. Edit anything in the dashboard, see the live preview and download the PDF. The PDF is plain, selectable text, which is what applicant tracking systems read best.</p>
  <h2>5. Prepare for the interview</h2><p>Each job gets a brief: what they are looking for, where you are strong, gaps and how to frame them honestly, and likely questions with answers drafted from your resume. With AI on, it also researches the company and cites its sources. These are predictions, not what you will definitely be asked.</p>
  <h2>6. Track it</h2><p>Move the job through Saved, Applied, Screening call, Interview and Offer. Notes and the tailored resume stay with the job, so you know exactly what you sent.</p>
  <p><a class="btn primary" href="${c.u('index')}#waitlist">Join the waitlist</a></p>
</div>`,
  },
  {
    slug: 'pricing', nav: 'Pricing', title: () => 'Pricing: free plan and Pro from ₹299 a month', desc: 'Start free with 10 tailored resumes a month. Pro adds unlimited tailoring and AI interview prep. Prices include GST. Billing opens soon.',
    body: (c) => `
<div class="wrap" style="padding-block:56px 80px">
  <div class="sechead"><h1>Simple pricing</h1><p>Start free. Upgrade when your search gets busy. Prices are in rupees and include GST.</p></div>
  <div class="grid">
    <div class="card plan"><h3>Free</h3><div class="price">₹0</div><p class="muted">For trying it on a few jobs.</p><ul class="prose"><li>10 tailored resumes a month</li><li>Match score and skill gaps</li><li>Job board and notes</li><li>Resume editor and PDF</li><li>Basic interview prep</li></ul></div>
    <div class="card plan featured"><span class="badge">Planned</span><h3>Pro</h3><div class="price">₹299 <small>/ month</small></div><p class="muted">Or ₹699 for 3 months, since most searches run 2 to 4 months.</p><ul class="prose"><li>Everything in Free</li><li>Unlimited tailored resumes (fair use)</li><li>AI interview prep with company research and sources</li><li>Ask AI about any job</li></ul>
      <a class="btn primary" href="${c.u('index')}#waitlist">Join the waitlist</a></div>
  </div>
  <div class="callout warn" style="margin-top:28px">Billing is not open yet. These are the planned prices. Waitlist members hear first, and we will not charge anyone without clear notice and their consent. Cancellation and refunds will follow the <a href="${c.u('refund')}">refund policy</a>.</div>
  <h2 style="margin-top:56px;margin-bottom:16px">Compare plans</h2>
  <div class="tablewrap"><table><thead><tr><th>Feature</th><th>Free</th><th>Pro</th></tr></thead><tbody>
    <tr><td>Tailored resumes</td><td>10 / month</td><td>Unlimited, fair use</td></tr>
    <tr><td>Match score and skill gaps</td><td>${check}</td><td>${check}</td></tr>
    <tr><td>Job board, notes, resume editor</td><td>${check}</td><td>${check}</td></tr>
    <tr><td>Chrome extension</td><td>${check}</td><td>${check}</td></tr>
    <tr><td>Interview prep</td><td>Basic</td><td>AI, with sources</td></tr>
    <tr><td>Ask AI about a job</td><td>${dash}</td><td>${check}</td></tr>
  </tbody></table></div>
  <h2 style="margin-top:56px;margin-bottom:8px">Questions about pricing</h2>
  <details><summary>Do I need a card for the free plan?</summary><p>No.</p></details>
  <details><summary>Why is there a monthly limit on the free plan?</summary><p>Each tailored resume uses real computing resources. A limit keeps the free plan sustainable for everyone.</p></details>
  <details><summary>Will the price change?</summary><p>These are the prices we plan to launch with. If they change before launch, the waitlist is told first.</p></details>
</div>`,
  },
  {
    slug: 'faq', nav: 'FAQ', title: () => 'FAQ: privacy, AI, supported sites and limits', desc: 'Answers about what the extension does, what it never does, which sites it supports, how AI is used, pricing and your data.',
    schema: (c) => [{ '@type': 'FAQPage', mainEntity: faqItems(c).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
    body: (c) => `<div class="wrap narrow" style="padding-block:56px 80px"><div class="sechead"><h1>Frequently asked questions</h1></div>${faqItems(c).map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
  <p style="margin-top:32px" class="muted">Something missing? Email <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>.</p></div>`,
  },
  {
    slug: 'tools/resume-keyword-checker', nav: 'Free checker', title: () => 'Free resume keyword checker for any job description', desc: 'Paste your resume and a job description to see which required skills your resume mentions and which are missing. Runs in your browser; nothing is uploaded.',
    schema: (c) => [{ '@type': 'WebApplication', name: 'Resume keyword checker', applicationCategory: 'BusinessApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, url: c.abs('tools/resume-keyword-checker') }],
    extraHead: (c) => '', script: 'checker',
    body: (c) => `
<div class="wrap narrow" style="padding-block:56px 80px">
  <div class="crumbs"><a href="${c.u('index')}">Home</a> / Tools</div>
  <div class="sechead"><h1>Resume keyword checker</h1><p>See which skills a job asks for that your resume does not mention yet. Paste your resume text and the job description. Everything runs in your browser, so nothing is uploaded or stored.</p></div>
  <div class="cols2">
    <label><strong>Your resume (text)</strong><textarea id="resume" placeholder="Paste your resume text here"></textarea></label>
    <label><strong>Job description</strong><textarea id="jd" placeholder="Paste the full job description, including the requirements"></textarea></label>
  </div>
  <div class="row" style="margin-top:16px"><button class="btn primary" id="check" type="button">Check keywords</button></div>
  <div id="result" hidden class="card" style="margin-top:24px" aria-live="polite">
    <h2 id="score"></h2><p id="summary" class="muted"></p>
    <h3>Required skills you already mention</h3><div class="chips" id="have"></div>
    <h3>Required skills missing from your resume</h3><div class="chips" id="missing"></div>
    <h3>Nice-to-have skills missing</h3><div class="chips" id="niceMissing"></div>
  </div>
  <div class="callout warn" style="margin-top:24px"><strong>What this is, and is not.</strong> It counts keywords from a built-in list of common skills. It is not an ATS score and does not predict whether you will be shortlisted. Add a skill only if you really have it.</div>
  <div class="prose" style="margin-top:40px"><h2>Want this done for every job?</h2><p>${c.B.name} captures a job from any page, runs this check automatically, and gives you a tailored resume in your own layout. <a href="${c.u('index')}#waitlist">Join the waitlist</a>.</p></div>
</div>`,
  },
  {
    slug: 'guides', nav: 'Guides', title: () => 'Guides: resumes, applications and interviews for Indian job seekers', desc: 'Practical, honest guides on tailoring a resume, tracking applications and preparing for interviews.',
    body: (c) => `<div class="wrap" style="padding-block:56px 80px"><div class="sechead"><h1>Guides</h1><p>Practical advice for people looking for work in India. No tricks and no invented statistics.</p></div>
  <div class="grid">${c.guides.map((g) => `<a class="card" href="${c.u(g.slug)}" style="text-decoration:none;color:inherit"><span class="eyebrow">${g.tag}</span><h3>${g.h1}</h3><p class="muted">${g.desc}</p><span style="color:var(--primary)">Read the guide →</span></a>`).join('')}</div></div>`,
  },
  {
    slug: 'about', nav: false, title: (B) => `About ${B.name}`, desc: 'Why we are building a job-search tool around tailoring, tracking and interview prep, and what we will not do.',
    body: (c) => `<div class="wrap narrow prose" style="padding-block:56px 80px"><h1>About ${c.B.name}</h1>
  <p>Job hunting in India means many applications, many tabs and very little feedback. We are building one place to keep it organised and to make each application a better fit than the last.</p>
  <h2>What we believe</h2><ul><li>A good tool does not apply for you. You choose where to apply and you press the button.</li><li>It should never invent experience. Tailoring is about emphasis, not fiction.</li><li>Scores must be explainable. If we say 70%, you can see why.</li><li>Your data is yours. You can export it or delete it at any time.</li></ul>
  <h2>Who is behind it</h2><p>${c.B.legalName}. ${c.B.address}. Contact: <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>.</p></div>`,
  },
  {
    slug: 'contact', nav: false, title: (B) => `Contact ${B.name}`, desc: 'Support, feedback and the grievance officer contact details.',
    body: (c) => `<div class="wrap narrow prose" style="padding-block:56px 80px"><h1>Contact</h1>
  <h2>Support and feedback</h2><p>Email <a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a>. Please include the browser you use and, for problems with a job page, its address.</p>
  <h2>Grievance officer</h2><p>For privacy or data complaints: <a href="mailto:${c.B.grievanceEmail}">${c.B.grievanceEmail}</a>. Registered address: ${c.B.address}.</p></div>`,
  },
  {
    slug: 'privacy', nav: false, legal: true, title: (B) => `Privacy policy | ${B.name}`, desc: 'What data we collect, why, how long we keep it and how to export or delete it. Draft pending legal review.',
    body: (c) => `<div class="wrap narrow prose" style="padding-block:56px 80px"><h1>Privacy policy</h1>
  <div class="callout warn"><strong>Draft.</strong> This text is a starting point for your lawyer. It must be reviewed against the Digital Personal Data Protection Act, 2023 and the current rules before launch.</div>
  <p class="muted">Last updated: [date]. Operator: ${c.B.legalName}, ${c.B.address}.</p>
  <h2>What we collect</h2><ul><li><strong>Account:</strong> your email address and a hashed password.</li><li><strong>Your resume and profile:</strong> the file you upload and the details read from it.</li><li><strong>Jobs you capture:</strong> the text of the page you chose to capture, its address, and your notes and status.</li><li><strong>Usage:</strong> counts needed to apply plan limits, and basic error logs.</li></ul>
  <h2>Why</h2><p>To provide the service you asked for: matching, tailoring, tracking and prep. We do not sell your data and we do not show advertising.</p>
  <h2>The extension</h2><p>It reads a page only when you click it, and only sends the text you capture to your own account.</p>
  <h2>AI processing</h2><p>When AI features are on, the relevant parts of your resume and the job description are sent to our AI provider to produce your prep. [Name the provider, its location and its retention terms here after review.]</p>
  <h2>Retention, export and deletion</h2><p>You can export everything and delete your account from Settings. Deletion removes your profile, resumes and jobs. [State backup retention here.]</p>
  <h2>Your rights and complaints</h2><p>Write to <a href="mailto:${c.B.grievanceEmail}">${c.B.grievanceEmail}</a>. [Add response time and the Data Protection Board route after review.]</p></div>`,
  },
  {
    slug: 'terms', nav: false, legal: true, title: (B) => `Terms of service | ${B.name}`, desc: 'The terms for using the service. Draft pending legal review.',
    body: (c) => `<div class="wrap narrow prose" style="padding-block:56px 80px"><h1>Terms of service</h1>
  <div class="callout warn"><strong>Draft.</strong> Have a lawyer review and complete this before launch.</div>
  <h2>The service</h2><p>${c.B.name} helps you tailor resumes, track applications and prepare for interviews. It does not apply to jobs for you and does not guarantee interviews, offers or any outcome.</p>
  <h2>Your content</h2><p>You own your resume and data. You confirm that everything in your resume is true and that you have the right to upload it. You are responsible for what you send to employers.</p>
  <h2>Acceptable use</h2><p>No automated bulk use, no attempts to bypass limits, and no use against the terms of the job sites you visit.</p>
  <h2>Plans and payment</h2><p>Paid plans renew until cancelled. Prices include GST. See the <a href="${c.u('refund')}">refund and cancellation policy</a>.</p>
  <h2>Liability</h2><p>[Limitation of liability, governing law and jurisdiction to be completed by counsel.]</p></div>`,
  },
  {
    slug: 'refund', nav: false, legal: true, title: (B) => `Refund and cancellation | ${B.name}`, desc: 'How to cancel a paid plan and when refunds are given. Draft pending legal review.',
    body: (c) => `<div class="wrap narrow prose" style="padding-block:56px 80px"><h1>Refund and cancellation</h1>
  <div class="callout warn"><strong>Draft.</strong> Payment providers require this page. Decide the policy, then have it reviewed.</div>
  <h2>Cancel any time</h2><p>Cancel from Settings. Your plan stays active until the end of the period you paid for and does not renew.</p>
  <h2>Refunds</h2><p>[State the refund window, for example a full refund within 7 days of the first payment if you have not used the paid features, and the process and timeline for refunds to the original payment method.]</p>
  <h2>Contact</h2><p><a href="mailto:${c.B.supportEmail}">${c.B.supportEmail}</a></p></div>`,
  },
];

export const GUIDES = [
  {
    slug: 'guides/tailor-resume-to-job-description', tag: 'Resumes', h1: 'How to tailor your resume to a job description without lying', date: '2026-10-20',
    title: () => 'How to tailor your resume to a job description (honestly)', desc: 'A step-by-step method to match your resume to a job description: read the requirements, mirror real skills, reorder bullets and keep it truthful.',
    body: (c) => `
<p>Tailoring does not mean rewriting your history. It means choosing which true things come first. Recruiters skim a resume in seconds, so the first third of page one decides whether they keep reading. Here is a method that takes about ten minutes per job.</p>
<h2>1. Split the job description into must-have and nice-to-have</h2>
<p>Read the requirements and mark each line. Words like “required”, “must”, “strong” and a stated number of years usually mean must-have. “Good to have”, “plus” and “preferred” mean nice-to-have. Ignore generic lines such as “team player”.</p>
<h2>2. Check each must-have against your resume</h2>
<p>For every must-have, find a bullet that shows it. Three outcomes are possible: you already show it, you have the skill but never wrote it down, or you do not have it. Be honest about the third group. Do not add a tool you cannot discuss in an interview.</p>
<h2>3. Use the job's words for skills you really have</h2>
<p>If the posting says “CI/CD pipelines” and your resume says “Jenkins jobs”, say both: “Built CI/CD pipelines in Jenkins”. Matching the wording helps both people and keyword-based search in recruiter tools.</p>
<h2>4. Reorder, do not rewrite</h2>
<ul><li>Within each role, put the bullets most relevant to this job first.</li><li>In your skills section, put the skills this job asks for at the front of each row.</li><li>If you have several projects, lead with the one closest to the role.</li></ul>
<h2>5. Lead with numbers</h2>
<p>“Reduced API latency by 38%” beats “improved performance”. If a bullet has a number, make sure it is easy to see. Never change a number to look better.</p>
<h2>6. Keep the format simple</h2>
<p>Use real text, standard headings (Experience, Education, Skills) and one column. Avoid text inside images, tables for layout and unusual fonts. Save as PDF unless the application asks for a Word file.</p>
<h2>7. Re-read it as the recruiter</h2>
<p>Look at the top third of page one. Could someone tell in ten seconds why you fit this role? If not, move something up.</p>
<div class="callout"><strong>Shortcut.</strong> Our <a href="${c.u('tools/resume-keyword-checker')}">free keyword checker</a> does steps 1 and 2 for any job description in your browser.</div>`,
  },
  {
    slug: 'guides/track-job-applications', tag: 'Applications', h1: 'What to track when you apply to many jobs', date: '2026-10-22',
    title: () => 'Job application tracker: what to record and why', desc: 'What to keep for every application so you never lose track: the posting, the resume you sent, dates, contacts and next steps.',
    body: (c) => `
<p>After about ten applications, memory stops being reliable. Which version of your resume did you send to which company? Who spoke to you on Tuesday? A tracker answers these in seconds. A spreadsheet is enough if you keep these columns.</p>
<h2>The columns that matter</h2>
<ul><li><strong>Company and role</strong>, spelled the way the posting spells them.</li><li><strong>Link</strong> to the posting, because postings are often taken down. Paste the description text too.</li><li><strong>Stage:</strong> saved, applied, screening call, interview, offer, rejected.</li><li><strong>Date applied</strong> and the date of the last contact.</li><li><strong>Resume version sent.</strong> Save the exact file.</li><li><strong>Contact:</strong> recruiter or referrer name and how to reach them.</li><li><strong>Notes:</strong> salary range if stated, questions you were asked, what to follow up on.</li></ul>
<h2>Why keep the job text</h2>
<p>When a recruiter calls three weeks later, you need to remember what the role actually asked for. Saving the text of the posting makes preparation possible even if the page is gone.</p>
<h2>A weekly routine</h2>
<ol><li>Update every stage.</li><li>List who you should follow up with, and send those messages.</li><li>Pick the three most promising roles and prepare for them.</li></ol>
<h2>Follow-up timing</h2><p>There is no rule that works everywhere. A short, polite follow-up after about a week with no reply is common. If the posting names a timeline, wait for it.</p>
<div class="callout">${c.B.name} keeps all of this automatically: capture a job and it records the text, the score, the tailored resume you generated and the stage you move it to.</div>`,
  },
  {
    slug: 'guides/prepare-for-an-interview', tag: 'Interviews', h1: 'How to prepare for a job interview in one evening', date: '2026-10-25',
    title: () => 'How to prepare for a job interview in one evening', desc: 'A focused one-evening plan: understand the role, know the company, prepare five stories from your resume, and plan what to ask.',
    body: (c) => `
<p>You rarely have a week. Most calls are arranged with a day or two of notice. This plan fits one evening and covers what interviewers actually probe.</p>
<h2>1. Re-read the job description (15 minutes)</h2><p>Write the three things this role most needs. Everything you prepare should connect back to these.</p>
<h2>2. Learn the company (30 minutes)</h2><p>Know what it sells, who its customers are and one recent development. The company's own site and recent press are the safest sources. Treat anonymous review sites as individual opinions, not facts.</p>
<h2>3. Prepare five stories from your resume (60 minutes)</h2><p>Pick five things you have done: a result with a number, a problem you solved, a time something went wrong, a time you worked with a difficult person, and something you learned. For each, write the situation, what you did and the result in plain sentences. Say them out loud once.</p>
<h2>4. Plan answers to the standard questions (30 minutes)</h2>
<ul><li>“Tell me about yourself”: 60 to 90 seconds covering your present role, relevant past and why this job.</li><li>“Why this company?”: one specific reason, from step 2.</li><li>“What are your gaps?”: be honest, then say how you would close them.</li><li>Notice period and expected CTC: decide your answers in advance. State your real notice period. For pay, give a range based on market data and the role.</li></ul>
<h2>5. Prepare questions to ask (15 minutes)</h2><p>Ask about the first three months, how success is measured, and the team. Avoid questions the job page already answers.</p>
<h2>6. Logistics</h2><p>Test your camera and connection, keep your resume in front of you and have water nearby.</p>
<div class="callout">${c.B.name} builds the first draft of steps 3 and 4 for each job from your resume and the job description, so you start by editing instead of writing from scratch.</div>`,
  },
];
export { faqItems };
