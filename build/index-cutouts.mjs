/* Write data/cutouts.json: the list of portrait filenames.
 *
 * The server reads this instead of listing public/cutouts, because on a
 * serverless host the function does not have that folder. Vercel serves
 * public/ to browsers from its CDN and bundles only what vercel.json's
 * includeFiles names into the function, which is data/**. Without this index
 * the catalog found no portraits and every face rendered as a placeholder,
 * while the images themselves were sitting there being served perfectly well.
 *
 *   node build/index-cutouts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'public', 'cutouts');
const out = path.join(ROOT, 'data', 'cutouts.json');

if (!fs.existsSync(dir)) {
  console.error(`no ${dir}; nothing to index`);
  process.exit(1);
}
const files = fs.readdirSync(dir).filter((f) => /\.(webp|png)$/i.test(f)).sort();
fs.writeFileSync(out, JSON.stringify(files));
console.log(`data/cutouts.json: ${files.length} portraits`);
