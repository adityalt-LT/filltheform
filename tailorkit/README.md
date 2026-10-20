# Tailor & Apply Kit

A Chrome extension plus a dashboard (same login) that helps a candidate apply with a resume that fits each job, without changing the resume's own structure.

**Flow:** upload resume once → open a job page or LinkedIn hiring post → click the extension → see a match score and what's missing → download a tailored PDF → track the application → prepare for the screening call.

It never submits an application. The candidate reviews and applies themselves.

## Run it

```bash
cd tailorkit
npm install
cp .env.example .env        # optional; see "Modes"
npm start                   # http://localhost:3000
npm test                    # 28 unit/API tests
npm run e2e                 # real Chromium + the real extension (7 steps)
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
| **Screening prep** | Likely questions with answers drafted only from the candidate's own profile; unknown facts (notice period, CTC…) are flagged "Needs your input", never guessed. |
| **Skill gaps** | What's missing most often across all saved jobs. |
| **Free tier** | `FREE_MONTHLY_LIMIT` (default 10) jobs tailored per month. Re-tailoring the same job is free; deleting a job doesn't refund quota. |

## Modes
- **Basic mode (default, no key):** rule-based job reading, matching and tailoring.
- **AI mode (`ANTHROPIC_API_KEY`):** better job extraction (title, company, requirements) and rewording suggestions. Suggestions are never applied silently, may not change any number, and page text is fenced as data so instructions inside a job page are ignored.

## Layout
```
server/   Express API, SQLite (node:sqlite), parsing, matching, tailoring, PDF, screening prep
web/      dashboard (vanilla JS modules, no build step; user text is never put in innerHTML)
extension/  Manifest V3 popup + on-click page capture
test/     node:test unit + API tests (incl. PDF round trip)
fixtures/ sample resume and job description
```

## Known limits (be honest with users and yourself)
- **Layout fidelity:** the candidate's layout is *rebuilt* from the detected structure for both PDF and DOCX uploads (same sections, order, headings, bullet glyph). It is not a pixel copy, and editing the original DOCX in place is not built yet. Fonts and column layouts are not preserved. The confirm step exists so candidates see this up front.
- **Resume parsing is heuristic.** Unusual layouts (multi-column, tables, scanned images) can be misread; the editor is the safety net. Scanned PDFs are rejected with a message.
- **Site selectors are untested against live LinkedIn/Naukri.** They are best-effort and will change; the selection fallback and JSON-LD path are the dependable ones. Tested here against local fixture pages only.
- **AI mode has not been run** in development (no API key was available); it is covered only by the fallbacks and the number-preservation guard.
- **No billing, email verification or password reset yet.** `plan` exists on users; `free` is enforced.
- **Auth** is bearer tokens in `localStorage` (30-day sessions) with scrypt password hashes and an in-memory rate limit, which is fine for one process, not for a scaled deployment.
- **Not legal advice:** resumes are sensitive personal data. Before launch, add a privacy policy, DPDP Act consent, deletion/export (both are implemented in Settings), and consider encrypting resume data at rest.
- Match scoring depends on a built-in skill dictionary (tech-heavy, with some marketing/sales/finance/HR terms). Roles outside it get fewer detected requirements ("No clear requirements found").

## Next
Early-Bird Radar (new-job alerts), Insights (apply→call funnel), more templates, billing (UPI AutoPay), DOCX in-place editing.
