# Testing guide

Three ways to test, from zero setup to full product.

## A. The hosted demo (nothing to install)

Open the dashboard demo link. It runs the real matching, tailoring and prep code in your browser on a sample resume and six sample jobs. It is a **demo**: nothing is saved or sent, PDF download is switched off (previews cannot download), and the AI chat replies are scripted.

Checklist:
- [ ] Tracking: board and table views, search, stage filter; drag a card to another stage
- [ ] Open a job: score, breakdown, missing skills; click "I have this" and watch the score change
- [ ] Interview prep tab: open questions, read the drafted answers; open a job that has no prep yet and generate it
- [ ] Ask AI tab: click a suggestion and read the scripted reply
- [ ] Add job: paste any real job description and see it scored and tailored
- [ ] Resume editor: remove a bullet, undo, check the live preview
- [ ] Skill gaps page, Profile page, Settings page
- [ ] Dark theme (switch your system theme) and your phone

Use **Reset** (bottom right) to restore the sample data.

## B. The real app on your Mac (full product, with PDF download and the extension)

```bash
cd ~/tailorkit-app && git pull        # your clone of this repo
cd tailorkit && npm install && npm start
```
Open http://localhost:3000, create an account, upload **your own resume**. Then:

1. Check the "Here's what we found" summary (name, contact, role, skills, years). Fix anything wrong.
2. Open Profile → Edit master resume. Compare the preview with your original.
3. Load the extension: chrome://extensions → Developer mode → Load unpacked → the `extension` folder. Sign in once in its popup.
4. Open 5–10 real job pages (LinkedIn job, LinkedIn hiring post, Naukri, a company careers page) and capture each. Record any wrong title or company.
5. For each: check the score, confirm one gap, tailor, download the PDF, open it and check the layout, then compare the text order by selecting all and pasting into a text editor.
6. Prep and chat need an API key: `ANTHROPIC_API_KEY=... npm start`. Try prep on 3 jobs and note the quality and time. **This is the first run against the real API**; tell me anything odd.

## C. Automated tests (for developers)

```bash
npm test            # unit and API tests
npm run e2e         # real Chromium with the real extension
npm run e2e:ai      # AI screens against a fake AI client
npm run demo:build && npm run e2e:demo     # static demo
npm run site:build && npm run e2e:site     # marketing site
```

## What to report

For each problem: the page address (for capture issues), what you expected, what you saw, a screenshot. The three most valuable things to learn from real testing are:

1. How often the resume rebuild is acceptable on *other people's* resumes (try 10 different ones).
2. How often company and title capture is right on live LinkedIn and Naukri.
3. What a real AI prep costs in tokens, to set limits and prices.
