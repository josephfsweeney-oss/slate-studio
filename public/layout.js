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

const COMPOSITIONS = ['stack', 'banner', 'split', 'slateOnly', 'palmcard',
  'palmback', 'ballot', 'spotlight', 'versus', 'strip'];

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

  const ctaTxt = String(copy.cta || '').trim();
  const cta = fitBlock(measure, ctaTxt, ANTON, s * 0.036, copyW, 1, 0.02, true);

  const entries = [
    { role: 'kicker', block: kick, gap: 0 },
    { role: 'headline', block: head, gap: s * 0.008 },
    { role: 'ask', block: ask, gap: s * 0.020 },
    { role: 'details', block: det, gap: s * 0.018 },
    { role: 'cta', block: cta, gap: s * 0.034, h: cta.h ? cta.px * 1.84 : 0 },
  ];
  const copyH = stackBlocks(entries, 0).height;

  let copyRect;
  let card;
  if (wide) {
    const capped = Math.min(copyH, inner.h);
    copyRect = { x: inner.x, y: inner.y + Math.max(0, (inner.h - capped) / 2), w: copyW, h: capped };
    card = { x: inner.x + copyW + gap, y: inner.y, w: inner.w - copyW - gap, h: inner.h };
  } else {
    // The card never gets less than a third of the piece: a ballot guide whose
    // ballot is a sliver is a poster with a rumour of a ballot on it.
    const cardH = Math.max(inner.h * 0.34, inner.h - copyH - gap * 1.4);
    copyRect = { x: inner.x, y: inner.y, w: copyW, h: Math.max(1, inner.h - cardH - gap * 1.4) };
    card = { x: inner.x, y: inner.y + inner.h - cardH, w: inner.w, h: cardH };
  }
  const bands = stackBlocks(entries, copyRect.y);
  const copyCramped = bands.height > copyRect.h + 1;

  // The card: a header rule, then one row per name. Rows shrink to fit rather
  // than spilling, because a ballot with a name missing is worse than a small one.
  const headerH = ruleBlk.h + s * 0.024;
  const body = { x: card.x, y: card.y + headerH, w: card.w, h: card.h - headerH };
  const rowGap = Math.min(s * 0.012, body.h * 0.03);
  const rowH = Math.max(s * 0.030, (body.h - rowGap * (n - 1)) / Math.max(1, n));
  const ovalR = Math.min(rowH * 0.30, card.w * 0.045);

  const rows = slate.map((c, i) => {
    const y = body.y + i * (rowH + rowGap);
    return {
      candidate: c, x: body.x, y, w: body.w, h: rowH,
      oval: { cx: body.x + card.w * 0.055 + ovalR, cy: y + rowH / 2, rx: ovalR * 1.45, ry: ovalR },
      textX: body.x + card.w * 0.055 + ovalR * 2 + card.w * 0.045,
      namePx: Math.min(rowH * 0.50, s * 0.040),
      firstPx: Math.min(rowH * 0.27, s * 0.022),
    };
  });
  const overflow = rows.length ? (rows[n - 1].y + rowH) > (card.y + card.h + s * 0.004) : false;

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
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(ask.truncated ? ['The subhead is too long and was cut.'] : []),
      ...(overflow ? [`${n} names will not fit the ballot card on this canvas. Use a taller one.`] : []),
      ...(copyCramped ? ['The copy is longer than the space left beside the ballot. Cut a line.'] : []),
      ...(seats > n ? [`This district elects ${seats} but only ${n} Republicans are on the slate. The card says ${seats}.`] : []),
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
  const n = slate.length;
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
  const rows = slate.map((c, i) => {
    const ry = ovalTop + ruleBlk.h + h * 0.016 + i * (rowH + rowGap);
    return {
      candidate: c, x: pad, y: ry, w: inner, h: rowH, px: rowPx,
      oval: { cx: pad + w * 0.030 + ovalR, cy: ry + rowH / 2, rx: ovalR * 1.45, ry: ovalR },
      textX: pad + w * 0.030 + ovalR * 2 + w * 0.034,
    };
  });
  const ovals = { x: 0, y: ovalTop, w, h: h - footerH - ovalTop, rule: ruleBlk, rows, seats };

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
    const copyH = stack.height + (chipsH ? s * 0.024 * q + chipsH : 0);
    return { q, kick, head, call, ask, cta, ctaH, entries, chipW, perRow, chipRows, chipH, chipsH, copyH };
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
  const { kick, head, call, ask, cta, chipW, perRow, chipRows, chipH, chipsH, copyH } = m;
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

  // One pass, one set of numbers: the bands, then the chips under them.
  const bands = stackBlocks(m.entries, copyRect.y);
  const chipsTop = chipsH
    ? Math.min(copyRect.y + copyRect.h - chipsH, bands.height + copyRect.y + s * 0.024 * m.q)
    : copyRect.y + copyRect.h;
  // The chips line up with the copy above them. Left when the copy is left,
  // centred when it is centred: a centred stack with one chip hanging off the
  // left edge reads as a mistake, because it is one.
  const chipsCentred = !wide && style.align !== 'left';
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
    disclaimer: disc
      ? { text: disc, px: discPx, x: pad, y: h - discPx * 1.0, w: w - pad * 2, centreOn: w / 2 }
      : null,
    warnings: [
      ...(head.truncated ? ['The headline is too long for this canvas and was cut.'] : []),
      ...(call.truncated ? ['The callout is too long and was cut.'] : []),
      ...(!hero ? ['Nobody is on the slate, so there is nobody to spotlight.'] : []),
      ...(rest.length > 9 ? ['More than nine chips will run very small. Drop some candidates.'] : []),
      ...(cropped ? ['The copy is longer than a spotlight of this size can hold. Cut a line, or drop a chip.'] : []),
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

/** Two per line, the way the strip on the reference card is set. */
function pairUp(values) {
  const out = [];
  for (let i = 0; i < values.length; i += 2) out.push(values.slice(i, i + 2).join('   ·   '));
  return out.join('\n');
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
  return { lines, px: size, lh, h: lh * lines.length, font, ls, truncated };
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

export function solve(spec, measure) {
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
  if (comp === 'ballot') return solveBallot(spec, measure);
  if (comp === 'palmback') return solvePalmBack(spec, measure);
  if (comp === 'spotlight') return solveSpotlight(spec, measure);
  if (comp === 'versus') return solveVersus(spec, measure);
  if (comp === 'strip') return solveStrip(spec, measure);
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
      ...bigPieceWarnings(spec, r, w, h),
      ...(r.overflow ? ['Copy is longer than the canvas can hold at a readable size. It was trimmed to fit.'] : []),
      ...trimmed.map((k) => `The ${k} is too long for this canvas and was cut off. Shorten it, or use a taller canvas.`),
      ...(!deckAR && tileW < idealTile(n, s) * 0.72
        ? [`${n} portraits on this canvas run small. A wider canvas or shorter copy reads better.`] : []),
    ],
  };
}

