/* Build a copy of the app that runs with no server at all.
 *
 *   node build/pack-atlas.mjs dist && node build/static-site.mjs dist
 *
 * The catalog and the atlas map are inlined into the page, portraits are sliced
 * out of the atlases at load time, and saving a file goes through the host's
 * download capability, because a sandboxed page cannot save one on its own.
 * The output is a plain directory: serve it anywhere, or publish it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { get } from '../server/catalog.js';

const OUT = process.argv[2] || 'dist';
if (!fs.existsSync(path.join(OUT, 'atlas.json'))) {
  console.error(`no atlas.json in ${OUT}. Run build/pack-atlas.mjs first.`);
  process.exit(1);
}

const cat = await get({ refresh: true });
const atlas = JSON.parse(fs.readFileSync(path.join(OUT, 'atlas.json'), 'utf8'));

fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const f of fs.readdirSync('public/fonts')) {
  fs.copyFileSync(`public/fonts/${f}`, path.join(OUT, 'fonts', f));
}
// Copy every module and stylesheet, rather than a hand-kept list. A list goes
// stale the moment app.js imports something new, and the page then dies on a
// failed import with no options in any menu and nothing in the console but a
// module error.
for (const f of fs.readdirSync('public')) {
  if (f === 'app.js' || f === 'index.html') continue;      // patched, or the page itself
  if (!/\.(js|css)$/.test(f)) continue;
  fs.copyFileSync(`public/${f}`, path.join(OUT, f));
}

// Every relative module app.js imports has to have landed.
const patched = fs.readFileSync('public/app.js', 'utf8');
for (const m of patched.matchAll(/^import[^'"]*['"]\.\/([^'"]+)['"]/gm)) {
  if (!fs.existsSync(path.join(OUT, m[1]))) {
    console.error(`static build: app.js imports ./${m[1]}, which is not in ${OUT}`);
    process.exit(1);
  }
}

let app = fs.readFileSync('public/app.js', 'utf8');
const swap = (re, to, what) => {
  if (!re.test(app)) { console.error(`static build: could not patch ${what}`); process.exit(1); }
  app = app.replace(re, to);
};

swap(/  const \[st, cat\] = await Promise\.all\(\[\s*fetch\('\/api\/state'\)[^;]*?\]\);/s,
  '  const st = window.__SLATE__.state;\n  const cat = window.__SLATE__.catalog;',
  'the state and catalog fetches');

swap(/async function loadPortraits\(d\) \{[\s\S]*?\n\}/,
`const atlasCache = new Map();
function loadAtlas(n) {
  if (!atlasCache.has(n)) atlasCache.set(n, loadImage('atlas-' + n + '.webp'));
  return atlasCache.get(n);
}

async function loadPortraits(d) {
  const out = {};
  const map = window.__SLATE__.atlas;
  await Promise.all((d?.nominees || []).map(async (n) => {
    const m = map[n.slug];
    if (!m) return;
    const sheet = await loadAtlas(m.a);
    if (!sheet) return;
    // A canvas is a drawImage source with width and height, exactly like an
    // Image, so the painter needs no change at all.
    const c = document.createElement('canvas');
    c.width = m.w; c.height = m.h;
    c.getContext('2d').drawImage(sheet, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
    out[n.name] = c;
  }));
  return out;
}`, 'portrait loading');

swap(/function download\(blob, name\) \{[\s\S]*?\n\}/,
`async function download(blob, name) {
  // A sandboxed page cannot start a download; the host offers one instead.
  try {
    const d = await window.claude?.use?.('downloads');
    if (d) { await d.save({ filename: name, data: new Uint8Array(await blob.arrayBuffer()) }); return; }
  } catch (e) {
    notice('Save was declined or is unavailable: ' + e.message, true);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}`, 'the download path');

fs.writeFileSync(path.join(OUT, 'app.js'), app);

const boot = '<script>window.__SLATE__=' + JSON.stringify({
  state: {
    isPublic: true, readyOnly: false, driveConfigured: false, signedIn: false,
    localMode: false, source: cat.source, counts: cat.counts, disclaimer: '',
  },
  catalog: cat,
  atlas,
}) + ';<' + '/script>';

let html = fs.readFileSync('public/index.html', 'utf8');
const tag = '<script type="module" src="app.js"><' + '/script>';
if (!html.includes(tag)) { console.error('static build: could not find the app script tag'); process.exit(1); }
html = html.replace(tag, boot + '\n' + tag);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

const files = fs.readdirSync(OUT).length + fs.readdirSync(path.join(OUT, 'fonts')).length;
console.log(`${OUT}: ${files} files, ${cat.counts.districts} districts, ${cat.counts.withCutouts} portraits`);
console.log('An Artifact holds 256 files at most; this stays well inside that.');
