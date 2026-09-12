/* Slate Studio layout engine.
 *
 * One job: given a slate (1 to 10 candidates) and the copy somebody submitted,
 * decide where every pixel goes on any canvas size so the result looks built on
 * purpose rather than stretched to fit.
 *
 * The engine is pure. It never touches a canvas. It takes a `measure(text, font)`
 * function that returns the width of `text` at 100px in that font, and returns a
 * plan of absolute rectangles the painter draws. That keeps it testable in Node
 * and keeps the preview and the export pixel-identical, because both render the
 * same plan.
 *
 * Brand tokens, portrait aspect and the name-plate proportions match
 * build/make_decks.py so these graphics read as the same family of assets as the
 * transparent decks already in Drive.
 */

/* Sampled off the Granite Guarantee sheet: the navy is 9.7% of that artwork and
 * the green 6.9%, so these are the two the brand actually runs on. */
export const BRAND = {
  navy: '#12314E',
  navyDeep: '#0D2740',
  green: '#2F7C4E',
  greenDeep: '#235E3B',
  mint: '#95DAB1',      // a tint of the brand green, for type on a navy plate
  ground: '#FFFFFF',
  cream: '#F0F6F4',
  white: '#FFFFFF',
  // The transparent decks in Drive were built on the older NHGOP navy and red.
  deckNavy: '#012360',
  deckRed: '#BF0A30',
  deckSky: '#9FC0FF',
};

/* A mail panel takes 4.25 inches of an 11 inch piece: room for the indicia, the
 * return address, the address block and the barcode clear zone. */
export const MAIL_PANEL_FRACTION = 4.25 / 11;

export const PHOTO_AR = 1.25;   // portrait tile is 4:5, height / width
export const PLATE_AR = 0.34;   // name plate height as a fraction of tile width

const ANTON = { family: 'Anton', weight: 400 };
const COND_BOLD = { family: 'Barlow Condensed', weight: 700 };
const COND_MED = { family: 'Barlow Condensed', weight: 500 };
const COND_SEMI = { family: 'Barlow Condensed', weight: 600 };

/* ------------------------------------------------------------------ measuring */

/** Width of `text` at `px`, including letter-spacing. Linear in px, so every
 *  measurement is taken once at 100px and scaled. */
function widthAt(measure, text, font, px, ls = 0) {
  if (!text) return 0;
  const base = measure(text, font) * (px / 100);
  return base + ls * px * Math.max(0, text.length - 1);
}

/** Greedy wrap at `maxW`. Returns an array of lines. */
function greedyWrap(measure, text, font, px, ls, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = line + ' ' + words[i];
    if (widthAt(measure, next, font, px, ls) <= maxW) line = next;
    else { lines.push(line); line = words[i]; }
  }
  lines.push(line);
  return lines;
}

/** Wrap, then rebalance so the last line is not an orphan.
 *  Finds the narrowest width that still produces the same number of lines,
 *  which evens out the rag without changing the line count. */
function balancedWrap(measure, text, font, px, ls, maxW) {
  const lines = greedyWrap(measure, text, font, px, ls, maxW);
  if (lines.length < 2) return lines;
  let lo = 0, hi = maxW;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(measure, text, font, px, ls, mid).length === lines.length) hi = mid;
    else lo = mid;
  }
  return greedyWrap(measure, text, font, px, ls, hi);
}

/* --------------------------------------------------------------- copy blocks */

/* Each block declares its size as a fraction of the canvas short side. The fit
 * scale `k` multiplies all of them together, so the copy grows and shrinks as
 * one voice instead of drifting out of proportion. */
const BLOCKS = [
  { key: 'kicker',    font: COND_BOLD, size: 0.0300, lh: 1.10, ls: 0.16, upper: true,  maxLines: 1, gapBefore: 0.000, role: 'accent' },
  { key: 'headline',  font: ANTON,     size: 0.0880, lh: 0.94, ls: -0.01, upper: true, maxLines: 4, gapBefore: 0.022, role: 'primary' },
  { key: 'subhead',   font: COND_SEMI, size: 0.0400, lh: 1.16, ls: 0.005, upper: false, maxLines: 3, gapBefore: 0.020, role: 'secondary' },
  { key: 'details',   font: COND_MED,  size: 0.0300, lh: 1.34, ls: 0.010, upper: false, maxLines: 6, gapBefore: 0.024, role: 'secondary' },
  { key: 'cta',       font: ANTON,     size: 0.0340, lh: 1.00, ls: 0.020, upper: true,  maxLines: 1, gapBefore: 0.030, role: 'cta' },
  { key: 'footer',    font: COND_BOLD, size: 0.0230, lh: 1.20, ls: 0.10, upper: true,  maxLines: 2, gapBefore: 0.028, role: 'secondary' },
];

const CTA_PAD_X = 0.62;  // pill padding, as a fraction of its own font size
const CTA_PAD_Y = 0.46;

/** Lay out the copy column at scale `k` inside width `maxW`.
 *  Returns { height, items } with every y relative to the block's own top. */
function layoutCopy(measure, copy, s, k, maxW) {
  const items = [];
  let y = 0;
  for (const b of BLOCKS) {
    const raw = copy[b.key];
    const text = Array.isArray(raw) ? raw.filter(Boolean).join('\n') : (raw || '').trim();
    if (!text) continue;

    let px = s * b.size * k;
    const floor = s * b.size * k * 0.55;
    let lines;
    // Hard-wrapped paragraphs (details) keep their own line breaks.
    const paras = text.split('\n').map((t) => (b.upper ? t.toUpperCase() : t));

    if (b.maxLines === 1) {
      // A kicker or a call to action is one phrase. Shrink it until it fits;
      // never drop words off the end of it, which is what wrapping then
      // trimming to one line does.
      const one = paras.join(' ');
      const fits = (size) => widthAt(measure, one, b.font, size, b.ls)
        <= (b.key === 'cta' ? maxW - size * CTA_PAD_X * 2 : maxW);
      const hard = s * b.size * k * 0.34;
      let guard = 0;
      while (!fits(px) && px > hard && guard++ < 60) px *= 0.96;
      lines = [one];
    } else {
      const width = maxW;
      for (;;) {
        lines = [];
        for (const p of paras) lines.push(...balancedWrap(measure, p, b.font, px, b.ls, width));
        if (lines.length <= b.maxLines || px <= floor) break;
        px *= 0.94;
      }
    }
    // Past the minimum size the copy no longer fits at all. Trim it, and flag
    // it, so nobody ships a headline with the end quietly missing. A one-line
    // block was shrunk instead, so it is only over if it is still too wide.
    const truncated = b.maxLines === 1
      ? widthAt(measure, lines[0], b.font, px, b.ls) > maxW * 1.02
      : lines.length > b.maxLines;
    if (b.maxLines !== 1 && truncated) lines = lines.slice(0, b.maxLines);

    const lineH = px * b.lh;
    let h = lineH * lines.length;
    if (b.key === 'cta') h = px * (1 + CTA_PAD_Y * 2);

    if (items.length) y += s * b.gapBefore * k;
    const widths = lines.map((l) => widthAt(measure, l, b.font, px, b.ls));
    items.push({ ...b, text, lines, widths, px, lineH, y, h, truncated, w: Math.max(0, ...widths, 0) });
    y += h;
  }
  return { height: y, items };
}

/* ---------------------------------------------------------------------- grid */

/** Pick the column count that makes the portrait tiles as large as possible.
 *  Ties go to fewer columns, which is what make_decks.py does. */
export function bestGrid(n, W, H, gap, plate, tileAROverride) {
  const tileAR = tileAROverride || PHOTO_AR + (plate ? PLATE_AR : 0);
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const aw = (W - (cols - 1) * gap) / cols;
    const ah = (H - (rows - 1) * gap) / rows / tileAR;
    const tw = Math.min(aw, ah);
    if (tw <= 0) continue;
    if (!best || tw > best.tileW + 0.01) best = { tileW: tw, cols, rows };
  }
  return best || { tileW: 0, cols: 1, rows: n };
}

/** The tile width a slate of `n` wants before it starts to look cramped. */
function idealTile(n, s) {
  return s * Math.min(0.34, Math.max(0.105, 0.62 / Math.sqrt(n)));
}

/* ----------------------------------------------------------------- the solve */

const COMPOSITIONS = ['stack', 'banner', 'split', 'slateOnly', 'palmcard'];

/* The palm card is a designed template rather than a solved one: a fixed stack
 * of bands, in a fixed order, the way a rack card is read top to bottom. The
 * faces take whatever the copy does not. Proportions follow the 4.25 x 11 card
 * this was modelled on. */
const PALM = {
  askGap: 0.012,      // fractions of the card height
  stripGap: 0.014,
  bandMin: 0.15,      // the event band never gets thinner than this
  bandMax: 0.24,
  panelMin: 0.24,     // nor the faces panel
};

/* ------------------------------------------------------------- palm card --- */

/** A vertical stack of bands. Everything is measured, then the faces take the
 *  remainder, so a longer headline costs the portraits height rather than
 *  pushing the footer off the bottom of the card. */
function solvePalmCard(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;

  const pad = w * 0.052 * density;
  const gap = w * 0.030 * density;
  const inner = w - pad * 2;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, w * 0.0155);
  const footerH = disc ? discPx * 2.9 : 0;

  // Masthead. The headline is the loudest thing on the card.
  const head = fitBlock(measure, copy.headline, ANTON, w * 0.082, inner, 4, -0.01, true);
  const kick = fitBlock(measure, copy.kicker, COND_BOLD, w * 0.030, inner, 2, 0.16, true);
  const mastH = (kick.h ? kick.h + h * 0.006 : 0) + head.h + h * 0.016;

  // The ask: the one sentence a voter has to take away.
  const ask = fitBlock(measure, copy.subhead, COND_SEMI, w * 0.042, inner, 3, 0.005, false);
  const askH = ask.h ? ask.h + h * PALM.askGap : 0;

  // The values strip, set on two lines the way the card it copies does.
  const vals = String(copy.values || '').split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const strip = vals.length
    ? fitBlock(measure, pairUp(vals), COND_BOLD, w * 0.040, inner, 3, 0.06, true)
    : { lines: [], h: 0, px: 0 };
  const stripH = strip.h ? strip.h + h * 0.030 : 0;

  // The event band carries when and where, together, at the foot of the card.
  const evLines = [copy.cta, copy.details].map((x) => String(x || '').trim()).filter(Boolean);
  const ev = evLines.length ? Math.min(h * PALM.bandMax,
    Math.max(h * PALM.bandMin, h * 0.045 * (String(copy.details || '').split('\n').length + 2))) : 0;

  // Whatever is left is the faces panel.
  let panelH = h - pad * 2 - mastH - askH - stripH - ev - footerH - gap;
  const shortfall = Math.max(0, h * PALM.panelMin - panelH);
  panelH = Math.max(h * PALM.panelMin * 0.72, panelH);

  let y = pad;
  const mast = { x: pad, y, w: inner, h: mastH, kicker: kick, headline: head };
  y += mastH;
  const askBand = { x: pad, y, w: inner, h: askH, block: ask };
  y += askH;
  const panel = { x: pad * 0.45, y, w: w - pad * 0.9, h: panelH };
  y += panelH + gap;
  const stripBand = { x: pad, y, w: inner, h: stripH, block: strip };
  y += stripH;
  const event = { x: 0, y: h - footerH - ev, w, h: ev };

  // Faces inside the panel, with room under each for a name plate and a tagline.
  const hasTags = slate.some((c) => (c.tag || '').trim());
  const tileAR = PHOTO_AR + PLATE_AR + (hasTags ? 0.22 : 0);
  const pin = panel.h - gap * 1.2;
  const g = bestGrid(n, panel.w - gap * 1.2, pin, gap, false, tileAR);
  const tileW = Math.min(g.tileW, panel.w * 0.46);
  const tileH = tileW * tileAR;
  const gridH = g.rows * tileH + (g.rows - 1) * gap;
  const gy = panel.y + (panel.h - gridH) / 2;

  const tiles = slate.map((c, i) => {
    const col = i % g.cols, row = Math.floor(i / g.cols);
    const inRow = Math.min(g.cols, n - row * g.cols);
    const rowW = inRow * tileW + (inRow - 1) * gap;
    const x = panel.x + (panel.w - rowW) / 2 + col * (tileW + gap);
    const ty = gy + row * (tileH + gap);
    const photoH = tileW * PHOTO_AR;
    const plateH = tileW * PLATE_AR;
    return {
      candidate: c, x, y: ty, w: tileW, h: tileH,
      photo: { x, y: ty, w: tileW, h: photoH },
      plate: { x, y: ty + photoH + tileW * 0.030, w: tileW, h: plateH },
      tag: hasTags ? { x, y: ty + photoH + tileW * 0.030 + plateH + tileW * 0.028, w: tileW } : null,
    };
  });

  return {
    canvas: { w, h },
    composition: 'palmcard',
    pad, gap, s,
    scale: 1,
    grid: { cols: g.cols, rows: g.rows, tileW, tileH },
    slateRect: panel,
    tiles,
    deck: null,
    copy: null,
    mailPanel: null,
    palm: { mast, ask: askBand, panel, strip: stripBand, event, hasTags,
            date: String(copy.cta || '').trim(), where: String(copy.details || '').trim() },
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: inner, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for the card and was cut. Shorten it.'] : []),
      ...(ask.truncated ? ['The ask is too long for the card and was cut.'] : []),
      ...(shortfall > h * 0.04 ? ['The copy is crowding the portraits. Cut a line somewhere.'] : []),
      ...(vals.length > 6 ? ['More than six values will not fit the strip.'] : []),
    ],
  };
}

/** Two per line, the way the strip on the reference card is set. */
function pairUp(values) {
  const out = [];
  for (let i = 0; i < values.length; i += 2) out.push(values.slice(i, i + 2).join('   ·   '));
  return out.join('\n');
}

/** Wrap `text` at `px`, shrinking until it fits `maxLines`. */
function fitBlock(measure, text, font, px, maxW, maxLines, ls, upper) {
  const raw = String(text || '').trim();
  if (!raw) return { lines: [], h: 0, px: 0, font, ls };
  const paras = raw.split('\n').map((t) => (upper ? t.toUpperCase() : t));
  let size = px;
  let lines;
  const floor = px * 0.5;
  for (;;) {
    lines = [];
    for (const p of paras) lines.push(...balancedWrap(measure, p, font, size, ls, maxW));
    if (lines.length <= maxLines || size <= floor) break;
    size *= 0.94;
  }
  const truncated = lines.length > maxLines;
  if (truncated) lines = lines.slice(0, maxLines);
  const lh = size * (font === ANTON ? 0.98 : 1.2);
  return { lines, px: size, lh, h: lh * lines.length, font, ls, truncated };
}

function autoComposition(w, h, n, hasCopy) {
  if (!hasCopy) return 'slateOnly';
  const ar = w / h;
  if (ar >= 1.5) return 'split';     // 16:9 and link cards read best side by side
  if (ar <= 0.72) return 'stack';    // stories and posters stack
  return n >= 6 ? 'banner' : 'stack';
}

/** Split the inner rect into a copy rect and a slate rect at parameter t. */
function carve(comp, inner, gap, t) {
  const { x, y, w, h } = inner;
  if (comp === 'stack') {
    const ch = h * t;
    return { copy: { x, y, w, h: ch }, slate: { x, y: y + ch + gap, w, h: h - ch - gap } };
  }
  if (comp === 'banner') {
    const ch = h * t;
    return { copy: { x, y: y + h - ch, w, h: ch }, slate: { x, y, w, h: h - ch - gap } };
  }
  // split
  const cw = w * t;
  return { copy: { x, y, w: cw, h }, slate: { x: x + cw + gap, y, w: w - cw - gap, h } };
}

/** Largest copy scale that still fits inside `rect`. */
function fitScale(measure, copy, s, rect, kMin, kMax) {
  if (layoutCopy(measure, copy, s, kMin, rect.w).height > rect.h) return { k: kMin, overflow: true };
  let lo = kMin, hi = kMax;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (layoutCopy(measure, copy, s, mid, rect.w).height <= rect.h) lo = mid;
    else hi = mid;
  }
  return { k: lo, overflow: false };
}

/**
 * Solve a whole graphic.
 *
 * spec = {
 *   canvas: { w, h },
 *   slate:  [{ name, first, last, hasPhoto }],
 *   copy:   { kicker, headline, subhead, details, cta, footer, disclaimer },
 *   style:  { composition, plate, align, accent, tint, density }
 * }
 */
export function solve(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);

  // With a deck aspect set, the slate is the pre-built deck PNG dropped in as a
  // single layer, not a grid this app composes. Everything else is unchanged.
  const deckAR = style.deckAspect || 0;
  const gridOf = (W, H) => (deckAR ? bestGrid(1, W, H, gap, false, deckAR) : bestGrid(n, W, H, gap, plate));

  const density = style.density ?? 1;          // user nudge, 0.8 tight to 1.2 airy
  const pad = 0.045 * s * density;
  const gap = 0.030 * s * density;
  const plate = style.plate !== false;

  const hasCopy = BLOCKS.some((b) => {
    const v = copy[b.key];
    return Array.isArray(v) ? v.filter(Boolean).length : (v || '').trim();
  });

  let comp = style.composition && style.composition !== 'auto' ? style.composition : autoComposition(w, h, n, hasCopy);
  if (!COMPOSITIONS.includes(comp)) comp = 'stack';
  if (comp === 'palmcard') return solvePalmCard(spec, measure);
  if (!hasCopy) comp = 'slateOnly';

  // Reserve the disclaimer strip first. It is required on a finished ad under
  // RSA 664:14, so it gets its own space instead of competing for it.
  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 1.25 + gap * 0.5 : 0;

  // A mail panel is carrier space, not canvas. Take it out before anything is
  // laid out, so nothing is ever designed into the address block.
  const panelW = style.mailPanel === 'right' ? w * MAIL_PANEL_FRACTION : 0;
  const inner = {
    x: pad, y: pad,
    w: w - 2 * pad - panelW, h: h - 2 * pad - discH,
  };

  if (comp === 'slateOnly') {
    const g = gridOf(inner.w, inner.h);
    return finish(spec, { comp, inner, slateRect: inner, copyRect: null, grid: g, k: 1, copyLayout: { height: 0, items: [] }, pad, gap, s, plate, discPx, disc, overflow: false });
  }

  const kMin = 0.46, kMax = 1.45;
  // A deck holds every face already, so it wants most of the canvas.
  const ideal = deckAR ? idealTile(1, s) * 1.9 : idealTile(n, s);
  const range = comp === 'split' ? [0.28, 0.66] : [0.14, 0.62];

  let best = null;
  const STEPS = 32;
  for (let i = 0; i <= STEPS; i++) {
    const t = range[0] + (range[1] - range[0]) * (i / STEPS);
    const rects = carve(comp, inner, gap, t);
    if (rects.copy.w < s * 0.18 || rects.slate.w < s * 0.14 || rects.slate.h < s * 0.12) continue;

    const { k, overflow } = fitScale(measure, copy, s, rects.copy, kMin, kMax);
    const cl = layoutCopy(measure, copy, s, k, rects.copy.w);
    const g = gridOf(rects.slate.w, rects.slate.h);

    const copyScore = (k - kMin) / (kMax - kMin);
    const tileScore = Math.min(1, g.tileW / ideal);
    // Reward the weaker of the two hardest, so neither the copy nor the faces
    // get starved, then break ties toward the better overall balance.
    let score = 0.68 * Math.min(copyScore, tileScore) + 0.32 * ((copyScore + tileScore) / 2);
    // Wasted vertical space in the copy column is dead air on a stacked layout.
    const slack = comp === 'split' ? 0 : Math.max(0, rects.copy.h - cl.height) / inner.h;
    score -= slack * 0.35;
    if (overflow) score -= 0.5;

    if (!best || score > best.score) best = { score, t, rects, k, cl, grid: g, overflow };
  }

  if (!best) {
    const g = gridOf(inner.w, inner.h);
    return finish(spec, { comp: 'slateOnly', inner, slateRect: inner, copyRect: null, grid: g, k: 1, copyLayout: { height: 0, items: [] }, pad, gap, s, plate, discPx, disc, overflow: true });
  }

  return finish(spec, {
    comp, inner, slateRect: best.rects.slate, copyRect: best.rects.copy,
    grid: best.grid, k: best.k, copyLayout: best.cl,
    pad, gap, s, plate, discPx, disc, overflow: best.overflow,
  });
}

/* Turn the solved regions into absolute rectangles the painter can draw. */
function finish(spec, r) {
  const { w, h } = spec.canvas;
  const trimmed = (r.copyLayout.items || []).filter((it) => it.truncated).map((it) => it.key);
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const { grid, slateRect, gap, s, plate } = r;

  const deckAR = style.deckAspect || 0;
  const tileW = deckAR ? grid.tileW : Math.min(grid.tileW, s * 0.52);
  const tileH = tileW * (deckAR || PHOTO_AR + (plate ? PLATE_AR : 0));
  const gridW = grid.cols * tileW + (grid.cols - 1) * gap;
  const gridH = grid.rows * tileH + (grid.rows - 1) * gap;
  const copyH = r.copyRect ? r.copyLayout.height : 0;

  // Centre the copy and the faces as one group rather than each inside its own
  // half. Otherwise a tall canvas opens a dead band between the two.
  let gy, copyTop;
  if (r.comp === 'stack' || r.comp === 'banner') {
    const groupH = copyH + gap + gridH;
    const top = r.inner.y + Math.max(0, (r.inner.h - groupH) / 2);
    if (r.comp === 'stack') { copyTop = top; gy = top + copyH + gap; }
    else { gy = top; copyTop = top + gridH + gap; }
  } else {
    gy = slateRect.y + (slateRect.h - gridH) / 2;
    copyTop = r.copyRect ? r.copyRect.y + Math.max(0, (r.copyRect.h - copyH) / 2) : 0;
  }

  const tiles = deckAR ? [] : slate.map((c, i) => {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    // Centre a short final row instead of leaving it hanging left.
    const inRow = Math.min(grid.cols, n - row * grid.cols);
    const rowW = inRow * tileW + (inRow - 1) * gap;
    const rx = slateRect.x + (slateRect.w - rowW) / 2;
    const x = rx + col * (tileW + gap);
    const y = gy + row * (tileH + gap);
    const photoH = tileW * PHOTO_AR;
    return {
      candidate: c,
      x, y, w: tileW, h: tileH,
      photo: { x, y, w: tileW, h: photoH },
      plate: plate ? { x, y: y + photoH + tileW * 0.035, w: tileW, h: tileH - photoH - tileW * 0.035 } : null,
    };
  });

  let copy = null;
  if (r.copyRect) {
    const cr = r.copyRect;
    const align = style.align || (r.comp === 'split' ? 'left' : 'center');
    copy = {
      rect: cr, align, x: cr.x, y: copyTop, w: cr.w, height: copyH,
      items: r.copyLayout.items.map((it) => ({ ...it, absY: copyTop + it.y })),
    };
  }

  return {
    canvas: { w, h },
    mailPanel: style.mailPanel === 'right'
      ? { x: w - w * MAIL_PANEL_FRACTION, y: 0, w: w * MAIL_PANEL_FRACTION, h }
      : null,
    composition: r.comp,
    pad: r.pad, gap, s,
    scale: r.k,
    grid: { cols: deckAR ? 1 : grid.cols, rows: deckAR ? 1 : grid.rows, tileW, tileH },
    slateRect: r.slateRect,
    tiles,
    deck: deckAR
      ? { x: slateRect.x + (slateRect.w - tileW) / 2, y: gy, w: tileW, h: tileH }
      : null,
    copy,
    disclaimer: r.disc
      ? { text: r.disc, px: r.discPx, x: r.pad, y: h - r.pad * 0.55,
          w: w - 2 * r.pad - (style.mailPanel === 'right' ? w * MAIL_PANEL_FRACTION : 0),
          centreOn: r.pad + (w - 2 * r.pad - (style.mailPanel === 'right' ? w * MAIL_PANEL_FRACTION : 0)) / 2 }
      : null,
    warnings: [
      ...(r.overflow ? ['Copy is longer than the canvas can hold at a readable size. It was trimmed to fit.'] : []),
      ...trimmed.map((k) => `The ${k} is too long for this canvas and was cut off. Shorten it, or use a taller canvas.`),
      ...(!deckAR && tileW < idealTile(n, s) * 0.72
        ? [`${n} portraits on this canvas run small. A wider canvas or shorter copy reads better.`] : []),
    ],
  };
}

