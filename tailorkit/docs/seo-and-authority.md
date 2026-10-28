# SEO and "domain authority": what is real and what to do

## 1. What domain authority is (and is not)

**Domain Authority (DA)** is a 1–100 score invented by Moz. **Domain Rating (DR)** is Ahrefs' version. They are *predictions* built mostly from how many different, trustworthy websites link to yours. Google does not use them as a ranking factor, and nobody can set or buy them directly.

So "boost domain authority" really means **earn links from real sites, and publish pages worth linking to**. A new domain starts near 1. Realistic expectation: single digits after 3 months, 15–25 after a year of steady work. Treat DA as a progress thermometer, not the goal. The goals are **indexed pages, impressions, clicks, waitlist sign-ups**.

**Do not** buy links, join link exchanges or PBNs, spam comments, or use "DA 50 in 7 days" services. Google penalises these, and a penalty on a new domain is worse than having no authority.

## 2. What is already built into the website

| Area | Done in `site/` |
|---|---|
| Crawlability | Static HTML (no JS needed to read content), clean URLs, `robots.txt`, `sitemap.xml`, custom 404 |
| Page basics | Unique title and meta description per page (tests enforce length), one `h1`, canonical URLs, `lang="en-IN"` |
| Structured data | Organization, WebSite, SoftwareApplication with offers, FAQPage, Article, BreadcrumbList (JSON-LD) |
| Social | Open Graph and Twitter card tags, generated 1200×630 share image |
| Speed | No framework, one small CSS file, self-hosted font, no third-party scripts |
| Mobile and dark mode | Tested at 390px with no sideways scroll |
| Content | 3 guides, FAQ, how it works, pricing |
| Linkable asset | **Free resume keyword checker** (runs in the browser, nothing uploaded) |
| Feeds | `rss.xml` for the guides |

`npm run site:build -- --mode production` refuses to build until the domain, emails and company details are real.

## 3. Launch checklist (you do these; they need your accounts)

1. Buy the domain (see `naming.md` for checks). Put the name, domain and emails in `web/brand.js`.
2. Host the `site/dist` folder on Cloudflare Pages, Netlify or Vercel (all have free tiers). Point `www` and the root to it. Force HTTPS.
3. Add the site to **Google Search Console** (Domain property, DNS verification) and **Bing Webmaster Tools**. Submit `sitemap.xml`. Watch **Pages → Indexing** for errors.
4. Install privacy-friendly analytics (Plausible or similar) and note the waitlist conversion rate.
5. Create profiles with a link back (these are normal, low-value-but-legitimate links and also protect your brand name): LinkedIn company page, X, GitHub organisation, Product Hunt, Crunchbase, AlternativeTo, G2/Capterra listing, Chrome Web Store page, YouTube channel.
6. Set up the waitlist endpoint: run the app at `app.<domain>`, set `ALLOWED_ORIGINS=https://<domain>`. Emails land in the `waitlist` table.
7. Complete the legal pages with a lawyer (`privacy`, `terms`, `refund`).

## 4. Links worth earning (white-hat), roughly in order of effort-to-payoff

1. **The free keyword checker.** Tools get linked. Share it where job seekers already are: r/developersIndia, r/indianworkplace and similar (read each community's self-promotion rules first and be a participant, not just a poster), LinkedIn posts, college placement-cell groups, Telegram/WhatsApp job groups.
2. **Placement cells and career clubs.** Email 30–50 college placement officers and student career clubs offering the checker and the guides as a free resource. Many keep a "resources" page, which is a genuine, relevant link.
3. **Original data.** Once you have real users, publish anonymised, aggregated findings ("the 10 most common skills missing from resumes applying to backend roles") with methodology. Journalists and bloggers link to numbers. Do not publish anything until the data is real.
4. **Guest posts and interviews.** Offer practical articles to career blogs, Medium publications and newsletters on India jobs. Include one relevant link.
5. **Product directories and roundups.** Submit to "best resume tools", "job search tools" lists, and ask the authors of existing roundups to consider you. Be polite and specific.
6. **Founder story.** A short "why I built this" post on LinkedIn, Hacker News (Show HN), IndieHackers and Product Hunt often brings a few good links and your first users.
7. **Broken-link outreach.** Find resource pages with dead links about resumes or interview prep and suggest your relevant guide as a replacement.

### Outreach template (placement cell)

> Subject: Free resume keyword tool for your students
>
> Hi <name>, I'm <you>, building a free tool that shows a student which skills a job description asks for that their resume does not mention. It runs in the browser and stores nothing. I thought it might help your final-year students ahead of placements. Here it is: <link>. If it's useful, you're welcome to list it on your resources page. Happy to answer any questions or do a short session for students.

### Outreach template (blog or newsletter)

> Hi <name>, I enjoyed your piece on <specific article>. I wrote a practical guide on <topic> with a step-by-step method: <link>. If it would be useful to your readers, I'd be glad if you linked it, or I can write something original for you. Either way, thanks for the good work.

Rules: personalise every email, never mass-send the same text, never offer payment for a link, accept no.

## 5. Content plan (first 90 days)

The three guides target *how to* queries. Add roughly one useful page every week or two, always from real questions you hear from users:

- Weeks 1–4: resume formats for freshers, "resume for ATS in India", cover letter basics, notice period negotiation, how to answer "expected CTC".
- Weeks 5–8: role-specific skill lists (backend, data analyst, product manager, QA, digital marketing), each linking to the checker.
- Weeks 9–12: interview question banks by role (written by you, not scraped), salary-negotiation guide, "how to track applications" template download.

Each page: answer one question fully, include a real example, link to related pages and the checker, update the date when you revise it. Avoid thin or AI-padded pages; they do not rank and do not earn links.

## 6. What to measure (weekly)

| Metric | Where | Healthy sign |
|---|---|---|
| Pages indexed | Search Console → Pages | Rising toward all pages |
| Impressions and clicks, top queries | Search Console → Performance | Rising week on week |
| **Referring domains** | Ahrefs Webmaster Tools (free for your own site) | +2–5 relevant domains a month |
| Domain Authority / Rating | Moz Link Explorer (limited free), Ahrefs Webmaster Tools | Slow climb; ignore weekly noise |
| Waitlist conversion | Analytics | 2–5% of visitors is typical for a clear page; test headlines |
| Checker uses | Analytics events | Growing share of visitors |

## 7. Realistic 90-day outcomes

- Month 1: site live, indexed, 10–20 profile and directory links, first posts. DA may still read 1–5.
- Month 2: first guides ranking for long-tail queries, first checker shares, 5–15 referring domains.
- Month 3: some organic visits each day, a handful of relevant links from placement cells or blogs, waitlist growing from search and shares.

If numbers are far below this, the usual causes are: pages not indexed (check Search Console), thin content, or no real outreach. Fix those before spending money.
