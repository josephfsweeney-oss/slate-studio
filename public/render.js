/* Slate Studio painter.
 *
 * Draws a plan from layout.js onto a 2D canvas. Preview and export call this
 * with the same plan at the same canvas size, so what you approve is what ships.
 */
import { BRAND, PHOTO_AR, luminance, flagBand } from './layout.js';
import { firstLine } from './names.js';

/* ------------------------------------------------------------------- helpers */

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/* How far apart two colours actually are, by the measure a printer and a
 * building inspector both use. The palette's green on the palette's navy comes
 * out at 2.5 to 1, which is below the floor for text of any size, and it is why
 * a kicker set in the accent on a dark ground could not be read. */
const srgb = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const relLum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

export function contrastRatio(a, b) {
  const la = relLum(hexToRgb(a));
  const lb = relLum(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const mixWhite = ([r, g, b], t) => [
  Math.round(r + (255 - r) * t), Math.round(g + (255 - g) * t), Math.round(b + (255 - b) * t)];
const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * The accent, in a form that can be read on a ground.
 *
 * The palette's own light accent first, because somebody chose it. If that does
 * not carry either, the accent is lifted toward white until it does, and white
 * is where it stops. Brand colour that cannot be read is not brand colour, it is
 * a mistake with a swatch next to it.
 */
export function readableOn(accent, ground, light, min = 4.5) {
  if (light && contrastRatio(light, ground) >= min) return light;
  if (contrastRatio(accent, ground) >= min) return accent;
  const base = hexToRgb(accent);
  for (let t = 0.1; t <= 1; t += 0.05) {
    const hex = toHex(mixWhite(base, t));
    if (contrastRatio(hex, ground) >= min) return hex;
  }
  return '#FFFFFF';
}

/* Lightness and the foot band both live in the engine now: the engine has to
 * reserve the band this file paints, and two copies of the rule had already
 * drifted far enough to bury a source line under it. */
export { luminance, flagBand } from './layout.js';

/* CTEHR shape rules, in canvas terms.
 *
 * No pills, and four pixels is the maximum radius anywhere. On a piece that is
 * 3300 across at 300 dpi, four pixels is a hundredth of an inch: no press holds
 * it and no eye sees it, so the honest reading of the rule on this surface is a
 * square corner. Everything here is square.
 *
 * The one thing that was a pill, the call to action, is a clipped block now:
 * two corners cut on the diagonal, which is the clip-path treatment the buttons
 * on the sites wear. */
const CORNER = 0;

/** A block with the top left and bottom right corners cut on the diagonal. */
function clipBlock(ctx, x, y, w, h, cut) {
  const c = Math.min(cut, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function setFont(ctx, font, px, ls) {
  ctx.font = `${font.weight} ${px}px "${font.family}", ${font.family === 'Anton' ? 'Impact, sans-serif' : 'sans-serif'}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(ls || 0) * px}px`;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Mix two colours, t of 0 being all of `a`. */
function mix(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const f = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${f(ar, br)},${f(ag, bg)},${f(ab, bb)})`;
}

/** Mix a colour toward black (k below 1) or toward white (k above 1). */
function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const CARD_COMPS = new Set(['palmcard', 'palmback']);

/* The stock a card prints on.
 *
 * A rack card is a physical thing with a colour, and that colour is the
 * palette's ground: white on the light schemes, the palette's own colour on
 * Navy and Pine. It used to be white whatever the palette said, so switching to
 * Navy changed nothing on a palm card and the type stayed dark on dark paper
 * that never arrived. */
export function cardStock(style) {
  if (style.cardGround) return style.cardGround;
  if (style.bgType === 'transparent') return BRAND.ground;
  const bg = style.bgColor || BRAND.ground;
  return luminance(bg) > 0.45 ? BRAND.ground : bg;
}

/** Theme derived from whatever actually sits behind the copy. */
export function themeFor(style) {
  const card = CARD_COMPS.has(style.composition);
  const bg = card ? cardStock(style)
    : (style.bgType === 'transparent' ? '#FFFFFF' : (style.bgColor || BRAND.navyDeep));
  const light = luminance(bg) > 0.45;
  const accent = style.accent || BRAND.green;
  const plate = style.plateColor || BRAND.navy;
  return {
    light,
    primary: light ? BRAND.navy : BRAND.white,
    secondary: light ? 'rgba(18,49,78,.80)' : 'rgba(255,255,255,.88)',
    // The brand sets the headline in two colours. On a light ground that is the
    // green over the navy; on a dark one the mint over white.
    headline2: light ? accent : (style.plateAccent || BRAND.mint),
    // On a dark ground a deep accent disappears in the copy, so the kicker and
    // the rules use the lighter plate colour instead.
    accent: light ? accent : (luminance(accent) < 0.18 ? (style.plateAccent || BRAND.mint) : accent),
    ctaBg: accent,
    ctaText: BRAND.white,
    rule: light ? 'rgba(18,49,78,.18)' : 'rgba(255,255,255,.22)',
    disclaimer: light ? 'rgba(18,49,78,.72)' : 'rgba(255,255,255,.62)',
    /* Blocks and tints, which have to move with the ground as well. On dark
     * stock a navy masthead on navy paper is not a masthead, so the band
     * becomes a deeper cut of the stock itself rather than a fixed colour. */
    band: light ? plate : shade(bg, 0.58),
    panel: light ? 'rgba(47,124,78,.07)' : 'rgba(255,255,255,.07)',
    cell: light ? 'rgba(47,124,78,.10)' : 'rgba(255,255,255,.10)',
    step: light ? 'rgba(18,49,78,.055)' : 'rgba(255,255,255,.06)',
  };
}

/** The closing bar. On a light ground it becomes a solid band, which is where
 *  the disclaimer then sits, so both painters have to agree on its size. */
/* A display rail is 90px tall and carries no disclaimer, so a flag bar along
 * the bottom is a third of the ad spent on a stripe. flagBand knows that. */
function bandMetrics(plan, style) {
  return flagBand(style, plan.s, plan.disclaimer ? plan.disclaimer.px : 0, Boolean(plan.strip));
}

/* ---------------------------------------------------------------- background */

function paintBackground(ctx, plan, style, assets, bleed = 0) {
  const { w, h } = plan.canvas;
  // Everything full-bleed is drawn from -bleed to w+bleed, so the trim cut
  // lands inside the artwork instead of on the edge of it.
  const bx = -bleed, by = -bleed, bw = w + bleed * 2, bh = h + bleed * 2;
  ctx.clearRect(bx, by, bw, bh);
  const type = style.bgType || 'solid';
  if (type === 'transparent') return;

  if (type === 'gradient') {
    const g = ctx.createLinearGradient(bx, by, bx + bw * 0.35, by + bh);
    g.addColorStop(0, style.bgColor || BRAND.navy);
    g.addColorStop(1, style.bgColor2 || BRAND.navyLift);
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);
  } else {
    ctx.fillStyle = style.bgColor || BRAND.navy;
    ctx.fillRect(bx, by, bw, bh);
  }

  if (type === 'image' && assets.bgImage) {
    const img = assets.bgImage;
    const scale = Math.max(bw / img.width, bh / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
    const dim = style.bgDim ?? 0.45;
    if (dim > 0) {
      const [dr, dg, db] = hexToRgb(style.bgColor || BRAND.navyDeep);
      ctx.fillStyle = `rgba(${dr},${dg},${db},${dim})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }

  // The green rule over the navy band, the way the Granite Guarantee sheet
  // closes. On a dark ground the band would vanish, so it stays a thin bar.
  const m = bandMetrics(plan, style);
  if (m.rule) {
    const [c1, c2] = style.bar || [style.accent || BRAND.green, BRAND.navy];
    const barW = plan.mailPanel ? plan.mailPanel.x : w + bleed;
    const barL = plan.mailPanel ? 0 : -bleed;
    if (m.band) {
      ctx.fillStyle = c2;
      ctx.fillRect(barL, h - m.band, barW - barL, m.band + bleed);
      ctx.fillStyle = c1;
      ctx.fillRect(barL, h - m.band, barW - barL, m.rule);
    } else {
      ctx.fillStyle = c1;
      ctx.fillRect(barL, h - m.rule, barW - barL, m.rule + bleed);
      ctx.fillStyle = c2;
      ctx.fillRect(barL, h - m.rule, (barW - barL) * 0.34, m.rule + bleed);
    }
  }
}

/* ------------------------------------------------------------------- portrait */

/** A candidate with no usable headshot still gets a tile, clearly marked, so the
 *  slate stays complete and the gap is visible instead of silently dropped. */
function paintSilhouette(ctx, r, theme) {
  const cx = r.x + r.w / 2;
  const base = r.y + r.h;
  ctx.save();
  ctx.fillStyle = theme.light ? 'rgba(18,49,78,.13)' : 'rgba(255,255,255,.16)';
  const headR = r.w * 0.20;
  ctx.beginPath();
  ctx.arc(cx, base - r.h * 0.62, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  const bw = r.w * 0.62, bh = r.h * 0.44;
  ctx.moveTo(cx - bw / 2, base);
  ctx.quadraticCurveTo(cx - bw / 2, base - bh, cx, base - bh);
  ctx.quadraticCurveTo(cx + bw / 2, base - bh, cx + bw / 2, base);
  ctx.closePath();
  ctx.fill();
  // The empty slot has to read as an absence at feed size, not as a soft grey
  // box somebody might take for a design choice.
  ctx.strokeStyle = theme.light ? 'rgba(18,49,78,.52)' : 'rgba(255,255,255,.52)';
  ctx.setLineDash([r.w * 0.05, r.w * 0.04]);
  ctx.lineWidth = Math.max(2, r.w * 0.014);
  roundRect(ctx, r.x + r.w * 0.06, r.y + r.h * 0.10, r.w * 0.88, r.h * 0.88, CORNER);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = theme.light ? 'rgba(18,49,78,.88)' : 'rgba(255,255,255,.92)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, r.w * 0.090, 0.06);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHOTO NEEDED', cx, r.y + r.h * 0.22);
  ctx.restore();
}

function paintTile(ctx, tile, plan, style, assets, theme) {
  const c = tile.candidate;
  const img = assets.portraits && assets.portraits[c.name];
  const tw = tile.w;

  // Names only: there is no photo box on the tile at all, so nothing is drawn
  // where a face would have been and nothing says a face is missing.
  if (img && tile.photo) {
    // Bottom-anchored and contained, matching the transparent decks: the cutout
    // stands on the plate rather than floating or cropping at the chin.
    const boxH = tile.photo.h;
    const scale = Math.min(tile.photo.w / img.width, boxH / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    const dx = tile.photo.x + (tile.photo.w - dw) / 2;
    const dy = tile.photo.y + boxH - dh;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = tw * 0.030;
    ctx.shadowOffsetY = tw * 0.012;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
    clearShadow(ctx);
  } else if (tile.photo) {
    paintSilhouette(ctx, tile.photo, theme);
  }

  if (!tile.plate) return;
  const p = tile.plate;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = tw * 0.030;
  ctx.shadowOffsetY = tw * 0.010;
  ctx.fillStyle = style.plateColor || BRAND.navyDeep;
  roundRect(ctx, p.x, p.y, p.w, p.h, CORNER);
  ctx.fill();
  ctx.restore();
  clearShadow(ctx);

  // Red cap along the top edge of the plate.
  ctx.save();
  roundRect(ctx, p.x, p.y, p.w, p.h, CORNER);
  ctx.clip();
  ctx.fillStyle = style.accent || BRAND.green;
  ctx.fillRect(p.x, p.y, p.w, Math.max(3, tw * 0.022));
  ctx.restore();

  const first = firstLine(c, style);
  const last = (c.last || '').toUpperCase();
  /* With no face above it the plate is the whole tile, so the name is sized off
   * the box it is actually in. Sized off the tile width instead, a name plate
   * four times its usual height would still set the surname at its usual size
   * and sit in an inch of empty navy. */
  const bare = !tile.photo;
  const firstPx = bare ? Math.min(p.h * 0.17, p.w * 0.13) : tw * 0.082;
  // Long surnames step down so they never overflow the plate.
  let lastPx = bare
    ? Math.min(p.h * 0.38, p.w * 0.32)
    : tw * 0.150 * Math.pow(Math.min(1, 9 / Math.max(last.length, 1)), 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = p.x + p.w / 2;
  const inner = p.w - tw * 0.10;

  setFont(ctx, { family: 'Anton', weight: 400 }, lastPx, -0.01);
  let guard = 0;
  while (ctx.measureText(last).width > inner && guard++ < 40) {
    lastPx *= 0.95;
    setFont(ctx, { family: 'Anton', weight: 400 }, lastPx, -0.01);
  }
  // "REP. " is four characters the plate was not sized for, so the first line
  // steps down the same way the surname does rather than running off the plate.
  let firstSize = firstPx;
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, firstSize, 0.10);
  let fguard = 0;
  while (first && ctx.measureText(first).width > inner && fguard++ < 40) {
    firstSize *= 0.95;
    setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, firstSize, 0.10);
  }

  const stackH = first ? firstSize * 1.05 + tw * 0.012 + lastPx * 0.96 : lastPx * 0.96;
  let y = p.y + (p.h - stackH) / 2 + (first ? firstSize * 0.86 : lastPx * 0.80);
  if (first) {
    ctx.fillStyle = style.plateAccent || BRAND.mint;
    setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, firstSize, 0.10);
    ctx.fillText(first, cx, y);
    y += tw * 0.012 + lastPx * 0.88;
  }
  ctx.fillStyle = BRAND.white;
  setFont(ctx, { family: 'Anton', weight: 400 }, lastPx, -0.01);
  ctx.fillText(last, cx, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** The pre-built deck PNG, dropped in whole. It is already a transparent
 *  composition of the whole slate, so it is placed, not rebuilt. */
function paintDeck(ctx, plan, assets, theme) {
  const r = plan.deck;
  const img = assets.deck;
  if (!img) {
    ctx.save();
    ctx.strokeStyle = theme.light ? 'rgba(18,49,78,.30)' : 'rgba(255,255,255,.34)';
    ctx.setLineDash([r.w * 0.02, r.w * 0.016]);
    ctx.lineWidth = Math.max(1.5, r.w * 0.004);
    roundRect(ctx, r.x, r.y, r.w, r.h, CORNER);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    return;
  }
  const scale = Math.min(r.w / img.width, r.h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
}

/* -------------------------------------------------------------- palm card ---
 * A rack card read top to bottom: masthead, the ask, the faces, the values
 * strip, then when and where. Same green and navy as everything else. */
function paintPalmCard(ctx, plan, style, theme, assets, bleed) {
  const p = plan.palm;
  const { w, h } = plan.canvas;
  const accent = theme.accent;
  // The blocks take the band colour, the words take the ink. On white stock
  // both are navy, which is where the one variable came from; on Navy or Pine
  // they have to part company or the card prints a navy word on navy paper.
  const ink = theme.band;

  // Masthead: a full-bleed block behind the headline.
  const mastBottom = p.mast.y + p.mast.h - plan.pad * 0.3;
  ctx.fillStyle = ink;
  ctx.fillRect(-bleed, -bleed, w + bleed * 2, mastBottom + bleed);
  ctx.fillStyle = accent;
  ctx.fillRect(-bleed, mastBottom, w + bleed * 2, Math.max(3, w * 0.010));

  let y = p.mast.y + plan.pad * 0.15;
  if (p.mast.kicker.lines.length) {
    ctx.fillStyle = style.plateAccent || BRAND.mint;
    setFont(ctx, p.mast.kicker.font, p.mast.kicker.px, p.mast.kicker.ls);
    ctx.textAlign = 'center';
    for (const l of p.mast.kicker.lines) { y += p.mast.kicker.lh; ctx.fillText(l, w / 2, y - p.mast.kicker.lh * 0.24); }
    y += h * 0.004;
  }
  const hd = p.mast.headline;
  ctx.textAlign = 'center';
  hd.lines.forEach((line, i) => {
    // Two-tone, first line in the accent, as the brand sets it.
    ctx.fillStyle = (style.twoTone !== false && hd.lines.length > 1 && i === 0)
      ? (style.plateAccent || BRAND.mint) : BRAND.white;
    setFont(ctx, hd.font, hd.px, hd.ls);
    ctx.fillText(line, w / 2, y + hd.lh * (i + 0.82));
  });

  // The ask.
  if (p.ask.block.lines.length) {
    const a = p.ask.block;
    ctx.fillStyle = theme.primary;
    setFont(ctx, a.font, a.px, a.ls);
    ctx.textAlign = 'center';
    a.lines.forEach((l, i) => ctx.fillText(l, w / 2, p.ask.y + a.lh * (i + 0.9)));
  }

  // The faces sit on a quiet tint, not on bare stock: it groups them as one slate.
  ctx.fillStyle = theme.panel;
  roundRect(ctx, p.panel.x, p.panel.y, p.panel.w, p.panel.h, CORNER);
  ctx.fill();

  // The values strip, full bleed in the accent.
  if (p.strip.block.lines.length) {
    const st = p.strip.block;
    const top = p.strip.y - plan.gap * 0.55;
    const height = p.strip.h + plan.gap * 0.5;
    ctx.fillStyle = accent;
    ctx.fillRect(-bleed, top, w + bleed * 2, height);
    ctx.fillStyle = BRAND.white;
    setFont(ctx, st.font, st.px, st.ls);
    ctx.textAlign = 'center';
    st.lines.forEach((l, i) => ctx.fillText(l, w / 2, top + plan.gap * 0.25 + st.lh * (i + 0.85)));
  }

  // When and where, together, on the town photo if there is one.
  if (p.event.h > 0) {
    const e = p.event;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-bleed, e.y, w + bleed * 2, e.h);
    ctx.clip();
    if (assets.bgImage) {
      const img = assets.bgImage;
      const sc = Math.max((w + bleed * 2) / img.width, e.h / img.height);
      ctx.drawImage(img, -bleed + ((w + bleed * 2) - img.width * sc) / 2,
        e.y + (e.h - img.height * sc) / 2, img.width * sc, img.height * sc);
      const [r, g, b] = hexToRgb(ink);
      ctx.fillStyle = `rgba(${r},${g},${b},.72)`;
    } else {
      ctx.fillStyle = ink;
    }
    ctx.fillRect(-bleed, e.y, w + bleed * 2, e.h);
    ctx.restore();

    // Centre the whole block in the band rather than hanging it from the top,
    // which left a third of the band empty.
    ctx.textAlign = 'center';
    const datePx = w * 0.062;
    const wherePx = w * 0.034;
    const whereLines = p.where ? p.where.split('\n').filter(Boolean) : [];
    const blockH = (p.date ? datePx * 1.02 : 0)
      + (whereLines.length ? w * 0.020 + wherePx * 1.24 * whereLines.length : 0);
    let ey = e.y + (e.h - blockH) / 2;
    if (p.date) {
      setFont(ctx, { family: 'Anton', weight: 400 }, datePx, -0.01);
      ctx.fillStyle = BRAND.white;
      ctx.fillText(p.date.toUpperCase(), w / 2, ey + datePx * 0.84);
      ey += datePx * 1.02 + w * 0.020;
    }
    if (whereLines.length) {
      setFont(ctx, { family: 'Barlow Condensed', weight: 600 }, wherePx, 0.02);
      ctx.fillStyle = style.plateAccent || BRAND.mint;
      whereLines.forEach((l, i) => ctx.fillText(l, w / 2, ey + wherePx * (0.86 + 1.24 * i)));
    }
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** The line of role or title under a name on a palm card. */
function paintTagline(ctx, tile, style, theme) {
  const t = (tile.candidate.tag || '').trim();
  if (!t || !tile.tag) return;
  const px = tile.w * 0.072;
  ctx.fillStyle = style.accent || BRAND.green;
  setFont(ctx, { family: 'Barlow Condensed', weight: 600 }, px, 0.01);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  t.split('\n').slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, tile.x + tile.w / 2, tile.tag.y + px * (i + 0.9) * 1.12);
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ------------------------------------------------------------------ mail panel
 *
 * The carrier's half of the piece. Drawn last over a clean ground so nothing in
 * the design can intrude, with the four things a mail house looks for: indicia,
 * return address, address block and a clear barcode zone.
 *
 * These are conventional placements, not a compliance guarantee. Every mail
 * house has its own template and the final piece has to clear theirs.
 */
function paintMailPanel(ctx, plan, style, copy) {
  const m = plan.mailPanel;
  if (!m) return;
  // The panel carries its own scale now, because it is a fixed size in inches
  // rather than a fraction of the piece. An 11 x 6 and an 11 x 5.5 get the same
  // four inch corner, which is what the mail house is expecting.
  const dpi = m.dpi || plan.canvas.w / 11;
  const inch = (n) => n * dpi;
  const ink = '#12314E';

  // A plain ground: scanners read badly over artwork.
  ctx.fillStyle = style.mailPanelGround || '#FFFFFF';
  ctx.fillRect(m.x, m.y, m.w, m.h);

  /* Blank means blank. The mail house owns this corner: they set the indicia,
   * the return address, the address block and the barcode, and a guide printed
   * here is one more thing for somebody to leave on the plate. The white knocked
   * out of the artwork is the whole instruction. */
  if (style.mailPanelBlank) return;

  ctx.fillStyle = 'rgba(18,49,78,.12)';
  ctx.fillRect(m.x, m.y, Math.max(1, inch(0.008)), m.h);

  const L = m.x + inch(0.3);
  const R = m.x + m.w - inch(0.3);

  /* Four inches by two and a quarter has to hold four things without any of
   * them touching: the return address and the indicia across the top, the
   * address block under them, and the barcode clear zone across the bottom.
   * The clear zone is fixed by the carrier at 5/8 inch, so everything else is
   * measured back from it rather than forward from the top, which is how the
   * "address block" label ended up printed through the return address. */
  const clearH = inch(0.625);
  const zoneTop = m.y + m.h - clearH - inch(0.10);
  const topBand = m.y + inch(0.16);

  // Indicia, top right.
  const iw = inch(1.55), ih = inch(0.60);
  const ix = R - iw, iy = topBand;
  ctx.strokeStyle = 'rgba(18,49,78,.45)';
  ctx.lineWidth = Math.max(1, inch(0.006));
  ctx.setLineDash([inch(0.05), inch(0.04)]);
  ctx.strokeRect(ix, iy, iw, ih);
  ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const indicia = (copy.indicia || 'NONPROFIT ORG\nU.S. POSTAGE\nPAID\nPERMIT NO. ___').split('\n');
  const ip = ih / (indicia.length + 0.6);
  setFont(ctx, { family: 'Barlow Condensed', weight: 600 }, ip * 0.78, 0.04);
  indicia.forEach((line, i) => ctx.fillText(line, ix + iw / 2, iy + ip * (i + 0.8)));

  // Return address, top left.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(18,49,78,.85)';
  const ret = (copy.returnAddress || '').trim().split('\n').filter(Boolean).slice(0, 3);
  const rp = inch(0.115);
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, rp, 0.01);
  ret.forEach((line, i) => ctx.fillText(line, L, topBand + rp * (1.0 + 1.24 * i)));

  // Address block, under both, and clear of the zone under it.
  const ap = inch(0.155);
  const sample = ['JOHN Q SAMPLE', '123 MAIN STREET', 'SALEM NH 03079-1234'];
  const blockH = ap * 1.3 * sample.length;
  const blockTop = zoneTop - inch(0.10) - blockH;
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, inch(0.085), 0.12);
  ctx.fillStyle = 'rgba(18,49,78,.45)';
  ctx.fillText('ADDRESS BLOCK, MAIL HOUSE FILLS', L, blockTop - inch(0.07));
  ctx.fillStyle = 'rgba(18,49,78,.38)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, ap, 0.02);
  sample.forEach((line, i) => ctx.fillText(line, L, blockTop + ap * (1.0 + 1.3 * i)));

  // Barcode clear zone across the bottom.
  ctx.strokeStyle = 'rgba(191,10,48,.55)';
  ctx.setLineDash([inch(0.06), inch(0.05)]);
  ctx.lineWidth = Math.max(1, inch(0.008));
  ctx.strokeRect(m.x + inch(0.12), zoneTop, m.w - inch(0.24), clearH);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(191,10,48,.6)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, inch(0.1), 0.1);
  ctx.fillText('BARCODE CLEAR ZONE, KEEP EMPTY', m.x + inch(0.2), zoneTop + inch(0.18));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ----------------------------------------------------------------------- copy */

function paintCopy(ctx, plan, style, theme) {
  if (!plan.copy) return;
  const { align } = plan.copy;
  const left = plan.copy.x;
  const width = plan.copy.w;
  const anchor = align === 'center' ? left + width / 2 : left;
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';

  for (const it of plan.copy.items) {
    if (it.key === 'cta') {
      const padX = it.px * 0.62, padY = it.px * 0.46;
      const pillW = Math.min(width, it.widths[0] + padX * 2);
      const pillH = it.px + padY * 2;
      const px0 = align === 'center' ? anchor - pillW / 2 : left;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.30)';
      ctx.shadowBlur = it.px * 0.5;
      ctx.shadowOffsetY = it.px * 0.14;
      ctx.fillStyle = theme.ctaBg;
      clipBlock(ctx, px0, it.absY, pillW, pillH, pillH * 0.30);
      ctx.fill();
      ctx.restore();
      clearShadow(ctx);
      ctx.fillStyle = theme.ctaText;
      setFont(ctx, it.font, it.px, it.ls);
      ctx.textAlign = 'center';
      ctx.fillText(it.lines[0], px0 + pillW / 2, it.absY + padY + it.px * 0.80);
      ctx.textAlign = align === 'center' ? 'center' : 'left';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      continue;
    }

    ctx.fillStyle = it.role === 'accent' ? theme.accent
      : it.role === 'primary' ? theme.primary
      : theme.secondary;
    setFont(ctx, it.font, it.px, it.ls);
    // The shadow is there to lift type off a dark ground or a photo. On a light
    // ground it only makes the letterforms muddy.
    if (it.role === 'primary' && style.headlineShadow !== false && !theme.light) {
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = it.px * 0.24;
      ctx.shadowOffsetY = it.px * 0.05;
    }
    it.lines.forEach((line, i) => {
      // Two-tone headline: the first line carries the accent, as on the sheet.
      if (it.role === 'primary' && style.twoTone !== false && it.lines.length > 1 && i === 0) {
        ctx.fillStyle = theme.headline2;
      } else if (it.role === 'primary') {
        ctx.fillStyle = theme.primary;
      }
      ctx.fillText(line, anchor, it.absY + it.lineH * i + it.px * 0.82);
    });
    clearShadow(ctx);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // Rule under the kicker, on a left-aligned column only.
    if (it.key === 'kicker' && align !== 'center') {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(left, it.absY + it.h + it.px * 0.30, Math.min(width, it.px * 3.2), Math.max(2, it.px * 0.12));
    }
  }
}

/* ----------------------------------------------------------------- disclaimer */

function paintDisclaimer(ctx, plan, style, theme) {
  const d = plan.disclaimer;
  if (!d) return;
  const centre = d.centreOn ?? plan.canvas.w / 2;
  const { band } = bandMetrics(plan, style);
  // Inside the navy band the copy has to go light, and it centres in the band.
  const onBand = band > 0 && d.y > plan.canvas.h - band;
  ctx.fillStyle = onBand ? 'rgba(255,255,255,.80)' : theme.disclaimer;
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, d.px, 0.02);
  ctx.textAlign = 'center';
  ctx.textBaseline = onBand ? 'middle' : 'alphabetic';
  ctx.fillText(d.text, centre, onBand ? plan.canvas.h - band / 2 + d.px * 0.06 : d.y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function paintLogo(ctx, plan, style, assets) {
  const img = assets.logo;
  if (!img) return;
  const s = plan.s;
  const maxW = s * (style.logoScale || 0.16);
  const scale = Math.min(maxW / img.width, (s * 0.11) / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  const pos = style.logoPos || 'top-right';
  const m = plan.pad * 0.7;
  const x = pos.includes('left') ? m : plan.canvas.w - m - dw;
  const y = pos.includes('bottom') ? plan.canvas.h - m - dh - (plan.disclaimer ? plan.disclaimer.px * 2 : 0) : m;
  ctx.drawImage(img, x, y, dw, dh);
}


/* ------------------------------------------------------------------- ballot ---
 *
 * A mock ballot with every oval already filled. The point is recognition: what
 * is on the card has to look like what is in the booth, or it teaches nothing.
 */

/** One ballot oval. Filled means marked, which is the whole instruction. */
function paintOval(ctx, o, ink, filled) {
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, o.ry * 0.14);
  ctx.strokeStyle = ink;
  ctx.stroke();
  if (!filled) return;
  /* Solid to the ring. A pen mark fills the oval; it does not leave a ring of
   * paper inside one. At 0.80 of the radius it left a gap that read as white
   * space on white stock and as a bright halo on Navy and Pine, which is an
   * unmarked oval on a card whose whole instruction is to mark it. */
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
}

function paintBallotRows(ctx, rows, style, opts) {
  opts = { ...opts, style };
  const ink = opts.ink;
  const accent = style.accent || BRAND.green;
  ctx.textBaseline = 'alphabetic';
  for (const r of rows) {
    if (opts.stripe) {
      ctx.fillStyle = 'rgba(18,49,78,.035)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    paintOval(ctx, r.oval, ink, true);
    const c = r.candidate;
    const namePx = r.namePx ?? Math.min(r.h * 0.46, r.px * 0.82);
    const firstPx = r.firstPx ?? Math.min(r.h * 0.22, r.px * 0.42);
    /* The name block is centred in the row as a block, not hung off fractions
     * of the row height. Positioned by fractions, a tall row pulled the first
     * name and the surname to opposite ends of it. */
    const firstTxt = firstLine(c, opts.style || {});
    const stack = (firstTxt ? firstPx * 1.25 : 0) + namePx;
    const top = r.y + (r.h - stack) / 2;
    ctx.textAlign = 'left';
    if (firstTxt) {
      ctx.fillStyle = opts.quiet;
      setFont(ctx, { family: 'Barlow Condensed', weight: 600 }, firstPx, 0.05);
      ctx.fillText(firstTxt, r.textX, top + firstPx * 0.86);
    }
    ctx.fillStyle = ink;
    setFont(ctx, { family: 'Anton', weight: 400 }, namePx, -0.005);
    ctx.fillText(c.last, r.textX, top + stack - (firstTxt ? namePx * 0.16 : namePx * 0.16));

    if (opts.party && r.w > namePx * 7) {
      const px = firstPx * 0.92;
      ctx.textAlign = 'right';
      ctx.fillStyle = accent;
      setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, px, 0.12);
      ctx.fillText('REPUBLICAN', r.x + r.w - px * 0.6, r.y + r.h / 2 + px * 0.34);
    }
    // A hairline between rows, the way a printed ballot separates them.
    if (opts.rule) {
      ctx.fillStyle = 'rgba(18,49,78,.14)';
      ctx.fillRect(r.x + r.w * 0.03, r.y + r.h - 1, r.w * 0.94, 1);
    }
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function paintBallot(ctx, plan, style, theme) {
  const b = plan.ballot;
  const { w } = plan.canvas;
  const accent = style.accent || BRAND.green;
  const ink = style.plateColor || BRAND.navy;

  // The card is always light. A ballot is printed on paper and reads as paper.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.22)';
  ctx.shadowBlur = plan.s * 0.020;
  ctx.shadowOffsetY = plan.s * 0.006;
  ctx.fillStyle = BRAND.white;
  roundRect(ctx, b.card.x, b.card.y, b.card.w, b.card.h, CORNER);
  ctx.fill();
  ctx.restore();
  clearShadow(ctx);

  // Header: the instruction, in the accent, exactly as the ballot words it.
  const hb = b.rule;
  ctx.fillStyle = accent;
  roundRect(ctx, b.card.x, b.card.y, b.card.w, b.headerH, CORNER);
  ctx.fill();
  ctx.fillRect(b.card.x, b.card.y + b.headerH - plan.s * 0.014, b.card.w, plan.s * 0.014);
  ctx.fillStyle = BRAND.white;
  setFont(ctx, hb.font, hb.px, hb.ls);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  hb.lines.forEach((l, i) => ctx.fillText(l, b.card.x + b.card.w / 2,
    b.card.y + (b.headerH - hb.h) / 2 + hb.lh * (i + 0.80)));

  paintBallotRows(ctx, b.rows, style, {
    ink, quiet: 'rgba(18,49,78,.62)', party: true, rule: true, stripe: false,
  });

  // The copy column.
  paintBands(ctx, b.bands, plan, style, theme, b.copyRect, !b.wide);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* Draw the bands a solver positioned. Every y comes from the plan; nothing
 * here advances a cursor of its own. The painter used to walk the same list and
 * add the same gaps again, which is two places to get one number right: on the
 * spotlight they disagreed and the call to action landed on top of the chips. */
function paintBands(ctx, bands, plan, style, theme, box, centred) {
  const tx = centred ? box.x + box.w / 2 : box.x;
  ctx.textBaseline = 'alphabetic';
  for (const b of bands) {
    const blk = b.block;
    ctx.textAlign = centred ? 'center' : 'left';
    if (b.role === 'cta') {
      const padX = blk.px * 0.62;
      const boxH = b.h;
      const tw = Math.min(box.w, widthOf(ctx, blk, blk.lines[0]) + padX * 2);
      const bx = centred ? tx - tw / 2 : box.x;
      ctx.fillStyle = theme.ctaBg;
      clipBlock(ctx, bx, b.y, tw, boxH, boxH * 0.30);
      ctx.fill();
      ctx.fillStyle = theme.ctaText;
      setFont(ctx, blk.font, blk.px, blk.ls);
      ctx.textAlign = 'center';
      ctx.fillText(blk.lines[0], bx + tw / 2, b.y + (boxH + blk.px * 0.72) / 2);
      continue;
    }
    // The callout is set as speech: a rule down the side, never quote marks,
    // because curly quotes on a graphic read as a meme.
    if (b.role === 'callout' && !centred) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(box.x, b.y, Math.max(2, plan.s * 0.005), blk.h * 1.02);
    }
    const x = b.role === 'callout' && !centred ? box.x + plan.s * 0.022 : tx;
    blk.lines.forEach((l, i) => {
      ctx.fillStyle = b.role === 'kicker' ? theme.accent
        : b.role === 'headline'
          ? ((style.twoTone !== false && blk.lines.length > 1 && i === 0) ? theme.headline2 : theme.primary)
          : b.role === 'callout' ? theme.primary : theme.secondary;
      setFont(ctx, blk.font, blk.px, blk.ls);
      ctx.fillText(l, x, b.y + blk.lh * (i + 0.84));
    });
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** Width of an already-fitted block's line at its own size. */
function widthOf(ctx, blk, line) {
  setFont(ctx, blk.font, blk.px, blk.ls);
  return ctx.measureText(line || '').width;
}

/* --------------------------------------------------------- palm card back --- */

function paintPalmBack(ctx, plan, style, theme, assets, bleed) {
  const p = plan.palmback;
  const { w, h } = plan.canvas;
  const accent = theme.accent;
  const ink = theme.band;          // blocks
  const text = theme.primary;      // words

  // Masthead, the same navy block the front wears, so the two sides match.
  const mastBottom = p.mast.y + p.mast.h - plan.pad * 0.3;
  ctx.fillStyle = ink;
  ctx.fillRect(-bleed, -bleed, w + bleed * 2, mastBottom + bleed);
  ctx.fillStyle = accent;
  ctx.fillRect(-bleed, mastBottom, w + bleed * 2, Math.max(3, w * 0.010));

  let y = p.mast.y + plan.pad * 0.15;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (p.mast.kicker.lines.length) {
    ctx.fillStyle = style.plateAccent || BRAND.mint;
    setFont(ctx, p.mast.kicker.font, p.mast.kicker.px, p.mast.kicker.ls);
    for (const l of p.mast.kicker.lines) { y += p.mast.kicker.lh; ctx.fillText(l, w / 2, y - p.mast.kicker.lh * 0.24); }
    y += h * 0.004;
  }
  const hd = p.mast.headline;
  hd.lines.forEach((line, i) => {
    ctx.fillStyle = (style.twoTone !== false && hd.lines.length > 1 && i === 0)
      ? (style.plateAccent || BRAND.mint) : BRAND.white;
    setFont(ctx, hd.font, hd.px, hd.ls);
    ctx.fillText(line, w / 2, y + hd.lh * (i + 0.82));
  });

  // The record. A check, then the thing done. No bullets: a check is a claim.
  if (p.record.rows.length) {
    let ry = p.record.y;
    const cx = p.record.x + p.record.px * 0.42;
    for (const row of p.record.rows) {
      paintCheck(ctx, cx, ry + row.h * 0.42, p.record.px * 0.40, accent);
      ctx.fillStyle = text;
      ctx.textAlign = 'left';
      setFont(ctx, row.font, row.px, row.ls);
      row.lines.forEach((l, i) => ctx.fillText(l, p.record.x + p.record.px * 1.05, ry + row.lh * (i + 0.86)));
      ry += row.h + h * 0.0085 * (p.q ?? 1);
    }
  }

  // The issues, boxed, two across.
  for (const cell of p.grid.cells) {
    ctx.fillStyle = theme.cell;
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, CORNER);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(cell.x, cell.y, Math.max(2, w * 0.006), cell.h);
    const blk = cell.block;
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    setFont(ctx, blk.font, blk.px, blk.ls);
    blk.lines.forEach((l, i) => ctx.fillText(l, cell.x + w * 0.024,
      cell.y + (cell.h - blk.h) / 2 + blk.lh * (i + 0.82)));
  }

  // The one line worth remembering, with a rule beside it.
  if (p.callout.block.lines.length) {
    const c = p.callout.block;
    ctx.fillStyle = accent;
    ctx.fillRect(p.callout.x, p.callout.y, Math.max(3, w * 0.008), c.h * 1.04);
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    setFont(ctx, c.font, c.px, c.ls);
    c.lines.forEach((l, i) => ctx.fillText(l, p.callout.x + w * 0.034, p.callout.y + c.lh * (i + 0.84)));
  }

  // The ovals: the instruction, then the names, on a tint so it reads as a step
  // rather than more argument.
  const ov = p.ovals;
  ctx.fillStyle = theme.step;
  ctx.fillRect(-bleed, ov.y, w + bleed * 2, ov.h + bleed);
  ctx.fillStyle = accent;
  ctx.fillRect(-bleed, ov.y, w + bleed * 2, Math.max(2, w * 0.005));
  const rb = ov.rule;
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  setFont(ctx, rb.font, rb.px, rb.ls);
  rb.lines.forEach((l, i) => ctx.fillText(l, w / 2, ov.y + h * 0.016 + rb.lh * (i + 0.86)));
  paintBallotRows(ctx, ov.rows, style, {
    ink: text,
    quiet: theme.light ? 'rgba(18,49,78,.60)' : 'rgba(255,255,255,.66)',
    party: false, rule: false, stripe: false,
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** A tick. Two strokes, drawn rather than typed, so no font has to carry it. */
function paintCheck(ctx, cx, cy, r, colour) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, r * 0.34);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy);
  ctx.lineTo(cx - r * 0.16, cy + r * 0.48);
  ctx.lineTo(cx + r * 0.68, cy - r * 0.56);
  ctx.stroke();
  ctx.restore();
}

/** A cross, for the column that is not ours. */
function paintCross(ctx, cx, cy, r, colour) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, r * 0.30);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.52, cy - r * 0.52);
  ctx.lineTo(cx + r * 0.52, cy + r * 0.52);
  ctx.moveTo(cx + r * 0.52, cy - r * 0.52);
  ctx.lineTo(cx - r * 0.52, cy + r * 0.52);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- spotlight --- */

function paintSpotlight(ctx, plan, style, theme, assets) {
  const sp = plan.spotlight;
  const centred = !sp.wide && style.align !== 'left';
  paintBands(ctx, sp.bands, plan, style, theme, sp.copyRect, centred);

  // The rest of the slate, small, with surnames only. Present, not competing.
  for (const chip of sp.chips) {
    const img = assets.portraits && assets.portraits[chip.candidate.name];
    if (img) {
      const sc = Math.min(chip.photo.w / img.width, chip.photo.h / img.height);
      const dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, chip.photo.x + (chip.photo.w - dw) / 2,
        chip.photo.y + chip.photo.h - dh, dw, dh);
    } else {
      paintSilhouette(ctx, chip.photo, theme);
    }
    const px = chip.w * 0.19;
    ctx.fillStyle = theme.primary;
    setFont(ctx, { family: 'Anton', weight: 400 }, px, 0);
    ctx.textAlign = 'center';
    ctx.fillText(chip.candidate.last, chip.x + chip.w / 2, chip.plate.y + px * 0.92);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ------------------------------------------------------------------ versus --- */

function paintVersus(ctx, plan, style, theme, assets) {
  const v = plan.versus;
  const accent = style.accent || BRAND.green;
  const ink = theme.primary;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  let y = v.head.y;
  if (v.head.kicker.lines.length) {
    ctx.fillStyle = theme.accent;
    setFont(ctx, v.head.kicker.font, v.head.kicker.px, v.head.kicker.ls);
    v.head.kicker.lines.forEach((l, i) => ctx.fillText(l, plan.canvas.w / 2, y + v.head.kicker.lh * (i + 0.84)));
    y += v.head.kicker.h + plan.s * 0.008;
  }
  v.head.headline.lines.forEach((l, i) => {
    ctx.fillStyle = (style.twoTone !== false && v.head.headline.lines.length > 1 && i === 0)
      ? theme.headline2 : ink;
    setFont(ctx, v.head.headline.font, v.head.headline.px, v.head.headline.ls);
    ctx.fillText(l, plan.canvas.w / 2, y + v.head.headline.lh * (i + 0.82));
  });

  // Ours in the brand green, theirs in a neutral grey. Not red: red is ours
  // everywhere else in this programme and would read as an endorsement.
  const column = (col, mine) => {
    const tint = mine ? 'rgba(47,124,78,.12)' : 'rgba(18,49,78,.07)';
    const mark = mine ? accent : '#8A93A3';
    ctx.fillStyle = tint;
    roundRect(ctx, col.x, col.y, col.w, col.h, CORNER);
    ctx.fill();
    ctx.fillStyle = mark;
    ctx.fillRect(col.x, col.y, col.w, Math.max(3, plan.s * 0.008));

    const lb = col.label;
    ctx.textAlign = 'center';
    ctx.fillStyle = mark;
    setFont(ctx, lb.font, lb.px, lb.ls);
    ctx.fillText(lb.lines[0] || '', col.x + col.w / 2, col.y + plan.s * 0.030 + lb.px * 0.84);

    let ry = col.y + plan.s * 0.030 + lb.h + plan.s * 0.020;
    const r = col.px * 0.40;
    for (const row of col.rows) {
      (mine ? paintCheck : paintCross)(ctx, col.x + plan.s * 0.034, ry + row.lh * 0.44, r, mark);
      ctx.fillStyle = mine ? ink : theme.secondary;
      ctx.textAlign = 'left';
      setFont(ctx, row.font, row.px, row.ls);
      row.lines.forEach((l, i) => ctx.fillText(l, col.x + plan.s * 0.034 + r * 1.9, ry + row.lh * (i + 0.86)));
      ry += row.h + col.rowGap;
    }
  };
  column(v.left, true);
  column(v.right, false);

  if (v.cta) {
    // The plan says how tall the pill is, so it cannot grow past what was
    // reserved for it and land on the faces below.
    const c = v.cta.block;
    const tw = Math.min(v.cta.w, widthOf(ctx, c, c.lines[0]) + c.px * 1.24);
    const bx = v.cta.x + (v.cta.w - tw) / 2;
    ctx.fillStyle = theme.ctaBg;
    clipBlock(ctx, bx, v.cta.y, tw, v.cta.h, v.cta.h * 0.30);
    ctx.fill();
    ctx.fillStyle = theme.ctaText;
    setFont(ctx, c.font, c.px, c.ls);
    ctx.textAlign = 'center';
    ctx.fillText(c.lines[0], bx + tw / 2, v.cta.y + (v.cta.h + c.px * 0.72) / 2);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ------------------------------------------------------------------- strip --- */

function paintStrip(ctx, plan, style, theme) {
  const st = plan.strip;
  const t = st.textRect;
  ctx.textBaseline = 'alphabetic';

  if (st.head.lines.length) {
    const centred = st.vertical;
    ctx.textAlign = centred ? 'center' : 'left';
    const tx = centred ? t.x + t.w / 2 : t.x;
    const top = t.y + Math.max(0, (t.h - st.head.h) / 2);
    st.head.lines.forEach((l, i) => {
      ctx.fillStyle = (style.twoTone !== false && st.head.lines.length > 1 && i === 0)
        ? theme.headline2 : theme.primary;
      setFont(ctx, st.head.font, st.head.px, st.head.ls);
      ctx.fillText(l, tx, top + st.head.lh * (i + 0.82));
    });
  }
  if (st.ctaRect && st.cta.lines.length) {
    const c = st.cta;
    const r = st.ctaRect;
    const boxH = Math.min(r.h, c.h + c.px * 0.9);
    const by = r.y + (r.h - boxH) / 2;
    ctx.fillStyle = theme.ctaBg;
    clipBlock(ctx, r.x, by, r.w, boxH, boxH * 0.30);
    ctx.fill();
    ctx.fillStyle = theme.ctaText;
    setFont(ctx, c.font, c.px, c.ls);
    ctx.textAlign = 'center';
    c.lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, by + (boxH - c.h) / 2 + c.lh * (i + 0.82)));
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}


/* ---------------------------------------------------------------- the stat --- */

/* Numbers sell, so the number is set large and the label small, with an accent
 * rule down the side of it the way the reference mailer sets its proof block. */
function paintStat(ctx, plan, style, theme) {
  const st = plan.stat;
  const box = { x: plan.pad, y: 0, w: plan.canvas.w - plan.pad * 2 };
  paintBands(ctx, st.bands, plan, style, theme, box, true);

  if (st.hero) {
    const hr = st.hero;
    const rule = Math.max(3, plan.s * 0.009);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(hr.x, hr.y, hr.w, rule);
    ctx.fillStyle = theme.primary;
    setFont(ctx, { family: 'Anton', weight: 400 }, hr.px, -0.02);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(hr.value, hr.x + hr.w / 2, hr.y + rule + hr.px * 0.86);
    if (hr.label.lines.length) {
      ctx.fillStyle = theme.secondary;
      setFont(ctx, hr.label.font, hr.label.px, hr.label.ls);
      hr.label.lines.forEach((l, i) => ctx.fillText(l, hr.x + hr.w / 2,
        hr.y + rule + hr.px * 1.02 + plan.s * 0.012 + hr.label.lh * (i + 0.84)));
    }
  }

  for (const cell of st.smalls) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(cell.x, cell.y, Math.max(2, plan.s * 0.006), cell.h);
    const pad = plan.s * 0.018;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.primary;
    setFont(ctx, cell.valueBlk.font, cell.valueBlk.px, cell.valueBlk.ls);
    ctx.fillText(cell.valueBlk.lines[0] || '', cell.x + pad, cell.y + cell.valueBlk.px * 0.88);
    if (cell.labelBlk.lines.length) {
      ctx.fillStyle = theme.secondary;
      setFont(ctx, cell.labelBlk.font, cell.labelBlk.px, cell.labelBlk.ls);
      cell.labelBlk.lines.forEach((l, i) => ctx.fillText(l, cell.x + pad,
        cell.y + cell.valueBlk.h + plan.s * 0.008 + cell.labelBlk.lh * (i + 0.84)));
    }
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ------------------------------------------------------------- the receipt --- */

/* It reads like a bill because a bill gets read. Set in the text face with the
 * amounts in a right aligned column, hairlines between the rows, and a heavier
 * rule above the total. Nothing about the document half shouts. */
function paintReceipt(ctx, plan, style, theme) {
  const r = plan.receipt;
  const d = r.doc;
  const ink = theme.primary;

  // The document sits on its own light card so it reads as a separate object
  // from the campaign's argument underneath it.
  ctx.fillStyle = theme.light ? '#FFFFFF' : 'rgba(255,255,255,.94)';
  roundRect(ctx, d.x - plan.pad * 0.35, d.y - plan.pad * 0.30,
    d.w + plan.pad * 0.70, d.h + plan.pad * 0.55, CORNER);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18,49,78,.28)';
  ctx.lineWidth = Math.max(1, plan.s * 0.0022);
  ctx.stroke();

  // Header: the document's own name, then a rule.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(18,49,78,.82)';
  setFont(ctx, d.title.font, d.title.px, d.title.ls);
  d.title.lines.forEach((l, i) => ctx.fillText(l, d.x, d.y + d.title.lh * (i + 0.86)));
  ctx.fillStyle = 'rgba(18,49,78,.45)';
  ctx.fillRect(d.x, d.y + d.headerH - plan.s * 0.012, d.w, Math.max(1, plan.s * 0.0025));

  let y = d.y + d.headerH;
  for (const row of d.rows) {
    ctx.fillStyle = '#14161A';
    ctx.textAlign = 'left';
    setFont(ctx, row.labelBlk.font, row.labelBlk.px, row.labelBlk.ls);
    row.labelBlk.lines.forEach((l, i) => ctx.fillText(l, d.x, y + row.labelBlk.lh * (i + 0.86)));
    if (row.amountBlk.lines.length) {
      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      setFont(ctx, row.amountBlk.font, row.amountBlk.px, row.amountBlk.ls);
      ctx.fillText(row.amountBlk.lines[0], d.x + d.w, y + row.amountBlk.lh * 0.86);
    }
    y += d.rowH;
    ctx.fillStyle = 'rgba(18,49,78,.14)';
    ctx.fillRect(d.x, y - d.rowH * 0.18, d.w, 1);
  }

  if (d.total) {
    ctx.fillStyle = ink;
    ctx.fillRect(d.x, y + plan.s * 0.004, d.w, Math.max(2, plan.s * 0.005));
    const ty = y + plan.s * 0.030;
    ctx.textAlign = 'left';
    setFont(ctx, d.total.label.font, d.total.label.px, d.total.label.ls);
    ctx.fillStyle = ink;
    d.total.label.lines.forEach((l, i) => ctx.fillText(l, d.x, ty + d.total.label.lh * (i + 0.86)));
    ctx.textAlign = 'right';
    setFont(ctx, d.total.value.font, d.total.value.px, d.total.value.ls);
    ctx.fillStyle = theme.accent;
    ctx.fillText(d.total.value.lines[0] || '', d.x + d.w, ty + d.total.value.px * 0.86);
  }

  paintBands(ctx, r.bands, plan, style, theme, { x: r.argX, y: 0, w: r.argW }, false);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ------------------------------------------------------------- the type-led --- */

function paintTypeLed(ctx, plan, style, theme) {
  const t = plan.typeled;
  const box = { x: plan.pad, y: 0, w: plan.canvas.w - plan.pad * 2 };
  paintBands(ctx, t.bands, plan, style, theme, box, t.centred);

  // Surnames under the identity strip, small, so the piece still says who.
  for (const f of t.faces) {
    const px = f.w * 0.20;
    ctx.fillStyle = theme.secondary;
    setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, px, 0.06);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(f.candidate.last, f.x + f.w / 2, f.y + f.h + px * 1.15);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* --------------------------------------------------------------- the source --- */

/* A number with no source is a liability, so the line has a place of its own
 * above the disclaimer rather than being squeezed into it. */
function paintSource(ctx, plan, style, theme) {
  const src = plan.source;
  if (!src) return;
  // Above the flag band and above the disclaimer. The painter owns this
  // position because the painter is what draws the band over the foot.
  const { band } = bandMetrics(plan, style);
  const floor = band > 0
    ? plan.canvas.h - band
    : plan.canvas.h - (plan.disclaimer ? plan.disclaimer.px * 1.9 : plan.pad * 0.4);
  ctx.fillStyle = theme.light ? 'rgba(18,49,78,.58)' : 'rgba(255,255,255,.62)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, src.px, 0.01);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(src.text, src.centreOn ?? plan.canvas.w / 2, floor - src.px * 0.5);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* --------------------------------------------------------------------- QR --- */

/* Dark on light, never inverted, with a quiet zone of four modules that no art
 * may enter. On a dark ground the code gets its own white card, because a light
 * code on a dark field is the reliable way to make a scanner give up. */
function paintQr(ctx, block, theme, plan) {
  if (!block || !block.code) return;
  const { code, size } = block;
  const quiet = 4;
  const per = size / (code.size + quiet * 2);
  ctx.save();
  // The card, including the quiet zone.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(block.x, block.y, size, size);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (!code.modules[y][x]) continue;
      // Ceil the module size so neighbouring dark modules meet. A hairline of
      // white between them is what stops a code scanning off cheap stock.
      ctx.fillRect(
        block.x + (quiet + x) * per,
        block.y + (quiet + y) * per,
        Math.ceil(per), Math.ceil(per),
      );
    }
  }
  ctx.restore();

  if (block.label && block.label.lines.length) {
    const lb = block.label;
    ctx.fillStyle = theme.secondary;
    setFont(ctx, lb.font, lb.px, lb.ls);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Clamp the label inside the piece. The code is often right aligned and the
    // URL is wider than the code, so centring it on the square walks the text
    // off the edge of the artwork.
    const half = (lb.w || ctx.measureText(lb.lines[0]).width) / 2;
    const margin = plan.pad * 0.5;
    const cx = Math.min(
      Math.max(block.centreOn ?? block.x + size / 2, margin + half),
      plan.canvas.w - margin - half,
    );
    ctx.fillText(lb.lines[0], cx, block.y + size + lb.lh * 0.94);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
}

/* -------------------------------------------------------------- hanger die --- */

/* The die line and the hang hole, drawn on the artwork so nothing important is
 * laid out where the printer is going to cut. It is a guide, not ink: the
 * printer works from their own die, and this is what stops a face being
 * punched out of the middle of the tab. */
function paintHangerDie(ctx, plan, style) {
  const { w } = plan.canvas;
  const d = plan.hangerDie;
  if (!d) return;
  const paths = () => {
    ctx.beginPath();
    ctx.ellipse(d.hole.cx, d.hole.cy, d.hole.r, d.hole.r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(d.slot.cx, d.slot.cy, d.slot.rx, d.slot.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d.tabLine.x, d.tabLine.y);
    ctx.lineTo(d.tabLine.x + d.tabLine.w, d.tabLine.y);
    ctx.stroke();
  };
  ctx.save();
  ctx.setLineDash([w * 0.016, w * 0.012]);
  // Twice, light under dark. The tab is usually a navy masthead and a navy
  // guide on it is invisible, which is the one thing a guide may not be.
  ctx.lineWidth = Math.max(3, w * 0.0075);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  paths();
  ctx.lineWidth = Math.max(1.5, w * 0.0032);
  ctx.strokeStyle = 'rgba(18,49,78,.55)';
  paths();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ---------------------------------------------------------------------- entry */

/* --------------------------------------------------- the mail pair: one band */

/* Two colourways, both derived from the palette rather than written down.
 *
 * On a light ground the headline is plain type with an accent rule under it and
 * the name band is the plate colour. On a dark ground the headline sits in a
 * solid accent block and the name band is the accent. That is how the
 * committee's own artwork sets the two versions of this layout, and it is one
 * rule rather than two designs.
 */
function paintSlateBand(ctx, plan, style, theme, assets, bleed = 0) {
  const b = plan.band;
  const { w, h } = plan.canvas;
  const B = bleed;
  const accent = style.accent || BRAND.green;
  const plate = style.plateColor || BRAND.navy;
  const ink = theme.primary;
  const dark = b.onDark;

  /* The scene behind the slate. It is drawn to cover its band, cropped rather
   * than squashed, with a veil over it so a row of cut-out people separates
   * from whatever is behind them. */
  const scene = assets && assets.hero;
  if (b.photo && scene && style.mailArt !== false) {
    const r = b.photo;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x - B, r.y - (r.y <= 0 ? B : 0), r.w + B * 2, r.h + (r.y <= 0 ? B : 0));
    ctx.clip();
    const k = Math.max((r.w + B * 2) / scene.width, r.h / scene.height);
    const dw = scene.width * k;
    const dh = scene.height * k;
    ctx.drawImage(scene, r.x - B + (r.w + B * 2 - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
    /* Heaviest under the words at the top, lightest across the middle where the
     * faces stand, and back up a little at the foot so the band has something
     * to sit against. */
    const veil = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    const [vr, vg, vb] = dark ? [10, 22, 38] : [255, 255, 255];
    veil.addColorStop(0, `rgba(${vr},${vg},${vb},${dark ? 0.78 : 0.90})`);
    veil.addColorStop(0.42, `rgba(${vr},${vg},${vb},${dark ? 0.70 : 0.84})`);
    veil.addColorStop(0.72, `rgba(${vr},${vg},${vb},${dark ? 0.42 : 0.52})`);
    veil.addColorStop(1, `rgba(${vr},${vg},${vb},${dark ? 0.50 : 0.40})`);
    ctx.fillStyle = veil;
    ctx.fillRect(r.x - B, r.y, r.w + B * 2, r.h);
    ctx.restore();
  }

  /* Left in the column beside a short slate, centred over a full one. The
   * words are a column there, and a centred column of three lines against a
   * left hand edge of faces reads as neither one thing nor the other. */
  const left = b.align === 'left';
  const anchor = left ? b.top.x : b.topCx;

  /* The headline. In a block on a dark ground, on a rule on a light one. */
  if (b.head) {
    const blk = b.head.block;
    if (dark) {
      ctx.fillStyle = accent;
      ctx.fillRect(b.top.x - b.pad * 0.4, b.head.y, b.top.w + b.pad * 0.8, blk.h + b.head.pad * 2);
    }
    ctx.fillStyle = dark ? BRAND.white : plate;
    setFont(ctx, blk.font, blk.px, blk.ls);
    ctx.textAlign = left ? 'left' : 'center';
    ctx.textBaseline = 'alphabetic';
    blk.lines.forEach((l, i) =>
      ctx.fillText(l, anchor, b.head.y + b.head.pad + blk.lh * (i + 0.84)));
    if (b.head.ruleH) {
      ctx.fillStyle = accent;
      ctx.fillRect(b.top.x, b.head.ruleY, b.top.w, b.head.ruleH);
    }
  }

  if (b.sub) {
    const blk = b.sub.block;
    ctx.fillStyle = dark ? 'rgba(255,255,255,.86)' : plate;
    setFont(ctx, blk.font, blk.px, blk.ls);
    ctx.textAlign = left ? 'left' : 'center';
    blk.lines.forEach((l, i) => ctx.fillText(l, anchor, b.sub.y + blk.lh * (i + 0.86)));
  }

  /* The figures. Contained by height and centred on the slot, so a tall
   * portrait and a short one stand on the same floor, and drawn left to right
   * so each overlaps the one before: a row of people, not a row of stamps. */
  for (const f of b.figures) {
    const img = assets.portraits && assets.portraits[f.candidate.name];
    const slot = f.slot;
    if (img) {
      /* Everybody the same height, standing on the band.
       *
       * A wide crop is trimmed at the sides rather than scaled down: shrinking
       * it to fit the slot left that person shorter than the row and floating
       * above the band, which reads as a mistake. Cropping keeps the heads the
       * same size and the shoulders where they belong, which is what a row of
       * people photographed separately needs in order to look like a row. */
      const k = slot.h / img.height;
      const dw = img.width * k;
      const cx0 = slot.x + slot.w / 2;
      /* A back row is cut at the line the row in front of it starts on, so its
       * body does not hang in the gaps between the people standing in front. */
      const cut = f.clipH != null && f.clipH < slot.h ? f.clipH : slot.h;
      if (dw > f.maxW || cut < slot.h) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx0 - f.maxW / 2, slot.y, f.maxW, cut);
        ctx.clip();
        ctx.drawImage(img, cx0 - dw / 2, slot.y, dw, slot.h);
        ctx.restore();
      } else {
        ctx.drawImage(img, cx0 - dw / 2, slot.y, dw, slot.h);
      }
    } else {
      // An absence, said plainly, with no box round it: a box here would read
      // as a design choice and go to press.
      ctx.save();
      ctx.fillStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(18,49,78,.12)';
      const fw = slot.w * 0.62;
      const fx = slot.x + (slot.w - fw) / 2;
      ctx.beginPath();
      ctx.arc(fx + fw / 2, slot.y + slot.h - fw * 1.30, fw * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(fx, slot.y + slot.h);
      ctx.quadraticCurveTo(fx, slot.y + slot.h - fw * 0.86, fx + fw / 2, slot.y + slot.h - fw * 0.86);
      ctx.quadraticCurveTo(fx + fw, slot.y + slot.h - fw * 0.86, fx + fw, slot.y + slot.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = dark ? 'rgba(255,255,255,.80)' : 'rgba(18,49,78,.70)';
      setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, Math.max(8, slot.w * 0.085), 0.06);
      ctx.textAlign = 'center';
      ctx.fillText('PHOTO NEEDED', slot.x + slot.w / 2, slot.y + slot.h - fw * 1.78);
      ctx.restore();
    }
  }

  /* What the slate leaves over. A small district frees most of the piece and
   * the words move into it; a middling one frees a block, and the block says
   * when to vote and how many to mark; a full one frees a strip, and the strip
   * is an accent bar with the date beside it. A full slate frees nothing and
   * there is nothing here to paint. */
  if (b.aside && b.aside.tier !== 'words') {
    const a = b.aside;
    const r = a.rect;
    const barW = Math.max(3, r.w * 0.085);
    const deep = r.h + (a.bleedFoot ? B : 0);
    if (a.tier === 'plate') {
      ctx.fillStyle = dark ? accent : plate;
      ctx.fillRect(r.x, r.y, r.w, deep);
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(r.x, r.y, barW, deep);
    }
    const tx = a.tier === 'plate' ? r.x + r.w / 2 : r.x + barW + (r.w - barW) / 2;
    ctx.textAlign = 'center';
    for (const part of [a.kicker, a.date, a.note]) {
      if (!part) continue;
      const blk = part.block;
      ctx.fillStyle = a.tier === 'plate' ? BRAND.white : (dark ? BRAND.white : plate);
      setFont(ctx, blk.font, blk.px, blk.ls);
      blk.lines.forEach((l, i) => ctx.fillText(l, tx, part.y + blk.lh * (i + 0.84)));
    }
  }

  /* A band of names under each row of faces. */
  for (const row of b.rows || []) {
    if (!row.band) continue;            // a montage has one band, under the group
    ctx.fillStyle = dark ? accent : plate;
    ctx.fillRect(row.band.x - B, row.band.y, row.band.w + B * 2,
      row.band.h + (row.bleedFoot ? B : 0));
  }
  if (b.rows && b.rows.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = BRAND.white;
    for (const f of b.figures) {
      setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, f.name.px, 0.03);
      ctx.fillText(f.name.text.toUpperCase(),
        f.nameBox.x + f.nameBox.w / 2, f.nameBox.y + (f.nameBox.h + f.name.px * 0.72) / 2);
    }
  }

  // The town and the district, under the band.
  if (b.seat) {
    const blk = b.seat.block;
    ctx.fillStyle = ink;
    setFont(ctx, blk.font, blk.px, blk.ls);
    ctx.textAlign = left ? 'left' : 'center';
    blk.lines.forEach((l, i) =>
      ctx.fillText(l, left ? b.top.x : b.footCx, b.seat.y + blk.lh * (i + 0.84)));
  }

  /* The call to action: a solid block, square, the width of its own words. A
   * side of this programme that does not say when to vote has not finished. */
  if (b.cta) {
    const blk = b.cta.block;
    const x = b.cta.x;
    ctx.fillStyle = dark ? accent : (theme.ctaBg || accent);
    ctx.fillRect(x, b.cta.y, b.cta.w, b.cta.h);
    ctx.fillStyle = BRAND.white;
    setFont(ctx, blk.font, blk.px, blk.ls);
    ctx.textAlign = 'center';
    ctx.fillText(blk.lines[0], x + b.cta.w / 2, b.cta.y + (b.cta.h + blk.px * 0.74) / 2);
  }

  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* The poster: the figure, then the words over the ground it stands on.
 *
 * The ground gets a vignette rather than a flat fill. A social graphic is
 * looked at on a screen next to a hundred other rectangles, and a flat panel of
 * one colour is the one that reads as a placeholder. */
/* ------------------------------------------------------------- the marks
 *
 * Drawings, not photographs. A photograph of a tax form is a photograph. A
 * drawing of one is an argument, it costs nothing, it has no licence attached,
 * and it is as sharp at 300 dpi as at 72. Each one is flat geometry so the
 * printer has nothing to trap.
 */
const MARKS = {
  /* A tax return with the line that matters filled in for you. */
  form(ctx, r, ink, accent) {
    const pw = r.w * 0.80;
    const ph = Math.min(r.h * 0.92, pw * 1.30);
    const x = r.x + (r.w - pw) / 2;
    const y = r.y + (r.h - ph) / 2;
    ctx.globalAlpha = 0.10; ctx.fillStyle = ink; ctx.fillRect(x, y, pw, ph);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, pw * 0.016);
    ctx.strokeRect(x, y, pw, ph);
    const m = pw * 0.10;
    ctx.fillStyle = ink; ctx.fillRect(x + m, y + m, pw - m * 2, ph * 0.11);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.50;
      ctx.fillRect(x + m, y + ph * 0.28 + i * ph * 0.095,
        (pw - m * 2) * (i % 2 ? 0.70 : 0.92), Math.max(2, ph * 0.022));
      ctx.globalAlpha = 1;
    }
    const bh = ph * 0.19;
    const bw = (pw - m * 2) * 0.60;
    ctx.fillStyle = accent;
    ctx.fillRect(x + pw - m - bw, y + ph - m - bh, bw, bh);
  },

  /* A bill that climbs, with the month you are living in on the end of it. */
  meter(ctx, r, ink, accent) {
    const n = 6;
    const bw = r.w * 0.095;
    const gap = (r.w * 0.82 - bw * n) / (n - 1);
    const x0 = r.x + r.w * 0.09;
    const base = r.y + r.h * 0.88;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const hgt = r.h * (0.14 + t * t * 0.60);
      ctx.fillStyle = i === n - 1 ? accent : ink;
      ctx.globalAlpha = i === n - 1 ? 1 : 0.40;
      ctx.fillRect(x0 + i * (bw + gap), base - hgt, bw, hgt);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillRect(r.x + r.w * 0.06, base, r.w * 0.88, Math.max(2, r.h * 0.012));
  },

  /* The sign that went up before your kids could put in an offer. */
  sold(ctx, r, ink, accent) {
    const bw = r.w * 0.80;
    const bh = bw * 0.54;
    const x = r.x + (r.w - bw) / 2;
    const y = r.y + r.h * 0.24;
    const pw = Math.max(3, bw * 0.045);
    ctx.globalAlpha = 0.50; ctx.fillStyle = ink;
    ctx.fillRect(x + bw * 0.16, y + bh, pw, r.h * 0.34);
    ctx.fillRect(x + bw * 0.80, y + bh, pw, r.h * 0.34);
    ctx.globalAlpha = 0.12; ctx.fillRect(x, y, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, bw * 0.020);
    ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = accent;
    ctx.fillRect(x + bw * 0.08, y - bh * 0.29, bw * 0.84, bh * 0.30);
    ctx.globalAlpha = 0.60; ctx.fillStyle = ink;
    ctx.fillRect(x + bw * 0.12, y + bh * 0.32, bw * 0.76, Math.max(2, bh * 0.085));
    ctx.fillRect(x + bw * 0.12, y + bh * 0.56, bw * 0.50, Math.max(2, bh * 0.085));
    ctx.globalAlpha = 1;
  },

  /* A tax bill going up a staircase with no top step. */
  stairs(ctx, r, ink, accent) {
    const n = 4;
    const sw = r.w * 0.76 / n;
    const sh = r.h * 0.68 / (n + 1);
    const x0 = r.x + r.w * 0.10;
    const base = r.y + r.h * 0.86;
    ctx.globalAlpha = 0.40; ctx.fillStyle = ink;
    for (let i = 0; i < n; i++) ctx.fillRect(x0 + i * sw, base - sh * (i + 1), sw, sh * (i + 1));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, r.w * 0.022);
    ctx.lineCap = 'square';
    ctx.setLineDash([r.w * 0.055, r.w * 0.040]);
    ctx.beginPath();
    ctx.moveTo(x0 + (n - 1) * sw, base - sh * n);
    ctx.lineTo(x0 + n * sw, base - sh * n);
    ctx.lineTo(x0 + n * sw, base - sh * (n + 1.7));
    ctx.stroke();
    ctx.setLineDash([]);
  },

  /* The schoolhouse door, with somebody standing in it. */
  door(ctx, r, ink, accent) {
    const dw = r.w * 0.54;
    const dh = Math.min(r.h * 0.86, dw * 1.70);
    const x = r.x + (r.w - dw) / 2;
    const y = r.y + (r.h - dh) / 2;
    ctx.globalAlpha = 0.12; ctx.fillStyle = ink; ctx.fillRect(x, y, dw, dh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(3, dw * 0.055);
    ctx.strokeRect(x, y, dw, dh);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x + dw * 0.82, y + dh * 0.56, Math.max(3, dw * 0.050), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(x - dw * 0.18, y + dh * 0.40, dw * 1.36, dh * 0.11);
  },

  /* The invoice with the prices taken out of it. */
  redacted(ctx, r, ink, accent) {
    const pw = r.w * 0.80;
    const ph = Math.min(r.h * 0.92, pw * 1.24);
    const x = r.x + (r.w - pw) / 2;
    const y = r.y + (r.h - ph) / 2;
    ctx.globalAlpha = 0.10; ctx.fillStyle = ink; ctx.fillRect(x, y, pw, ph);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, pw * 0.016);
    ctx.strokeRect(x, y, pw, ph);
    const m = pw * 0.10;
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const ly = y + ph * 0.18 + i * ph * 0.150;
      ctx.globalAlpha = 0.45; ctx.fillStyle = ink;
      ctx.fillRect(x + m, ly, (pw - m * 2) * 0.40, Math.max(2, ph * 0.028));
      ctx.globalAlpha = 1;
      ctx.fillStyle = i === rows - 1 ? accent : 'rgba(6,12,20,.92)';
      ctx.fillRect(x + pw - m - (pw - m * 2) * 0.40, ly - ph * 0.016,
        (pw - m * 2) * 0.40, Math.max(3, ph * 0.058));
    }
  },
};

/* The message side of an issue round, with nobody's face on it. Dark on
 * purpose: it must not look like the side with the people on it. */
function paintContrast(ctx, plan, style, theme, assets, bleed = 0) {
  const c = plan.contrast;
  const { w, h } = plan.canvas;
  const B = bleed;
  const accent = style.accent || BRAND.green;
  const ground = style.contrastGround || style.plateColor || BRAND.navy;
  const ink = BRAND.white;
  /* Everything set in the accent on this side is set in a version of it that
   * can be read on this ground. The solid blocks keep the accent itself: white
   * type on the accent is a different sum and it already carries. */
  const mark = readableOn(accent, ground, style.plateAccent, 4.5);

  ctx.fillStyle = ground;
  ctx.fillRect(-B, -B, w + B * 2, h + B * 2);

  /* A photograph if there is one, cropped to the panel and bled off the top and
   * the right, and the drawing only if there is not. */
  const shot = assets && assets.mark;
  if (c.mark && shot) {
    /* Edge to edge, cropped rather than squashed, with a scrim that is heaviest
     * on the left where the words are and lets go across the picture. */
    const r = c.mark.rect;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x - B, r.y - B, r.w + B * 2, r.h + B * 2);
    ctx.clip();
    const k = Math.max((r.w + B * 2) / shot.width, (r.h + B * 2) / shot.height);
    const dw = shot.width * k;
    const dh = shot.height * k;
    ctx.drawImage(shot, r.x - B + (r.w + B * 2 - dw) / 2,
      r.y - B + (r.h + B * 2 - dh) / 2, dw, dh);
    const [gr, gg, gb] = hexToRgb(ground);
    const scrim = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    scrim.addColorStop(0, `rgba(${gr},${gg},${gb},.96)`);
    scrim.addColorStop(0.46, `rgba(${gr},${gg},${gb},.90)`);
    scrim.addColorStop(0.68, `rgba(${gr},${gg},${gb},.52)`);
    scrim.addColorStop(1, `rgba(${gr},${gg},${gb},.30)`);
    ctx.fillStyle = scrim;
    ctx.fillRect(r.x - B, r.y - B, r.w + B * 2, r.h + B * 2);
    ctx.restore();
  } else if (c.mark && MARKS[c.mark.id]) {
    ctx.save();
    MARKS[c.mark.id](ctx, c.mark.rect, ink, accent);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const line = (at, color, x) => {
    if (!at) return;
    const blk = at.block;
    ctx.fillStyle = color;
    setFont(ctx, blk.font, blk.px, blk.ls);
    blk.lines.forEach((l, i) => ctx.fillText(l, x, at.y + blk.lh * (i + 0.84)));
  };
  line(c.kicker, mark, c.col.x);
  line(c.head, ink, c.col.x);
  line(c.number, mark, c.col.x);
  line(c.caption, 'rgba(255,255,255,.86)', c.col.x);
  line(c.source, 'rgba(255,255,255,.66)', c.inner.x);

  if (c.cta) {
    const blk = c.cta.block;
    ctx.fillStyle = accent;
    ctx.fillRect(c.cta.x, c.cta.y, c.cta.w, c.cta.h);
    ctx.fillStyle = BRAND.white;
    setFont(ctx, blk.font, blk.px, blk.ls);
    ctx.textAlign = 'center';
    ctx.fillText(blk.lines[0], c.cta.x + c.cta.w / 2,
      c.cta.y + (c.cta.h + blk.px * 0.74) / 2);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function paintPoster(ctx, plan, style, theme, bleed = 0) {
  const g = plan.poster;
  const { w, h } = plan.canvas;
  const B = bleed;
  const accent = theme.accent;
  const ink = theme.primary;

  ctx.save();
  const vig = ctx.createLinearGradient(-B, -B, w + B, h + B);
  vig.addColorStop(0, 'rgba(255,255,255,.07)');
  vig.addColorStop(0.55, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(-B, -B, w + B * 2, h + B * 2);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const b of g.bands) {
    const blk = b.block;
    if (b.role === 'bar') {
      // A solid bar, not a pill. A pill is a button; this is a title block.
      const r = g.bar;
      ctx.fillStyle = theme.light ? (style.plateColor || BRAND.navy) : 'rgba(0,0,0,.30)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = style.plateAccent || BRAND.mint;
      setFont(ctx, blk.font, blk.px, blk.ls);
      ctx.fillText(blk.lines[0], r.x + blk.px * 0.8, r.y + (r.h + blk.px * 0.72) / 2);
      continue;
    }
    ctx.fillStyle = b.role === 'kicker' ? (style.plateAccent || BRAND.mint) : ink;
    setFont(ctx, blk.font, blk.px, blk.ls);
    blk.lines.forEach((l, i) => {
      if (b.role === 'headline' && style.headlineShadow !== false) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.30)';
        ctx.shadowBlur = blk.px * 0.16;
        ctx.shadowOffsetY = blk.px * 0.045;
        ctx.fillText(l, g.col.x, b.y + blk.lh * (i + 0.84));
        ctx.restore();
        clearShadow(ctx);
        return;
      }
      ctx.fillText(l, g.col.x, b.y + blk.lh * (i + 0.84));
    });
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** Paint a solved plan. `assets` = { portraits: {name -> Image}, bgImage, logo }. */
export function paint(ctx, plan, style, assets = {}, copy = {}, bleed = 0) {
  const theme = themeFor(style);
  ctx.save();

  // The card layouts paint their own ground: they are bands, not one background.
  if (plan.palm || plan.palmback) {
    ctx.clearRect(-bleed, -bleed, plan.canvas.w + bleed * 2, plan.canvas.h + bleed * 2);
    ctx.fillStyle = cardStock(style);
    ctx.fillRect(-bleed, -bleed, plan.canvas.w + bleed * 2, plan.canvas.h + bleed * 2);
    if (plan.palm) {
      paintPalmCard(ctx, plan, style, theme, assets, bleed);
      for (const tile of plan.tiles) {
        paintTile(ctx, tile, plan, style, assets, theme);
        paintTagline(ctx, tile, style, theme);
      }
    } else {
      paintPalmBack(ctx, plan, style, theme, assets, bleed);
    }
    paintQr(ctx, plan.qr, theme, plan);
    paintDisclaimer(ctx, plan, style, theme);
    paintHangerDie(ctx, plan, style);
    ctx.restore();
    return theme;
  }

  paintBackground(ctx, plan, style, assets, bleed);
  if (plan.deck) paintDeck(ctx, plan, assets, theme);

  if (plan.spotlight) {
    for (const tile of plan.tiles) {
      paintTile(ctx, tile, plan, style, assets, theme);
      paintTagline(ctx, tile, style, theme);
    }
    paintSpotlight(ctx, plan, style, theme, assets);
  } else if (plan.ballot) {
    paintBallot(ctx, plan, style, theme);
  } else if (plan.versus) {
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintVersus(ctx, plan, style, theme, assets);
  } else if (plan.strip) {
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintStrip(ctx, plan, style, theme);
  } else if (plan.stat) {
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintStat(ctx, plan, style, theme);
  } else if (plan.receipt) {
    paintReceipt(ctx, plan, style, theme);
  } else if (plan.typeled) {
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintTypeLed(ctx, plan, style, theme);
  } else if (plan.contrast) {
    paintContrast(ctx, plan, style, theme, assets, bleed);
  } else if (plan.band) {
    paintSlateBand(ctx, plan, style, theme, assets, bleed);
  } else if (plan.poster) {
    // The figure first: the words sit on the ground it stands on, not on it.
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintPoster(ctx, plan, style, theme, bleed);
  } else {
    for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
    paintCopy(ctx, plan, style, theme);
  }

  paintQr(ctx, plan.qr, theme, plan);
  paintSource(ctx, plan, style, theme);
  paintLogo(ctx, plan, style, assets);
  paintDisclaimer(ctx, plan, style, theme);
  paintMailPanel(ctx, plan, style, copy);
  paintHangerDie(ctx, plan, style);
  ctx.restore();
  return theme;
}

/** measureText at a fixed 100px, cached. layout.js scales it linearly. */
export function makeMeasurer(ctx) {
  const cache = new Map();
  return (text, font) => {
    const key = `${font.family}|${font.weight}|${text}`;
    let v = cache.get(key);
    if (v === undefined) {
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.font = `${font.weight} 100px "${font.family}", ${font.family === 'Anton' ? 'Impact, sans-serif' : 'sans-serif'}`;
      v = ctx.measureText(text).width;
      cache.set(key, v);
    }
    return v;
  };
}
