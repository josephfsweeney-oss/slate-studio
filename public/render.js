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

/* Lightness and the foot band both live in the engine now: the engine has to
 * reserve the band this file paints, and two copies of the rule had already
 * drifted far enough to bury a source line under it. */
export { luminance, flagBand } from './layout.js';

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

/** Theme derived from whatever sits behind the copy. */
/* Card layouts paint their own bands on a white stock, so the copy on them is
 * always dark whatever the palette's ground is set to. */
const CARD_COMPS = new Set(['palmcard', 'palmback']);

export function themeFor(style) {
  if (CARD_COMPS.has(style.composition)) {
    const accent = style.accent || BRAND.green;
    return {
      light: true, primary: BRAND.navy, secondary: 'rgba(18,49,78,.80)',
      headline2: accent, accent, ctaBg: accent, ctaText: BRAND.white,
      rule: 'rgba(18,49,78,.18)', disclaimer: 'rgba(18,49,78,.70)',
    };
  }
  const bg = style.bgType === 'transparent' ? '#FFFFFF' : (style.bgColor || BRAND.navyDeep);
  const light = luminance(bg) > 0.45;
  const accent = style.accent || BRAND.green;
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
  roundRect(ctx, r.x + r.w * 0.06, r.y + r.h * 0.10, r.w * 0.88, r.h * 0.88, r.w * 0.05);
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

  if (img) {
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
  } else {
    paintSilhouette(ctx, tile.photo, theme);
  }

  if (!tile.plate) return;
  const p = tile.plate;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = tw * 0.030;
  ctx.shadowOffsetY = tw * 0.010;
  ctx.fillStyle = style.plateColor || BRAND.navyDeep;
  roundRect(ctx, p.x, p.y, p.w, p.h, tw * 0.035);
  ctx.fill();
  ctx.restore();
  clearShadow(ctx);

  // Red cap along the top edge of the plate.
  ctx.save();
  roundRect(ctx, p.x, p.y, p.w, p.h, tw * 0.035);
  ctx.clip();
  ctx.fillStyle = style.accent || BRAND.green;
  ctx.fillRect(p.x, p.y, p.w, Math.max(3, tw * 0.022));
  ctx.restore();

  const first = firstLine(c, style);
  const last = (c.last || '').toUpperCase();
  const firstPx = tw * 0.082;
  // Long surnames step down so they never overflow the plate.
  let lastPx = tw * 0.150 * Math.pow(Math.min(1, 9 / Math.max(last.length, 1)), 0.55);
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
    roundRect(ctx, r.x, r.y, r.w, r.h, r.w * 0.02);
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
  const accent = style.accent || BRAND.green;
  const ink = style.plateColor || BRAND.navy;

  // Masthead: a full-bleed navy block behind the headline.
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
    ctx.fillStyle = ink;
    setFont(ctx, a.font, a.px, a.ls);
    ctx.textAlign = 'center';
    a.lines.forEach((l, i) => ctx.fillText(l, w / 2, p.ask.y + a.lh * (i + 0.9)));
  }

  // The faces sit on a quiet tint, not on white: it groups them as one slate.
  ctx.fillStyle = theme.light ? 'rgba(47,124,78,.07)' : 'rgba(255,255,255,.07)';
  roundRect(ctx, p.panel.x, p.panel.y, p.panel.w, p.panel.h, w * 0.020);
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
  ctx.fillStyle = 'rgba(18,49,78,.12)';
  ctx.fillRect(m.x, m.y, Math.max(1, inch(0.008)), m.h);

  const L = m.x + inch(0.3);
  const R = m.x + m.w - inch(0.3);

  // Indicia, top right.
  const iw = inch(1.6), ih = inch(0.72);
  const ix = R - iw, iy = m.y + inch(0.3);
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
  const ret = (copy.returnAddress || '').trim().split('\n').filter(Boolean);
  const rp = inch(0.13);
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, rp, 0.01);
  ret.slice(0, 4).forEach((line, i) => ctx.fillText(line, L, m.y + inch(0.42) + rp * 1.22 * i));

  // Address block, lower middle, clear of the barcode zone.
  const clearH = inch(0.625);
  const ap = inch(0.17);
  const sample = ['JOHN Q SAMPLE', '123 MAIN STREET', 'SALEM NH 03079-1234'];
  const blockTop = m.y + m.h - clearH - inch(0.45) - ap * 1.3 * sample.length;
  ctx.fillStyle = 'rgba(18,49,78,.38)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 500 }, ap, 0.02);
  sample.forEach((line, i) => ctx.fillText(line, L, blockTop + ap * 1.3 * i));
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, inch(0.09), 0.12);
  ctx.fillStyle = 'rgba(18,49,78,.45)';
  ctx.fillText('ADDRESS BLOCK, MAIL HOUSE FILLS', L, blockTop - ap * 0.9);

  // Barcode clear zone across the bottom.
  ctx.strokeStyle = 'rgba(191,10,48,.55)';
  ctx.setLineDash([inch(0.06), inch(0.05)]);
  ctx.lineWidth = Math.max(1, inch(0.008));
  ctx.strokeRect(m.x + inch(0.12), m.y + m.h - clearH - inch(0.12), m.w - inch(0.24), clearH);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(191,10,48,.6)';
  setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, inch(0.1), 0.1);
  ctx.fillText('BARCODE CLEAR ZONE, KEEP EMPTY', m.x + inch(0.2), m.y + m.h - clearH + inch(0.06));
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
      roundRect(ctx, px0, it.absY, pillW, pillH, pillH / 2);
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
  // Nearly to the edge. A small dot in the middle of a thick ring reads as a
  // target; a marked ballot oval is almost solid.
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, o.rx * 0.80, o.ry * 0.74, 0, 0, Math.PI * 2);
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
  roundRect(ctx, b.card.x, b.card.y, b.card.w, b.card.h, plan.s * 0.014);
  ctx.fill();
  ctx.restore();
  clearShadow(ctx);

  // Header: the instruction, in the accent, exactly as the ballot words it.
  const hb = b.rule;
  ctx.fillStyle = accent;
  roundRect(ctx, b.card.x, b.card.y, b.card.w, b.headerH, plan.s * 0.014);
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
      roundRect(ctx, bx, b.y, tw, boxH, boxH / 2);
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
  const accent = style.accent || BRAND.green;
  const ink = style.plateColor || BRAND.navy;

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
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      setFont(ctx, row.font, row.px, row.ls);
      row.lines.forEach((l, i) => ctx.fillText(l, p.record.x + p.record.px * 1.05, ry + row.lh * (i + 0.86)));
      ry += row.h + h * 0.0085 * (p.q ?? 1);
    }
  }

  // The issues, boxed, two across.
  for (const cell of p.grid.cells) {
    ctx.fillStyle = 'rgba(47,124,78,.10)';
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, w * 0.016);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(cell.x, cell.y, Math.max(2, w * 0.006), cell.h);
    const blk = cell.block;
    ctx.fillStyle = ink;
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
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    setFont(ctx, c.font, c.px, c.ls);
    c.lines.forEach((l, i) => ctx.fillText(l, p.callout.x + w * 0.034, p.callout.y + c.lh * (i + 0.84)));
  }

  // The ovals: the instruction, then the names, on a tint so it reads as a step
  // rather than more argument.
  const ov = p.ovals;
  ctx.fillStyle = 'rgba(18,49,78,.055)';
  ctx.fillRect(-bleed, ov.y, w + bleed * 2, ov.h + bleed);
  ctx.fillStyle = accent;
  ctx.fillRect(-bleed, ov.y, w + bleed * 2, Math.max(2, w * 0.005));
  const rb = ov.rule;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  setFont(ctx, rb.font, rb.px, rb.ls);
  rb.lines.forEach((l, i) => ctx.fillText(l, w / 2, ov.y + h * 0.016 + rb.lh * (i + 0.86)));
  paintBallotRows(ctx, ov.rows, style, {
    ink, quiet: 'rgba(18,49,78,.60)', party: false, rule: false, stripe: false,
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
    roundRect(ctx, col.x, col.y, col.w, col.h, plan.s * 0.018);
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
    roundRect(ctx, bx, v.cta.y, tw, v.cta.h, v.cta.h / 2);
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
    roundRect(ctx, r.x, by, r.w, boxH, Math.min(boxH / 2, plan.s * 0.10));
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
    d.w + plan.pad * 0.70, d.h + plan.pad * 0.55, plan.s * 0.008);
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

/** Paint a solved plan. `assets` = { portraits: {name -> Image}, bgImage, logo }. */
export function paint(ctx, plan, style, assets = {}, copy = {}, bleed = 0) {
  const theme = themeFor(style);
  ctx.save();

  // The card layouts paint their own ground: they are bands, not one background.
  if (plan.palm || plan.palmback) {
    ctx.clearRect(-bleed, -bleed, plan.canvas.w + bleed * 2, plan.canvas.h + bleed * 2);
    ctx.fillStyle = style.cardGround || BRAND.ground;
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
