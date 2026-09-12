/* Size the licensed programme photography down for the bundle.
 *
 *   node build/pack-art.mjs <srcDir> [outDir]
 *
 * Reads every .jpg in srcDir, fits it inside LONG px on the long edge, and
 * writes public/art/<name>.webp.
 *
 * A licensed Adobe Stock file is five to twenty megabytes. Eight of them is
 * fifty six, which is not going in a repository that also has to publish as an
 * Artifact. At 2200 px these cover the four and a third inch image rail on an
 * 11 x 6 at better than 500 dpi, and a full bleed ground at about 200. Under
 * type, on a mail piece, that is the right trade. Ask the printer to proof any
 * piece that runs one full bleed.
 */
import { chromium as resolveChromium } from './playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'public/art';
const LONG = 2200;
const QUALITY = 0.86;

if (!SRC || !fs.existsSync(SRC)) {
  console.error('Usage: node build/pack-art.mjs <srcDir> [outDir]');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const chromium = await resolveChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

let total = 0;
for (const file of fs.readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const name = path.basename(file).replace(/\.[^.]+$/, '');
  const src = `data:image/jpeg;base64,${fs.readFileSync(path.join(SRC, file)).toString('base64')}`;
  const b64 = await page.evaluate(async ([data, long, q]) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = data; });
    const k = Math.min(1, long / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return { b64: btoa(s), w: c.width, h: c.height };
  }, [src, LONG, QUALITY]);
  const buf = Buffer.from(b64.b64, 'base64');
  fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
  total += buf.length;
  console.log(`  ${name.padEnd(12)} ${b64.w}x${b64.h}  ${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
console.log(`${OUT}: ${(total / 1048576).toFixed(1)} MB`);
