# Tailor & Apply: launch plan

Status: draft for review. Written from what the product does today. Anything marked **verify** depends on current law, pricing or platform rules that I could not check from here. Treat legal and tax points as questions for a lawyer and a CA, not advice.

## 1. Where you are today (honest snapshot)

| Area | Today | Needed before charging money |
|---|---|---|
| Product | Extension + dashboard work end to end on a laptop; resume layout fidelity verified on one real resume | Test on 20+ real resumes (PDF, DOCX, Google Docs, Word, Canva-style) and fix what breaks |
| Hosting | Runs on your Mac (`npm start`) | Hosted, always on, HTTPS, custom domain |
| Data | One SQLite file on that machine | Managed Postgres, backups, encryption, deletion/export |
| Accounts | Email + password, token in browser storage, no verification or reset | Email verification, password reset, Google sign-in, secure cookies, extension linking, session management |
| AI | Built and tested with a fake client only | Real-key testing, cost measurement, per-user limits |
| Billing | None (free quota only) | Subscriptions, invoices, plan limits |
| Website | None | Landing page, pricing, legal pages |
| Chrome extension | Loaded unpacked, points at `localhost` | Published on the Chrome Web Store, points at production |
| Legal | None | Privacy policy, terms, refund policy, DPDP compliance, grievance contact |

## 2. Who it is for and what you promise

- **Audience for launch:** early-career and mid-career job seekers in India applying to many roles (start with product, tech, analytics and marketing, where the skill dictionary and resumes fit best).
- **Promise:** "Apply with a resume that fits each job, and walk into the interview prepared." Three outcomes: a tailored PDF in your own layout, a clear list of what's missing, an interview brief with company research.
- **Not promised:** jobs, interviews or ATS scores. The tool says "match score vs this job description", never "ATS score".

## 3. Launch scope

In: everything built so far, plus the production foundation below. Out for launch: Early-Bird Radar, auto-apply, mobile apps, team plans, other languages.

## 4. Website

| Page | Purpose |
|---|---|
| Home | One-line promise, a 30-second demo (extension capture → score → PDF), three outcomes, pricing teaser, call to action |
| Pricing | Free vs paid, what each includes, GST-inclusive prices, FAQ |
| How it works | Install extension → upload resume → capture → tailor → prepare |
| FAQ and help | Install steps, privacy, "does it submit applications" (no), supported sites |
| Legal | Privacy policy, Terms, Refund and cancellation, Contact and grievance officer |
| Blog (later) | Resume and interview content for search traffic |

- **Domains:** marketing site at `yourproduct.com`, app at `app.yourproduct.com`, API on the same origin as the app.
- **Stack:** a static site (Astro or Next.js static export) on Vercel or Cloudflare Pages. Keep it separate from the app so a marketing change never risks the app.
- **Launch tooling:** waitlist form (email), privacy-friendly analytics (Plausible or PostHog), a status page later.

## 5. How each user accesses their account

**Sign-up and sign-in**
- Email + password (hashed with argon2id or scrypt, as now), plus **Google sign-in** (most candidates have a Gmail), plus email magic link as a fallback.
- **Email verification** before the first tailored resume; **password reset** by email link.
- Phone OTP is not recommended at launch: SMS in India needs DLT registration and costs money per message. Revisit if sign-up drop-off is high.

**Web session**
- Move from a token in `localStorage` to **httpOnly, Secure, SameSite cookies** with CSRF protection, so a script injected into a page cannot read the session.
- "Active sessions" list in Settings with "sign out everywhere".

**Chrome extension linking** (replaces typing a password into the popup)
1. Popup shows "Connect to your account" and opens `app.yourproduct.com/connect?device=…`.
2. The user is already signed in on the web, taps **Approve**.
3. The extension receives a **device token**: scoped (capture only), revocable, listed under Settings → Devices.
4. Lost laptop or shared computer: revoke the device from the web.

**Isolation and safety**
- Every query is scoped to the signed-in user (already tested). Add Postgres **row-level security** as a second layer.
- Rate limits and lockout on sign-in, bot protection on sign-up.
- Optional 2FA (authenticator app) after launch.
- **Support access:** staff see account metadata by default; viewing resume content needs the user's consent and is logged.
- **Build vs buy:** the safest path for a small team is a managed auth service (Clerk, Auth0, Supabase Auth or similar) rather than maintaining this yourself. Cost is small at early scale; the trade-off is a vendor dependency. Decision needed (see section 14).

## 6. Where the data is stored

```
Browser / extension ──HTTPS──> App server (India region)
                                  │        │            │
                                  │        │            └──> Anthropic API (AI: US by default, see note)
                                  │        └──> Object storage (generated PDFs, short-lived)
                                  └──> Managed Postgres (all account data)  ──> daily backups
Razorpay (payments) ──webhooks──> App server        Email provider (transactional mail)
```

| Data | Where | Notes |
|---|---|---|
| Account (email, password hash, plan) | Postgres | Password never stored in plain text |
| Resume: parsed content and layout settings | Postgres (JSON) | The **original uploaded file is not kept**; only extracted text and the structured model. Less to protect and to disclose |
| Jobs, match scores, tailored resumes, notes | Postgres | Per user, deletable |
| Generated PDFs | Created on demand; optional short-lived object storage | Prefer not to keep them |
| Company research | Postgres, shared across users | Public information only, cached a week |
| Chat and prep | Prep saved per job; chat not stored (today) | Decide whether to keep chat history |
| Usage and billing state | Postgres | Source of truth for plan limits |
| Payment details | **Razorpay only** | You never see or store card or UPI details |
| Logs and errors | Log service (Sentry etc.) | Scrub personal data; never log resume text |

- **Region:** put Postgres and the app in India (for example AWS `ap-south-1` Mumbai) for latency and for explaining where data lives. **Verify** managed-database options and pricing in that region.
- **Encryption:** TLS everywhere, provider-managed encryption at rest. Stretch goal: application-level encryption of resume text with a managed key.
- **Backups:** automated daily with point-in-time recovery (7–30 days). Test a restore before launch.
- **Deletion and export:** both already exist in Settings. Backups age out on the retention schedule; say so in the privacy policy.
- **AI provider:** resume and job text is sent to Anthropic to generate results. Disclose it as a sub-processor. By default processing happens outside India. **Verify** whether region-specific options (for example through a cloud provider's Mumbai region) fit your needs and budget.

## 7. Subscription and billing

**Payment provider:** Razorpay Subscriptions is the usual choice for India: cards, UPI AutoPay and netbanking mandates. **Verify** current fees, supported mandates and settlement timelines. Alternatives: Cashfree, Stripe (check India availability for your entity).

**Proposed plans** (prices incl. GST; test before fixing):

| | Free | Pro (proposed) |
|---|---|---|
| Price | ₹0 | ₹299 / month, or ₹699 for 3 months (job hunts last 2–4 months) |
| Tailored resumes | 10 / month | Unlimited with fair use (for example 100) |
| Match score, gaps, tracking, editor | Yes | Yes |
| Interview prep | Basic (rule-based) | **AI**: company research, answers, sources, up to 30 AI preps / month |
| Ask AI chat | No | Yes, with a monthly cap |
| Extension | Yes | Yes |

- A cheaper **₹199 Starter** (tracker + more tailoring, no AI) is worth an A/B test against ₹299 Pro.
- **Why AI needs caps:** AI is the main variable cost. Rough arithmetic with **assumed, unmeasured** token counts: a prep of ~20k tokens in and ~5k out on Claude Opus 5.5 ($4 / $20 per million tokens) is about $0.18 before search costs. At ~₹85–90 per dollar (**verify**) that is ₹15–16 per prep, so a Pro user doing 20 preps could cost more than ₹299. Claude Sonnet 5.5 ($2 / $10) halves that, Claude Haiku 5.5 ($0.10 / $0.50) is far cheaper. **Measure real cost per prep, per chat message and per capture on 20–30 real jobs before setting limits or prices.**
- **Cost controls already built in:** research cached per company for a week, prep cached per job, model configurable with one setting.

**Mechanics**
1. Checkout creates a Razorpay subscription; a **webhook** updates the plan in your database (never trust the browser).
2. Plan limits are enforced on the server (the free quota logic already works this way).
3. Failed payments: retry, email, short grace period, then downgrade. Never delete data on downgrade.
4. Cancel anytime from Settings; access continues to the period end. Refund policy stated up front (Razorpay requires a refund and cancellation page).
5. **GST invoices:** 18% GST is typically charged on software services. **Verify** with a CA: registration threshold, invoice format, and whether you need an invoicing tool (Zoho Books, ClearTax, etc.). Razorpay does not issue GST-compliant invoices for you.
6. UPI AutoPay and card mandates have RBI rules (authentication on setup, advance debit notifications). Razorpay handles most of it. **Verify** current rules.
7. Abuse: free quota is per account; add email verification and basic device or IP checks to stop sign-up farming.

## 8. Infrastructure and operations

- **App hosting:** a managed platform (Render, Fly.io, Railway) or AWS (ECS or App Runner). For a small team, a managed platform in an India or Singapore region is the fastest path; move to AWS Mumbai if you need strict India residency.
- **PDF rendering** uses headless Chromium: run it in the same container image, with memory limits, and queue it if traffic grows.
- **Environments:** local, staging, production. Staging uses test Razorpay keys.
- **CI:** run `npm test`, `npm run e2e` and `npm run e2e:ai` on every change; deploy from `main` only.
- **Secrets:** environment variables in the host's secret store; never in the repo.
- **Monitoring:** error tracking (Sentry), uptime checks, alerts on payment webhook failures and AI error rate.
- **Rough monthly cost at start:** hosting + managed Postgres + email + monitoring is small (low thousands of rupees) compared with AI usage, which dominates. **Verify** with real quotes.

## 9. Chrome Web Store

- One-time developer registration fee (about US$5, **verify**), then review that can take days to weeks.
- Needs: a clear single purpose, a privacy policy URL, justification for each permission (`activeTab`, `scripting`, `storage`), screenshots, a short demo video.
- Before submitting: replace `localhost` in `host_permissions` with the production domain, remove the "Load unpacked" instructions, and describe plainly that the extension reads a page only when the user clicks.
- Edge uses the same package; Firefox needs small changes.
- **Policy risk:** the extension reads job pages including LinkedIn pages on user action. Review LinkedIn's terms and the Web Store user-data policy with your lawyer before launch; keep the design as it is (no background scraping, no automation of the site).

## 10. Legal and compliance (India)

Questions for a lawyer / CA, not conclusions:
- **DPDP Act 2023:** you will hold personal data (resumes). Expect: a clear notice and consent at sign-up, purpose limits, user rights (access, correction, erasure), a grievance contact, breach notification, and rules for minors. **Verify** the current rules and timelines.
- **Privacy policy** listing every sub-processor: hosting, database, Anthropic, Razorpay, email, analytics, error tracking.
- **Terms of service**, **refund and cancellation policy**, **contact and grievance officer** details.
- **Business entity, GST registration, and a current bank account** for the payment gateway's onboarding.
- **Trademarks and names:** check the product name and domain are free.
- **Claims:** don't claim ATS scores, guaranteed interviews, or "verified" company reviews.

## 11. Phases

| Phase | Weeks | Goal | Exit criteria |
|---|---|---|---|
| 0. Validate | 0–2 | Proof it works on real people's resumes | 20 real resumes parse and rebuild acceptably; 10–15 job seekers interviewed; willingness to pay tested at ₹199 vs ₹299; real AI cost per prep measured |
| 1. Production foundation | 2–5 | A safe, hosted app | Postgres, secure cookies, email verification, reset, Google sign-in, extension linking, deploy pipeline, backups restored once in a test, monitoring |
| 2. Money and trust | 4–7 | Able to charge and be accountable | Razorpay subscriptions + webhooks, plan limits, GST invoices, website, legal pages, Web Store submission |
| 3. Private beta | 7–8 | Real users, real payments | 50–100 users, support channel, fixed top issues, payment flow tested with real UPI |
| 4. Public launch | 9–10 | Open the doors | Store listing live, launch posts, referral link, pricing page live |

These weeks assume one or two engineers. The longest unknowns are extension store review and legal review: start both early.

## 12. What to measure

- **Activation:** uploaded a resume → captured a first job within 24 hours → downloaded a tailored PDF.
- **Engagement:** captures per week, PDFs downloaded, interview prep opened.
- **Outcome proxy:** users who move jobs to Interview or Offer (self-reported).
- **Business:** free → paid conversion, monthly churn (expect high; job hunts end), refund rate, AI cost per active user, gross margin.
- **Quality:** share of resumes where the user edits the parse heavily, share of captures where the user corrects the title or company.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Resume parsing fails on some layouts | Test set of 20+ real resumes; "Fix in editor" always available; keep improving |
| LinkedIn or a job site changes its page | Structured data and text selection fallback; "Edit details"; monitor capture failures |
| AI cost eats the margin | Caps, caching, cheaper model for light tasks, measure before pricing |
| Users churn after landing a job | Quarterly plan, referral credit, alumni pricing |
| Privacy incident | Minimal data kept, encryption, no resume text in logs, deletion tools, incident plan |
| Platform policy action (store or site terms) | Click-only capture, no automation, legal review before launch |
| Unproven demand | Phase 0 interviews and a paid pre-order or waitlist test before building billing |

## 14. Decisions I need from you

1. **Auth:** managed service (faster, recommended) or build it ourselves?
2. **Hosting:** managed platform for speed, or AWS Mumbai from day one?
3. **Price:** test ₹199 vs ₹299, and whether to offer the 3-month plan?
4. **AI in the free plan:** none (recommended, for cost), or a small taste (for example 2 AI preps)?
5. **Business entity and GST status:** do you have a registered entity and GST number, or does that need to start now?
6. **Launch audience:** all roles, or product and tech first?
7. **Who owns legal review** (lawyer / CA) and by when?

## 15. Engineering backlog to reach launch

| Item | Why | Size |
|---|---|---|
| Postgres instead of SQLite, migrations, connection pooling | Hosted, multi-instance, backups | M |
| Secure cookie sessions + CSRF | Remove token-in-browser risk | M |
| Email verification, password reset, transactional email | Basic account safety | M |
| Google sign-in | Lower sign-up friction | S |
| Extension device linking (replace popup password) | Safer, smoother | M |
| Razorpay subscriptions + webhooks + plan enforcement | Charge money | L |
| Per-plan AI limits and usage metering | Control cost | M |
| Settings → Devices, Sessions, Billing portal | Self-service | M |
| Rate limiting and abuse controls on a shared store (Redis) | Safety at scale | S |
| Admin/support tooling with audit log | Support without exposing data | M |
| Containerise (app + Chromium), CI/CD, staging | Repeatable deploys | M |
| Error tracking, structured logs without personal data, alerts | Operate it | S |
| Website, legal pages, waitlist | Acquire and be accountable | M |
| Web Store packaging and production config | Distribution | S |
| 20-resume parsing test set and fixes | The core promise | M |
| Real-key AI testing and cost report | Pricing | S |
