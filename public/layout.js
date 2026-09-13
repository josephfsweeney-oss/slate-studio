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

import { encode as encodeQr } from './qr.js';
import { firstLine } from './names.js';

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

/* The mail panel is the carrier's corner, not a whole column: four inches by two
 * and a quarter, anchored to the lower right of the trim. That is all the
 * indicia, the return address, the address block and the barcode clear zone
 * need. Taking the full height instead threw away three and a half inches by
 * four of an 11 x 5.5, which is the best space on the piece. */
export const MAIL_PANEL = { wIn: 4.0, hIn: 2.25 };

/** Kept for the older fraction-based callers. */
export const MAIL_PANEL_FRACTION = MAIL_PANEL.wIn / 11;

/** Where the panel sits, in pixels. Uses the canvas dpi when it has one, and
 *  falls back to the same proportions of an 11 x 5.5 when it does not. */
export function mailPanelRect(spec, w, h) {
  if ((spec.style || {}).mailPanel !== 'right') return null;
  const dpi = spec.dpi || 0;
  const pw = dpi ? MAIL_PANEL.wIn * dpi : w * (MAIL_PANEL.wIn / 11);
  const ph = dpi ? MAIL_PANEL.hIn * dpi : h * (MAIL_PANEL.hIn / 5.5);
  const width = Math.min(pw, w * 0.52);
  const height = Math.min(ph, h * 0.62);
  return { x: w - width, y: h - height, w: width, h: height, dpi: dpi || w / 11 };
}

export const PHOTO_AR = 1.25;   // portrait tile is 4:5, height / width
export const PLATE_AR = 0.34;   // name plate height as a fraction of tile width

/* The QR block.
 *
 * 0.75 inch square is the floor in print and 1 inch is preferred, with a quiet
 * zone of four modules that no art may enter. The URL is set in text beside it
 * because plenty of people will read it rather than scan it, and because a
 * printed URL still works when the code does not. */
export const QR = { minIn: 0.75, preferredIn: 1.0, quiet: 4, screenFraction: 0.13 };

const qrCache = new Map();
function qrModules(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  let out;
  try { out = { code: encodeQr(url) }; } catch (e) { out = { error: e.message }; }
  if (qrCache.size > 40) qrCache.clear();
  qrCache.set(url, out);
  return out;
}

/** A QR block sized for this surface, or null when no URL was given.
 *  `maxSide` caps the square; `maxW` is the width the label may use. */
function qrFor(measure, copy, spec, s, maxSide, maxW) {
  const url = String(copy.url || '').trim();
  if (!url) return null;
  const { code, error } = qrModules(url);
  const dpi = spec.dpi || 0;
  const want = dpi ? QR.preferredIn * dpi : Math.max(84, s * QR.screenFraction);
  const floor = dpi ? QR.minIn * dpi : 72;
  const size = Math.max(0, Math.min(want, maxSide));
  // The URL under the code, because plenty of people read it instead of
  // scanning, and a printed URL still works when a code does not.
  const label = fitBlock(measure, url, COND_SEMI, Math.max(9, size * 0.21),
    Math.max(20, maxW), 1, 0.01, false);
  return {
    url, code: code || null, error: error || null, size,
    tooSmall: size < floor - 0.5, floor,
    label, w: Math.max(size, label.w || 0), h: size + (label.h ? label.h * 1.35 : 0),
  };
}

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

/* A tile with no face on it is a name plate and nothing else, so it is short
 * and wide rather than tall. Kept taller than PLATE_AR because on its own the
 * plate carries both lines of the name with air around them, where under a
 * portrait it only had to sit on the chin. */
export const NAME_TILE_AR = 0.46;

/** The aspect of one tile on this piece: a face over a plate, or a plate alone. */
export function tileAspect(style = {}, plate = true, extra = 0) {
  if (style.namesOnly) return NAME_TILE_AR + extra;
  return PHOTO_AR + (plate ? PLATE_AR : 0) + extra;
}

/** The tile width a slate of `n` wants before it starts to look cramped. */
function idealTile(n, s) {
  return s * Math.min(0.34, Math.max(0.105, 0.62 / Math.sqrt(n)));
}

/* ----------------------------------------------------------------- the solve */

export const COMPOSITIONS = ['stack', 'banner', 'split', 'slateOnly', 'palmcard',
  'palmback', 'ballot', 'spotlight', 'versus', 'strip', 'stat', 'receipt', 'typeled',
  'promise', 'proof', 'poster', 'contrast'];

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
  const tileAR = tileAspect(style, true, hasTags ? 0.22 : 0);
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

  /* The front's QR goes in the event band when there is one, and just above the
   * footer when there is not. Either way it is the last thing on the card. */
  const qr = qrFor(measure, copy, spec, s, Math.min(w * 0.24, h * 0.085), w * 0.34);
  const qrBlock = qr && qr.code ? {
    ...qr,
    x: w - pad - qr.size,
    y: (ev > 0 ? event.y + (ev - qr.h) / 2 : h - footerH - qr.h - h * 0.010),
    centreOn: w - pad - qr.size / 2,
  } : null;

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
    qr: qrBlock,
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
      ...qrWarnings(qr, qrBlock),
    ],
  };
}


/* ------------------------------------------------------------ ballot guide ---
 *
 * 81 of the 174 districts elect more than one member, and 237 of the 330
 * nominees run in one of them. A voter who marks a single name in a nine seat
 * district gives the other eight away. Nothing else in this app addresses that,
 * so this piece does one thing: show the ballot as the voter will see it, with
 * every oval already filled, and say how many to mark.
 *
 * Ballot order is the surname order the state prints, which is the order the
 * roster already holds. */
function solveBallot(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.052 * density;
  const gap = s * 0.030 * density;
  const seats = Math.max(1, spec.seats || n || 1);

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 2.0 : 0;

  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - discH };
  // Side by side once the canvas is wider than it is tall by a clear margin.
  // Stacked, a landscape ballot card would be a wide strip of nothing.
  const wide = w / h >= 1.25;
  const copyW = wide ? (inner.w - gap) * 0.46 : inner.w;

  const kick = fitBlock(measure, copy.kicker, COND_BOLD, s * 0.032, copyW, 2, 0.16, true);
  const head = fitBlock(measure, copy.headline, ANTON, s * (wide ? 0.088 : 0.078), copyW, 3, -0.01, true);
  const ask = fitBlock(measure, copy.subhead, COND_SEMI, s * 0.038, copyW, 3, 0.005, false);
  const det = fitBlock(measure, copy.details, COND_MED, s * 0.029, copyW, 4, 0.010, false);

  // The instruction is the point of the piece, so it is generated rather than
  // typed: nobody has to remember how many seats this district elects.
  const rule = seats > 1 ? `Vote for not more than ${seats}` : 'Vote for one';
  const ruleBlk = fitBlock(measure, rule, COND_BOLD, s * 0.034, copyW, 2, 0.10, true);

  const ballotN = slate.filter((c) => !c.topper).length;

  const ctaTxt = String(copy.cta || '').trim();
  const cta = fitBlock(measure, ctaTxt, ANTON, s * 0.036, copyW, 1, 0.02, true);

  const entries = [
    { role: 'kicker', block: kick, gap: 0 },
    { role: 'headline', block: head, gap: s * 0.008 },
    { role: 'ask', block: ask, gap: s * 0.020 },
    { role: 'details', block: det, gap: s * 0.018 },
    { role: 'cta', block: cta, gap: s * 0.034, h: cta.h ? cta.px * 1.84 : 0 },
  ];
  const qr = qrFor(measure, copy, spec, s, Math.min(copyW * 0.42, s * 0.20), copyW);
  const qrH = qr && qr.code ? qr.h + s * 0.026 : 0;
  const copyH = stackBlocks(entries, 0).height + qrH;

  let copyRect;
  let card;
  /* How tall the card wants to be, before anything else is decided: the header,
   * a proper ballot row per name, and a margin. A one-name card pinned to a
   * third of the piece is mostly empty paper with an oval in it. */
  const headerH0 = ruleBlk.h + s * 0.024;
  const idealRowH = s * 0.085;
  const rowGap = s * 0.012;
  const naturalCard = headerH0 + ballotN * idealRowH
    + Math.max(0, ballotN - 1) * rowGap + s * 0.044;

  if (wide) {
    const capped = Math.min(copyH, inner.h);
    copyRect = { x: inner.x, y: inner.y + Math.max(0, (inner.h - capped) / 2), w: copyW, h: capped };
    card = { x: inner.x, y: inner.y, w: inner.w - copyW - gap, h: Math.min(inner.h, naturalCard) };
    card.x = inner.x + copyW + gap;
    card.y = inner.y + Math.max(0, (inner.h - card.h) / 2);
  } else {
    // Never a sliver, never more than it needs: a ballot guide whose ballot is
    // a rumour is a poster, and one whose ballot is empty paper is worse.
    const room = Math.max(inner.h * 0.30, inner.h - copyH - gap * 1.4);
    const cardH = Math.min(room, naturalCard);
    const group = copyH + gap * 1.4 + cardH;
    const top = inner.y + Math.max(0, (inner.h - group) / 2);
    copyRect = { x: inner.x, y: top, w: copyW, h: copyH };
    card = { x: inner.x, y: top + copyH + gap * 1.4, w: inner.w, h: cardH };
  }
  const bands = stackBlocks(entries, copyRect.y);
  const copyCramped = bands.height + qrH > copyRect.h + 1;
  const qrBlock = qr && qr.code ? {
    ...qr,
    x: wide ? copyRect.x : copyRect.x + (copyW - qr.size) / 2,
    y: copyRect.y + bands.height + s * 0.026,
    centreOn: wide ? copyRect.x + qr.size / 2 : copyRect.x + copyW / 2,
  } : null;

  // The card: a header rule, then one row per name. Rows shrink to fit rather
  // than spilling, because a ballot with a name missing is worse than a small one.
  const headerH = headerH0;
  const body = { x: card.x, y: card.y + headerH, w: card.w, h: card.h - headerH };

  /* A ballot row is a ballot row. Dividing the card evenly between however many
   * names there are is right for nine and absurd for one: a single row took the
   * whole card, which gave a half-inch oval and threw the first name and the
   * surname to opposite ends of five hundred pixels of nothing. The ideal size
   * is the answer; the even division only ever shrinks it. */
  // The gap closes up before the rows do, and past that the rows are squeezed
  // rather than run off the card. The warning below carries the bad news.
  const gapUsed = Math.min(rowGap, Math.max(0, body.h * 0.03));
  const even = (body.h - gapUsed * Math.max(0, ballotN - 1)) / Math.max(1, ballotN);
  const rowH = Math.max(1, Math.min(even, idealRowH));
  const cramped = rowH < s * 0.030;
  const ovalR = Math.min(rowH * 0.30, card.w * 0.045);
  const blockH = ballotN * rowH + Math.max(0, ballotN - 1) * gapUsed;
  const rowsTop = body.y + Math.max(0, (body.h - blockH) / 2);

  /* Only the people actually on this ballot line get an oval. A governor at the
   * top of the ticket is on the piece, not on the House ballot, and an oval
   * next to her name would be telling a voter to do something they cannot. */
  const onBallot = slate.filter((c) => !c.topper);
  const rows = onBallot.map((c, i) => {
    const y = rowsTop + i * (rowH + gapUsed);
    return {
      candidate: c, x: body.x, y, w: body.w, h: rowH,
      oval: { cx: body.x + card.w * 0.055 + ovalR, cy: y + rowH / 2, rx: ovalR * 1.45, ry: ovalR },
      textX: body.x + card.w * 0.055 + ovalR * 2 + card.w * 0.045,
      namePx: Math.min(rowH * 0.50, s * 0.040),
      firstPx: Math.min(rowH * 0.27, s * 0.022),
    };
  });
  const overflow = rows.length
    ? (rows[rows.length - 1].y + rowH) > (card.y + card.h + s * 0.004) : false;

  return {
    canvas: { w, h },
    composition: 'ballot',
    pad, gap, s, scale: 1,
    grid: { cols: 1, rows: n, tileW: 0, tileH: 0 },
    slateRect: card,
    tiles: [],
    deck: null,
    copy: null,
    mailPanel: null,
    ballot: {
      wide, card, body, headerH, rowH, rows, seats,
      rule: ruleBlk,
      copyRect, bands: bands.items,
    },
    qr: qrBlock,
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(ask.truncated ? ['The subhead is too long and was cut.'] : []),
      ...(overflow ? [`${ballotN} names will not fit the ballot card on this canvas. Use a taller one.`] : []),
      ...(copyCramped ? ['The copy is longer than the space left beside the ballot. Cut a line.'] : []),
      ...(cramped ? [`${ballotN} names on a card this size gives rows too small to read. Use a taller canvas.`] : []),
      ...qrWarnings(qr, qrBlock),
      ...(seats > ballotN ? [`This district elects ${seats} but only ${ballotN} Republicans are on the slate. The card says ${seats}.`] : []),
    ],
  };
}


/* --------------------------------------------------------- palm card back ---
 *
 * A rack card with a blank back wastes half the print. The front sells the
 * slate; this side gives the voter a reason and then tells them exactly what to
 * do with the ballot. Bands again, in the order a card is read: what they did,
 * what they stand for, one line worth remembering, then the ovals. */
function solvePalmBack(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  // The oval band is the ballot line, so a topper is not one of these rows.
  const n = slate.filter((c) => !c.topper).length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = w * 0.055 * density;
  const gap = w * 0.034 * density;
  const inner = w - pad * 2;
  const seats = Math.max(1, spec.seats || n || 1);

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, w * 0.0155);
  const footerH = disc ? discPx * 2.9 : 0;

  /* Measure the whole stack at scale q. The card is a fixed order of bands, so
   * the only way to make a long back fit a short canvas is to set all of it
   * smaller together. Everything below reads q; nothing picks its own size. */
  function build(q, drop = new Set()) {
  // Masthead, quieter than the front: this side is the argument, not the ask.
  const kick = fitBlock(measure, copy.kicker, COND_BOLD, w * 0.030 * q, inner, 2, 0.16, true);
  const head = fitBlock(measure, copy.headline, ANTON, w * 0.070 * q, inner, 3, -0.01, true);
  const mastH = (kick.h ? kick.h + h * 0.005 : 0) + head.h + h * 0.014 * q;

  // The record. One line per thing done, each with a check.
  const recLines = drop.has('record') ? []
    : String(copy.record || '').split('\n').map((t) => t.trim()).filter(Boolean);
  const recPx = w * 0.040 * q;
  const recRows = recLines.map((t) => fitBlock(measure, t, COND_SEMI, recPx, inner - w * 0.085, 2, 0.005, false));
  const recH = recRows.length
    ? recRows.reduce((a, r) => a + r.h + h * 0.0085 * q, 0) + h * 0.018 * q
    : 0;

  // Issues, two across, the way the front's strip pairs them.
  const vals = drop.has('grid') ? []
    : String(copy.values || '').split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const cols = vals.length >= 4 ? 2 : 1;
  const cellW = (inner - (cols - 1) * gap * 0.7) / cols;
  const cells = vals.map((v) => fitBlock(measure, v, COND_BOLD, w * 0.034 * q, cellW - w * 0.030, 2, 0.04, true));
  const cellH = cells.length ? Math.max(...cells.map((c) => c.h)) + w * 0.044 * q : 0;
  const gridRows = Math.ceil(vals.length / cols);
  const gridH = cells.length ? gridRows * cellH + (gridRows - 1) * gap * 0.55 + h * 0.020 * q : 0;

  // One line worth remembering.
  const call = fitBlock(measure, drop.has('callout') ? '' : copy.callout,
    ANTON, w * 0.052 * q, inner - w * 0.06, 4, -0.005, false);
  const callH = call.h ? call.h + h * 0.038 * q : 0;

  // The ovals. Names only: the faces are on the front, and this is the
  // instruction, not the introduction.
  // Generated, never typed. The number of ovals is the one thing on this card
  // that has to be right, and the app knows it from the district record.
  const ovalRule = seats > 1 ? `Fill in all ${seats} ovals` : 'Fill in the oval';
  const ruleBlk = fitBlock(measure, ovalRule, ANTON, w * 0.050 * q, inner, 2, 0.01, true);
  const rowPx = w * 0.042 * q;
  const rowGap = h * 0.004 * q;
  const ovalChrome = ruleBlk.h + h * 0.016 * q + h * 0.026 * q;

  /* The ovals are elastic. Everything above them is measured copy that either
   * fits or gets given up; the rows take what is left, down to a floor. On a
   * canvas where even the floor does not fit they are squeezed past it, which
   * is ugly and is exactly what the warning below says. */
  const fixed = pad * 2 + mastH + recH + gridH + callH + footerH;
  const room = h - fixed - ovalChrome - Math.max(0, n - 1) * rowGap;
  const wantRowH = rowPx * 1.62;
  const floorRowH = rowPx * 0.95;
  const rowH = n ? Math.max(1, Math.min(wantRowH, Math.max(floorRowH, room / n))) : 0;
  const ovalsH = n ? ovalChrome + n * rowH + (n - 1) * rowGap : 0;

  const used = fixed + ovalsH;
  const slack = h - used;
  return { q, drop, used, slack, kick, head, mastH, recRows, recPx, recH, recLines,
    cols, cellW, cells, cellH, gridH, call, callH, ruleBlk, rowPx, rowH, rowGap, ovalsH, vals };
  }

  /* The largest scale that fits, and if nothing fits, the bands a designer
   * would give up in that order. The masthead and the ovals never go: one says
   * who this is, the other is the whole reason the card has a back. */
  const FLOOR = 0.5;
  const CEILING = 1.35;   // a short back fills the card rather than floating in it
  const GIVE_UP = ['callout', 'grid', 'record'];
  const fits = (q, drop) => build(q, drop).slack >= 0;
  const bestQ = (drop) => {
    if (fits(CEILING, drop)) return CEILING;
    if (!fits(FLOOR, drop)) return null;
    let lo = FLOOR, hi = CEILING;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, drop)) lo = mid; else hi = mid;
    }
    return lo;
  };
  const drop = new Set();
  let q = bestQ(drop);
  for (const band of GIVE_UP) {
    if (q !== null) break;
    drop.add(band);
    q = bestQ(drop);
  }
  // Even stripped to the masthead and the ovals it does not fit. Squeeze the
  // rows past their floor so nothing runs off the piece, and say so.
  let m = build(q ?? FLOOR, drop);
  if (m.slack < 0 && n) {
    const spare = m.ovalsH + m.slack - (m.ruleBlk.h + h * 0.016 * m.q + h * 0.026 * m.q)
      - (n - 1) * m.rowGap;
    m = { ...m, rowH: Math.max(1, spare / n), squeezed: true };
    m.ovalsH = m.ruleBlk.h + h * 0.016 * m.q + h * 0.026 * m.q + n * m.rowH + (n - 1) * m.rowGap;
    m.slack = 0;
  }
  const { kick, head, mastH, recRows, recPx, recH, recLines, cols, cellW, cells,
    cellH, gridH, call, callH, ruleBlk, rowPx, rowH, rowGap, ovalsH, vals, slack } = m;

  // Four bands above the ovals, so the leftover goes four ways. Dumping it all
  // in one place left a hand's width of nothing above the oval band.
  const air = Math.max(0, slack) / 4;
  let y = pad;
  const mast = { x: pad, y, w: inner, h: mastH, kicker: kick, headline: head };
  y += mastH + air;

  const record = { x: pad, y, w: inner, h: recH, rows: recRows, px: recPx };
  y += recH + air;

  const grid = {
    x: pad, y, w: inner, h: gridH, cols, cellW, cellH,
    cells: cells.map((c, i) => ({
      block: c,
      x: pad + (i % cols) * (cellW + gap * 0.7),
      y: y + Math.floor(i / cols) * (cellH + gap * 0.55),
      w: cellW, h: cellH,
    })),
  };
  y += gridH + air;

  const callout = { x: pad, y, w: inner, h: callH, block: call };
  y += callH + air;

  const ovalTop = Math.max(pad, Math.min(y, h - footerH - ovalsH));
  const ovalR = rowPx * 0.34;
  const rows = slate.filter((c) => !c.topper).map((c, i) => {
    const ry = ovalTop + ruleBlk.h + h * 0.016 + i * (rowH + rowGap);
    return {
      candidate: c, x: pad, y: ry, w: inner, h: rowH, px: rowPx,
      oval: { cx: pad + w * 0.030 + ovalR, cy: ry + rowH / 2, rx: ovalR * 1.45, ry: ovalR },
      textX: pad + w * 0.030 + ovalR * 2 + w * 0.034,
    };
  });
  const ovals = { x: 0, y: ovalTop, w, h: h - footerH - ovalTop, rule: ruleBlk, rows, seats };

  /* The QR sits in the oval band, off to the right of the names. That is the
   * commit read: somebody who has got this far is the one who will scan. */
  const qr = qrFor(measure, copy, spec, s, Math.min(w * 0.26, ovals.h * 0.46), w * 0.34);
  const qrBlock = qr && qr.code ? {
    ...qr,
    x: w - pad - qr.size,
    y: ovals.y + ovals.h - qr.h - h * 0.010,
    centreOn: w - pad - qr.size / 2,
  } : null;

  return {
    canvas: { w, h },
    composition: 'palmback',
    pad, gap, s, scale: 1,
    grid: { cols: 1, rows: n, tileW: 0, tileH: 0 },
    slateRect: ovals,
    tiles: [],
    deck: null,
    copy: null,
    mailPanel: null,
    palmback: { mast, record, grid, callout, ovals },
    qr: qrBlock,
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: inner, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for the card and was cut.'] : []),
      ...(call.truncated ? ['The callout is too long for the card and was cut.'] : []),
      ...(m.q < 0.999 ? [`The back is over full, so all of it was set ${Math.round((1 - m.q) * 100)}% smaller. Cut a record line or an issue.`] : []),
      ...(drop.size ? [`No room for the ${[...drop].join(' or the ')} on this canvas, so ${drop.size > 1 ? 'they were' : 'it was'} left off. The back belongs on a 4.25 x 11 card.`] : []),
      ...(m.squeezed ? ['This canvas is too short for a palm card back at any size. Use the palm card canvas.'] : []),
      ...(vals.length > 6 ? ['More than six issues will not fit the grid.'] : []),
      ...(!recLines.length && !vals.length && !call.lines.length
        ? ['The back is empty. Fill in the record, the issues or the callout.'] : []),
      ...qrWarnings(qr, qrBlock),
    ],
  };
}


/* ---------------------------------------------------------------- spotlight ---
 *
 * One candidate at full size with the rest of the slate as chips beneath. 93 of
 * the 174 districts run a single nominee, where a grid of one looks like a
 * mistake, and a member posting to their own feed wants their own face, not the
 * team photo. The chips keep the slate present without competing. */
function solveSpotlight(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.055 * density;
  const gap = s * 0.032 * density;

  const wanted = String(style.spotlight || '').trim();
  const idx = Math.max(0, slate.findIndex((c) => c.name === wanted));
  const hero = slate[idx] || slate[0] || null;
  const rest = slate.filter((_, i) => i !== idx);

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 1.9 : 0;
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - discH };

  const wide = w / h >= 1.15;
  const heroW = wide ? inner.w * 0.40 : inner.w * 0.62;
  const colW = wide ? inner.w - heroW - gap : inner.w;

  /* Measured at scale q so the hero can be defended. A spotlight whose subject
   * ends up chip sized is not a spotlight, so on a stacked canvas the copy
   * gives way to the face rather than the other way round. */
  function build(q) {
    const kick = fitBlock(measure, copy.kicker, COND_BOLD, s * 0.030 * q, colW, 2, 0.16, true);
    const head = fitBlock(measure, copy.headline, ANTON, s * 0.080 * q, colW, 3, -0.01, true);
    const call = fitBlock(measure, copy.callout, COND_SEMI, s * 0.046 * q, colW, 4, 0.005, false);
    const ask = fitBlock(measure, copy.subhead, COND_MED, s * 0.032 * q, colW, 3, 0.008, false);
    const cta = fitBlock(measure, copy.cta, ANTON, s * 0.034 * q, colW, 1, 0.02, true);

    // Floored, not just capped. A running mate shrunk to a thumbnail because
    // the copy ran long is worse than no chip at all.
    const chipW = rest.length
      ? Math.max(s * 0.085, Math.min(colW / Math.min(rest.length, 5) - gap * 0.5, s * 0.155 * q))
      : 0;
    const perRow = chipW ? Math.max(1, Math.floor((colW + gap * 0.5) / (chipW + gap * 0.5))) : 1;
    const chipRows = rest.length ? Math.ceil(rest.length / perRow) : 0;
    const chipH = chipW ? chipW * (PHOTO_AR + 0.30) : 0;
    const chipsH = rest.length ? chipRows * chipH + (chipRows - 1) * gap * 0.5 + s * 0.020 * q : 0;

    // The call to action is a pill, so it stands taller than its own type.
    const ctaH = cta.h ? cta.px * 1.84 : 0;
    const entries = [
      { role: 'kicker', block: kick, gap: 0 },
      { role: 'headline', block: head, gap: s * 0.008 * q },
      { role: 'callout', block: call, gap: s * 0.022 * q },
      { role: 'ask', block: ask, gap: s * 0.016 * q },
      { role: 'cta', block: cta, gap: s * 0.030 * q, h: ctaH },
    ];
    const stack = stackBlocks(entries, 0);
    const qrBox = qrFor(measure, copy, spec, s, Math.min(colW * 0.30, s * 0.17 * q), colW);
    const qrH = qrBox && qrBox.code ? qrBox.h + s * 0.022 * q : 0;
    const copyH = stack.height + qrH + (chipsH ? s * 0.024 * q + chipsH : 0);
    return { q, kick, head, call, ask, cta, ctaH, entries, chipW, perRow, chipRows,
      chipH, chipsH, copyH, qrBox, qrH };
  }

  /* How much height the copy column may have. Beside the face it may use the
   * canvas; above it, the hero keeps its share and the copy takes the rest. */
  const HERO_FLOOR = 0.44;
  const budget = wide ? inner.h : inner.h * (1 - HERO_FLOOR) - gap;

  let m = build(1);
  if (m.copyH > budget) {
    let lo = 0.45, hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (build(mid).copyH <= budget) lo = mid; else hi = mid;
    }
    m = build(lo);
  }
  const { kick, head, call, ask, cta, chipW, perRow, chipRows, chipH, chipsH, copyH, qrBox, qrH } = m;
  // Past the search floor the copy will not compress any further. Cap the
  // column so nothing runs off the piece, and warn about the overrun.
  const cropped = copyH > budget;
  const copyBudget = Math.max(1, Math.min(copyH, budget));

  const heroRect = wide
    ? { x: inner.x, y: inner.y, w: heroW, h: inner.h }
    : { x: inner.x + (inner.w - heroW) / 2, y: inner.y, w: heroW, h: Math.max(1, inner.h - copyBudget - gap) };
  const copyRect = wide
    ? { x: inner.x + heroW + gap, y: inner.y + Math.max(0, (inner.h - copyBudget) / 2), w: colW, h: copyBudget }
    : { x: inner.x, y: inner.y + inner.h - copyBudget, w: colW, h: copyBudget };

  // The hero tile keeps the same photo-to-plate proportion as every other tile,
  // so a spotlight and a grid read as the same family.
  const tileAR = PHOTO_AR + PLATE_AR + ((hero?.tag || '').trim() ? 0.20 : 0);
  const tileW = Math.min(heroRect.w, heroRect.h / tileAR);
  const tileH = tileW * tileAR;
  const tx = heroRect.x + (heroRect.w - tileW) / 2;
  const ty = heroRect.y + (heroRect.h - tileH) / 2;
  const photoH = tileW * PHOTO_AR;
  const heroTile = hero ? {
    candidate: hero, x: tx, y: ty, w: tileW, h: tileH,
    photo: { x: tx, y: ty, w: tileW, h: photoH },
    plate: { x: tx, y: ty + photoH + tileW * 0.035, w: tileW, h: tileW * PLATE_AR },
    tag: (hero.tag || '').trim()
      ? { x: tx, y: ty + photoH + tileW * 0.035 + tileW * PLATE_AR + tileW * 0.026, w: tileW }
      : null,
  } : null;

  // One pass, one set of numbers: the bands, then the QR, then the chips. They
  // all line up with each other: left when the copy is left, centred when it is
  // centred, so nothing hangs off the edge of a centred stack.
  const centred = !wide && style.align !== 'left';
  const bands = stackBlocks(m.entries, copyRect.y);
  const qrTop = copyRect.y + bands.height + s * 0.022 * m.q;
  const qrPlaced = qrBox && qrBox.code ? {
    ...qrBox, y: qrTop,
    x: centred ? copyRect.x + (colW - qrBox.size) / 2 : copyRect.x,
    centreOn: centred ? copyRect.x + colW / 2 : copyRect.x + qrBox.size / 2,
  } : null;
  const chipsTop = chipsH
    ? Math.min(copyRect.y + copyRect.h - chipsH, copyRect.y + bands.height + qrH + s * 0.024 * m.q)
    : copyRect.y + copyRect.h;
  const chipsCentred = centred;
  const chips = rest.map((c, i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, rest.length - row * perRow);
    const rowW = inRow * chipW + (inRow - 1) * gap * 0.5;
    const x = copyRect.x + (chipsCentred ? (colW - rowW) / 2 : 0) + col * (chipW + gap * 0.5);
    const y = chipsTop + row * (chipH + gap * 0.5);
    return {
      candidate: c, x, y, w: chipW, h: chipH,
      photo: { x, y, w: chipW, h: chipW * PHOTO_AR },
      plate: { x, y: y + chipW * PHOTO_AR + chipW * 0.03, w: chipW, h: chipW * 0.26 },
    };
  });

  return {
    canvas: { w, h },
    composition: 'spotlight',
    pad, gap, s, scale: 1,
    grid: { cols: perRow, rows: chipRows, tileW, tileH },
    slateRect: heroRect,
    tiles: heroTile ? [heroTile] : [],
    deck: null,
    copy: null,
    mailPanel: null,
    spotlight: { wide, hero: heroTile, chips, copyRect, bands: bands.items },
    qr: qrPlaced,
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(call.truncated ? ['The callout is too long and was cut.'] : []),
      ...(!hero ? ['Nobody is on the slate, so there is nobody to spotlight.'] : []),
      ...(rest.length > 9 ? ['More than nine chips will run very small. Drop some candidates.'] : []),
      ...(cropped ? ['The copy is longer than a spotlight of this size can hold. Cut a line, or drop a chip.'] : []),
      ...qrWarnings(qrBox, qrPlaced),
    ],
  };
}

/* ------------------------------------------------------------------ versus ---
 *
 * Two columns, ours and theirs, because a choice reads faster than a claim.
 * Our side is the values strip the palm card already uses; their side is its
 * own field, so nobody has to invent the other party's record twice. */
function solveVersus(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.052 * density;
  const gap = s * 0.030 * density;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 1.9 : 0;
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - discH };

  const kick = fitBlock(measure, copy.kicker, COND_BOLD, s * 0.030, inner.w, 2, 0.16, true);
  const head = fitBlock(measure, copy.headline, ANTON, s * 0.076, inner.w, 2, -0.01, true);
  const headH = (kick.h ? kick.h + s * 0.008 : 0) + head.h + s * 0.026;

  const cta = fitBlock(measure, copy.cta, ANTON, s * 0.034, inner.w, 1, 0.02, true);
  // A pill stands taller than its own type. Reserving only the line height is
  // what let the call to action sit down on top of the faces.
  const pillH = cta.h ? cta.px * 1.84 : 0;
  const ctaH = pillH ? pillH + s * 0.026 : 0;

  // Faces along the foot, small and plateless: they identify the slate, they
  // are not the argument.
  const faceH = n ? Math.min(inner.h * 0.24, s * 0.20) : 0;
  const faceW = n ? Math.min((inner.w - (n - 1) * gap * 0.5) / n, faceH / PHOTO_AR) : 0;
  const facesH = n ? faceW * PHOTO_AR + s * 0.026 : 0;

  // Stack the columns on anything tall and narrow; nobody reads two 300px
  // columns of claims on a story.
  const stacked = w / h < 0.78;
  const bodyH = inner.h - headH - ctaH - facesH;
  const colW = stacked ? inner.w : (inner.w - gap) / 2;
  const colH = stacked ? (bodyH - gap) / 2 : bodyH;

  // Values are the comma separated issue words the palm card strip uses. The
  // other side's record is written a claim per line, so splitting it on commas
  // too would turn "An income tax, again" into two separate charges.
  const ours = String(copy.values || '').split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
  const theirs = String(copy.contrast || '').split('\n').map((t) => t.trim()).filter(Boolean);

  /* The panel grows to hold its claims with room to breathe, and stops. Pinned
   * to the full column it left half a box of nothing under four lines; sized
   * tight to the text it left the same nothing above and below instead. So:
   * take the height generous gaps would want, cap it at the column, and share
   * whatever is left between the rows. */
  const MAX_ROW_GAP = s * 0.034;
  const MIN_ROW_GAP = s * 0.010;
  const side = (items, x, y, label) => {
    const labelBlk = fitBlock(measure, label, COND_BOLD, s * 0.030, colW - s * 0.05, 1, 0.14, true);
    const px = s * 0.036;
    const rows = items.map((t) => fitBlock(measure, t, COND_SEMI, px, colW - s * 0.10, 2, 0.005, false));
    const textH = rows.reduce((a, r) => a + r.h, 0);
    const chrome = s * 0.030 + labelBlk.h + s * 0.020 + s * 0.026;
    const h = Math.max(0, Math.min(colH, chrome + textH + rows.length * MAX_ROW_GAP));
    const rowGap = rows.length
      ? Math.max(MIN_ROW_GAP, (h - chrome - textH) / rows.length)
      : MIN_ROW_GAP;
    const listH = textH + rows.length * rowGap;
    return { x, y: y + (colH - h) / 2, w: colW, h, label: labelBlk, rows, rowGap, px, listH, items };
  };

  const bodyY = inner.y + headH;
  const left = side(ours, inner.x, bodyY, style.oursLabel || 'Our team');
  const right = side(theirs, stacked ? inner.x : inner.x + colW + gap,
    stacked ? bodyY + colH + gap : bodyY, style.theirsLabel || 'Their record');
  // Side by side, the two panels match: a taller box is not a stronger claim.
  if (stacked) {
    // One above the other with a single gap, and the pair centred. Each panel
    // centred in its own half opened a hole the height of a headline between
    // the two halves of the argument.
    const total = left.h + gap + right.h;
    const top = bodyY + Math.max(0, (bodyH - total) / 2);
    left.y = top;
    right.y = top + left.h + gap;
  } else {
    const h = Math.max(left.h, right.h);
    const top = bodyY + (colH - h) / 2;
    for (const col of [left, right]) {
      const chrome = s * 0.030 + col.label.h + s * 0.020 + s * 0.026;
      const textH = col.rows.reduce((a, r) => a + r.h, 0);
      col.h = h;
      col.y = top;
      col.rowGap = col.rows.length
        ? Math.max(MIN_ROW_GAP, Math.min(MAX_ROW_GAP, (h - chrome - textH) / col.rows.length))
        : MIN_ROW_GAP;
      col.listH = textH + col.rows.length * col.rowGap;
    }
  }

  const facesY = inner.y + inner.h - facesH + s * 0.026;
  const faces = slate.map((c, i) => {
    const rowW = n * faceW + (n - 1) * gap * 0.5;
    const x = inner.x + (inner.w - rowW) / 2 + i * (faceW + gap * 0.5);
    return {
      candidate: c, x, y: facesY, w: faceW, h: faceW * PHOTO_AR,
      photo: { x, y: facesY, w: faceW, h: faceW * PHOTO_AR },
      plate: null,
    };
  });

  return {
    canvas: { w, h },
    composition: 'versus',
    pad, gap, s, scale: 1,
    grid: { cols: n || 1, rows: 1, tileW: faceW, tileH: faceW * PHOTO_AR },
    slateRect: { x: inner.x, y: facesY, w: inner.w, h: facesH },
    tiles: faces,
    deck: null,
    copy: null,
    mailPanel: null,
    versus: {
      stacked, left, right, faces,
      head: { x: inner.x, y: inner.y, w: inner.w, h: headH, kicker: kick, headline: head },
        cta: cta.lines.length
        ? { block: cta, x: inner.x, y: inner.y + inner.h - facesH - ctaH, w: inner.w, h: pillH }
        : null,
    },
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(!ours.length || !theirs.length
        ? ['A contrast needs both sides. Fill in the values and the other record.'] : []),
      ...(left.listH > colH || right.listH > colH
        ? ['The lists are longer than the columns. Cut a line from each side.'] : []),
      ...(Math.max(ours.length, theirs.length) > 6 ? ['More than six points a side stops being a contrast.'] : []),
    ],
  };
}

/* ------------------------------------------------------------------- strip ---
 *
 * Display rails. A leaderboard is eight times wider than it is tall, where the
 * ordinary solve carves a copy column and a slate column and produces two
 * unreadable slivers. This one gives up on the grid: a few faces, one line, one
 * pill, and nothing else. */
function solveStrip(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const vertical = h > w;
  const pad = s * (vertical ? 0.070 : 0.105);
  const gap = s * (vertical ? 0.060 : 0.090);
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };

  // Four faces is the most that stays a face rather than a smudge at 90px tall.
  // A skyscraper is narrower than it is short, so it takes fewer still.
  const maxFaces = vertical
    ? Math.max(1, Math.min(3, Math.floor(inner.w / (inner.h * 0.14))))
    : Math.max(1, Math.min(4, Math.floor(inner.w / (inner.h * 0.55))));
  const shown = slate.slice(0, maxFaces);
  const more = slate.length - shown.length;
  const count = Math.max(1, shown.length);
  const faceGap = gap * 0.25;

  // Sized by whichever way round the rail is tight: the row of faces has to fit
  // the width and the band has to fit the height, and neither may win.
  const byWidth = (inner.w * (vertical ? 1 : 0.46) - (count - 1) * faceGap) / count;
  const byHeight = (vertical ? inner.h * 0.34 : inner.h) / PHOTO_AR;
  const faceW = Math.max(1, Math.min(byWidth, byHeight));
  const faceH = faceW * PHOTO_AR;
  const facesW = shown.length ? shown.length * faceW + (shown.length - 1) * faceGap : 0;

  const ctaTxt = String(copy.cta || '').trim();
  const line = String(copy.headline || copy.subhead || '').trim();

  let facesRect, textRect, ctaRect;
  if (vertical) {
    facesRect = { x: inner.x + (inner.w - facesW) / 2, y: inner.y, w: facesW, h: faceH };
    const rest = inner.h - faceH - gap;
    ctaRect = ctaTxt ? { x: inner.x, y: inner.y + inner.h - s * 0.16, w: inner.w, h: s * 0.16 } : null;
    textRect = { x: inner.x, y: inner.y + faceH + gap, w: inner.w, h: rest - (ctaRect ? ctaRect.h + gap * 0.5 : 0) };
  } else {
    facesRect = { x: inner.x, y: inner.y, w: facesW, h: faceH };
    const ctaW = ctaTxt ? Math.min(inner.w * 0.30, s * 2.4) : 0;
    ctaRect = ctaTxt ? { x: inner.x + inner.w - ctaW, y: inner.y + inner.h * 0.12, w: ctaW, h: inner.h * 0.76 } : null;
    const tx = inner.x + facesW + (facesW ? gap : 0);
    textRect = { x: tx, y: inner.y, w: inner.x + inner.w - tx - (ctaW ? ctaW + gap * 0.6 : 0), h: inner.h };
  }

  // A skyscraper is read top to bottom at arm's length, so its line is set to
  // the width of the rail. Sized off the short side it came out as a caption
  // floating in the middle of a very tall white box.
  const headPx = vertical
    ? Math.min(inner.w * 0.19, textRect.h * 0.30)
    : Math.min(inner.h * 0.46, textRect.w * 0.14);
  const head = fitBlock(measure, line, ANTON, headPx, Math.max(10, textRect.w), vertical ? 5 : 2, -0.01, true);
  const cta = ctaRect
    ? fitBlock(measure, ctaTxt, COND_BOLD, Math.min(ctaRect.h * 0.32, s * 0.09), ctaRect.w * 0.84, 2, 0.04, true)
    : { lines: [], h: 0, px: 0 };

  const faces = shown.map((c, i) => {
    const x = facesRect.x + i * (faceW + faceGap);
    return {
      candidate: c, x, y: facesRect.y, w: faceW, h: faceH,
      photo: { x, y: facesRect.y, w: faceW, h: faceH },
      plate: null,
    };
  });

  return {
    canvas: { w, h },
    composition: 'strip',
    pad, gap, s, scale: 1,
    grid: { cols: shown.length || 1, rows: 1, tileW: faceW, tileH: faceH },
    slateRect: facesRect,
    tiles: faces,
    deck: null,
    copy: null,
    mailPanel: null,
    // A display rail carries no disclaimer of its own: the click-through does.
    // Nothing here is a finished ad under RSA 664:14 on its own.
    strip: { vertical, facesRect, textRect, ctaRect, head, cta, more },
    disclaimer: null,
    warnings: [
      ...(head.truncated ? ['The line is too long for a rail this size. Four words is the budget.'] : []),
      ...(more > 0 ? [`${more} of ${slate.length} faces do not fit a rail this size and were left off.`] : []),
      ...(!line ? ['A rail with no headline is just faces. Put one line in.'] : []),
      'A display rail carries no disclaimer. The landing page has to.',
    ],
  };
}


/* --------------------------------------------------------------- the stats --- */

/** "1,140 | What the average homeowner paid" per line, up to four. */
function parseStats(raw) {
  return String(raw || '').split('\n').map((line) => {
    const [value, ...rest] = line.split('|');
    return { value: (value || '').trim(), label: rest.join('|').trim() };
  }).filter((x) => x.value).slice(0, 4);
}

/* ---------------------------------------------------------- stat, the piece ---
 *
 * The archetype is type-dominant with a number doing the work. Numbers sell, so
 * the number is set large and the label small, and the first one gets the panel
 * to itself. Everything else on the piece is support. The job this serves is
 * "sell a policy or project": one number, one visual, one next step. */
function solveStat(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.055 * density;
  const gap = s * 0.030 * density;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const src = String(copy.source || '').trim();
  const srcPx = Math.max(9, s * 0.0135);
  // The flag band is painted over the foot of the piece, so it is reserved here
  // rather than discovered later by a source line disappearing under it.
  const band = flagBand(style, s, disc ? discPx : 0).band;
  const footH = Math.max(band, disc ? discPx * 1.9 : 0) + (src ? srcPx * 1.7 : 0);
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - footH };

  const stats = parseStats(copy.stat);
  const hero = stats[0] || null;
  const rest = stats.slice(1);

  // Faces along the foot, small and plateless: identity, not argument.
  const faceW = n ? Math.min((inner.w - (n - 1) * gap * 0.4) / n, s * 0.11) : 0;
  const facesH = n ? faceW * PHOTO_AR + s * 0.024 : 0;

  const kick = fitBlock(measure, copy.kicker, COND_BOLD, s * 0.030, inner.w, 2, 0.16, true);
  const head = fitBlock(measure, copy.headline, ANTON, s * 0.062, inner.w, 3, -0.01, true);
  const ask = fitBlock(measure, copy.subhead, COND_SEMI, s * 0.036, inner.w, 3, 0.005, false);
  const det = fitBlock(measure, copy.details, COND_MED, s * 0.028, inner.w, 4, 0.010, false);
  const cta = fitBlock(measure, copy.cta, ANTON, s * 0.034, inner.w, 1, 0.02, true);

  const qr = qrFor(measure, copy, spec, s, Math.min(inner.w * 0.26, s * 0.17), inner.w * 0.4);
  const qrH = qr && qr.code ? qr.h + s * 0.020 : 0;

  // The smaller numbers are measured before the hero, because the hero takes
  // what is left and leaving these out of the sum is what put the QR code on
  // top of the call to action.
  const cols0 = rest.length >= 3 ? 3 : Math.max(1, rest.length);
  const cellW0 = rest.length ? (inner.w - (cols0 - 1) * gap * 0.7) / cols0 : 0;
  const smallsPre = rest.map((st) => ({
    valueBlk: fitBlock(measure, st.value, ANTON, s * 0.070, cellW0 - s * 0.02, 1, -0.01, true),
    labelBlk: fitBlock(measure, st.label, COND_MED, s * 0.024, cellW0 - s * 0.02, 3, 0.005, false),
  }));
  const smallHPre = smallsPre.length
    ? Math.max(...smallsPre.map((x) => x.valueBlk.h + (x.labelBlk.h ? x.labelBlk.h + s * 0.008 : 0))) + s * 0.030
    : 0;
  const smallRowsPre = Math.ceil(smallsPre.length / cols0) || 0;

  /* The hero number takes whatever is left once everything else is measured,
   * which is the whole point: on this piece the number is the picture. */
  const chrome = (kick.h ? kick.h + s * 0.008 : 0) + head.h
    + (ask.h ? ask.h + s * 0.020 : 0) + (det.h ? det.h + s * 0.016 : 0)
    + (cta.h ? cta.px * 1.84 + s * 0.030 : 0) + qrH + facesH
    + smallHPre * smallRowsPre;
  const heroRoom = Math.max(s * 0.12, inner.h - chrome - gap * 2);

  const heroLabel = hero
    ? fitBlock(measure, hero.label, COND_SEMI, s * 0.032, inner.w * 0.78, 3, 0.005, false)
    : { lines: [], h: 0, px: 0 };
  const heroPx = hero
    ? (() => {
      let px = Math.min(heroRoom - heroLabel.h - s * 0.012, s * 0.30);
      // Shrink on width too: "$1,140" and "9%" are very different measures.
      const wide = () => widthAt(measure, hero.value, ANTON, px, -0.02) > inner.w * 0.96;
      let guard = 0;
      while (wide() && px > s * 0.06 && guard++ < 80) px *= 0.96;
      return Math.max(s * 0.06, px);
    })()
    : 0;
  const heroH = hero ? heroPx * 1.02 + (heroLabel.h ? heroLabel.h + s * 0.012 : 0) : 0;

  // The other numbers, side by side, at a fraction of the hero.
  const cols = cols0;
  const cellW = cellW0;
  const smalls = rest.map((st, i) => ({ value: st.value, ...smallsPre[i] }));
  const smallH = smallHPre;

  const entries = [
    { role: 'kicker', block: kick, gap: 0 },
    { role: 'headline', block: head, gap: s * 0.008 },
  ];
  const top = stackBlocks(entries, inner.y);
  let y = inner.y + top.height + (top.height ? gap : 0);

  const heroRect = hero ? { x: inner.x, y, w: inner.w, h: heroH, px: heroPx, value: hero.value, label: heroLabel } : null;
  y += heroH + (heroH ? gap * 0.8 : 0);

  const smallRects = smalls.map((x, i) => ({
    ...x,
    x: inner.x + (i % cols) * (cellW + gap * 0.7),
    y: y + Math.floor(i / cols) * smallH,
    w: cellW, h: smallH - s * 0.030,
  }));
  y += smallH * Math.max(1, Math.ceil(smalls.length / cols)) * (smalls.length ? 1 : 0);

  const tail = stackBlocks([
    { role: 'ask', block: ask, gap: 0 },
    { role: 'details', block: det, gap: s * 0.016 },
    { role: 'cta', block: cta, gap: s * 0.030, h: cta.h ? cta.px * 1.84 : 0 },
  ], y);
  y = y + tail.height;

  const facesY = inner.y + inner.h - faceW * PHOTO_AR;

  /* Above the faces, always. The warning below says when the piece is over
   * full; it must not also let the code land on somebody's head. */
  const qrPlaced = qr && qr.code
    ? { ...qr, x: inner.x + (inner.w - qr.size) / 2,
        // Never above the block it belongs under, and never on the faces.
        y: Math.max(y + s * 0.020,
          n ? Math.min(y + s * 0.020, facesY - qr.h - s * 0.034) : y + s * 0.020),
        centreOn: inner.x + inner.w / 2 }
    : null;

  const faces = slate.map((c, i) => {
    const rowW = n * faceW + (n - 1) * gap * 0.4;
    const x = inner.x + (inner.w - rowW) / 2 + i * (faceW + gap * 0.4);
    return { candidate: c, x, y: facesY, w: faceW, h: faceW * PHOTO_AR,
             photo: { x, y: facesY, w: faceW, h: faceW * PHOTO_AR }, plate: null };
  });

  const overrun = Math.max(0, (y + qrH) - facesY);

  return {
    canvas: { w, h },
    composition: 'stat',
    pad, gap, s, scale: 1,
    grid: { cols: n || 1, rows: 1, tileW: faceW, tileH: faceW * PHOTO_AR },
    slateRect: { x: inner.x, y: facesY, w: inner.w, h: facesH },
    tiles: faces,
    deck: null,
    copy: null,
    mailPanel: null,
    qr: qrPlaced,
    stat: { bands: [...top.items, ...tail.items], hero: heroRect, smalls: smallRects, faces },
    source: src ? { text: src, px: srcPx, centreOn: w / 2 } : null,
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(!stats.length ? ['No number to lead with. Write one per line as "1,140 | what it is".'] : []),
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(overrun > s * 0.01 ? ['The piece is over full. Drop a stat or cut a line.'] : []),
      ...(stats.length && !src ? ['A number with no source is a liability. Put the source in.'] : []),
      ...qrWarnings(qr, qrPlaced),
    ],
  };
}

/* ------------------------------------------------------- receipt, the piece ---
 *
 * The document archetype: it reads like a bill, because a bill gets read. The
 * highest response rates on cost-of-living mail come from pieces that look like
 * the thing they are about. That only works if it is honest, so the source line
 * is not optional here and the app says so when it is missing. */
function solveReceipt(spec, measure) {
  const { w, h } = spec.canvas;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.055 * density;
  const gap = s * 0.026 * density;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const src = String(copy.source || '').trim();
  const srcPx = Math.max(9, s * 0.0135);
  // The flag band is painted over the foot of the piece, so it is reserved here
  // rather than discovered later by a source line disappearing under it.
  const band = flagBand(style, s, disc ? discPx : 0).band;
  const footH = Math.max(band, disc ? discPx * 1.9 : 0) + (src ? srcPx * 1.7 : 0);
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - footH };

  // The document header: the kicker is the document's name, not a campaign line.
  /* On anything landscape the document goes left and the argument right, the
   * way the reference mailer sets its proof side. Stacked on an 11 x 5.5 the
   * document came out four inches wide and half an inch tall, which is not a
   * document, it is a rule with numbers on it. */
  const wide = w / h >= 1.35;
  const colW = wide ? (inner.w - gap * 1.6) * 0.54 : inner.w;
  const argW = wide ? inner.w - colW - gap * 1.6 : inner.w;

  const title = fitBlock(measure, copy.kicker || 'Statement', COND_BOLD, s * 0.030, colW, 2, 0.14, true);
  const headerH = title.h + s * 0.030;

  /* Line items: "Label | 412" per line, the amount right aligned so the column
   * reads as a column. Set in the text face, not the display face: a receipt
   * that shouts is not a receipt. */
  const items = String(copy.record || '').split('\n').map((line) => {
    const [label, ...rest] = line.split('|');
    return { label: (label || '').trim(), amount: rest.join('|').trim() };
  }).filter((x) => x.label);
  const rowPx = s * 0.030;
  const rows = items.map((it) => ({
    ...it,
    labelBlk: fitBlock(measure, it.label, COND_MED, rowPx, colW * 0.66, 2, 0.005, false),
    amountBlk: fitBlock(measure, it.amount, COND_BOLD, rowPx, colW * 0.30, 1, 0.01, false),
  }));
  const rowH = rows.length ? Math.max(...rows.map((r) => Math.max(r.labelBlk.h, r.amountBlk.h))) + s * 0.018 : 0;
  const tableH = rows.length * rowH;

  // The total, from the first stat line, set the way a bill sets a total.
  const stats = parseStats(copy.stat);
  const total = stats[0] || null;
  const totalLabel = total
    ? fitBlock(measure, total.label || 'Total', COND_BOLD, s * 0.030, colW * 0.56, 2, 0.06, true)
    : { lines: [], h: 0, px: 0 };
  const totalValue = total
    ? fitBlock(measure, total.value, ANTON, s * 0.072, colW * 0.40, 1, -0.01, false)
    : { lines: [], h: 0, px: 0 };
  const totalH = total ? Math.max(totalLabel.h, totalValue.h) + s * 0.040 : 0;

  // Then the argument, in the campaign's own voice, under the document.
  const head = fitBlock(measure, copy.headline, ANTON, s * 0.056, argW, 3, -0.01, true);
  const ask = fitBlock(measure, copy.subhead, COND_SEMI, s * 0.034, argW, 3, 0.005, false);
  const cta = fitBlock(measure, copy.cta, ANTON, s * 0.034, argW, 1, 0.02, true);

  const qr = qrFor(measure, copy, spec, s, Math.min(argW * 0.34, s * 0.16), argW * 0.72);
  const qrH = qr && qr.code ? qr.h : 0;

  const docH = headerH + tableH + totalH;
  const argEntries = [
    { role: 'headline', block: head, gap: 0 },
    { role: 'ask', block: ask, gap: s * 0.018 },
    { role: 'cta', block: cta, gap: s * 0.026, h: cta.h ? cta.px * 1.84 : 0 },
  ];
  const argH = stackBlocks(argEntries, 0).height;
  const slack = wide
    ? inner.h - Math.max(docH, argH + qrH + gap)
    : inner.h - docH - argH - Math.max(qrH, 0) - gap * 2;

  const argX = wide ? inner.x + colW + gap * 1.6 : inner.x;
  const doc = {
    x: inner.x,
    y: inner.y + (wide ? Math.max(0, (inner.h - docH) / 2) : 0),
    w: colW, h: docH, title, headerH, rows, rowH, tableH,
    total: total ? { label: totalLabel, value: totalValue, h: totalH } : null,
  };
  const argTop = wide
    ? inner.y + Math.max(0, (inner.h - argH - qrH - gap) / 2)
    : inner.y + docH + gap + Math.max(0, slack) * 0.5;
  const bands = stackBlocks(argEntries, argTop);

  /* The code sits under the call to action, in the argument column. The bottom
   * of the piece is then one block: what to do, and the way to do it. */
  const qrPlaced = qr && qr.code
    ? { ...qr, x: argX, y: argTop + bands.height + gap * 0.6,
        centreOn: argX + qr.size / 2 }
    : null;

  return {
    canvas: { w, h },
    composition: 'receipt',
    pad, gap, s, scale: 1,
    grid: { cols: 1, rows: rows.length, tileW: 0, tileH: 0 },
    slateRect: doc,
    tiles: [],
    deck: null,
    copy: null,
    mailPanel: null,
    qr: qrPlaced,
    receipt: { doc, bands: bands.items, wide, argX, argW },
    source: src ? { text: src, px: srcPx, centreOn: w / 2 } : null,
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(!rows.length ? ['No line items. Write them as "What it was | 412", one per line.'] : []),
      ...(!src ? ['A piece that looks like a bill has to say where the numbers came from. Fill in the source.'] : []),
      ...(!total ? ['No total. Put the number that matters in the stat field as "1,140 | what it is".'] : []),
      ...(slack < 0 ? ['The document and the argument together do not fit the piece. Cut a line item.'] : []),
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      'This mimics a bill on purpose. Every figure on it has to be defensible.',
      ...qrWarnings(qr, qrPlaced),
    ],
  };
}

/* ------------------------------------------------------ type-led, the piece ---
 *
 * The headline is the image. For when the line is the whole argument, or when
 * the photo assets are weak, which on a slate programme with 143 missing
 * headshots is most of the state. */
function solveTypeLed(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;
  const pad = s * 0.060 * density;
  const gap = s * 0.028 * density;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 1.9 : 0;
  const inner = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - discH };

  // An identity strip rather than a slate grid: small faces, surnames only.
  const showFaces = style.identityStrip !== false && n > 0;
  const faceW = showFaces ? Math.min((inner.w - (n - 1) * gap * 0.4) / n, s * 0.10) : 0;
  const facesH = showFaces ? faceW * PHOTO_AR + s * 0.022 : 0;

  const kick = fitBlock(measure, copy.kicker, COND_BOLD, s * 0.032, inner.w, 2, 0.16, true);
  const ask = fitBlock(measure, copy.subhead, COND_SEMI, s * 0.040, inner.w * 0.92, 4, 0.005, false);
  const cta = fitBlock(measure, copy.cta, ANTON, s * 0.038, inner.w, 1, 0.02, true);
  const qr = qrFor(measure, copy, spec, s, Math.min(inner.w * 0.24, s * 0.16), inner.w * 0.4);
  const qrH = qr && qr.code ? qr.h + s * 0.022 : 0;

  /* The headline takes everything the rest does not want, which is what makes
   * it the image. It is only capped so a two word line does not turn into a
   * pattern of letterforms. */
  const others = (kick.h ? kick.h + s * 0.010 : 0)
    + (ask.h ? ask.h + s * 0.024 : 0)
    + (cta.h ? cta.px * 1.84 + s * 0.030 : 0) + qrH + facesH;
  const room = Math.max(s * 0.10, inner.h - others - gap);
  const head = (() => {
    let px = Math.min(s * 0.34, room);
    let block = fitBlock(measure, copy.headline, ANTON, px, inner.w, 5, -0.02, true);
    let guard = 0;
    while (block.h > room && px > s * 0.05 && guard++ < 60) {
      px *= 0.94;
      block = fitBlock(measure, copy.headline, ANTON, px, inner.w, 5, -0.02, true);
    }
    return block;
  })();

  const entries = [
    { role: 'kicker', block: kick, gap: 0 },
    { role: 'headline', block: head, gap: s * 0.010 },
    { role: 'ask', block: ask, gap: s * 0.024 },
    { role: 'cta', block: cta, gap: s * 0.030, h: cta.h ? cta.px * 1.84 : 0 },
  ];
  const stackH = stackBlocks(entries, 0).height;
  const blockTop = inner.y + Math.max(0, (inner.h - facesH - stackH - qrH) / 2);
  const bands = stackBlocks(entries, blockTop);

  const centred = style.align !== 'left';
  const qrPlaced = qr && qr.code
    ? { ...qr, y: blockTop + bands.height + s * 0.022,
        x: centred ? inner.x + (inner.w - qr.size) / 2 : inner.x,
        centreOn: centred ? inner.x + inner.w / 2 : inner.x + qr.size / 2 }
    : null;

  const facesY = inner.y + inner.h - faceW * PHOTO_AR;
  const faces = showFaces ? slate.map((c, i) => {
    const rowW = n * faceW + (n - 1) * gap * 0.4;
    const x = inner.x + (inner.w - rowW) / 2 + i * (faceW + gap * 0.4);
    return { candidate: c, x, y: facesY, w: faceW, h: faceW * PHOTO_AR,
             photo: { x, y: facesY, w: faceW, h: faceW * PHOTO_AR }, plate: null };
  }) : [];

  const dpi = spec.dpi || 0;
  return {
    canvas: { w, h },
    composition: 'typeled',
    pad, gap, s, scale: 1,
    grid: { cols: n || 1, rows: 1, tileW: faceW, tileH: faceW * PHOTO_AR },
    slateRect: { x: inner.x, y: facesY, w: inner.w, h: facesH },
    tiles: faces,
    deck: null,
    copy: null,
    mailPanel: null,
    qr: qrPlaced,
    typeled: { bands: bands.items, centred, faces },
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(!String(copy.headline || '').trim() ? ['A type-led piece with no headline is a blank.'] : []),
      ...(head.truncated ? ['The headline is too long to be the image. Six words is the budget.'] : []),
      ...(dpi && head.px / dpi < 1 && Math.min(w, h) / dpi >= 8
        ? [`The headline is ${(head.px / dpi).toFixed(1)} inches on a type-led piece. Cut words until it is bigger.`] : []),
      ...qrWarnings(qr, qrPlaced),
    ],
  };
}

/** Two per line, the way the strip on the reference card is set. */
function pairUp(values) {
  const out = [];
  for (let i = 0; i < values.length; i += 2) out.push(values.slice(i, i + 2).join('   ·   '));
  return out.join('\n');
}

/* Fit a copy column to the room it has, in both directions.
 *
 * Shrinking to fit is the half everybody writes. Growing into slack is the half
 * that matters: a column sized for the longest headline in a programme leaves
 * the shortest sitting in the top third with nothing under it. The cap keeps a
 * four word piece from turning into a poster by accident. */
function fitColumn(build, density, room, { min = 0.42, max = 1.6, fill = 0.92 } = {}) {
  let built = build(density);
  for (let guard = 0; built.height > room && built.k > min && guard < 60; guard++) {
    built = build(built.k * 0.95);
  }
  if (built.height > room * 0.82) return built;
  for (let guard = 0; guard < 60; guard++) {
    const next = build(Math.min(max, built.k * 1.04));
    if (next.height > room * fill || next.k >= max) {
      return next.height <= room ? next : built;
    }
    built = next;
  }
  return built;
}

/* ----------------------------------------------------------------- poster --- */

/* One candidate, cut out and bleeding off the edge, under a headline that takes
 * the piece. This is the social graphic: a thing somebody sees at 400 pixels
 * wide in a feed, at a glance, with no second look.
 *
 * The spotlight was the nearest thing in this app and it was not close. It puts
 * the subject in a boxed tile with a name plate under it, sets the headline at
 * a third of the height it wants, and runs the rest of the slate along the foot
 * as chips. All three are right on a mail piece and all three are wrong at feed
 * size: the box reads as a deck tile, the headline loses to the box, and the
 * chips are illegible. So the poster is its own composition rather than a flag
 * on that one. There is no box, no plate, and nobody else on it.
 */
function solvePoster(spec, measure) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);
  const density = style.density ?? 1;

  const wanted = String(style.spotlight || '').trim();
  const hero = slate.find((c) => c.name === wanted) || slate[0] || null;

  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0195);
  const discH = disc ? discPx * 2.1 : 0;

  const pad = w * 0.044 * density;
  const tall = w / h < 0.92;

  /* The figure takes a column at the right on anything wide, and the foot on
   * anything tall, and bleeds off two edges either way. A cutout with air all
   * round it is a sticker; a cutout running off the page is a person standing
   * in it. */
  const figW = tall ? w : w * 0.42;
  const figH = tall ? h * 0.46 : h;
  const fig = { x: w - figW, y: h - figH, w: figW, h: figH };
  const colW = Math.max(s * 0.3, (tall ? w : fig.x) - pad * 2);
  const colH = (tall ? fig.y : h) - discH;

  const barText = String(copy.cta || copy.footer || '').trim();

  const build = (k) => {
    const kick = fitBlock(measure, copy.kicker, COND_BOLD, h * 0.036 * k, colW, 2, 0.16, true);
    const head = fitBlock(measure, copy.headline, ANTON, h * 0.150 * k, colW, 4, -0.015, true);
    const barPx = barText ? h * 0.040 * k : 0;
    const bar = fitBlock(measure, barText, COND_BOLD, barPx, colW - barPx * 1.6, 1, 0.08, true);
    const entries = [
      { role: 'kicker', block: kick, gap: 0 },
      { role: 'headline', block: head, gap: h * 0.014 * k },
      { role: 'bar', block: bar, gap: h * 0.034 * k, h: bar.h ? bar.px * 2.3 : 0 },
    ];
    return { entries, height: stackBlocks(entries, 0).height, k };
  };

  const room = Math.max(s * 0.2, colH - pad * 1.4);
  const built = fitColumn(build, density, room, { min: 0.34, max: 1.25, fill: 0.94 });
  const top = pad + Math.max(0, (room - built.height) / 2);
  const bands = stackBlocks(built.entries, top);
  const barBand = bands.at('bar');

  const dpi = spec.dpi || 0;
  return {
    canvas: { w, h },
    composition: 'poster',
    pad, gap: h * 0.03, s, scale: built.k,
    grid: { cols: 1, rows: 1, tileW: fig.w, tileH: fig.h },
    slateRect: fig,
    // No plate: the name is in the headline, and a plate under a bleeding
    // cutout is a label stuck on a photograph.
    tiles: hero ? [{ candidate: hero, x: fig.x, y: fig.y, w: fig.w, h: fig.h,
                     photo: { ...fig }, plate: null }] : [],
    deck: null,
    copy: null,
    mailPanel: null,
    qr: null,
    poster: {
      col: { x: pad, y: top, w: colW, h: room },
      bands: bands.items,
      fig,
      tall,
      bar: barBand
        ? { x: pad, y: barBand.y, w: Math.min(colW, barBand.block.w + barBand.block.px * 1.6),
            h: barBand.h, block: barBand.block }
        : null,
    },
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 0.95, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(!hero ? ['A poster with nobody on it is a background.'] : []),
      ...(!String(copy.headline || '').trim() ? ['A poster with no headline is a portrait.'] : []),
      ...(slate.length > 1 && !wanted
        ? [`${slate.length} on this slate and nobody picked, so the poster is `
          + `${hero ? hero.name : 'the first name'}. Pick the subject under Spotlight on.`] : []),
      ...(built.k < 0.55 ? ['The headline shrank past half to fit. A poster is read at a glance, so cut words.'] : []),
      ...(dpi && built.entries[1].block.px / dpi < 0.5 && s / dpi >= 6
        ? ['The headline is under half an inch on a printed poster.'] : []),
    ],
  };
}

/* --------------------------------------------------- the mail pair: one band */

/* Both sides of a mail piece are the same parts, arranged for the shape each
 * side actually has:
 *
 *     headline on the issue, big
 *     one line saying who it is for
 *     the whole slate, cut out, shoulder to shoulder, no boxes
 *     a band of names, one under each face
 *     the town and the district
 *     VOTE REPUBLICAN NOVEMBER 3
 *
 * No card, no tile, no plate. A face in a box is a database record; a row of
 * faces at the same height standing on the same band is a team, and the band
 * labels them once instead of six times.
 *
 * The message side is a column: headline down to call to action, eleven inches
 * wide. The address side is an L. The carrier owns the bottom two and a quarter
 * inches of the right hand four, and nothing else, so the slate takes the whole
 * width above that line and the words go under it on the left. Six or more
 * faces there go in two rows: eight across seven inches is a row of thumbnails,
 * four over four is two rows of people.
 *
 * No disclaimer on either side. The print shop sets the paid-for line with the
 * indicia, the address block and the barcode, because they are all one job and
 * it is theirs. RSA 664:14 applies to the finished piece, which is what the
 * handoff note tells them.
 */
/* The words for a count, so the piece can tell a voter how many to mark
 * without printing a numeral in a sentence. */
/** What a line in a comparison can be marked with. The first two are against. */
export const CONTRAST_DIRS = ['up', 'no', 'down', 'yes'];
const DIRS = CONTRAST_DIRS;

const COUNT_WORD = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN',
  'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];

/** Fit a block inside a width. fitBlock stops shrinking at half the size it
 *  was given, which is fine for a headline that may run long and wrong for a
 *  date inside a block: NOVEMBER ran out through the side of the plate. */
function fitInside(measure, text, font, px, maxW, maxLines, ls, upper) {
  let blk = fitBlock(measure, text, font, px, maxW, maxLines, ls, upper);
  let guard = 0;
  while (blk.w > maxW && guard++ < 40) {
    blk = fitBlock(measure, text, font, blk.px * Math.min(0.94, maxW / blk.w),
      maxW, maxLines, ls, upper);
  }
  return blk;
}

/** A fitted block with nothing in it, for a line that has been taken out. */
const EMPTY_SUB = { lines: [], h: 0, px: 0, lh: 0, font: COND_BOLD, ls: 0.045, w: 0, widths: [] };

function solveSlateBand(spec, measure, side) {
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const density = style.density ?? 1;

  const panel = side === 'back'
    ? mailPanelRect({ ...spec, style: { ...style, mailPanel: 'right' } }, w, h)
    : null;
  const box = { x: 0, y: 0, w, h };
  const s = Math.min(w, h);

  const pad = w * 0.040 * density;
  const inner = { x: pad, y: pad * 1.15, w: w - pad * 2, h: h - pad * 2.0 };
  const cx = inner.x + inner.w / 2;

  /* Where the words go when they sit over the faces: the whole column on the
   * message side, the lower left corner on the address side, which is the only
   * part of that side the carrier is not standing in. */
  const foot = h - pad * 1.15;
  const stackBox = panel
    ? { x: pad, y: panel.y, w: panel.x - pad * 2, h: h - panel.y - pad * 0.5 }
    : { x: inner.x, y: inner.y, w: inner.w, h: foot - inner.y };

  const onDark = luminance(style.bgType === 'transparent' ? '#FFFFFF'
    : (style.bgColor || '#FFFFFF')) <= 0.45;

  /* ---------------------------------------------------------------- the rows */

  /* One row. Both sides have the whole eleven inches now, and eight faces fit
   * across it above the carrier's line, which is the thing the artwork does.
   * Two rows stay available on the address side for a slate that will not sit
   * on one line at a size anybody can recognise. */
  const rowCount = panel && n >= 6 && style.twoRows === true ? 2 : 1;
  const perRow = Math.max(1, Math.ceil(n / rowCount));
  const rowsOf = [];
  for (let i = 0; i < n; i += perRow) rowsOf.push(slate.slice(i, i + perRow));
  const widest = rowsOf.length ? Math.max(...rowsOf.map((r) => r.length)) : 1;

  const nominalBandPx = box.h * 0.026 * density;
  const nominalBandH = n ? nominalBandPx * 2.30 : 0;
  const gutter = box.w * 0.028;

  /* The strip the faces stand in: the whole width, on both sides. The address
   * side earns it by staying above the carrier's line, and the row starts at
   * the left margin, so it never drifts over the corner the carrier is
   * standing in the way a centred row did. */
  const strip = { x: inner.x, w: inner.w };

  /* A cutout is about four fifths as wide as it is tall, so a row is as wide as
   * its faces actually are. This says how wide, before anything is placed. */
  /* A head-and-shoulders taller than about three fifths of the piece is a
   * poster of one person, not a slate. Capping it is what lets a district with
   * one or two candidates free a column wide enough to put the message in:
   * uncapped, two faces grew until they filled the width and left a gap too
   * narrow to set a headline in. The faces stand on the band either way, so the
   * room the cap gives back becomes air above the shoulders. */
  const figCap = box.h * (n === 1 ? 0.82 : 0.62);

  const groupWidthAt = (zoneTop, zoneBottom, bandH) => {
    if (!n) return 0;
    const unitH = Math.max(1, (zoneBottom - zoneTop) / rowCount);
    const figH = Math.min(figCap, Math.max(1, unitH - bandH));
    const natural = figH / PHOTO_AR;
    return Math.max(...rowsOf.map((r) => natural + (r.length - 1) * natural * 0.94));
  };

  /* Two rows are a montage, the way a team photograph is: the back row stands
   * behind the front one and comes down into it, so its heads and shoulders
   * show in the gaps between the people in front and its body does not. A grid
   * of two rows clear of each other reads as two slates, not as one team. */
  const ROW_DROP = 0.60;                 // how far the front row sits down the back one
  const rowPitch = rowCount > 1 ? ROW_DROP : 1;
  /* Three ways a row can sit in the strip.
   *   left  the slate keeps the width it needs and a block takes the rest
   *   fill  nothing is taking the rest, so the slate takes all of it
   * A row centred with half an inch of air either side reads as a slip. */
  const layoutRows = (bandH, zoneTop, zoneBottom, mode) => {
    const figZone = Math.max(1, zoneBottom - zoneTop - bandH);
    const stackH = 1 + (rowCount - 1) * rowPitch;
    const figH = Math.min(figCap, Math.max(1, figZone / stackH));
    const groupTop = zoneTop + Math.max(0, figZone - figH * stackH);
    const bandY = groupTop + figH * stackH;
    const natural = figH / PHOTO_AR;
    const tight = natural * 0.94;              // a little overlap at the shoulder
    const out = [];
    let seen = 0;
    for (let r = 0; r < rowsOf.length; r++) {
      const rn = rowsOf[r].length;
      /* Only share the width out when there are more faces than fit. */
      const spread = natural + (rn - 1) * tight > strip.w;
      const cellW = spread ? strip.w / rn : natural;
      /* Filling means the first face starts at the left margin and the last one
       * ends at the right, whatever is between them. Shoulder to shoulder if
       * that is wide enough, a little apart if it is not. */
      const span = rn > 1 ? (strip.w - cellW) / (rn - 1) : 0;
      const step = spread ? strip.w / rn
        : mode === 'fill' ? Math.max(tight, span) : tight;
      const groupW = (rn - 1) * step + cellW;
      /* A second row is offset half a face, so its people stand in the gaps of
       * the row in front instead of in a grid behind it. A row that already
       * has to share the width out has no gaps to stand in. */
      const stagger = r % 2 === 1 && !spread ? step / 2 : 0;
      const x0 = stagger + strip.x + (spread || mode !== 'centre'
        ? 0 : (strip.w - groupW) / 2);
      out.push({ members: rowsOf[r], first: seen, rn, spread, step, cellW, x0,
                 y: groupTop + r * figH * rowPitch, h: figH, bandY, bandH,
                 /* A row with another one in front of it is cut at the line
                  * that row starts on, so nothing of it hangs in the gaps. */
                 clipH: r < rowsOf.length - 1 ? figH * rowPitch : figH,
                 right: x0 + (rn - 1) * step + cellW });
      seen += rn;
    }
    const left = out.length ? Math.min(...out.map((r) => r.x0)) : strip.x;
    const right = out.length ? Math.max(...out.map((r) => r.right)) : strip.x;
    return { rows: out, figH, bandY, left, right,
             cellW: out.length ? Math.min(...out.map((r) => r.cellW)) : 0 };
  };

  /* --------------------------------------------- the slate, in two passes
   *
   * The name band's height depends on the size of the names, the names have to
   * fit the cell each face ends up in, and the cell depends on how much height
   * is left once the band has taken its share. So it is measured twice: once
   * with a nominal band to find the cells, and again with the real names in
   * them. One pass sized the names against a slot the width of the piece
   * divided by the slate, which on a centred group of four was three times too
   * wide, and the band came out as one another's names printed on top of each
   * other. */
  const solveRows = (zoneTop, zoneBottom, mode) => {
    const first = layoutRows(nominalBandH, zoneTop, zoneBottom, mode);
    const cellW = first.cellW || strip.w;
    const wide = (t, px) => widthAt(measure, t, COND_BOLD, px, 0.03) <= cellW * 0.94;
    const fullNames = slate.map((c) => `${firstLine(c, style)} ${c.last}`.trim());
    const shortNames = slate.map((c) => String(c.last || '').trim());
    const startPx = Math.min(box.h * (n <= 2 ? 0.042 : 0.028), cellW * 0.155) * density;
    const floorPx = startPx * 0.62;
    let bandPx = startPx;
    let texts = fullNames;
    let guard = 0;
    while (!texts.every((t) => wide(t, bandPx)) && guard++ < 60) {
      if (bandPx <= floorPx && texts === fullNames) { texts = shortNames; bandPx = startPx; continue; }
      if (bandPx <= floorPx * 0.8) break;
      bandPx *= 0.95;
    }
    const dropped = texts !== fullNames;
    /* One band under the whole group, deep enough to hold a line of names for
     * each row of faces. Two bands, one per row, cut a montage in half and read
     * as two slates. */
    const lineH = bandPx * 1.30;
    const bandH = n ? lineH * rowCount + bandPx : 0;
    return { laid: layoutRows(bandH, zoneTop, zoneBottom, mode),
             bandH, bandPx, lineH, texts, dropped };
  };

  /* ------------------------------------------------------------- the shape
   *
   * One rule, from a district with one candidate to a district with eight: the
   * slate takes the width it needs and the words take what is left. A small
   * slate leaves most of the piece, so the message stands beside the faces and
   * the faces run the full height. A middling slate leaves a block, so the
   * message goes back over the top and the block carries the date. A full slate
   * leaves nothing, and the row is centred, which is where this started. */
  const zoneFull = { top: inner.y,
    bottom: panel ? panel.y - box.h * 0.022 : foot };
  /* What the leftover has to be worth before it is used: wide enough to set a
   * date in, and a sixth of the strip, so it reads as a block and not as a
   * margin somebody forgot to close. */
  const minAside = Math.max(box.h * 0.30, (inner.w) * 0.17);
  const freeFull = strip.w - groupWidthAt(zoneFull.top, zoneFull.bottom, nominalBandH) - gutter;
  /* Beside the faces is a message side idea. The address side has the carrier's
   * corner in the bottom right, so its words stay in the lower left. */
  const sideBySide = !!n && !panel && style.sideBySide !== false
    && freeFull >= minAside && freeFull / strip.w >= 0.38;

  const ctaText = String(copy.cta || '').trim();
  const seatLine = String(copy.footer || '').trim();

  let wordsBox; let slateZone; let rowsOut; let head; let sub; let blockPad; let ruleH;
  let headH; let subH; let ctaBlk; let ctaH; let seatBlk; let seatH; let align;
  let asideSub = null;
  let wordShift = 0;
  let checklist = null;
  let checklistH = 0;

  const fitHead = (width, room, maxLines) => {
    let px = Math.min(box.h * 0.150 * density, Math.max(room, box.h * 0.035));
    let blk = fitBlock(measure, copy.headline, ANTON, px, width, maxLines, -0.012, true);
    let guard = 0;
    while (blk.h > room && px > box.h * 0.035 && guard++ < 60) {
      px *= 0.94;
      blk = fitBlock(measure, copy.headline, ANTON, px, width, maxLines, -0.012, true);
    }
    return blk;
  };

  if (sideBySide) {
    /* The faces first: in this shape the slate's height owes nothing to the
     * words, so it is settled before a word is measured, and the words are cut
     * to the column the faces leave behind. */
    slateZone = zoneFull;
    rowsOut = solveRows(slateZone.top, slateZone.bottom, 'left');
    align = 'left';
    const colX = rowsOut.laid.right + gutter;
    /* The column stops on top of the band, not at the foot of the paper: the
     * band runs the whole width and a call to action that ran to the foot sat
     * on it. */
    wordsBox = { x: colX, y: inner.y, w: strip.x + strip.w - colX,
      h: rowsOut.laid.bandY - inner.y - box.h * 0.016 };

    ctaBlk = fitInside(measure, ctaText, ANTON, box.h * 0.082 * density,
      wordsBox.w * 0.94, 1, 0.005, true);
    ctaH = ctaBlk.h ? ctaBlk.px * 1.58 : 0;
    seatBlk = fitBlock(measure, seatLine, ANTON, box.h * 0.046 * density,
      wordsBox.w, 1, 0.01, true);
    seatH = seatBlk.h ? seatBlk.h + box.h * 0.016 : 0;

    sub = fitBlock(measure, copy.subhead, COND_BOLD, box.h * 0.046 * density,
      wordsBox.w * 0.98, 4, 0.045, true);
    subH = sub.h ? sub.h + box.h * 0.024 : 0;
    let headRoom = Math.max(box.h * 0.035,
      wordsBox.h - subH - seatH - ctaH - box.h * 0.034);
    head = fitHead(wordsBox.w, headRoom, 4);
    blockPad = onDark && head.lines.length ? head.px * 0.30 : 0;
    ruleH = !onDark && head.lines.length ? Math.max(3, box.h * 0.0085) : 0;
    headH = head.h
      ? head.h + blockPad * 2 + (ruleH ? ruleH + box.h * 0.018 : box.h * 0.010) : 0;
    wordShift = Math.max(0, (wordsBox.h - ctaH - seatH - headH - subH) / 2);
  } else {
    /* The words over the faces. Four things do not fit in the address side's
     * seven inches by two and a quarter at the sizes the message side uses, so
     * the supporting lines give way and the headline does not: it is the only
     * one of them anybody reads at arm's length. */
    align = 'center';
    wordsBox = stackBox;
    /* The call to action is the last thing anybody reads and the only thing on
     * the piece that tells them what to do, so it takes all the size the column
     * will give it and stops at the width. */
    ctaBlk = fitInside(measure, ctaText, ANTON, box.h * (panel ? 0.072 : 0.092) * density,
      wordsBox.w * 0.94, 1, 0.005, true);
    ctaH = ctaBlk.h ? ctaBlk.px * 1.58 : 0;
    seatBlk = fitBlock(measure, seatLine, ANTON,
      box.h * (panel ? 0.042 : 0.058) * density, wordsBox.w, 1, 0.01, true);
    seatH = seatBlk.h ? seatBlk.h + box.h * 0.014 : 0;

    /* Run twice at most. The first pass finds out how much width the slate
     * leaves; if that is enough to set the supporting line beside the faces,
     * the second pass takes it out of the stack, and the height it was using
     * goes to the headline and the faces. */
    /* A checklist under the headline, in two columns, each line ticked. The
     * programme is a written guarantee and the piece that opens it has to say
     * what is in it: a promise nobody can read is not a promise. Message side
     * only, where there is a full column to set it in. */
    const listIn = !panel && Array.isArray(copy.list)
      ? copy.list.map((t) => String(t || '').trim()).filter(Boolean) : [];
    let list = null;
    let listH = 0;
    if (listIn.length) {
      const cols = listIn.length > 4 ? 2 : 1;
      const rws = Math.ceil(listIn.length / cols);
      const colGap = wordsBox.w * 0.045;
      const cw = (wordsBox.w - colGap * (cols - 1)) / cols;
      const tick = cw * 0.058;
      const tw = Math.max(1, cw - tick * 2.0);
      const start = Math.min(box.h * 0.032, tw * 0.055) * density;
      /* One size for every line. Fitted one at a time, a short promise sat next
       * to a long one at twice the size and the list read as a ransom note. */
      const px = Math.min(...listIn.map(
        (t) => fitInside(measure, t, COND_BOLD, start, tw, 1, 0.02, true).px));
      const items = listIn.map((t) => fitInside(measure, t, COND_BOLD, px, tw, 1, 0.02, true));
      const rowH = px * 1.48;
      list = { cols, rws, colGap, cw, tick, tw, px, rowH, items };
      listH = rws * rowH + box.h * 0.024;
    }

    const stackedPass = (dropSub) => {
      let subBlk = dropSub ? EMPTY_SUB : fitBlock(measure, copy.subhead, COND_BOLD,
        box.h * (panel ? 0.036 : 0.050) * density, wordsBox.w * 0.98, panel ? 1 : 2, 0.045, true);
      let subHt = subBlk.h ? subBlk.h + box.h * (panel ? 0.016 : 0.024) : 0;

      /* A short slate gets a taller floor, because four big faces are the
       * design. A piece carrying a checklist gives some of that back: the list
       * is why the piece went out. */
      const faceFloorRow = box.h * (list ? 0.24
        : rowCount > 1 ? 0.20 : (n <= 4 ? 0.36 : 0.26));
      let room = panel
        ? wordsBox.h - subHt - seatH - ctaH
        : Math.max(box.h * 0.10,
          inner.h - ctaH - seatH - subHt - listH - (faceFloorRow + nominalBandH) * rowCount);
      /* With no room left for a headline the line under it is the thing that
       * goes. A subhead over a headline set at the floor is two small lines
       * where there should be one that carries. */
      if (panel && room < box.h * 0.062 && subBlk.lines.length) {
        subBlk = EMPTY_SUB;
        subHt = 0;
        room = wordsBox.h - seatH - ctaH;
      }
      /* fitHead measures the type; the rule under it, the block padding and the
       * gap are chrome the block carries as well. Room has to come off for
       * them, or the headline fits by its own measure and the line under it
       * lands on the district line by three pixels. */
      room = Math.max(box.h * 0.035, room - box.h * 0.034);
      const headBlk = fitHead(panel ? wordsBox.w : inner.w, room, 3);
      const bp = onDark && headBlk.lines.length ? headBlk.px * 0.30 : 0;
      const rh = !onDark && headBlk.lines.length ? Math.max(3, box.h * 0.0085) : 0;
      const hh = headBlk.h
        ? headBlk.h + bp * 2 + (rh ? rh + box.h * 0.018 : box.h * 0.010) : 0;

      /* The candidates are the lowest thing on the piece. Anything that used to
       * sit under them, the district line and the call to action, goes above
       * them instead, and the slate stands on the foot of the paper. */
      const zone = panel
        ? { top: inner.y, bottom: panel.y - box.h * 0.022 }
        : { top: inner.y + hh + subHt + listH + seatH + ctaH, bottom: foot };
      /* Left first, to find out what the slate leaves. If it leaves too little
       * to put anything in, the row goes back to centred: a row of eight with
       * half an inch of air on the right reads as a slip, not as a margin. */
      /* Left first, to find out what the slate leaves. If what it leaves is
       * not worth a block, the slate takes that width too. */
      let out = solveRows(zone.top, zone.bottom, 'left');
      const spare = strip.x + strip.w - out.laid.right - gutter;
      if (spare < minAside) out = solveRows(zone.top, zone.bottom, 'fill');
      return { subBlk, subHt, headBlk, bp, rh, hh, zone, out, spare, list, listH };
    };

    let pass = stackedPass(false);
    /* Wide enough to read a sentence in. The supporting line goes beside the
     * faces and the stack gets its height back. */
    if (pass.spare / strip.w >= 0.34 && pass.subBlk.lines.length) {
      asideSub = pass.subBlk;
      pass = stackedPass(true);
    }
    sub = pass.subBlk; subH = pass.subHt;
    head = pass.headBlk; blockPad = pass.bp; ruleH = pass.rh; headH = pass.hh;
    slateZone = pass.zone; rowsOut = pass.out;
    checklist = pass.list; checklistH = pass.listH;
  }

  const { laid, bandH, bandPx, lineH, texts, dropped } = rowsOut;

  /* ------------------------------------------------------- what is left over */

  /* The band is the floor of the piece, so on a side with no carrier's corner
   * it runs off the bottom of the paper instead of stopping a quarter inch
   * short of it. The names stay where they were: the extra depth is ground, and
   * type this close to a trim edge is type a guillotine takes off. */
  const footBleed = !panel && laid.rows.length;
  const lastRow = laid.rows.length ? laid.rows[laid.rows.length - 1] : null;
  const lastBandH = footBleed ? Math.max(bandH, h - laid.bandY) : bandH;

  const asideX = laid.right + gutter;
  const asideW = strip.x + strip.w - asideX;
  const frac = asideW / strip.w;
  const tier = sideBySide ? 'words' : (!n || asideW < minAside) ? 'none' : 'plate';

  let aside = null;
  if (tier === 'words') {
    aside = { tier, rect: { ...wordsBox } };
  } else if (tier !== 'none') {
    /* The block stands beside every row, not beside the first one, and its foot
     * lands on the same line as the band's. Two rows with a block the height of
     * one read as a third row that fell off. */
    const r0 = laid.rows[0];
    const rect = { x: asideX, y: r0.y, w: asideW, h: laid.bandY + lastBandH - r0.y };
    const dateText = String(copy.voteDate || '').trim();
    const inset = rect.w * 0.10;
    const tw = Math.max(1, rect.w - inset * 2);
    /* Widest first: a block with room for a sentence gets the supporting line
     * the stack gave up, a narrower one gets the date and how many to mark, and
     * a strip gets the date alone. */
    const kicker = asideSub
      ? fitInside(measure, copy.subhead, COND_BOLD,
        Math.min(box.h * 0.062, tw * 0.088) * density, tw, 4, 0.03, true)
      : fitInside(measure, 'ELECTION DAY', COND_BOLD,
        Math.min(box.h * 0.034, tw * 0.105) * density, tw, 1, 0.14, true);
    const date = fitInside(measure, dateText, ANTON,
      Math.min(box.h * (asideSub ? 0.072 : 0.098), tw * 0.225) * density, tw, 2, -0.005, true);
    const note = fitInside(measure,
      n >= 2 && n < COUNT_WORD.length ? `VOTE FOR ALL ${COUNT_WORD[n]}` : '',
      COND_BOLD, Math.min(box.h * 0.038, tw * 0.125) * density, tw, 2, 0.06, true);
    const gap = box.h * 0.020;
    const stackH = (kicker.h ? kicker.h + gap : 0) + date.h + (note.h ? note.h + gap : 0);
    const top = rect.y + Math.max(0, (rect.h - stackH) / 2);
    let cur = top;
    const place = (blk) => {
      if (!blk.h) return null;
      const at = { block: blk, y: cur };
      cur += blk.h + gap;
      return at;
    };
    const k = place(kicker);
    const d = place(date);
    const nt = place(note);
    if (d || nt) aside = { tier, rect, inset, bleedFoot: !!footBleed, kicker: k, date: d, note: nt };
  }

  /* ------------------------------------------------------------ the figures */

  const figures = [];
  const rows = [];
  /* The band runs to the carrier's edge on the address side and to the edge of
   * the paper on the message side, except when the words are standing beside
   * the faces: there it stops where the faces stop, so the plinth belongs to
   * the slate and not to the column next to it. */
  /* The band is the floor of the piece and runs the whole width of it, except
   * where the block beside the slate takes over: there it stops at the block's
   * edge and the two make one shape. */
  const bandRight = aside && aside.tier !== 'words' ? asideX : w;
  /* The name strip: one band, one line in it for each row of faces, and every
   * name under the face it belongs to. */
  for (let ri = 0; ri < laid.rows.length; ri++) {
    const r = laid.rows[ri];
    for (let i = 0; i < r.rn; i++) {
      const x = r.x0 + i * r.step;
      const k = r.first + i;
      figures.push({
        candidate: r.members[i],
        slot: { x, y: r.y, w: r.cellW, h: r.h },
        /* The cutout fills the row's height, but never more than the cap
         * across. Scaled by height alone a wide crop swallowed its neighbours
         * whole: on Rockingham 25 one shoulder covered the man beside him. */
        maxW: Math.min(r.cellW * (r.spread && r.rn >= 7 ? 1.62 : 1.32), r.h * 0.92),
        clipH: r.clipH,
        name: { text: texts[k], px: bandPx, dropped },
        nameBox: { x, w: r.cellW, h: lineH,
          y: laid.bandY + bandPx * 0.5 + ri * lineH },
      });
    }
    rows.push({ y: r.y, h: r.h,
      bleedFoot: !!(footBleed && r === lastRow),
      band: r === lastRow
        ? { x: box.x, y: laid.bandY, w: bandRight, h: lastBandH } : null });
  }

  /* -------------------------------------------------------------- the words */

  const wordTop = wordsBox.y + wordShift;
  const subTop = wordTop + headH;
  /* Over the faces the foot of the words is the district line and then the call
   * to action, both above the slate. Beside them, and in the carrier's corner,
   * the words are their own column and the two sit at its foot. */
  const overFaces = !panel && !sideBySide;
  const listTop = subTop + subH;
  const seatY = overFaces
    ? listTop + checklistH : wordsBox.y + wordsBox.h - ctaH - seatH + box.h * 0.008;
  const ctaY = overFaces
    ? listTop + checklistH + seatH : wordsBox.y + wordsBox.h - ctaH;
  const wordsCx = wordsBox.x + wordsBox.w / 2;

  const dpi = spec.dpi || 0;
  const shortest = laid.figH;
  const cramped = shortest < box.h * 0.16;
  return {
    canvas: { w, h },
    composition: side === 'back' ? 'proof' : 'promise',
    pad, gap: box.h * 0.02, s, scale: 1,
    grid: { cols: widest, rows: rowCount, tileW: laid.cellW, tileH: laid.figH },
    slateRect: { x: strip.x, y: slateZone.top,
      w: (sideBySide ? laid.right - strip.x : strip.w), h: slateZone.bottom - slateZone.top },
    // Painted by the band painter, not by paintTile: no plate, no silhouette box.
    tiles: [],
    deck: null,
    copy: null,
    mailPanel: panel,
    qr: null,
    band: {
      side, box, inner, pad, cx,
      onDark, align, shape: sideBySide ? 'beside' : 'over',
      top: { x: wordsBox.x, w: wordsBox.w },
      topCx: wordsCx,
      footCx: wordsCx,
      head: head.lines.length
        ? { block: head, y: wordTop, pad: blockPad, ruleH,
            ruleY: wordTop + head.h + blockPad * 2 + box.h * 0.014 }
        : null,
      sub: sub.lines.length ? { block: sub, y: subTop } : null,
      list: checklist ? { ...checklist, x: wordsBox.x, y: listTop } : null,
      figures,
      rows,
      aside,
      /* The scene: the ground of the whole piece, edge to edge and under
       * everything. It is veiled where the words are, so a headline is read
       * rather than picked out of a photograph. */
      photo: { x: box.x, y: box.y, w, h },
      bandRect: rows.length ? rows[rows.length - 1].band : null,
      seat: seatBlk.lines.length ? { block: seatBlk, y: seatY } : null,
      cta: ctaBlk.lines.length
        ? { block: ctaBlk, y: ctaY, h: ctaH, x: wordsBox.x, w: wordsBox.w } : null,
    },
    disclaimer: null,
    warnings: [
      ...(!n ? ['Nobody on the piece. A slate mailer with no slate is a background.'] : []),
      ...(!String(copy.headline || '').trim()
        ? [`The ${side === 'back' ? 'address' : 'message'} side has no headline.`] : []),
      ...(!ctaText
        ? ['No call to action. Every side of this programme tells somebody when to vote.'] : []),
      ...(cramped
        ? [`${n} faces leaves each one about ${(shortest / (dpi || 300)).toFixed(1)} inches tall, `
          + 'which is too small to recognise across a room. Cut the headline, or run '
          + 'this district as two pieces.'] : []),
      ...(dropped
        ? ['First names came off the band to fit. The surname is what a voter matches '
          + 'on the ballot, so that is the one that stays.'] : []),
      ...(head.truncated ? ['The headline is longer than three lines will hold.'] : []),
    ],
  };
}

/* ------------------------------------------------------------ the contrast
 *
 * The message side of an issue round, with nobody's face on it. A slate piece
 * has two jobs and cannot do both well on one side: this side makes the case,
 * and the address side carries the team and the ask. It runs on a dark ground
 * so it does not look like the side with the people on it, and it carries a
 * drawn mark rather than a photograph, because a photograph of a tax form is a
 * photograph and a drawing of one is an argument.
 */
function solveContrast(spec, measure) {
  const { w, h } = spec.canvas;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const density = style.density ?? 1;
  const box = { x: 0, y: 0, w, h };
  const s = Math.min(w, h);

  const pad = w * 0.042 * density;
  const inner = { x: pad, y: pad * 1.15, w: w - pad * 2, h: h - pad * 2.3 };
  const gutter = w * 0.030;

  /* The foot, measured first: the call to action is the one line on this side
   * that is not an argument, and it never gives up its height. */
  const ctaBlk = fitInside(measure, copy.cta, ANTON, box.h * 0.090 * density,
    inner.w * 0.94, 1, 0.005, true);
  const ctaH = ctaBlk.h ? ctaBlk.px * 1.58 : 0;
  const srcBlk = fitInside(measure, copy.source, COND_BOLD, box.h * 0.028 * density,
    inner.w, 2, 0.02, true);
  const srcH = srcBlk.h ? srcBlk.h + box.h * 0.014 : 0;

  const footTop = inner.y + inner.h - ctaH - srcH;

  /* The mark takes a third on the right. Anything narrower and a drawing reads
   * as a logo somebody forgot to move. */
  /* A photograph takes the whole piece. The words sit on the left of it under a
   * scrim that is heaviest where they are and lets go across the picture, so it
   * is a photograph with an argument on it rather than a photograph in a box. A
   * drawing, having no ground of its own, still stands in a panel on the right.
   */
  const art = String(style.markArt || '');
  const markW = inner.w * 0.30;
  const markX = inner.x + inner.w - markW;
  const mark = { id: String(style.mark || ''), art,
    rect: art ? { x: box.x, y: box.y, w, h }
      : { x: markX, y: box.y, w: w - markX, h: Math.max(1, footTop - box.y) } };
  const colW = art ? inner.w * 0.62 : (mark.id ? inner.w - markW - gutter : inner.w);

  const kick = fitInside(measure, copy.kicker, COND_BOLD, box.h * 0.038 * density,
    colW, 2, 0.16, true);
  const kickH = kick.h ? kick.h + box.h * 0.024 : 0;

  const num = fitInside(measure, copy.number, ANTON,
    Math.min(box.h * 0.34, colW * 0.62) * density, colW, 1, -0.02, true);
  const numH = num.h ? num.h + box.h * 0.016 : 0;

  const cap = fitInside(measure, copy.subhead, COND_BOLD, box.h * 0.042 * density,
    colW, 3, 0.03, true);
  const capH = cap.h ? cap.h + box.h * 0.018 : 0;

  /* Two lines with an arrow on each, one going down and one going up. Where a
   * round has this, it is the argument and the big number stands down: a
   * numeral and a comparison in the same column are two headlines. */
  const vsIn = Array.isArray(copy.versus) ? copy.versus.filter((v) => v && v.text) : [];
  let versus = null;
  if (vsIn.length) {
    /* A swoosh needs a box to swing in. A tick needs less, but one column width
     * for both keeps the two lines starting on the same edge. */
    const arrowW = colW * 0.200;
    const vgap = colW * 0.030;
    const tw = Math.max(1, colW - arrowW - vgap);
    const pad = box.h * 0.026;
    const rows = [];
    let vy = 0;
    for (const v of vsIn) {
      const block = fitInside(measure, v.text, COND_BOLD,
        Math.min(box.h * 0.060, tw * 0.070) * density, tw, 2, 0.02, true);
      const rh = Math.max(block.h, arrowW * 0.80);
      rows.push({ dir: DIRS.includes(v.dir) ? v.dir : 'down', block, dy: vy, h: rh });
      vy += rh + pad;
    }
    versus = { arrowW, gap: vgap, rows, h: Math.max(0, vy - pad) };
  }
  const versusH = versus ? versus.h + box.h * 0.024 : 0;

  /* The headline takes what the rest of the column leaves, and never less than
   * a line it can be read at. */
  const room = Math.max(box.h * 0.06,
    footTop - inner.y - kickH - numH - versusH - capH - box.h * 0.02);
  let headPx = Math.min(box.h * 0.135 * density, Math.max(room, box.h * 0.05));
  let head = fitBlock(measure, copy.headline, ANTON, headPx, colW, 3, -0.012, true);
  let guard = 0;
  while (head.h > room && headPx > box.h * 0.05 && guard++ < 60) {
    headPx *= 0.94;
    head = fitBlock(measure, copy.headline, ANTON, headPx, colW, 3, -0.012, true);
  }
  const headH = head.h ? head.h + box.h * 0.022 : 0;

  // The block sits in the middle of the column it was given.
  const stackH = kickH + headH + numH + versusH + capH;
  let y = inner.y + Math.max(0, (footTop - inner.y - stackH) / 2);
  const place = (blk, gapAfter) => {
    if (!blk.h) return null;
    const at = { block: blk, y };
    y += blk.h + gapAfter;
    return at;
  };
  const placeVersus = () => {
    const at = { ...versus, x: inner.x, y };
    y += versus.h + box.h * 0.024;
    return at;
  };

  const dpi = spec.dpi || 0;
  return {
    canvas: { w, h },
    composition: 'contrast',
    pad, gap: box.h * 0.02, s, scale: 1,
    grid: { cols: 0, rows: 0, tileW: 0, tileH: 0 },
    slateRect: null,
    tiles: [],
    deck: null,
    copy: null,
    mailPanel: null,
    qr: null,
    contrast: {
      box, inner, col: { x: inner.x, w: colW },
      kicker: place(kick, box.h * 0.024),
      head: place(head, box.h * 0.022),
      number: place(num, box.h * 0.016),
      versus: versus ? placeVersus() : null,
      caption: place(cap, box.h * 0.018),
      mark: mark.id || mark.art ? mark : null,
      source: srcBlk.lines.length
        ? { block: srcBlk, y: footTop } : null,
      cta: ctaBlk.lines.length
        ? { block: ctaBlk, x: inner.x, y: footTop + srcH, w: inner.w, h: ctaH } : null,
    },
    disclaimer: null,
    warnings: [
      ...(!String(copy.headline || '').trim()
        ? ['The contrast side has no headline. It is the whole side.'] : []),
      ...(!String(copy.cta || '').trim()
        ? ['No call to action. Every side of this programme tells somebody when to vote.'] : []),
      ...(!String(copy.source || '').trim()
        ? ['No source line. A side that attacks a record and does not cite it is a '
          + 'side you cannot defend. Put the bill number and the roll call on it.'] : []),
      ...(head.truncated ? ['The headline is longer than three lines will hold.'] : []),
      ...(dpi && mark.id && !mark.art && !CONTRAST_MARKS.includes(mark.id)
        ? [`There is no mark called ${mark.id}. The column will print empty.`] : []),
    ],
  };
}

/** The drawings the contrast side can carry. The painter holds the geometry. */
export const CONTRAST_MARKS = ['form', 'meter', 'sold', 'stairs', 'door', 'redacted'];

function solvePromise(spec, measure) { return solveSlateBand(spec, measure, 'front'); }
function solveProof(spec, measure) { return solveSlateBand(spec, measure, 'back'); }

/* ------------------------------------------------------------- the foot band */

/** Perceived lightness, 0 black to 1 white. */
export function luminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  const rgb = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* The flag bar and the band under it. One definition, used by the engine to
 * reserve the space and by the painter to fill it, because the source line was
 * being laid out into a band the painter then drew on top of. */
export function flagBand(style, s, discPx = 0, isStrip = false) {
  if (isStrip || style.flagBar === false) return { rule: 0, band: 0 };
  const rule = Math.max(3, s * 0.009);
  const bg = style.bgType === 'transparent' ? '#FFFFFF' : (style.bgColor || '');
  if (luminance(bg) <= 0.45) return { rule, band: 0 };
  return { rule, band: Math.max(rule * 3, s * 0.052, discPx ? discPx * 2.6 : 0) };
}

/* Stack fitted blocks from `top`, each with its gap before it, and hand the
 * painter absolute positions. The painter used to walk the same list and add
 * the same gaps again, which is two places to get one number right: on the
 * spotlight they disagreed and the call to action landed on top of the chips. */
function stackBlocks(entries, top) {
  let y = top;
  let first = true;
  const items = [];
  for (const e of entries) {
    const blk = e.block;
    if (!blk || !blk.lines || !blk.lines.length) continue;
    if (!first) y += e.gap || 0;
    const h = e.h ?? blk.h;
    items.push({ role: e.role, block: blk, y, h });
    y += h;
    first = false;
  }
  return { items, height: y - top, at: (role) => items.find((i) => i.role === role) || null };
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
  const widths = lines.map((l) => widthAt(measure, l, font, size, ls));
  return { lines, px: size, lh, h: lh * lines.length, font, ls, truncated,
           w: Math.max(0, ...widths, 0), widths };
}

function autoComposition(w, h, n, hasCopy) {
  const ar = w / h;
  // A display rail has no room for a grid and a copy column. Catch it before
  // the choice between them, copy or not: faces alone on a 728x90 is nothing.
  // The threshold is past a 3:1 email header, which is a real design surface
  // and lays out fine, and short of a 728x90 at 8:1, which does not.
  if (ar >= 4.5 || ar <= 0.30) return 'strip';
  if (!hasCopy) return 'slateOnly';
  if (n === 1) return 'spotlight';   // a grid of one reads as a mistake
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
/* A door hanger is a palm card with the top two and a quarter inches given to
 * the tab and the die. Nothing is laid out up there: a face with a hole punched
 * through it is not a printing accident, it is a design one.
 *
 * Expressed as a fraction of the card so it holds at any dpi. */
export const HANGER = { tab: 2.25 / 11, holeC: 1.25 / 11, holeD: 1.375 / 4.25, slotW: 0.42 / 4.25 };

/** Move every y in a plan down by dy. Used to drop a solved card below a die. */
function shiftPlan(node, dy, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return node;
  seen.add(node);
  if (Array.isArray(node)) { for (const v of node) shiftPlan(v, dy, seen); return node; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'canvas' || k === 'candidate') continue;
    if (k === 'y' || k === 'cy' || k === 'absY') { if (typeof v === 'number') node[k] = v + dy; continue; }
    if (v && typeof v === 'object') shiftPlan(v, dy, seen);
  }
  return node;
}

/* Names only.
 *
 * No photograph anywhere on the piece: the name plate takes the whole tile the
 * face would have had. A yard sign read at forty miles an hour is names, a road
 * sign is names, and a district whose portraits have not come in yet is names
 * today rather than placeholders today and a reprint next week.
 *
 * It is done to the finished plan rather than inside eight solvers that each
 * build a tile, so every layout in the app gets it at once and none of them can
 * disagree about it. The transform is idempotent: a plan with no photographs
 * left in it comes back unchanged.
 */
function namesOnlyPlan(plan) {
  if (!plan || !plan.tiles || !plan.tiles.length) return plan;
  plan.tiles = plan.tiles.map((t) => {
    // A tagline keeps its line under the plate; the plate takes the rest.
    const bottom = t.tag ? t.tag.y - t.w * 0.02 : t.y + t.h;
    return { ...t, photo: null, plate: { x: t.x, y: t.y, w: t.w, h: Math.max(1, bottom - t.y) } };
  });
  return plan;
}

export function solve(spec, measure) {
  const plan = solveAll(spec, measure);
  return (spec.style || {}).namesOnly ? namesOnlyPlan(plan) : plan;
}

function solveAll(spec, measure) {
  // The die is geometry, not decoration, so it is settled before anything is
  // laid out and the solve simply never sees that part of the card.
  if (spec.die === 'hanger') {
    const { w, h } = spec.canvas;
    const tab = h * HANGER.tab;
    const plan = shiftPlan(solve({ ...spec, die: null, canvas: { w, h: h - tab } }, measure), tab);
    plan.canvas = { w, h };
    const holeR = w * HANGER.holeD / 2;
    plan.hangerDie = {
      tab,
      hole: { cx: w / 2, cy: h * HANGER.holeC, r: holeR },
      slot: { cx: w / 2, cy: h * HANGER.holeC + holeR * 1.15, rx: w * HANGER.slotW / 2, ry: holeR * 0.42 },
      tabLine: { x: 0, y: tab, w },
    };
    plan.warnings = [...(plan.warnings || []),
      'The die line and the hole are guides. The printer cuts from their own die, so send them the trim size and ask for a proof.'];
    return plan;
  }
  const { w, h } = spec.canvas;
  const slate = spec.slate || [];
  const n = slate.length;
  const style = spec.style || {};
  const copy = spec.copy || {};
  const s = Math.min(w, h);

  // With a deck aspect set, the slate is the pre-built deck PNG dropped in as a
  // single layer, not a grid this app composes. Everything else is unchanged.
  const deckAR = style.deckAspect || 0;
  const gridOf = (W, H) => (deckAR
    ? bestGrid(1, W, H, gap, false, deckAR)
    : bestGrid(n, W, H, gap, plate, tileAspect(style, plate)));

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
  if (comp === 'ballot') return solveBallot(spec, measure);
  if (comp === 'palmback') return solvePalmBack(spec, measure);
  if (comp === 'spotlight') return solveSpotlight(spec, measure);
  if (comp === 'versus') return solveVersus(spec, measure);
  if (comp === 'strip') return solveStrip(spec, measure);
  if (comp === 'stat') return solveStat(spec, measure);
  if (comp === 'receipt') return solveReceipt(spec, measure);
  if (comp === 'typeled') return solveTypeLed(spec, measure);
  if (comp === 'promise') return solvePromise(spec, measure);
  if (comp === 'proof') return solveProof(spec, measure);
  if (comp === 'poster') return solvePoster(spec, measure);
  if (comp === 'contrast') return solveContrast(spec, measure);
  if (!hasCopy) comp = 'slateOnly';

  // Reserve the disclaimer strip first. It is required on a finished ad under
  // RSA 664:14, so it gets its own space instead of competing for it.
  const disc = (copy.disclaimer || '').trim();
  const discPx = Math.max(11, s * 0.0165);
  const discH = disc ? discPx * 1.25 + gap * 0.5 : 0;

  /* A mail panel is carrier space, not canvas. Take it out before anything is
   * laid out, so nothing is ever designed into the address block. It is a
   * corner, so the copy loses its width but the faces keep the height above
   * it: proof on the left, the slate upper right, the carrier's corner below.
   * That is the archetype the reference mailer uses, and it is why a piece with
   * a mail panel is always solved as a split. */
  const panel = mailPanelRect(spec, w, h);
  const panelW = panel ? panel.w : 0;
  const inner = {
    x: pad, y: pad,
    w: w - 2 * pad - (panel ? 0 : 0), h: h - 2 * pad - discH,
  };
  if (panel) {
    inner.w = w - 2 * pad;
    comp = hasCopy ? 'split' : 'slateOnly';
  }

  if (comp === 'slateOnly') {
    const room = panel
      ? { x: inner.x, y: inner.y, w: inner.w, h: panel.y - inner.y - gap }
      : inner;
    const g = gridOf(room.w, room.h);
    return finish(spec, { comp, inner, slateRect: room, copyRect: null, grid: g, k: 1, copyLayout: { height: 0, items: [] }, pad, gap, s, plate, discPx, disc, overflow: false, panel });
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
    if (panel) {
      /* The copy keeps the left of the piece full height. The slate takes the
       * column above the carrier's corner, and nothing is ever laid out inside
       * it. */
      rects.copy = { x: inner.x, y: inner.y, w: inner.w - panelW - gap, h: inner.h };
      rects.slate = {
        x: inner.x + inner.w - panelW + gap * 0.25,
        y: inner.y,
        w: panelW - gap * 0.5,
        h: panel.y - inner.y - gap,
      };
    }
    if (rects.copy.w < s * 0.18 || rects.slate.w < s * 0.14 || rects.slate.h < s * 0.12) continue;

    // The QR block is reserved out of the copy column before the copy is
    // fitted to it, so a code can never be squeezed in afterwards on top of
    // something or shrunk below the size a phone can read.
    const qrHere = qrFor(measure, copy, spec, s,
      Math.min(rects.copy.w * 0.44, rects.copy.h * 0.40), rects.copy.w);
    const qrH = qrHere && qrHere.code ? qrHere.h + gap * 0.5 : 0;
    const copyBox = { ...rects.copy, h: Math.max(s * 0.10, rects.copy.h - qrH) };
    const { k, overflow } = fitScale(measure, copy, s, copyBox, kMin, kMax);
    const cl = layoutCopy(measure, copy, s, k, copyBox.w);
    const g = gridOf(rects.slate.w, rects.slate.h);

    const copyScore = (k - kMin) / (kMax - kMin);
    const tileScore = Math.min(1, g.tileW / ideal);
    // Reward the weaker of the two hardest, so neither the copy nor the faces
    // get starved, then break ties toward the better overall balance.
    let score = 0.68 * Math.min(copyScore, tileScore) + 0.32 * ((copyScore + tileScore) / 2);
    // Wasted vertical space in the copy column is dead air on a stacked layout.
    const slack = comp === 'split' ? 0 : Math.max(0, copyBox.h - cl.height) / inner.h;
    score -= slack * 0.35;
    if (overflow) score -= 0.5;

    if (!best || score > best.score) best = { score, t, rects, k, cl, grid: g, overflow, qr: qrHere, qrH };
  }

  if (!best) {
    const g = gridOf(inner.w, inner.h);
    return finish(spec, { comp: 'slateOnly', inner, slateRect: inner, copyRect: null, grid: g, k: 1, copyLayout: { height: 0, items: [] }, pad, gap, s, plate, discPx, disc, overflow: true });
  }

  return finish(spec, {
    comp, inner, slateRect: best.rects.slate, copyRect: best.rects.copy,
    grid: best.grid, k: best.k, copyLayout: best.cl,
    pad, gap, s, plate, discPx, disc, overflow: best.overflow,
    qr: best.qr, qrH: best.qrH, panel,
  });
}

/* What went wrong with the QR, said plainly. An untested or unreadable code is
 * the single cheapest way to waste a whole print run. */
function qrWarnings(asked, placed) {
  if (!asked) return [];
  const out = [];
  if (asked.error) out.push(`No QR code: ${asked.error}`);
  else if (!placed) out.push('This layout has no room for a QR code, so the URL is text only.');
  else if (placed.tooSmall) {
    out.push('The QR code is below three quarters of an inch. Print it larger or it will not scan.');
  }
  if (asked.code) {
    out.push(`QR points at ${asked.url}. Scan the exported file with two phones before it goes to print.`);
  }
  return out;
}

/* A yard sign and a road sign are read at forty miles an hour, not held. The
 * engine will happily set a paragraph on a four foot board, so this measures
 * what it just laid out in inches and says plainly when it is unreadable. */
function bigPieceWarnings(spec, r, w, h) {
  const dpi = spec.dpi || 0;
  if (!dpi) return [];
  const shortIn = Math.min(w, h) / dpi;
  if (shortIn < 16) return [];        // a card is held, not driven past
  const out = [];
  const head = (r.copyLayout.items || []).find((it) => it.key === 'headline');
  const wantIn = shortIn >= 40 ? 6 : 3;
  if (head && head.px / dpi < wantIn) {
    out.push(`The headline is ${(head.px / dpi).toFixed(1)} inches tall on a ${Math.round(shortIn)} inch piece. `
      + `It wants ${wantIn}. Cut it to three or four words.`);
  }
  const words = (r.copyLayout.items || []).reduce((a, it) => a + String(it.text || '').split(/\s+/).filter(Boolean).length, 0);
  if (shortIn >= 40 && words > 12) {
    out.push(`${words} words on a road sign. Nobody reads more than about eight at speed.`);
  }
  return out;
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
  const tileH = tileW * (deckAR || tileAspect(style, plate));
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
  let qr = null;
  if (r.copyRect) {
    const cr = r.copyRect;
    const align = style.align || (r.comp === 'split' ? 'left' : 'center');
    copy = {
      rect: cr, align, x: cr.x, y: copyTop, w: cr.w, height: copyH,
      items: r.copyLayout.items.map((it) => ({ ...it, absY: copyTop + it.y })),
    };
    if (r.qr && r.qr.code) {
      const top = copyTop + copyH + gap * 0.5;
      qr = { ...r.qr, y: top, align,
             x: align === 'center' ? cr.x + (cr.w - r.qr.size) / 2 : cr.x,
             centreOn: align === 'center' ? cr.x + cr.w / 2 : cr.x + r.qr.size / 2 };
    }
  }

  return {
    canvas: { w, h },
    mailPanel: r.panel || null,
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
    qr,
    disclaimer: r.disc
      ? (() => {
        // Clear of the carrier's corner, which is the one part of a mail piece
        // nothing of ours may touch.
        const dw = w - 2 * r.pad - (r.panel ? r.panel.w : 0);
        return { text: r.disc, px: r.discPx, x: r.pad, y: h - r.pad * 0.55,
                 w: dw, centreOn: r.pad + dw / 2 };
      })()
      : null,
    warnings: [
      ...bigPieceWarnings(spec, r, w, h),
      ...qrWarnings(r.qr, qr),
      ...(r.overflow ? ['Copy is longer than the canvas can hold at a readable size. It was trimmed to fit.'] : []),
      ...trimmed.map((k) => `The ${k} is too long for this canvas and was cut off. Shorten it, or use a taller canvas.`),
      ...(!deckAR && tileW < idealTile(n, s) * 0.72
        ? [`${n} portraits on this canvas run small. A wider canvas or shorter copy reads better.`] : []),
    ],
  };
}

