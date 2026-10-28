// Single source of truth for the product's name and public details.
// The dashboard, the website and the extension all read this. To rename the product: edit here, then run `npm run brand`.
// Working name only: see docs/naming.md before announcing anything.

export const BRAND = {
  name: 'Tailor & Apply',
  mark: 'T',
  tagline: 'Apply with a resume that fits every job.',
  description: 'A Chrome extension and dashboard that tailors your resume to each job in your own layout, shows what is missing, and prepares you for the interview.',
  // Replace before launch. The website build refuses to publish a production build while any of these still look like placeholders.
  domain: 'example.com',
  supportEmail: 'hello@example.com',
  grievanceEmail: 'grievance@example.com',
  legalName: '[Company legal name]',
  address: '[Registered address]',
  gstin: '[GSTIN, if registered]',
  twitter: '',
  linkedin: '',
};
