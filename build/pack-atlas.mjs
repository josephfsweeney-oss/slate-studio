/* Pack public/cutouts into a handful of texture atlases.
 *
 * A published Artifact holds at most 256 files in total, and there are 301
 * portraits, so one file each is not an option. Thirteen atlases are. Packing
 * runs in district order, so a district's faces usually come from one atlas and
 * opening a district pulls one file rather than ten.
 *
 *   node build/pack-atlas.mjs <outDir>
 *
 * Writes atlas-N.webp plus atlas.json, a slug -> {a, x, y, w, h} map.
 */
import { chromium as resolveChromium } from './playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { get } from '../server/catalog.js';

const SRC = 'public/cutouts';
const OUT = process.argv[2] || 'dist';
const MAX = 4096;               // keeps a decoded atlas near 67 MP, safe on phones

fs.mkdirSync(OUT, { recursive: true });
const cat = await get({ refresh: true });

const order = [];
const seen = new Set();
for (const d of cat.districts) {
  for (const n of d.nominees) {
    if (n.cutout && !seen.has(n.slug)) { seen.add(n.slug); order.push(n.slug); }
  }
}
if (!order.length) {
  console.error('no cutouts found under ' + SRC);
  process.exit(1);
}

const chromium = await resolveChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const meta = {};
let atlas = 0, shelfY = 0, shelfH = 0, cursorX = 0, placed = [];

async function flush() {
  if (!placed.length) return;
  const b64 = await page.evaluate(async ([items, W, H]) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    for (const it of items) {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = it.src; });
      x.drawImage(img, it.x, it.y);
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.92));
    const u = new Uint8Array(await blob.arrayBuffer());
    // Spreading a large array into fromCharCode overflows the stack.
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [placed, MAX, Math.min(MAX, shelfY + shelfH)]);
  fs.writeFileSync(path.join(OUT, `atlas-${atlas}.webp`), Buffer.from(b64, 'base64'));
  placed = []; atlas++; shelfY = 0; shelfH = 0; cursorX = 0;
}

for (const slug of order) {
  const file = fs.existsSync(`${SRC}/${slug}.webp`) ? `${slug}.webp` : `${slug}.png`;
  const buf = fs.readFileSync(`${SRC}/${file}`);
  const src = `data:image/${file.endsWith('.webp') ? 'webp' : 'png'};base64,` + buf.toString('base64');
  const dim = await page.evaluate(async (s) => {
    const i = new Image();
    await new Promise((r) => { i.onload = r; i.src = s; });
    return { w: i.width, h: i.height };
  }, src);

  if (cursorX + dim.w > MAX) { cursorX = 0; shelfY += shelfH; shelfH = 0; }
  if (shelfY + dim.h > MAX) await flush();

  meta[slug] = { a: atlas, x: cursorX, y: shelfY, w: dim.w, h: dim.h };
  placed.push({ src, x: cursorX, y: shelfY });
  cursorX += dim.w;
  shelfH = Math.max(shelfH, dim.h);
}
await flush();
await browser.close();

fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(meta));
const bytes = fs.readdirSync(OUT).filter((f) => /^atlas-\d+\.webp$/.test(f))
  .reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${order.length} portraits -> ${atlas} atlases, ${(bytes / 1048576).toFixed(1)} MB`);
