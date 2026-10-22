// Date ranges as they appear on resumes: "Jul 2022 – Present", "[Feb '26 - Present]", "2016-2020", "(May '23 - Aug '23)".

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PART = `(?:${MONTH}\\.?\\s*,?\\s*['’]?\\d{2,4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const END_PART = `(?:present|current|now|till date|ongoing|${DATE_PART})`;
const RANGE = `${DATE_PART}\\s*(?:-|–|—|to|until)\\s*${END_PART}`;
const SINGLE = `(?:${MONTH}\\.?\\s*,?\\s*['’]?\\d{2,4}|(?:19|20)\\d{2})`;

const BRACKETED_END = new RegExp(`\\s*[\\[(]\\s*(${RANGE}|${SINGLE})\\s*[\\])]\\s*$`, 'i');
const RANGE_ANY = new RegExp(`(${RANGE})`, 'i');
const SINGLE_END = new RegExp(`(?:^|[\\s|,])(${SINGLE})\\s*$`, 'i');

// Returns { text, date, bracketed } where date is the trailing/embedded date (without brackets).
export function splitDate(line) {
  const s = String(line);
  let m = s.match(BRACKETED_END);
  if (m) return { text: s.slice(0, m.index).replace(/[\s|,–—-]+$/, '').trim(), date: m[1].trim(), bracketed: true };
  m = s.match(RANGE_ANY);
  if (m) {
    const text = s.replace(m[1], '').replace(/[\s|,–—-]+$/, '').replace(/^[\s|,–—-]+/, '').replace(/\(\s*\)|\[\s*\]/g, '').trim();
    return { text, date: m[1].trim(), bracketed: false };
  }
  m = s.match(SINGLE_END);
  if (m && s.trim().length > m[1].length + 2) return { text: s.slice(0, m.index).replace(/[\s|,–—-]+$/, '').trim(), date: m[1].trim(), bracketed: false };
  return { text: s.trim(), date: '', bracketed: false };
}

export const hasDate = (s) => !!splitDate(s).date;
export const isDateOnly = (s) => { const x = splitDate(s); return !!x.date && !x.text; };
