// Canonical skill dictionary. Each line: "Canonical Name: alias, alias".
// Used to normalise skills found in resumes and job descriptions so they can be
// compared deterministically ("Node", "NodeJS" and "Node.js" are the same skill).

const RAW = `
JavaScript: js, javascript, ecmascript, es6
TypeScript: ts, typescript
Python: python, python3
Java: java
C++: c++, cpp
C#: c#, csharp, c sharp
Go: golang, go lang
Rust: rust
PHP: php
Ruby: ruby
Kotlin: kotlin
Swift: swift
Scala: scala
R: r programming, rstudio
SQL: sql, t-sql, pl/sql, plsql
MySQL: mysql
PostgreSQL: postgres, postgresql
MongoDB: mongodb, mongo db
Redis: redis
Elasticsearch: elasticsearch, elastic search
React: react, reactjs, react.js
Angular: angular, angularjs
Vue: vue, vuejs, vue.js
Next.js: next.js, nextjs
Node.js: node, nodejs, node.js
Express: express.js, expressjs
Django: django
Flask: flask
FastAPI: fastapi
Spring Boot: spring boot, springboot, spring
HTML: html, html5
CSS: css, css3
Tailwind CSS: tailwind, tailwindcss
Sass: sass, scss
REST APIs: rest, restful, rest api, rest apis, restful apis
GraphQL: graphql
Microservices: microservices, microservice
Docker: docker, containers, containerization
Kubernetes: kubernetes, k8s
AWS: aws, amazon web services
Azure: azure
GCP: gcp, google cloud
Terraform: terraform
Ansible: ansible
Jenkins: jenkins
CI/CD: ci/cd, cicd, ci cd, continuous integration, continuous delivery, continuous deployment
Git: git, github, gitlab, bitbucket
Linux: linux, unix
Kafka: kafka
RabbitMQ: rabbitmq
Machine Learning: machine learning, ml
Deep Learning: deep learning
NLP: nlp, natural language processing
Computer Vision: computer vision
TensorFlow: tensorflow
PyTorch: pytorch
Pandas: pandas
NumPy: numpy
scikit-learn: scikit-learn, sklearn
Data Analysis: data analysis, data analytics, analytics
Data Engineering: data engineering, etl, elt
Spark: spark, pyspark, apache spark
Airflow: airflow
Tableau: tableau
Power BI: power bi, powerbi
Excel: excel, ms excel, microsoft excel, advanced excel
Looker: looker
dbt: dbt
Snowflake: snowflake
BigQuery: bigquery
Android: android
iOS: ios
React Native: react native
Flutter: flutter
Selenium: selenium
Cypress: cypress
Jest: jest
Playwright: playwright
Test Automation: test automation, automation testing
Manual Testing: manual testing
QA: qa, quality assurance
JIRA: jira
Agile: agile
Scrum: scrum
System Design: system design
Data Structures: data structures, dsa, algorithms
OOP: oop, object oriented, object-oriented
Figma: figma
UI/UX: ui/ux, ux, ui design, ux design, user experience, user interface
Product Management: product management, product manager
Roadmapping: roadmap, roadmapping
Stakeholder Management: stakeholder management, stakeholders
A/B Testing: a/b testing, ab testing, experimentation
Salesforce: salesforce, sfdc
HubSpot: hubspot
CRM: crm
SEO: seo, search engine optimization
SEM: sem, google ads, adwords
Social Media Marketing: social media marketing, social media
Content Writing: content writing, copywriting, content creation
Email Marketing: email marketing
Google Analytics: google analytics, ga4
Performance Marketing: performance marketing
Digital Marketing: digital marketing
Lead Generation: lead generation, lead gen
Sales: sales, b2b sales, inside sales
Business Development: business development, bd
Account Management: account management
Customer Support: customer support, customer service
Customer Success: customer success
Negotiation: negotiation
Cold Calling: cold calling
Recruitment: recruitment, talent acquisition, sourcing
HR Operations: hr operations, hr ops
Payroll: payroll
Onboarding: onboarding
Employee Engagement: employee engagement
Accounting: accounting, bookkeeping
Tally: tally, tally erp, tally prime
GST: gst
TDS: tds
Financial Analysis: financial analysis, financial modelling, financial modeling
Auditing: audit, auditing
SAP: sap, sap fico, sap erp
Budgeting: budgeting, forecasting
Supply Chain: supply chain
Logistics: logistics
Procurement: procurement
Operations Management: operations management
Project Management: project management, project manager, pmp
Process Improvement: process improvement, lean, six sigma
Vendor Management: vendor management
Communication: communication, communication skills
Leadership: leadership, team leadership
Team Management: team management, people management
Problem Solving: problem solving, problem-solving
Presentation: presentation, presentations, powerpoint, ppt
Research: research
Technical Writing: technical writing
MS Office: ms office, microsoft office
Canva: canva
Photoshop: photoshop
Video Editing: video editing, premiere pro
AutoCAD: autocad
Embedded Systems: embedded systems, embedded
IoT: iot, internet of things
Cybersecurity: cybersecurity, cyber security, infosec
Networking: networking, tcp/ip
Blockchain: blockchain
Salesforce Admin: salesforce admin
ServiceNow: servicenow
Shopify: shopify
WordPress: wordpress
`;

export const SKILLS = RAW.trim().split('\n').map((line) => {
  const i = line.indexOf(':');
  const name = line.slice(0, i).trim();
  const aliases = new Set(line.slice(i + 1).split(',').map((a) => a.trim().toLowerCase()).filter(Boolean));
  aliases.add(name.toLowerCase());
  return { name, aliases: [...aliases] };
});

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// One compiled regex per skill. Boundaries are "not a letter/digit", so
// "c++" and "node.js" work and "java" does not match inside "javascript".
const PATTERNS = SKILLS.map((s) => {
  // Longest aliases first so "react native" wins over "react".
  const alts = [...s.aliases].sort((a, b) => b.length - a.length).map(esc).join('|');
  return { name: s.name, re: new RegExp(`(?<![a-z0-9+#])(?:${alts})(?![a-z0-9]|\\+\\+|#)`, 'i') };
});

// Skills that are too generic to treat as hard requirements on their own are
// still matched, but a single-letter alias like "r" or "go" needs context.
const AMBIGUOUS = new Set(['R', 'Go', 'Swift', 'Spring Boot', 'Express', 'Research', 'Sales', 'Excel']);

// Returns canonical skills in the order they first appear in the text.
export function findSkills(text) {
  const out = [];
  if (!text) return out;
  for (const p of PATTERNS) {
    let idx;
    if (AMBIGUOUS.has(p.name)) {
      if (!ambiguousHit(p.name, text)) continue;
      idx = Math.max(0, text.toLowerCase().indexOf(p.name.toLowerCase()));
    } else {
      const m = p.re.exec(text);
      if (!m) continue;
      idx = m.index;
    }
    out.push({ name: p.name, idx });
  }
  return out.sort((a, b) => a.idx - b.idx).map((x) => x.name);
}

function ambiguousHit(name, text) {
  switch (name) {
    case 'R': return /\b(r programming|rstudio|ggplot|tidyverse|r,\s*python|python,\s*r)\b/i.test(text);
    case 'Go': return /\b(golang|go lang|go\s*\(|\bgo,\s*(java|python|rust)|(java|python|rust),\s*go\b)/i.test(text);
    case 'Swift': return /\bswift(ui)?\b.*\b(ios|xcode|apple)\b|\b(ios|xcode)\b.*\bswift\b/i.test(text);
    case 'Spring Boot': return /\bspring\s*boot\b|\bspring\s*(mvc|framework|cloud)\b/i.test(text);
    case 'Express': return /\bexpress(\.js|js)\b|\bexpress\b.*\bnode\b|\bnode\b.*\bexpress\b/i.test(text);
    case 'Research': return /\b(user |market |ux )?research\b/i.test(text);
    case 'Sales': return /\bsales\b/i.test(text);
    // "I excel at" is a verb. Excel the tool appears as MS/Advanced Excel, next to other tools, or in a list.
    case 'Excel': return /\b(ms|microsoft|advanced)\s+excel\b|\bexcel\s*(,|\/|and|&)\s*(sql|tableau|power ?bi|word|powerpoint|jira|google sheets)\b|\b(sql|tableau|power ?bi|word|powerpoint|jira|google sheets)\s*(,|\/|and|&)\s*excel\b|\bexcel\s+(formulas?|spreadsheets?|sheets?|pivot|macros?|skills|dashboards?|models?)\b|\bvlookup\b|(^|[,;:(•·|\/]\s*)Excel(\s*[,;)\/•·|]|\s*$)/m.test(text);
    default: return false;
  }
}

export function canonicalSkill(raw) {
  const k = String(raw).trim().toLowerCase();
  for (const s of SKILLS) if (s.aliases.includes(k)) return s.name;
  return null;
}

export const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ').trim();
