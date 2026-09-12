/* Candidate photos added or replaced in the browser.
 *
 * Two jobs live here and nothing else:
 *
 *   1. A store. A photo dropped in here belongs to one candidate, keyed by the
 *      same slug make_decks.py wrote, and survives a reload. It lives in
 *      IndexedDB because a headshot is far too big for localStorage, and it
 *      never leaves the browser unless somebody asks for it to.
 *
 *   2. The prep a raw headshot needs before it can stand next to a real cutout.
 *      The shipped portraits are background-free and trimmed tight to the
 *      subject, and the painter contains them bottom-anchored on the plate. A
 *      phone photo dropped straight in would render as a rectangle with a wall
 *      behind it. So: crop to the 4:5 tile box, optionally knock the backdrop
 *      out, then trim to what is left.
 */

export const OUT_W = 1000;
export const OUT_H = 1250;          // 4:5, the PHOTO_AR tile box in layout.js
const MAX_SIDE = 900;               // what the shipped cutouts run to

/* ------------------------------------------------------------------- storage */

const DB = 'slate-studio-photos';
const STORE = 'photos';
const memory = new Map();           // private windows, and anything else that refuses
let dbPromise = null;
let dbBroken = false;

function db() {
  if (dbBroken) return Promise.reject(new Error('no IndexedDB'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'slug' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB refused'));
  }).catch((e) => { dbBroken = true; throw e; });
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.onerror = () => reject(t.error);
    t.oncomplete = () => resolve(req?.result);
  }));
}

/** slug -> { slug, name, blob, type, addedAt, sourceName }. Newest last. */
export async function all() {
  try {
    const rows = await tx('readonly', (s) => s.getAll());
    return new Map((rows || []).map((r) => [r.slug, r]));
  } catch {
    return new Map(memory);
  }
}

export async function put(rec) {
  const row = { ...rec, addedAt: rec.addedAt || Date.now() };
  memory.set(row.slug, row);
  try { await tx('readwrite', (s) => s.put(row)); } catch { /* memory only, this session */ }
  return row;
}

export async function remove(slug) {
  memory.delete(slug);
  try { await tx('readwrite', (s) => s.delete(slug)); } catch { /* nothing to do */ }
}

export async function clear() {
  memory.clear();
  try { await tx('readwrite', (s) => s.clear()); } catch { /* nothing to do */ }
}

/* --------------------------------------------------------------------- framing */

/** Where the crop frame sits on the source: the source pixel under the middle
 *  of the frame, and how many output pixels one source pixel becomes. */
export function defaultView(img) {
  const scale = Math.max(OUT_W / img.width, OUT_H / img.height);
  // A headshot puts the face in the top half. Centring on the middle of the
  // frame would cut the forehead and keep a lot of shirt.
  return { scale, cx: img.width / 2, cy: img.height * 0.44 };
}

/** The frame can move until its edge would pull past the edge of the photo. */
export function clampView(img, view, frameW = OUT_W, frameH = OUT_H) {
  const half = { w: frameW / 2 / view.scale, h: frameH / 2 / view.scale };
  const cx = half.w * 2 >= img.width ? img.width / 2
    : Math.min(Math.max(view.cx, half.w), img.width - half.w);
  const cy = half.h * 2 >= img.height ? img.height / 2
    : Math.min(Math.max(view.cy, half.h), img.height - half.h);
  return { ...view, cx, cy };
}

export function minScale(img, frameW = OUT_W, frameH = OUT_H) {
  return Math.max(frameW / img.width, frameH / img.height);
}

/** Paint the framed region of `img` into a context of the given size. */
export function drawView(ctx, img, view, w, h) {
  const k = view.scale * (w / OUT_W);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img,
    w / 2 - view.cx * k, h / 2 - view.cy * k,
    img.width * k, img.height * k);
}

/* ---------------------------------------------------------------- background */

/** The colour the backdrop is, judged from the four corners. A face is never
 *  in a corner, so this is the safest sample there is. */
function cornerColour(px, w, h) {
  const n = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  let r = 0, g = 0, b = 0, count = 0;
  for (const [x0, y0] of [[0, 0], [w - n, 0], [0, h - n], [w - n, h - n]]) {
    for (let y = y0; y < y0 + n; y++) {
      for (let x = x0; x < x0 + n; x++) {
        const o = (y * w + x) * 4;
        r += px[o]; g += px[o + 1]; b += px[o + 2]; count++;
      }
    }
  }
  return [r / count, g / count, b / count];
}

/** How far apart the four corners are. A plain backdrop holds together; a
 *  kitchen does not, and knocking that out would take half the candidate with
 *  it. Used to decide whether to offer the knockout switched on. */
export function backdropIsPlain(img) {
  const { ctx, w, h } = scratch(img, 160);
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = Math.max(3, Math.round(Math.min(w, h) * 0.06));
  const means = [];
  for (const [x0, y0] of [[0, 0], [w - n, 0], [0, h - n], [w - n, h - n]]) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let y = y0; y < y0 + n; y++) {
      for (let x = x0; x < x0 + n; x++) {
        const o = (y * w + x) * 4;
        r += px[o]; g += px[o + 1]; b += px[o + 2]; c++;
      }
    }
    means.push([r / c, g / c, b / c]);
  }
  let worst = 0;
  for (const a of means) {
    for (const b of means) {
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  return worst < 40;
}

function scratch(img, side) {
  const k = side / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return { ctx, w, h };
}

/** Clear everything that reaches the edge of the frame and matches the backdrop.
 *  Flood fill from the border, so a dark suit the same shade as the wall keeps
 *  its alpha as long as the candidate is not touching the frame. */
export function knockOut(canvas, tolerance = 34) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const ref = cornerColour(px, w, h);
  const tol = tolerance * tolerance * 3;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (bg[i]) return;
    const o = i * 4;
    const dr = px[o] - ref[0], dg = px[o + 1] - ref[1], dbv = px[o + 2] - ref[2];
    if (dr * dr + dg * dg + dbv * dbv > tol) return;
    bg[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < w; x++) { consider(x, 0); consider(x, h - 1); }
  for (let y = 0; y < h; y++) { consider(0, y); consider(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    consider(x - 1, y); consider(x + 1, y); consider(x, y - 1); consider(x, y + 1);
  }
  for (let i = 0; i < w * h; i++) if (bg[i]) px[i * 4 + 3] = 0;
  featherAlpha(px, w, h);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** A hard alpha edge reads as a sticker. One box blur along the boundary is
 *  enough to make it read as a cutout instead. */
function featherAlpha(px, w, h) {
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let sum = 0, mixed = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = a[i + dy * w + dx];
          sum += v;
          if (v !== a[i]) mixed = true;
        }
      }
      if (mixed) px[i * 4 + 3] = sum / 9;
    }
  }
}

/** Crop away fully transparent margin, the way the shipped cutouts are trimmed.
 *  Returns the canvas unchanged when nothing is transparent. */
export function trimAlpha(canvas, pad = 0.01) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return canvas;
  const m = Math.round(Math.min(w, h) * pad);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function capSide(canvas, max = MAX_SIDE) {
  const k = max / Math.max(canvas.width, canvas.height);
  if (k >= 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * k);
  out.height = Math.round(canvas.height * k);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** Source image plus framing plus settings, out the other end as a canvas ready
 *  to be a cutout. */
export function prepare(img, view, { knockout = false, tolerance = 34 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = OUT_W; cv.height = OUT_H;
  drawView(cv.getContext('2d', { willReadFrequently: true }), img, view, OUT_W, OUT_H);
  if (!knockout) return capSide(cv);
  return capSide(trimAlpha(knockOut(cv, tolerance)));
}

/* ------------------------------------------------------------------ encoding */

/* WebP with alpha is what the repo already ships and is a third the size of the
 * PNG. Safari gained it in 14; anything older falls back to PNG, which the
 * catalog accepts just the same. */
let webpOk = null;
export function supportsWebp() {
  if (webpOk === null) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    webpOk = cv.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
}

export function encode(canvas) {
  const type = supportsWebp() ? 'image/webp' : 'image/png';
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve({ blob: b, type, ext: type === 'image/webp' ? 'webp' : 'png' }), type, 0.92);
  });
}

/** The filename the catalog resolves a candidate by. */
export const cutoutName = (slug, ext) => `${slug}.${ext}`;
