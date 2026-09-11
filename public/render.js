/* Slate Studio painter.
 *
 * Draws a plan from layout.js onto a 2D canvas. Preview and export call this
 * with the same plan at the same canvas size, so what you approve is what ships.
 */
import { BRAND, PHOTO_AR } from './layout.js';

/* ------------------------------------------------------------------- helpers */

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/** Perceived lightness, 0 black to 1 white. Decides whether copy goes light or dark. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

/** Theme derived from whatever sits behind the copy. */
export function themeFor(style) {
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
function bandMetrics(plan, style) {
  if (style.flagBar === false) return { rule: 0, band: 0 };
  const rule = Math.max(3, plan.s * 0.009);
  const light = luminance(style.bgType === 'transparent' ? '#FFFFFF' : (style.bgColor || '')) > 0.45;
  if (!light) return { rule, band: 0 };
  const need = plan.disclaimer ? plan.disclaimer.px * 2.6 : 0;
  return { rule, band: Math.max(rule * 3, plan.s * 0.052, need) };
}

/* ---------------------------------------------------------------- background */

function paintBackground(ctx, plan, style, assets) {
  const { w, h } = plan.canvas;
  ctx.clearRect(0, 0, w, h);
  const type = style.bgType || 'solid';
  if (type === 'transparent') return;

  if (type === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
    g.addColorStop(0, style.bgColor || BRAND.navy);
    g.addColorStop(1, style.bgColor2 || BRAND.navyLift);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = style.bgColor || BRAND.navy;
    ctx.fillRect(0, 0, w, h);
  }

  if (type === 'image' && assets.bgImage) {
    const img = assets.bgImage;
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const dim = style.bgDim ?? 0.45;
    if (dim > 0) {
      const [dr, dg, db] = hexToRgb(style.bgColor || BRAND.navyDeep);
      ctx.fillStyle = `rgba(${dr},${dg},${db},${dim})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // The green rule over the navy band, the way the Granite Guarantee sheet
  // closes. On a dark ground the band would vanish, so it stays a thin bar.
  const m = bandMetrics(plan, style);
  if (m.rule) {
    const [c1, c2] = style.bar || [style.accent || BRAND.green, BRAND.navy];
    const barW = plan.mailPanel ? plan.mailPanel.x : w;
    if (m.band) {
      ctx.fillStyle = c2;
      ctx.fillRect(0, h - m.band, barW, m.band);
      ctx.fillStyle = c1;
      ctx.fillRect(0, h - m.band, barW, m.rule);
    } else {
      ctx.fillStyle = c1;
      ctx.fillRect(0, h - m.rule, barW, m.rule);
      ctx.fillStyle = c2;
      ctx.fillRect(0, h - m.rule, barW * 0.34, m.rule);
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

  const first = (c.first || '').toUpperCase();
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

  const stackH = first ? firstPx * 1.05 + tw * 0.012 + lastPx * 0.96 : lastPx * 0.96;
  let y = p.y + (p.h - stackH) / 2 + (first ? firstPx * 0.86 : lastPx * 0.80);
  if (first) {
    ctx.fillStyle = style.plateAccent || BRAND.mint;
    setFont(ctx, { family: 'Barlow Condensed', weight: 700 }, firstPx, 0.10);
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
  const dpi = plan.canvas.w / 11;          // the 11 inch dimension sets the scale
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

/* ---------------------------------------------------------------------- entry */

/** Paint a solved plan. `assets` = { portraits: {name -> Image}, bgImage, logo }. */
export function paint(ctx, plan, style, assets = {}, copy = {}) {
  const theme = themeFor(style);
  ctx.save();
  paintBackground(ctx, plan, style, assets);
  if (plan.deck) paintDeck(ctx, plan, assets, theme);
  for (const tile of plan.tiles) paintTile(ctx, tile, plan, style, assets, theme);
  paintCopy(ctx, plan, style, theme);
  paintLogo(ctx, plan, style, assets);
  paintDisclaimer(ctx, plan, style, theme);
  paintMailPanel(ctx, plan, style, copy);
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
