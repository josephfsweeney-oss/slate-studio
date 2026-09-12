/* Print-ready output: bleed, crop marks and a slug line.
 *
 * A press cuts to the trim size with a tolerance of a fraction of a millimetre.
 * Artwork that stops exactly at the trim shows a white sliver along the edge
 * when the cut drifts, so anything running to the edge is drawn 1/8 inch past
 * it and the press cuts through the artwork instead of along it.
 *
 * The sheet is laid out as:
 *
 *     slug  |<-- bleed -->|<------ trim ------>|<-- bleed -->|  slug
 *           +  crop marks sit out here, clear of the bleed  +
 */
import { paint } from './render.js';

export const PRINT = {
  bleedIn: 0.125,    // what every commercial press asks for
  markOffIn: 0.0625, // gap between the trim corner and the start of a mark
  markLenIn: 0.25,   // how long each mark runs
  slugIn: 0.375,     // room outside the bleed for marks and the slug line
};

/** Canvas dimensions in inches, given the dpi the canvas was authored at. */
export function inchesOf(canvas, dpi) {
  return { w: canvas.w / dpi, h: canvas.h / dpi };
}

/**
 * Render a plan onto a press sheet.
 *
 *   plan/style/assets/copy  exactly what paint() takes
 *   dpi                     what one inch of the plan measures, e.g. 300
 *   marks                   draw crop marks and the slug line
 *
 * Returns { canvas, trim, bleed, sheet } with every measurement in pixels.
 */
export function printSheet({ plan, style, assets = {}, copy = {}, dpi = 300, marks = true }) {
  // Round the margin as a whole, so the sheet lands on round inches for the
  // printer rather than on 5.257 x 12.007. Bleed rounds up: more than the
  // required eighth of an inch is safe, less is not.
  const bleed = Math.ceil(PRINT.bleedIn * dpi);
  const pad = marks ? Math.round((PRINT.bleedIn + PRINT.slugIn) * dpi) : bleed;
  const slug = pad - bleed;

  const cv = document.createElement('canvas');
  cv.width = plan.canvas.w + pad * 2;
  cv.height = plan.canvas.h + pad * 2;
  const ctx = cv.getContext('2d');

  // White around the artwork so the marks read, and so a press proof of a
  // transparent piece is not printed onto nothing.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cv.width, cv.height);

  ctx.save();
  ctx.translate(pad, pad);
  paint(ctx, plan, style, assets, copy, bleed);
  ctx.restore();

  if (marks) drawMarks(ctx, cv, plan, pad, bleed, dpi);

  return {
    canvas: cv,
    trim: { x: pad, y: pad, w: plan.canvas.w, h: plan.canvas.h },
    bleed, slug,
    sheet: { w: cv.width, h: cv.height },
  };
}

/** Hairline marks at each trim corner, clear of the bleed, plus a slug line. */
function drawMarks(ctx, cv, plan, pad, bleed, dpi) {
  const off = Math.round(PRINT.markOffIn * dpi) + bleed;
  const len = Math.round(PRINT.markLenIn * dpi);
  const x0 = pad, y0 = pad;
  const x1 = pad + plan.canvas.w, y1 = pad + plan.canvas.h;

  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, Math.round(dpi / 600));   // about 0.5 pt
  ctx.beginPath();
  for (const [x, dir] of [[x0, -1], [x1, 1]]) {
    for (const y of [y0, y1]) {
      ctx.moveTo(x + dir * off, y);
      ctx.lineTo(x + dir * (off + len), y);
    }
  }
  for (const [y, dir] of [[y0, -1], [y1, 1]]) {
    for (const x of [x0, x1]) {
      ctx.moveTo(x, y + dir * off);
      ctx.lineTo(x, y + dir * (off + len));
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** The line printed in the slug, telling the press what it is holding. */
export function slugLine(plan, dpi, name) {
  const { w, h } = inchesOf(plan.canvas, dpi);
  const fmt = (n) => (Math.round(n * 100) / 100).toString().replace(/\.0+$/, '');
  return `${name} · trim ${fmt(w)} x ${fmt(h)} in · bleed ${PRINT.bleedIn} in · ${dpi} dpi · RGB, proof colour before the run`;
}

/** Draw the slug line into the bottom margin of a sheet. */
export function drawSlug(sheetCtx, sheet, text, dpi) {
  const px = Math.max(9, Math.round(dpi * 0.035));
  sheetCtx.save();
  sheetCtx.fillStyle = '#000000';
  sheetCtx.font = `500 ${px}px "Barlow Condensed", sans-serif`;
  sheetCtx.textAlign = 'center';
  sheetCtx.textBaseline = 'alphabetic';
  sheetCtx.fillText(text, sheet.w / 2, sheet.h - Math.round(dpi * 0.09));
  sheetCtx.restore();
}
