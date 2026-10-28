// Applies web/brand.js to the places that cannot import it: the extension manifest and popup, and the dashboard's <title>.
import { readFileSync, writeFileSync } from 'node:fs';
import { BRAND } from '../web/brand.js';

const here = (p) => new URL(`../${p}`, import.meta.url);
const edit = (p, fn) => { const f = here(p); const s = readFileSync(f, 'utf8'); const out = fn(s); if (out !== s) { writeFileSync(f, out); console.log('updated', p); } };
const esc = (s) => s.replace(/&/g, '&amp;');

edit('extension/manifest.json', (s) => { const m = JSON.parse(s); m.name = BRAND.name; return `${JSON.stringify(m, null, 2)}\n`; });
edit('extension/popup.js', (s) => s
  .replace(/el\('div', \{ class: 'brand' \}, '[^']*'\)/, `el('div', { class: 'brand' }, '${BRAND.name.replace(/'/g, "\\'")}')`)
  .replace(/Is the [^?]*server running\?/, `Is the ${BRAND.name} server running?`)
  .replace(/sent to the user's own [^ ]*(?: & [^ ]*)? server\./, `sent to the user's own ${BRAND.name} server.`));
edit('web/index.html', (s) => s.replace(/<title>[^<]*<\/title>/, `<title>${esc(BRAND.name)}</title>`));
console.log(`Brand applied: ${BRAND.name}`);
