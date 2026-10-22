# Tailor & Apply Kit

A Chrome extension plus a dashboard (same login) that helps a candidate apply with a resume that fits each job, without changing the resume's own structure.

**Flow:** upload your resume once (that's the only onboarding step; the profile is read from it) → open a job page or LinkedIn hiring post → click the extension → see a match score and what's missing → download a tailored PDF → track the application → get an AI interview brief with company research → chat with an assistant that knows the job.

It never submits an application. The candidate reviews and applies themselves.

## Run it

```bash
cd tailorkit
npm install
cp .env.example .env        # optional; add ANTHROPIC_API_KEY to turn on AI (see "Modes")
npm start                   # http://localhost:3000
npm test                    # unit + API + layout tests (AI paths use a fake client)
npm run e2e                 # real Chromium + the real extension
npm run e2e:ai              # AI-mode screens (research, prep, streaming chat) with a fake client
```

Node 22.13+ is required (uses the built-in `node:sqlite`). PDFs are made with a local Chrome/Chromium; it is auto-detected, or set `CHROMIUM_PATH`.

### Install the extension
1. Open `chrome://extensions`, switch on **Developer mode**.
2. **Load unpacked** → choose `tailorkit/extension`.
3. Open the extension, sign in with the same account you made on the dashboard.
4. On a job page, click **Capture this job**. If the page is cluttered, select just the job text first.

The manifest only trusts `http://localhost:3000`. For another server, enter its URL in the popup (Chrome asks for permission) and change `host_permissions` before publishing.

## What it does
| Piece | Behaviour |
|---|---|
| **Onboarding** | Reads PDF/DOCX/TXT, records the structure (section order, heading case, bullet glyph), and shows "what we read" next to "how we'll rebuild it" so the candidate confirms nothing was lost. |
| **Capture** | Click-only. Reads the active tab (JSON-LD `JobPosting` if present, LinkedIn/Naukri containers, else page text, or the user's selection). |
| **Match score** | Deterministic and explainable: must-have skills 60, nice-to-have 10, experience 20, role similarity 10 (re-weighted over the checks that apply). "A or B" requirements count as met by either. Called a *match score*, never an "ATS score". |
| **Gaps** | Missing skills with **I have this**. Confirmed skills are saved to the profile and used for every later job. Nothing is added to a resume unless confirmed. |
| **Tailoring** | Keeps the candidate's structure. Only reorders skills/bullets by relevance, adds confirmed skills, and **bolds real metrics** (%, ₹/$, multipliers, counts). No invented experience. |
| **PDF** | Single-column, real text, standard fonts, no positioned elements, so the text layer reads in order for ATS parsers (tested by re-parsing our own PDF). |
| **Editor** | Edit text, remove/reorder bullets, entries and sections, undo, live preview, accept/reject AI rewordings. |
| **Tracking** | Board: Saved → Applied → Screening call → Interview → Offer → Rejected. Drag cards, or use the Stage menu. |
| **Interview prep** | Per job: a one-line brief, what they want, where you're strong, honest framing for gaps, company research, 8–14 likely questions each with a **drafted answer built from your resume**, questions to ask back, and notice/CTC strategy. Nothing asks the candidate to fill anything in. Cached per job; marked stale when your resume changes. |
| **Company research** | AI mode: Claude searches the public web (review themes, reported interview process and questions, news, pay) and returns a summary **with the sources it retrieved** and a coverage indicator (good / partial / not found). Basic mode: a Wikipedia snapshot. Cached per company for a week. |
| **Ask AI** | Streaming chat grounded in the job description, your resume and the research. AI mode only. |
| **Skill gaps** | What's missing most often across all saved jobs. |
| **Free tier** | `FREE_MONTHLY_LIMIT` (default 10) jobs tailored per month. Re-tailoring the same job is free; deleting a job doesn't refund quota. |

## Modes
- **Basic mode (default, no key):** rule-based job reading, matching, tailoring and prep; Wikipedia company snapshot.
- **AI mode (`ANTHROPIC_API_KEY` in `.env`):** adds company research with web search, personalised prep, better job extraction, rewording suggestions and Ask AI. Default model is `claude-opus-5-5`; set `TAILORKIT_MODEL` (e.g. `claude-sonnet-5-5` or `claude-haiku-5-5`) to trade quality for cost. Requests use the server-side refusal fallback and retry without it if an account rejects it.
- Safety: page text, reviews and resumes are fenced as data in every prompt; rewrites may not change numbers; sources shown are the pages actually retrieved or cited, never model-claimed.

### About Glassdoor and other review sites
There is **no scraping** of Glassdoor, AmbitionBox, LinkedIn or Naukri (their terms forbid it, they block bots, and it would put users' accounts at risk). Review and interview insight comes from public web search through the model, with links to what it found. Coverage varies by company: when review sites can't be read, the brief says so ("Not found") instead of guessing. A possible next step is a "save this page as company research" button in the extension, so a candidate can add a review page they are already looking at.

## Layout
```
server/   Express API, SQLite (node:sqlite), layout-aware resume parsing (pdf-layout.js), matching, tailoring, PDF, interview prep
server/fonts/  Carlito, Arimo, Tinos (SIL OFL) for faithful PDFs;  web/fonts/ Inter (SIL OFL) for the UI
web/      dashboard (vanilla JS modules, no build step; user text is never put in innerHTML)
extension/  Manifest V3 popup + on-click page capture
test/     node:test unit + API tests (incl. PDF round trip)
fixtures/ sample resume and job description
```

## Known limits (be honest with users and yourself)
- **Layout fidelity:** PDFs are read with their layout (positions, bold/italic, indentation, centred headings, page size, margins, font, bullet indent) and rebuilt with embedded metric-compatible fonts (Carlito for Calibri, Arimo for Arial, Tinos for Times), so line wraps and page count match the original. Verified on one real 2-page Google-Docs resume and on a synthetic fixture. Not reproduced: font colours, links, heading-bar colour (a neutral grey bar is used), images, multi-column layouts, tables. DOCX uploads keep bold/italic and bullets but not page size or alignment (the library does not expose them). Editing the original DOCX in place is not built.
- **Resume parsing is heuristic.** Unusual layouts (multi-column, tables, scanned images) can be misread; the editor is the safety net. Scanned PDFs are rejected with a message.
- **Site selectors are untested against live LinkedIn/Naukri.** They are best-effort and will change; the selection fallback and JSON-LD path are the dependable ones. Tested here against local fixture pages only.
- **AI mode has not been run against the real API** (no key was available while building). Request shapes, the web-search pause/resume loop, fallbacks, caching, streaming and every screen are tested with a fake client; real model output quality, latency and cost are unmeasured.
- **AI cost:** company research uses web search and is the most expensive call (cached a week per company). Measure per-user cost before fixing a price, and consider a cheaper `TAILORKIT_MODEL`.
- **No billing, email verification or password reset yet.** `plan` exists on users; `free` is enforced.
- **Auth** is bearer tokens in `localStorage` (30-day sessions) with scrypt password hashes and an in-memory rate limit, which is fine for one process, not for a scaled deployment.
- **Not legal advice:** resumes are sensitive personal data. Before launch, add a privacy policy, DPDP Act consent, deletion/export (both are implemented in Settings), and consider encrypting resume data at rest.
- Match scoring depends on a built-in skill dictionary (tech-heavy, with some marketing/sales/finance/HR terms). Roles outside it get fewer detected requirements ("No clear requirements found").

## Launch
See [`docs/launch-plan.md`](docs/launch-plan.md): website, accounts and access, where data lives, subscription and billing, compliance, phases and open decisions.

## Next
Early-Bird Radar (new-job alerts), Insights (apply→call funnel), more templates, billing (UPI AutoPay), DOCX in-place editing.
