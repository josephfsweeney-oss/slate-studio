import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';
import { solve, bestGrid, PHOTO_AR, PLATE_AR, COMPOSITIONS, CONTRAST_MARKS,
  CONTRAST_DIRS } from '../public/layout.js';
import { nameParts, slugify } from '../public/names.js';
import { fillTokens, CANVASES, TEMPLATES, PALETTES } from '../public/presets.js';
import { MAIL_PROGRAMS, SIDE_COMMON, sideStyle, sideCopyFor, pieceLook } from '../public/mailers.js';

/* Stand-in for canvas measureText: width of the string at 100px. Anton is the
 * wider face, so the proportions stay roughly honest. */
const measure = (t, f) => t.length * (f.family === 'Anton' ? 52 : 43);

const slate = (n) => Array.from({ length: n }, (_, i) => {
  const name = ['Lorie Ball', 'Edward W. Huminick', 'John Janigian', 'George I. Kassas',
    'Dennis Mannion', 'Valerie McDonnell', 'Joe Sweeney', 'John Sytek',
    'Susan J. Vandecasteele', 'Brian K. Chirichiello'][i];
  return { name, ...nameParts(name), hasPhoto: true };
});

const COPY = {
  kicker: 'Rockingham District 25',
  headline: 'Your Republican team for Salem',
  subhead: 'Nine Republicans on the ballot. One team for lower taxes and safer streets.',
  details: 'Polls open 7 AM to 8 PM\nBring a photo ID',
  cta: 'Vote Tuesday, November 3',
  footer: 'SalemRepublicans.com',
  disclaimer: 'Paid for by the Salem Republican Town Committee, Jane Doe, Treasurer.',
};

/* A display rail drops faces on purpose: four is the most that stays a face at
 * 90px tall, and it says so in its warnings. Every other layout carries the
 * whole slate. */
const DROPS_FACES = new Set(['strip']);

test('every slate size fits every canvas without overflow', () => {
  for (const c of CANVASES) {
    for (let n = 1; n <= 10; n++) {
      const p = solve({ canvas: { w: c.w, h: c.h }, slate: slate(n), copy: COPY, style: {} }, measure);
      if (DROPS_FACES.has(p.composition)) {
        assert.ok(p.tiles.length > 0 && p.tiles.length <= n, `${c.id} n=${n} rail tile count`);
        if (p.tiles.length < n) {
          assert.ok(p.warnings.some((x) => /do not fit a rail/.test(x)),
            `${c.id} n=${n} dropped faces without saying so`);
        }
      } else {
        assert.equal(p.tiles.length, n, `${c.id} n=${n} tile count`);
      }
      for (const t of p.tiles) {
        assert.ok(t.x >= -1 && t.y >= -1, `${c.id} n=${n} tile off the top left`);
        assert.ok(t.x + t.w <= c.w + 1, `${c.id} n=${n} tile off the right`);
        assert.ok(t.y + t.h <= c.h + 1, `${c.id} n=${n} tile off the bottom`);
        assert.ok(t.w > 0 && t.h > 0);
      }
      if (p.copy) {
        assert.ok(p.copy.height <= p.copy.rect.h + 1,
          `${c.id} n=${n} copy ${p.copy.height.toFixed(0)} > rect ${p.copy.rect.h.toFixed(0)}`);
        assert.ok(p.copy.x >= -1 && p.copy.x + p.copy.w <= c.w + 1);
      }
    }
  }
});

test('tiles never overlap', () => {
  for (const n of [2, 3, 5, 7, 9, 10]) {
    const p = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(n), copy: COPY, style: {} }, measure);
    for (let i = 0; i < p.tiles.length; i++) {
      for (let j = i + 1; j < p.tiles.length; j++) {
        const a = p.tiles[i], b = p.tiles[j];
        const hit = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        assert.ok(!hit, `n=${n} tiles ${i} and ${j} overlap`);
      }
    }
  }
});

test('more copy shrinks the copy scale, it does not spill', () => {
  const short = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(4), copy: { headline: 'Vote' }, style: {} }, measure);
  const long = solve({
    canvas: { w: 1080, h: 1080 }, slate: slate(4),
    copy: { ...COPY, subhead: COPY.subhead.repeat(3), details: COPY.details.repeat(3) }, style: {},
  }, measure);
  assert.ok(long.scale < short.scale, 'long copy should use a smaller type scale');
  assert.ok(long.copy.height <= long.copy.rect.h + 1);
});

test('no copy falls back to a faces-only composition', () => {
  const p = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(6), copy: { disclaimer: 'x' }, style: {} }, measure);
  assert.equal(p.composition, 'slateOnly');
  assert.equal(p.copy, null);
});

test('name plates change the tile aspect the grid solves against', () => {
  const withPlate = bestGrid(6, 1000, 1000, 30, true);
  const without = bestGrid(6, 1000, 1000, 30, false);
  assert.ok(without.tileW >= withPlate.tileW);
  const t = bestGrid(4, 1000, 1000, 0, true);
  assert.equal(t.cols, 2);
  assert.ok(Math.abs(t.tileW - Math.min(500, 500 / (PHOTO_AR + PLATE_AR))) < 1);
});

test('a short last row is centred, not left hanging', () => {
  const p = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(5), copy: {}, style: { plate: true } }, measure);
  assert.equal(p.grid.cols, 3);
  const lastRow = p.tiles.slice(3);
  const mid = (lastRow[0].x + lastRow[lastRow.length - 1].x + lastRow[0].w) / 2;
  assert.ok(Math.abs(mid - 540) < 2, `last row centre ${mid}`);
});

test('names split the way the deck build splits them', () => {
  assert.deepEqual(nameParts('Kevin M. Nugent Jr'), { first: 'KEVIN M.', last: 'NUGENT JR' });
  assert.deepEqual(nameParts('Jarvis M. Adams IV'), { first: 'JARVIS M.', last: 'ADAMS IV' });
  assert.deepEqual(nameParts('Joe Sweeney'), { first: 'JOE', last: 'SWEENEY' });
  assert.equal(slugify('Karel A. Crawford'), 'Karel-A-Crawford');
  assert.equal(slugify("Bill O'Brien"), 'Bill-O-Brien');
});

test('tokens fill from the district record', () => {
  const d = { county: 'Rockingham', district: 25, seats: 9, towns: ['Salem'], nominees: slate(3) };
  assert.equal(fillTokens('{{SEAT}}', d), 'Rockingham District 25');
  assert.equal(fillTokens('{{COUNT}} on the ballot in {{TOWNS}}', d), '3 on the ballot in Salem');
  assert.equal(fillTokens('{{NAMES}}', d), 'Ball, Huminick and Janigian');
  assert.equal(fillTokens('{{UNKNOWN}}', d), '{{UNKNOWN}}');
});

test('copy agrees with itself on a single-nominee district', () => {
  // 93 of 174 districts run one nominee. "1 Republicans" and "your Republican
  // team" for a team of one both shipped before this.
  const solo = { county: 'Cheshire', district: 4, seats: 1, towns: ['Chesterfield'], nominees: slate(1) };
  const many = { county: 'Rockingham', district: 25, seats: 9, towns: ['Salem'], nominees: slate(9) };
  assert.equal(fillTokens('{{REPUBLICANS}}', solo), '1 Republican');
  assert.equal(fillTokens('{{REPUBLICANS}}', many), '9 Republicans');
  assert.equal(fillTokens('Your Republican {{TEAM}} for {{TOWNS}}', solo),
    'Your Republican candidate for Chesterfield');
  assert.equal(fillTokens('Your Republican {{TEAM}} for {{TOWNS}}', many),
    'Your Republican team for Salem');
});

test('no shipped template reads wrong on a one-person slate', () => {
  const solo = { county: 'Cheshire', district: 4, seats: 1, towns: ['Chesterfield'], nominees: slate(1) };
  for (const t of TEMPLATES) {
    for (const [field, text] of Object.entries(t.copy)) {
      const out = fillTokens(text, solo);
      assert.ok(!/\b1 Republicans\b/.test(out), `${t.id}.${field}: "${out}"`);
      assert.ok(!/Republican team|whole slate/i.test(out), `${t.id}.${field}: "${out}"`);
    }
  }
});

test('an overlong headline is trimmed rather than allowed to run off', () => {
  const p = solve({
    canvas: { w: 1200, h: 628 }, slate: slate(8),
    copy: { headline: 'word '.repeat(90), disclaimer: 'x' }, style: {},
  }, measure);
  assert.ok(p.copy.height <= p.copy.rect.h + 1);
  assert.ok(p.warnings.length > 0);
});

test('a one-line block shrinks to fit instead of losing its last words', () => {
  // "VOTE TUESDAY, NOVEMBER 3" was shipping as "VOTE TUESDAY," on a narrow
  // column: wrapped to two lines, then trimmed to maxLines of one.
  const narrow = solve({
    canvas: { w: 3300, h: 1650 }, slate: slate(9),
    copy: { headline: 'Your Republican team for Rockingham 25',
            cta: 'Vote Tuesday, November 3', disclaimer: 'x' },
    style: { mailPanel: 'right' },
  }, measure);
  const cta = narrow.copy.items.find((i) => i.key === 'cta');
  assert.equal(cta.lines.length, 1);
  assert.equal(cta.lines[0], 'VOTE TUESDAY, NOVEMBER 3',
    'the whole phrase must survive');
  const kicker = solve({
    canvas: { w: 1200, h: 628 }, slate: slate(2),
    copy: { kicker: 'Rockingham County District Twenty Five', headline: 'Vote' },
    style: {},
  }, measure).copy.items.find((i) => i.key === 'kicker');
  assert.equal(kicker.lines[0], 'ROCKINGHAM COUNTY DISTRICT TWENTY FIVE');
});

test('the mail panel is the carrier corner and nothing of ours is inside it', () => {
  const p = solve({
    canvas: { w: 3300, h: 1650 }, slate: slate(9),
    copy: { headline: 'Your Republican team', cta: 'Vote Tuesday, November 3',
            disclaimer: 'Paid for by the committee.' },
    style: { mailPanel: 'right' }, dpi: 300,
  }, measure);
  assert.ok(p.mailPanel, 'the plan must describe the panel');
  const m = p.mailPanel;
  // Four inches by two and a quarter, in the lower right of the trim.
  assert.ok(Math.abs(m.w - 4 * 300) < 1, `panel is ${(m.w / 300).toFixed(2)} in wide, wanted 4`);
  assert.ok(Math.abs(m.h - 2.25 * 300) < 1, `panel is ${(m.h / 300).toFixed(2)} in tall, wanted 2.25`);
  assert.ok(Math.abs(m.x + m.w - 3300) < 1 && Math.abs(m.y + m.h - 1650) < 1,
    'the panel is not in the lower right corner');

  const hits = (r) => r.x < m.x + m.w - 1 && m.x < r.x + r.w - 1
    && r.y < m.y + m.h - 1 && m.y < r.y + r.h - 1;
  for (const t of p.tiles) assert.ok(!hits(t), 'a portrait is inside the carrier corner');
  assert.ok(!hits({ x: p.copy.x, y: p.copy.y, w: p.copy.w, h: p.copy.height }),
    'the copy is inside the carrier corner');
  assert.ok(p.disclaimer.x + p.disclaimer.w <= m.x + 1, 'the disclaimer runs under the panel');

  // The whole point of a corner rather than a column: the space above it gets
  // used. A full-height panel threw away three and a half inches by four.
  assert.ok(p.tiles.some((t) => t.x + t.w > m.x), 'nothing was placed above the panel');
  assert.ok(p.tiles.every((t) => t.y + t.h <= m.y + 1), 'a portrait hangs below the panel top');
});

test('with no mail panel the whole canvas is usable', () => {
  const p = solve({
    canvas: { w: 3300, h: 1650 }, slate: slate(9),
    copy: { headline: 'Your Republican team', disclaimer: 'x' }, style: {},
  }, measure);
  assert.equal(p.mailPanel, null);
});

test('the 6x9 postcard is gone and 11x5.5 is there', () => {
  assert.ok(!CANVASES.some((c) => c.id === 'postcard'), '6x9 should be removed');
  const mail = CANVASES.find((c) => c.id === 'mail11');
  assert.ok(mail, '11x5.5 should exist');
  assert.equal(mail.w, 3300);
  assert.equal(mail.h, 1650);
  assert.equal(mail.w / mail.h, 2, '11 by 5.5 is exactly 2:1');
});

test('the palm card is a 4.25 by 11 stack that always leaves room for the footer', () => {
  const copy = {
    kicker: 'Hillsborough District 29',
    headline: "Goffstown's Republican team",
    subhead: 'Four seats. One team. Vote for all four.',
    values: 'No new taxes, Safer streets, Parents decide, Lower energy bills',
    cta: 'Vote Tuesday, November 3',
    details: 'Goffstown High School\nPolls open 7 am to 7 pm',
    disclaimer: 'Paid for by Committee to Elect House Republicans, Concord NH.',
  };
  for (const n of [1, 2, 3, 4, 6, 9]) {
    const p = solve({ canvas: { w: 1275, h: 3300 }, slate: slate(n), copy,
      style: { composition: 'palmcard' } }, measure);
    assert.equal(p.composition, 'palmcard');
    assert.ok(p.palm, 'the plan describes its bands');
    // The bands stay in order and inside the card.
    const { mast, ask, panel, strip, event } = p.palm;
    assert.ok(mast.y >= 0);
    assert.ok(ask.y >= mast.y + mast.h - 1, `n=${n}: the ask overlaps the masthead`);
    assert.ok(panel.y >= ask.y + ask.h - 1, `n=${n}: the panel overlaps the ask`);
    assert.ok(strip.y >= panel.y + panel.h - 1, `n=${n}: the strip overlaps the panel`);
    assert.ok(event.y + event.h <= 3300 + 1, `n=${n}: the event band runs off the card`);
    // The paid-for line is the thing that went missing on the card this copies.
    assert.ok(p.disclaimer, `n=${n}: no disclaimer`);
    assert.ok(p.disclaimer.y <= 3300, `n=${n}: the disclaimer is off the bottom`);
    assert.ok(p.disclaimer.y > event.y + event.h - 1,
      `n=${n}: the disclaimer is under the event band, where it cannot be read`);
    for (const t of p.tiles) {
      assert.ok(t.y >= panel.y - 1 && t.y + t.h <= panel.y + panel.h + 1,
        `n=${n}: a portrait is outside the panel`);
    }
  }
});

test('a palm card with taglines leaves room under each plate for one', () => {
  const withTags = solve({ canvas: { w: 1275, h: 3300 },
    slate: slate(4).map((c) => ({ ...c, tag: 'Selectman' })),
    copy: { headline: 'Team', disclaimer: 'x' }, style: { composition: 'palmcard' } }, measure);
  const without = solve({ canvas: { w: 1275, h: 3300 }, slate: slate(4),
    copy: { headline: 'Team', disclaimer: 'x' }, style: { composition: 'palmcard' } }, measure);
  assert.ok(withTags.tiles[0].tag, 'a tagline slot is reserved');
  assert.equal(without.tiles[0].tag, null, 'and not reserved when nobody has one');
  assert.ok(withTags.grid.tileW <= without.grid.tileW,
    'the tagline comes out of the tile, not out of the card');
});

test('the 4.25 by 11 palm card replaced the 5.5 by 8.5 one', () => {
  const palm = CANVASES.find((c) => c.id === 'palm');
  assert.equal(palm.w, 1275);
  assert.equal(palm.h, 3300);
  assert.equal(palm.w / 300, 4.25);
  assert.equal(palm.h / 300, 11);
});

/* ------------------------------------------------------- the new layouts --- */

/* Every rectangle any of these hands the painter has to sit on the canvas.
 * A band with a negative y or a row past the bottom edge is not a warning, it
 * is a piece that goes to a printer wrong. */
const BACK_COPY = {
  ...COPY,
  values: 'No income tax, No sales tax, Safer streets, Parents decide',
  record: 'Held the line on spending\nStopped an income tax\nBacked local police',
  callout: 'Concord works for you, not the other way around.',
  contrast: 'An income tax, again\nHigher energy bills\nMandates from Concord',
};

/** Every {x,y,w,h} and every {cx,cy} anywhere in a plan, with its path. */
function rects(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.x === 'number' && typeof node.y === 'number'
      && typeof node.w === 'number' && typeof node.h === 'number') {
    out.push({ path, ...node });
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'candidate' || k === 'canvas') continue;
    if (Array.isArray(v)) v.forEach((x, i) => rects(x, `${path}.${k}[${i}]`, out));
    else if (v && typeof v === 'object') rects(v, `${path}.${k}`, out);
  }
  return out;
}

test('every new layout stays on the canvas, on every canvas', () => {
  const comps = ['ballot', 'palmback', 'spotlight', 'versus', 'strip'];
  for (const comp of comps) {
    for (const c of CANVASES) {
      for (const n of [1, 2, 3, 5, 9]) {
        const p = solve({
          canvas: { w: c.w, h: c.h }, slate: slate(n), copy: BACK_COPY,
          style: { composition: comp }, seats: n,
        }, measure);
        assert.equal(p.composition, comp, `${comp} on ${c.id} fell back to ${p.composition}`);
        const slack = Math.max(2, c.h * 0.004);
        for (const r of rects(p)) {
          const where = `${comp} ${c.id} n=${n} ${r.path}`;
          assert.ok(r.w >= 0 && r.h >= 0, `${where} has a negative size`);
          assert.ok(r.x >= -slack, `${where} runs off the left at x=${r.x.toFixed(0)}`);
          assert.ok(r.y >= -slack, `${where} runs off the top at y=${r.y.toFixed(0)}`);
          assert.ok(r.x + r.w <= c.w + slack, `${where} runs off the right`);
          assert.ok(r.y + r.h <= c.h + slack, `${where} runs off the bottom`);
        }
      }
    }
  }
});

test('the ballot guide counts the seats, not the candidates', () => {
  // A district can elect more seats than we have nominees for. The card has to
  // say what the ballot says, and flag the gap rather than quietly shrink it.
  const p = solve({
    canvas: { w: 1080, h: 1920 }, slate: slate(3), copy: COPY,
    style: { composition: 'ballot' }, seats: 4,
  }, measure);
  assert.equal(p.ballot.seats, 4);
  assert.match(p.ballot.rule.lines.join(' '), /NOT MORE THAN 4/i);
  assert.ok(p.warnings.some((w) => /only 3 Republicans/.test(w)), p.warnings.join(' | '));
  assert.equal(p.ballot.rows.length, 3, 'one row per name on the slate');
});

test('a one-seat district is told to vote for one', () => {
  const p = solve({
    canvas: { w: 1080, h: 1920 }, slate: slate(1), copy: COPY,
    style: { composition: 'ballot' }, seats: 1,
  }, measure);
  assert.match(p.ballot.rule.lines.join(' '), /VOTE FOR ONE/i);
  assert.ok(!p.warnings.some((w) => /only/.test(w)));
});

test('the ballot rows are in order and never overlap', () => {
  const p = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(9), copy: COPY,
    style: { composition: 'ballot' }, seats: 9,
  }, measure);
  const r = p.ballot.rows;
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].y >= r[i - 1].y + r[i - 1].h - 1, `row ${i} overlaps row ${i - 1}`);
    assert.equal(r[i].candidate.name, slate(9)[i].name, 'ballot order is the roster order');
  }
  assert.ok(r[8].y + r[8].h <= p.ballot.card.y + p.ballot.card.h + 2, 'the last row is inside the card');
});

test('the palm card back leaves room for the disclaimer and the ovals', () => {
  const p = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(4), copy: BACK_COPY,
    style: { composition: 'palmback' }, seats: 4,
  }, measure);
  const b = p.palmback;
  assert.equal(b.ovals.rows.length, 4);
  assert.match(b.ovals.rule.lines.join(' '), /ALL 4 OVALS/i);
  const last = b.ovals.rows[3];
  assert.ok(last.y + last.h <= p.disclaimer.y - p.disclaimer.px,
    'the last oval row runs into the disclaimer');
  assert.ok(b.mast.y + b.mast.h <= b.record.y + 1, 'the record starts below the masthead');
  assert.ok(b.record.y + b.record.h <= b.grid.y + 1, 'the issues start below the record');
  assert.ok(b.grid.y + b.grid.h <= b.callout.y + 1, 'the callout starts below the issues');
});

test('an empty palm card back says so instead of printing a blank', () => {
  const p = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(2), copy: COPY,
    style: { composition: 'palmback' }, seats: 2,
  }, measure);
  assert.ok(p.warnings.some((w) => /The back is empty/.test(w)), p.warnings.join(' | '));
});

test('the spotlight picks the named candidate and chips the rest', () => {
  const s5 = slate(5);
  const p = solve({
    canvas: { w: 1080, h: 1080 }, slate: s5, copy: BACK_COPY,
    style: { composition: 'spotlight', spotlight: s5[2].name },
  }, measure);
  assert.equal(p.spotlight.hero.candidate.name, s5[2].name);
  assert.equal(p.spotlight.chips.length, 4);
  assert.ok(!p.spotlight.chips.some((c) => c.candidate.name === s5[2].name),
    'the hero is chipped as well as spotlit');
  assert.ok(p.spotlight.hero.w > p.spotlight.chips[0].w * 1.5, 'the hero is not hero sized');
});

test('an unknown spotlight name falls back to the first on the ballot', () => {
  const p = solve({
    canvas: { w: 1080, h: 1080 }, slate: slate(3), copy: BACK_COPY,
    style: { composition: 'spotlight', spotlight: 'Nobody At All' },
  }, measure);
  assert.equal(p.spotlight.hero.candidate.name, slate(3)[0].name);
  assert.equal(p.spotlight.chips.length, 2);
});

test('a contrast with one side filled in says what is missing', () => {
  const p = solve({
    canvas: { w: 1080, h: 1080 }, slate: slate(3),
    copy: { ...COPY, values: 'Lower taxes, Safer streets' },
    style: { composition: 'versus' },
  }, measure);
  assert.ok(p.warnings.some((w) => /needs both sides/.test(w)), p.warnings.join(' | '));
});

test('a contrast stacks its columns on a story and splits them on a square', () => {
  const tall = solve({ canvas: { w: 1080, h: 1920 }, slate: slate(3), copy: BACK_COPY, style: { composition: 'versus' } }, measure);
  const square = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(3), copy: BACK_COPY, style: { composition: 'versus' } }, measure);
  assert.equal(tall.versus.stacked, true);
  assert.equal(square.versus.stacked, false);
  assert.ok(square.versus.right.x > square.versus.left.x, 'the columns are side by side');
  assert.ok(tall.versus.right.y > tall.versus.left.y, 'the columns are one above the other');
});

test('a display rail carries no disclaimer and says so', () => {
  const p = solve({
    canvas: { w: 1456, h: 180 }, slate: slate(6), copy: COPY, style: {},
  }, measure);
  assert.equal(p.composition, 'strip', 'a leaderboard is a rail');
  assert.equal(p.disclaimer, null);
  assert.ok(p.warnings.some((w) => /no disclaimer/.test(w)), p.warnings.join(' | '));
});

test('an email header is a design surface, not a rail', () => {
  // 3:1 is wide. It is not a leaderboard, and the ordinary solve handles it.
  const p = solve({ canvas: { w: 1200, h: 400 }, slate: slate(5), copy: COPY, style: {} }, measure);
  assert.notEqual(p.composition, 'strip');
  assert.equal(p.tiles.length, 5);
});

test('a single nominee gets the spotlight, not a grid of one', () => {
  const p = solve({ canvas: { w: 1080, h: 1080 }, slate: slate(1), copy: COPY, style: {} }, measure);
  assert.equal(p.composition, 'spotlight');
  assert.equal(p.tiles.length, 1);
});

test('the print canvases all declare a dpi and the screen ones do not', () => {
  const print = CANVASES.filter((c) => c.dpi);
  assert.ok(print.length >= 8, 'the print set is there');
  for (const c of print) {
    assert.ok(c.dpi >= 50 && c.dpi <= 300, `${c.id} has an odd dpi`);
    const inches = { w: c.w / c.dpi, h: c.h / c.dpi };
    assert.ok(inches.w >= 3 && inches.h >= 3, `${c.id} is smaller than a business card`);
    // The label carries the trim size, so it has to match the pixels.
    const m = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/.exec(c.label);
    assert.ok(m, `${c.id} label does not name its trim size`);
    const [a, b] = [Number(m[1]), Number(m[2])];
    const ft = /ft/.test(c.note || '') || /ft/.test(c.label);
    const want = ft ? [a * 12, b * 12] : [a, b];
    assert.ok(Math.abs(inches.w - want[0]) < 0.02 && Math.abs(inches.h - want[1]) < 0.02,
      `${c.id} says ${m[0]} but is ${inches.w.toFixed(2)} x ${inches.h.toFixed(2)} in`);
  }
  for (const c of CANVASES.filter((x) => !x.dpi)) {
    assert.ok(!/\d\s*x\s*\d+\s*(in|ft)/.test(c.label), `${c.id} looks like a print size with no dpi`);
  }
});

test('every template asks for a layout that exists and fills what it paints', () => {
  const NEEDS = {
    versus: ['values', 'contrast'],
    palmback: ['record', 'values', 'callout'],   // at least one of these
    palmcard: ['values'],
  };
  /* Read off the engine rather than kept here. A hand-kept copy of this list
   * goes stale the moment a composition is added, and then the test that is
   * supposed to catch a template asking for a layout that does not exist starts
   * failing on templates that are fine. */
  const known = new Set(['auto', ...COMPOSITIONS]);
  const ids = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id), `two templates share the id ${t.id}`);
    ids.add(t.id);
    const comp = t.style?.composition;
    if (!comp) continue;
    assert.ok(known.has(comp), `${t.id} asks for the layout ${comp}, which does not exist`);
    const need = NEEDS[comp];
    if (!need) continue;
    const filled = need.filter((k) => String(t.copy[k] || '').trim());
    if (comp === 'versus') {
      assert.equal(filled.length, need.length,
        `${t.id} is a contrast with only ${filled.join(', ') || 'nothing'} filled in`);
    } else {
      assert.ok(filled.length, `${t.id} paints ${comp} but fills none of ${need.join(', ')}`);
    }
  }
});

test('every canvas has a unique id and a sane size', () => {
  const ids = new Set();
  for (const c of CANVASES) {
    assert.ok(!ids.has(c.id), `two canvases share the id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.w >= 100 && c.h >= 100 && c.w <= 8000 && c.h <= 8000, `${c.id} is an odd size`);
    assert.ok(c.label && c.note, `${c.id} is missing a label or a note`);
  }
  assert.ok(ids.has('hanger') && ids.has('palm'), 'the door hanger sits beside the palm card');
});

test('the door hanger keeps the layout out of the tab and the punch', () => {
  const flat = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(6), copy: COPY,
    style: { composition: 'palmcard' }, seats: 6,
  }, measure);
  const hung = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(6), copy: COPY,
    style: { composition: 'palmcard' }, seats: 6, die: 'hanger',
  }, measure);

  assert.equal(hung.canvas.h, 3300, 'the card is still the full trim size');
  assert.ok(hung.hangerDie, 'no die was worked out');
  const tab = hung.hangerDie.tab;
  assert.ok(tab > 3300 * 0.19 && tab < 3300 * 0.22, `the tab is ${Math.round(tab)}px, which is not 2.25 inches`);

  // Nothing the app lays out may start above the tab line, and nothing at all
  // may sit where the hole is going to be punched.
  const hole = hung.hangerDie.hole;
  for (const t of hung.tiles) {
    assert.ok(t.y >= tab - 1, 'a portrait is inside the hanger tab');
    assert.ok(t.y > hole.cy + hole.r, 'a portrait is where the punch goes');
  }
  assert.ok(hung.palm.panel.y >= tab - 1, 'the faces panel starts inside the tab');
  // Same card, less room, so the faces come out smaller. That is the trade.
  assert.ok(hung.grid.tileW < flat.grid.tileW, 'the hanger got the same tile size as the flat card');
  assert.ok(hung.warnings.some((w) => /die/.test(w)), 'the die is not called out as a guide');
});

test('a sign that cannot be read at distance says so in inches', () => {
  const wordy = { ...COPY, headline: 'Your Republican team for Salem is on the ballot this November' };
  const road = solve({
    canvas: { w: 4800, h: 2400 }, slate: slate(9), copy: wordy, style: {}, dpi: 50,
  }, measure);
  assert.ok(road.warnings.some((w) => /road sign/.test(w)), road.warnings.join(' | '));
  assert.ok(road.warnings.some((w) => /inches tall/.test(w)), road.warnings.join(' | '));

  // A palm card is held in the hand. The same copy on one is nobody's problem.
  const palm = solve({
    canvas: { w: 1275, h: 3300 }, slate: slate(9), copy: wordy, style: {}, dpi: 300,
  }, measure);
  assert.ok(!palm.warnings.some((w) => /inches tall|road sign/.test(w)), palm.warnings.join(' | '));
});

test('cutting the copy on a sign makes the type bigger, and the warning says so in inches', () => {
  /* Three inches of letter is the rule of thumb for a yard sign read from a
   * car, so the warning fires on most of them. That is the point: it is there
   * to be acted on, and acting on it has to visibly work. */
  const sign = (copy) => solve({ canvas: { w: 3600, h: 2700 }, slate: slate(2), copy, style: {}, dpi: 150 }, measure);
  const headPx = (p) => p.copy.items.find((i) => i.key === 'headline').px;

  const wordy = sign({ ...COPY, headline: 'Your Republican team for Salem is on the ballot this November' });
  const tight = sign({ headline: 'Vote Republican', disclaimer: COPY.disclaimer });
  assert.ok(headPx(tight) > headPx(wordy) * 1.5,
    `cutting the copy barely moved the headline: ${headPx(wordy).toFixed(0)} to ${headPx(tight).toFixed(0)}`);

  const warned = wordy.warnings.find((w) => /inches tall/.test(w));
  assert.ok(warned, wordy.warnings.join(' | '));
  assert.match(warned, /\d+\.\d inches tall on a 18 inch piece/);
  // The road sign word budget is for road signs, not for a two word yard sign.
  assert.ok(!tight.warnings.some((w) => /road sign/.test(w)), tight.warnings.join(' | '));
});

/* ---------------------------------------------------------------- toppers --- */

const AYOTTE = { name: 'Kelly Ayotte', first: 'GOV. KELLY', last: 'AYOTTE',
  slug: 'Kelly-Ayotte', tag: 'Governor', cutout: '/cutouts/Kelly-Ayotte.webp', topper: true };

test('a topper is on the piece but never on the ballot line', () => {
  const withGov = [AYOTTE, ...slate(4)];
  const ballot = solve({
    canvas: { w: 1080, h: 1920 }, slate: withGov, copy: COPY,
    style: { composition: 'ballot' }, seats: 4,
  }, measure);
  assert.equal(ballot.ballot.rows.length, 4, 'the governor was given a ballot oval');
  assert.ok(!ballot.ballot.rows.some((r) => r.candidate.topper), 'a topper is in the oval rows');
  assert.equal(ballot.ballot.seats, 4, 'the seat count counted the governor');
  assert.ok(!ballot.warnings.some((w) => /only 4 Republicans/.test(w)),
    'the seat gap warning miscounted with a topper on the slate');

  const back = solve({
    canvas: { w: 1275, h: 3300 }, slate: withGov, copy: BACK_COPY,
    style: { composition: 'palmback' }, seats: 4,
  }, measure);
  assert.equal(back.palmback.ovals.rows.length, 4);
  assert.match(back.palmback.ovals.rule.lines.join(' '), /ALL 4 OVALS/i);
});

test('a topper does get a face, a plate and a tile like anybody else', () => {
  const withGov = [AYOTTE, ...slate(3)];
  const p = solve({ canvas: { w: 1080, h: 1080 }, slate: withGov, copy: COPY, style: {} }, measure);
  assert.equal(p.tiles.length, 4, 'the governor did not get a tile');
  const gov = p.tiles.find((t) => t.candidate.topper);
  assert.ok(gov, 'no tile for the topper');
  assert.ok(gov.plate, 'the topper got no name plate');
  assert.equal(gov.candidate.last, 'AYOTTE');
});

/* --------------------------------------------------------------- filenames --- */

test('filenames sort by client, then programme, then surface', async () => {
  const { buildName, canvasById } = await import('../public/presets.js');
  const d = { county: 'Rockingham', district: 25 };
  const name = buildName({
    program: 'Ballot guide', surface: 'palm', canvas: canvasById('palm'),
    audience: `${d.county}-${d.district}`, side: 'back',
  });
  assert.equal(name, 'nhgop-ballot-guide-palm-4.25x11-rockingham-25-back-v01.png');

  // A print surface carries its trim size in inches, which is what a printer
  // asks for. A screen surface carries no size at all: a screen size in a
  // filename is an ad size in a filename, and EasyList blocks those URLs.
  assert.match(buildName({ program: 'x', surface: 'mail11', canvas: canvasById('mail11') }), /-11x5\.5-/);
  for (const c of CANVASES.filter((x) => !x.dpi)) {
    const n = buildName({ program: 'x', surface: c.id, canvas: c, audience: 'r-25' });
    assert.ok(!new RegExp(`\\b${c.w}x${c.h}\\b`).test(n), `${c.id} put its pixel size in ${n}`);
    assert.ok(!/\d{3,4}x\d{2,4}/.test(n), `${c.id} looks like an ad size: ${n}`);
  }
  // Nor may an ad-ish path word get in, for the same reason.
  for (const c of CANVASES) {
    const n = buildName({ program: 'Display banner ad', surface: c.id, canvas: c });
    assert.ok(!/\b(ads?|banner|social|display)\b/.test(n.replace(/-/g, ' ')) || !/\d+x\d+/.test(n),
      `${c.id} produced a blockable name: ${n}`);
  }

  // Lower case, hyphens, nothing else, and every field optional but the shape.
  const messy = buildName({ program: 'Vote  for ALL the Seats!', surface: 'story',
    canvas: canvasById('story'), audience: 'Coös 2' });
  assert.match(messy, /^nhgop-vote-for-all-the-seats-story-co-s-2-v01\.png$/,
    `got ${messy}`);
  assert.ok(!/[A-Z_ ]/.test(messy), 'a filename with a capital or a space in it');

  // The version field is there from the first file, so v02 has somewhere to go.
  assert.match(buildName({ program: 'x', surface: 'palm', canvas: canvasById('palm'), version: 12 }), /-v12\./);
});

test('a print canvas states a trim size its label agrees with', async () => {
  const { CANVASES, sizeField } = await import('../public/presets.js');
  for (const c of CANVASES.filter((x) => x.dpi)) {
    const field = sizeField(c);
    const [a, b] = field.split('x').map(Number);
    assert.ok(a > 0 && b > 0, `${c.id} has no trim size`);
    assert.ok(Math.abs(a - c.w / c.dpi) < 0.01 && Math.abs(b - c.h / c.dpi) < 0.01);
  }
});

/* ------------------------------------------------------ one-seat districts --- */

test('the copy reads as English in a single-seat district', () => {
  /* 75 of the 174 districts elect one member. "Vote for all 1" and "Fill in
   * all 1 ovals" went out on a real piece. The seat count is a number; the
   * phrases built from it are their own tokens. */
  const one = { county: 'Belknap', district: 1, seats: 1, nominees: [{ last: 'PLOSZAJ' }] };
  const nine = { county: 'Rockingham', district: 25, seats: 9, nominees: Array(9).fill({ last: 'X' }) };

  assert.equal(fillTokens('Vote for {{VOTEFOR}}', one), 'Vote for one');
  assert.equal(fillTokens('Vote for {{VOTEFOR}}', nine), 'Vote for all 9');
  assert.equal(fillTokens('Fill in {{OVALS}}', one), 'Fill in the oval');
  assert.equal(fillTokens('Fill in {{OVALS}}', nine), 'Fill in all 9 ovals');
  assert.match(fillTokens('{{SEATLINE}}', one), /elects one member/);
  assert.match(fillTokens('{{SEATLINE}}', nine), /the other 8 on the table/);

  // And no shipped template may produce one of those readings on a one-seat
  // district. This is the check that would have caught it.
  for (const t of TEMPLATES) {
    for (const [key, raw] of Object.entries(t.copy)) {
      const out = fillTokens(raw, one);
      assert.ok(!/\ball 1\b/i.test(out), `${t.id}.${key} reads "${out}"`);
      assert.ok(!/\b1 ovals\b/i.test(out), `${t.id}.${key} reads "${out}"`);
      assert.ok(!/elects 1\./i.test(out), `${t.id}.${key} reads "${out}"`);
    }
  }
});

test('one name on a ballot card gets a ballot row, not the whole card', () => {
  const card = (n) => solve({
    canvas: { w: 1080, h: 1080 }, slate: slate(n), copy: COPY,
    style: { composition: 'ballot' }, seats: n,
  }, measure);

  const one = card(1);
  const r = one.ballot.rows[0];
  assert.ok(r.h <= 1080 * 0.086, `one row is ${Math.round(r.h)}px tall on a 1080 canvas`);
  assert.ok(r.oval.ry <= r.h * 0.31, 'the oval grew with the row instead of the type');

  // It sits in the middle of the card rather than pinned to the top of it.
  const body = one.ballot.body;
  const above = r.y - body.y;
  const below = (body.y + body.h) - (r.y + r.h);
  assert.ok(Math.abs(above - below) < 2, `the single row is not centred: ${Math.round(above)} above, ${Math.round(below)} below`);

  // Nine names still fill the card, so the cap has not made long lists small.
  const nine = card(9);
  assert.ok(nine.ballot.rows[8].y + nine.ballot.rows[8].h
    > nine.ballot.body.y + nine.ballot.body.h * 0.9, 'nine rows no longer fill the card');
  assert.ok(nine.ballot.rowH <= one.ballot.rowH + 1, 'a longer list got taller rows');
});

/* ------------------------------------------- towns and sitting members --- */

test('towns read as a sentence, and fall back to the seat when there are none', () => {
  const at = (towns) => fillTokens('{{TOWNS}}', { county: 'Rockingham', district: 25, seats: 9, towns, nominees: [{ last: 'X' }] });
  assert.equal(at(['Salem']), 'Salem');
  assert.equal(at(['Derry', 'Londonderry']), 'Derry and Londonderry');
  assert.equal(at(['Atkinson', 'Plaistow', 'Newton']), 'Atkinson, Plaistow and Newton');
  assert.equal(at([]), 'Rockingham 25', 'with no towns it has to say something true');
  assert.equal(at(['Salem', 'Salem']), 'Salem', 'a town listed twice is one town');

  const one = (towns) => fillTokens('{{TOWN}}', { county: 'Rockingham', district: 25, towns, nominees: [{ last: 'X' }] });
  assert.equal(one(['Derry', 'Londonderry']), 'Derry', 'the anchor town is the first one');
  assert.equal(one([]), 'Rockingham 25');
});

test('a sitting member carries Rep. on the first-name line, never on the surname', async () => {
  const { firstLine, HONORIFIC } = await import('../public/names.js');
  const rep = { name: 'Tom Ploszaj', first: 'TOM', last: 'PLOSZAJ', incumbent: true };
  const challenger = { ...rep, incumbent: false };

  assert.equal(firstLine(rep, {}), 'REP. TOM');
  assert.equal(firstLine(challenger, {}), 'TOM');
  assert.equal(firstLine(rep, { honorific: false }), 'TOM', 'the switch has to turn it off');
  // The surname is what a voter matches against the ballot, so nothing goes in
  // front of it. firstLine never touches it.
  assert.ok(!firstLine(rep, {}).includes('PLOSZAJ'));
  assert.equal(HONORIFIC, 'REP.');
  // Somebody with no first name on record still gets the honorific alone.
  assert.equal(firstLine({ last: 'X', incumbent: true }, {}), 'REP.');
});

test('the manifest carries towns and sitting members, and flags a name nobody stands under', async () => {
  const { _internal } = await import('../server/catalog.js');
  const csv = [
    'County,District,Seats,Slate size,Built?,Nominees,Missing photos,Towns,Incumbents',
    'Rockingham,25,9,9,YES,Lorie Ball; Joe Sweeney; John Sytek,,Salem,Joe Sweeney; John Sytek',
    'Belknap,1,1,1,YES,Tom Ploszaj,,Center Harbor; Meredith,',
    'Carroll,2,2,2,YES,Erlon Jones; Jennifer LePla,,Bartlett,Somebody Else',
  ].join('\n');
  const byId = _internal.fromManifest(csv);

  const rock = byId.get('Rockingham-25');
  assert.deepEqual(rock.towns, ['Salem']);
  assert.deepEqual(rock.nominees.filter((n) => n.incumbent).map((n) => n.name),
    ['Joe Sweeney', 'John Sytek']);
  assert.equal(rock.nominees.find((n) => n.name === 'Lorie Ball').incumbent, false);

  assert.deepEqual(byId.get('Belknap-1').towns, ['Center Harbor', 'Meredith']);
  assert.equal(byId.get('Belknap-1').nominees[0].incumbent, false, 'an empty column marks nobody');

  // A name in Incumbents that is on nobody's ballot is a typo, and a typo that
  // puts Rep. in front of the wrong person is worth catching.
  assert.deepEqual(byId.get('Carroll-2').strayIncumbents, ['Somebody Else']);
  assert.deepEqual(byId.get('Rockingham-25').strayIncumbents, []);
});

test('a manifest with neither column reads exactly as it did before', async () => {
  const { _internal } = await import('../server/catalog.js');
  const byId = _internal.fromManifest([
    'County,District,Seats,Slate size,Built?,Nominees,Missing photos',
    'Belknap,1,1,1,YES,Tom Ploszaj,',
  ].join('\n'));
  const d = byId.get('Belknap-1');
  assert.deepEqual(d.towns, []);
  assert.equal(d.nominees[0].incumbent, false);
  assert.deepEqual(d.strayIncumbents, []);
});

/* ------------------------------------------------- the Granite Guarantee pair */



test('an unfilled token is left standing rather than quietly dropped', () => {
  const d = { id: 'r25', county: 'Rockingham', district: 25, seats: 1, towns: ['Salem'], nominees: slate(1) };
  assert.equal(fillTokens('{{TOWN}} pays {{TAX_RATE}}', d), 'Salem pays {{TAX_RATE}}');
  assert.equal(fillTokens('{{TOWN}} pays {{TAX_RATE}}', d, { typed: { TAX_RATE: '$14.72' } }),
    'Salem pays $14.72');
  // A blank typed value is not an answer, so the token stays up.
  assert.equal(fillTokens('pays {{TAX_RATE}}', d, { typed: { TAX_RATE: '  ' } }), 'pays {{TAX_RATE}}');
  // And the piece only names somebody once somebody is named.
  assert.equal(fillTokens('Vote {{CAND_LAST}}', d), 'Vote {{CAND_LAST}}');
  assert.equal(fillTokens('Vote {{CAND_LAST}}', d, { lead: slate(1)[0] }), 'Vote Ball');
});

test('names only takes the photograph off every layout and gives the plate the tile', () => {
  for (const c of CANVASES) {
    for (const n of [1, 4, 9]) {
      const list = slate(n);
      const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi || 0, slate: list,
        copy: COPY, style: { namesOnly: true } }, measure);
      const where = `${c.id} n=${n}`;
      for (const t of p.tiles) {
        assert.equal(t.photo, null, `${where} still has a photo box`);
        assert.ok(t.plate, `${where} lost the name plate`);
        // The plate is the tile: a name with nowhere to sit is not a name.
        assert.ok(t.plate.w === t.w && t.plate.h > t.w * 0.2, `${where} plate too small`);
        assert.ok(t.plate.y + t.plate.h <= t.y + t.h + 1, `${where} plate off its tile`);
      }
      // And the piece still fits: a shorter tile must not push the copy off.
      for (const t of p.tiles) {
        assert.ok(t.x >= -1 && t.x + t.w <= c.w + 1, `${where} tile off the canvas`);
        assert.ok(t.y >= -1 && t.y + t.h <= c.h + 1, `${where} tile off the canvas`);
      }
    }
  }
});

test('a names only piece is shorter per tile than the same piece with faces', () => {
  const c = CANVASES.find((x) => x.id === 'sign');
  const spec = (style) => solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: slate(9),
    copy: COPY, style }, measure);
  const faces = spec({});
  const names = spec({ namesOnly: true });
  assert.ok(names.grid.tileH < faces.grid.tileH,
    'a plate on its own is shorter than a face over a plate');
  assert.ok(names.grid.tileW >= faces.grid.tileW,
    'and the width it gives back goes into the name');
});


/* Switching to Navy or Pine has to reach the type. The card layouts used to
 * force white stock whatever the palette said, so the palette did nothing to a
 * palm card and the words stayed navy on paper that never arrived. */
test('a dark palette turns the type white, on cards as well as on pages', async () => {
  const { themeFor, cardStock } = await import('../public/render.js');
  const dark = { bgType: 'solid', bgColor: '#12314E', accent: '#2F7C4E', plateColor: '#0D2740' };
  const pine = { bgType: 'gradient', bgColor: '#2F7C4E', accent: '#12314E', plateColor: '#12314E' };
  const paper = { bgType: 'solid', bgColor: '#FFFFFF', accent: '#2F7C4E', plateColor: '#12314E' };

  for (const comp of ['palmcard', 'palmback', 'promise', 'proof', 'stack', 'ballot']) {
    for (const [name, pal] of [['navy', dark], ['pine', pine]]) {
      const t = themeFor({ ...pal, composition: comp });
      assert.equal(t.light, false, `${comp} on ${name} still thinks it is on paper`);
      assert.equal(t.primary, '#FFFFFF', `${comp} on ${name} is not setting white type`);
      assert.notEqual(t.band, t.primary, `${comp} on ${name} paints its blocks in the text colour`);
    }
    const t = themeFor({ ...paper, composition: comp });
    assert.equal(t.light, true, `${comp} on the light scheme changed`);
    assert.equal(t.primary, '#12314E', `${comp} on the light scheme changed`);
  }

  // The stock itself follows: white on the light schemes, the palette on the dark.
  assert.equal(cardStock(paper), '#FFFFFF');
  assert.equal(cardStock(dark), '#12314E');
  assert.equal(cardStock(pine), '#2F7C4E');
  // An explicit stock still wins, and a transparent asset layer stays white.
  assert.equal(cardStock({ ...dark, cardGround: '#ABCDEF' }), '#ABCDEF');
  assert.equal(cardStock({ ...dark, bgType: 'transparent' }), '#FFFFFF');
});

/* The name is the one thing on the piece a voter has to find again on a ballot,
 * so the band is set as large as the cell will carry. The check is that it
 * fills the cell it is in, not that it hits some number: a slate of eight has a
 * narrower cell than a slate of two and a smaller name is the right answer
 * there. What is wrong is a name sitting in the middle of a cell with room on
 * both sides of it. */
test('the names are set as large as their cell carries', () => {
  const CONDW = 43 / 100;   // the stand-in measure, per px, for Barlow Condensed
  const piece = MAIL_PROGRAMS[0].pieces.find((x) => x.id === 'close');
  for (const id of ['mail6', 'mail11']) {
    const c = CANVASES.find((x) => x.id === id);
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const list = slate(n);
      const copy = { ...SIDE_COMMON, ...piece.front };
      const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
        style: sideStyle(piece, 'front') }, measure);
      const b = p.band;
      const where = `${id} n=${n}`;
      assert.ok(b && b.figures.length === n, `${where} did not solve as a band`);

      const cellW = p.grid.tileW;
      const px = b.figures[0].name.px;
      assert.ok(px > 0, `${where} sized the names to nothing`);
      for (const f of b.figures) {
        assert.equal(f.name.px, px, `${where} sets the names at two different sizes`);
      }

      /* Nothing runs out of its cell. */
      const widest = Math.max(...b.figures.map((f) => f.name.text.length)) * CONDW * px;
      assert.ok(widest <= cellW + 1,
        `${where}: a name is ${(widest - cellW).toFixed(0)}px wider than its cell`);

      /* And the band is not left small in a cell that had room. Either the name
       * fills the cell, or it stopped at the height ceiling for the slate. */
      const ceiling = c.h * (n <= 2 ? 0.054 : n <= 4 ? 0.042 : 0.036);
      assert.ok(widest >= cellW * 0.78 || px >= ceiling * 0.98,
        `${where}: the names fill ${(widest / cellW * 100).toFixed(0)}% of the cell `
        + `at ${px.toFixed(0)}px, with a ${ceiling.toFixed(0)}px ceiling unused`);
    }
  }
});

/* ------------------------------------------------------------ the mail band */

test('every mail side puts the slate, a headline and a call to action on the piece', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const prog = MAIL_PROGRAMS[0];
  const typed = { TAX_RATE: '$14.72', OPP_LAST: 'Spahr', OPP_VOTE: 'no' };
  for (const piece of prog.pieces) {
    for (const n of [1, 3, 6, 9]) {
      const list = slate(n);
      const d = { id: 'r25', county: 'Rockingham', district: 25, seats: n,
                  towns: ['Salem'], nominees: list };
      for (const side of ['front', 'back']) {
        const raw = { ...SIDE_COMMON, ...piece[side] };
        const copy = {};
        for (const [k, v] of Object.entries(raw)) copy[k] = fillTokens(v, d, { typed });
        const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
          style: sideStyle(piece, side) }, measure);
        const where = `${piece.id} ${side} n=${n}`;
        const b = p.band;
        assert.ok(b, `${where} did not solve as a band`);

        // Everybody is on it, once, in ballot order, and nobody is in a box.
        assert.equal(b.figures.length, n, `${where} lost somebody`);
        assert.deepEqual(b.figures.map((f) => f.candidate.name), list.map((x) => x.name),
          `${where} is not in ballot order`);
        assert.equal(p.tiles.length, 0, `${where} still draws boxed tiles`);

        // The three things every side must carry. No disclaimer: the print shop
        // sets it with the carrier's corner, which is theirs.
        assert.ok(b.head, `${where} has no headline`);
        assert.ok(b.cta, `${where} has no call to action`);
        assert.equal(p.disclaimer, null, `${where} printed a disclaimer the print shop sets`);
        assert.match(b.cta.block.lines[0], /NOV\.? ?3/, `${where} does not say when to vote`);

        // Nothing lands on anything else, on either shape.
        assert.ok(b.head.y >= 0, `${where} headline off the top`);
        for (const row of b.rows) {
          assert.ok(row.y + row.h <= b.bandRect.y + 1, `${where} faces run past the band`);
        }
        const wordsBottom = b.sub ? b.sub.y + b.sub.block.h : b.head.y + b.head.block.h;
        assert.ok(wordsBottom <= b.cta.y + 1, `${where} the copy lands on the call to action`);
        if (b.seat) {
          assert.ok(wordsBottom <= b.seat.y + 1, `${where} the copy lands on the district line`);
          assert.ok(b.cta.y >= b.seat.y, `${where} call to action above the district line`);
        }
        assert.ok(b.cta.y + b.cta.h <= c.h, `${where} call to action off the foot`);

        if (side === 'front' && b.shape === 'beside') {
          /* Beside: a small slate holds the left at full height and the words
           * take the column it leaves. Neither may enter the other. */
          const right = Math.max(...b.figures.map((f) => f.slot.x + f.slot.w));
          assert.ok(b.top.x >= right, `${where} the words start inside the faces`);
          assert.ok(b.cta.x >= right, `${where} the call to action is on top of a face`);
          assert.ok(b.cta.y + b.cta.h <= b.bandRect.y + 1,
            `${where} the call to action sits on the band`);
        } else if (side === 'front') {
          /* A column: headline, supporting line, district line, call to action,
           * and the slate standing on the foot of the paper under all of it. */
          assert.ok(b.figures[0].slot.y > b.head.y, `${where} faces above the headline`);
          assert.ok(b.rows[0].y >= b.cta.y + b.cta.h - 1,
            `${where} the faces start above the call to action`);
        }
        if (side === 'front') {
          // Nothing on this side is lower than the candidates.
          const bottom = b.bandRect.y + b.bandRect.h;
          assert.ok(b.cta.y + b.cta.h <= bottom + 1, `${where} the call to action is below the slate`);
          if (b.seat) {
            assert.ok(b.seat.y + b.seat.block.h <= bottom + 1,
              `${where} the district line is below the slate`);
          }
        }
        if (side === 'back') {
          // An L: the slate takes the width above the carrier's line and the
          // words take the corner the carrier is not standing in.
          assert.ok(b.bandRect.y + b.bandRect.h <= p.mailPanel.y + 1,
            `${where} the slate crosses the carrier line`);
          assert.ok(b.head.y >= p.mailPanel.y - 1, `${where} the words are not below the line`);
        }
        // One row, both sides, however many are on the slate.
        assert.equal(b.rows.length, 1, `${where} came out in ${b.rows.length} rows`);

        /* The address side is an L: everything may use the full width above the
         * carrier's line, and only what sits below it moves to the left. What
         * nothing may do is enter the corner itself. */
        if (side === 'back') {
          assert.ok(p.mailPanel, `${where} lost the mail panel`);
          const m = p.mailPanel;
          const clear = (r, what) => assert.ok(
            r.x + r.w <= m.x + 1 || r.y + r.h <= m.y + 1, `${where} ${what} in the carrier corner`);
          for (const f of b.figures) clear(f.slot, 'a face');
          clear(b.bandRect, 'the name band');
          clear({ x: b.cta.x, y: b.cta.y, w: b.cta.w, h: b.cta.h }, 'the call to action');
          if (b.seat) {
            clear({ x: 0, y: b.seat.y, w: b.seat.block.w + b.cta.x * 2, h: b.seat.block.h },
              'the district line');
          }
          // The band and the faces earn the full width by staying above the line.
          assert.ok(b.bandRect.y + b.bandRect.h <= m.y + 1,
            `${where} the name band crosses the carrier line`);
          assert.ok(b.cta.x + b.cta.w <= m.x + 1, `${where} the call to action is not on the left`);
        } else {
          assert.equal(p.mailPanel, null, `${where} put a mail panel on the message side`);
        }
      }
    }
  }
});

test('a repository is named owner/repo, and a typo is caught before the push', async () => {
  const { parseRepo } = await import('../public/github.js');
  assert.deepEqual(parseRepo('josephfsweeney-oss/slate-studio'),
    { owner: 'josephfsweeney-oss', repo: 'slate-studio' });
  assert.deepEqual(parseRepo('  https://github.com/josephfsweeney-oss/slate-studio.git '),
    { owner: 'josephfsweeney-oss', repo: 'slate-studio' });
  for (const junk of ['', 'slate-studio', 'a/b/c', 'owner /repo', 'owner/repo?', null]) {
    assert.equal(parseRepo(junk), null, `${JSON.stringify(junk)} should not parse`);
  }
});

test('the push token stays in the browser and never reaches this app', () => {
  const ghSrc = fs.readFileSync(path.join(ROOT, 'public', 'github.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

  /* Every fetch in the push module goes to GitHub. One that went anywhere else,
   * including back to this app's own server, would be a token leak. */
  const fetches = [...ghSrc.matchAll(/fetch\(([^)]*)/g)].map((m) => m[1]);
  assert.ok(fetches.length, 'the push module makes no requests at all');
  for (const f of fetches) {
    assert.ok(/\bAPI\b/.test(f), `a request in github.js does not go to the API: ${f}`);
  }
  assert.match(ghSrc, /const API = 'https:\/\/api\.github\.com'/);

  // The token is not kept in the app's own saved state.
  assert.ok(!/state\.[A-Za-z.]*[Tt]oken/.test(appSrc),
    'the token must not live in the app state, which is saved to localStorage wholesale');

  // The field is a password field, and there is a way to forget it.
  assert.match(html, /id="gh-token"[^>]*type="password"/);
  assert.match(html, /id="gh-forget"/);
  assert.match(appSrc, /gh\.forget\(\)/);

  // And the panel says what the token is allowed to be.
  assert.match(html, /Contents set to\s*\n?\s*read and write/);
});

test('eight drops do not arrive as one piece eight times', () => {
  const rounds = MAIL_PROGRAMS[0].pieces;
  assert.equal(rounds.length, 8);

  const looks = rounds.map((p) => pieceLook(p));
  for (let i = 0; i < rounds.length; i++) {
    const l = looks[i];
    const id = rounds[i].id;
    assert.ok(l.palette, `${id} has no colourway`);
    assert.ok(l.canvas, `${id} has no trim`);
    assert.ok(PALETTES.some((x) => x.id === l.palette), `${id}: no palette called ${l.palette}`);
    assert.ok(CANVASES.some((x) => x.id === l.canvas), `${id}: no canvas called ${l.canvas}`);
  }

  // Nothing arrives twice running in the same colourway or the same trim.
  for (let i = 1; i < looks.length; i++) {
    assert.notEqual(looks[i].palette, looks[i - 1].palette,
      `${rounds[i].id} repeats the colourway before it`);
    assert.notEqual(looks[i].canvas, looks[i - 1].canvas,
      `${rounds[i].id} repeats the trim before it`);
  }

  /* And the message side changes shape through the drop, which is the thing
   * colour alone cannot do. */
  const shapes = new Set(rounds.map((p) => sideStyle(p, 'front', true).composition));
  assert.ok(shapes.size >= 3,
    `the drop runs on ${shapes.size} shape(s): ${[...shapes].join(', ')}`);
  assert.ok(shapes.has('ballot'), 'the closing round does not show the ballot');

  // Every shape a round asks for is one the engine can actually solve.
  for (const p of rounds) {
    const comp = sideStyle(p, 'front', true).composition;
    assert.ok(COMPOSITIONS.includes(comp), `${p.id} asks for a shape called ${comp}`);
    assert.ok(sideCopyFor(p, 'front', true), `${p.id} has no copy for its message side`);
  }
});

test('the lockup is set to the width and held to the height', () => {
  const piece = MAIL_PROGRAMS[0].pieces.find((x) => x.id === 'contract');
  const copy = { ...SIDE_COMMON, ...sideCopyFor(piece, 'front', true) };
  const style = sideStyle(piece, 'front', true);
  assert.equal(style.composition, 'guarantee', 'the opening round lost its lockup');

  /* Every trim it could be drawn at, including the wide short one where a word
   * set to the full width is taller than the panel it is on. */
  for (const id of ['mail6', 'mail11', 'email', '16x9', '1x1', 'story']) {
    const c = CANVASES.find((x) => x.id === id);
    if (!c) continue;
    const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi || 0, slate: [], copy, style },
      measure);
    const g = p.guarantee;
    const where = `${id}`;
    assert.ok(g, `${where} did not solve as a lockup`);
    assert.equal(p.tiles.length, 0, `${where} drew a tile on the lockup`);

    assert.equal(g.title.length, 2, `${where} lost half the lockup`);
    for (const t of g.title) assert.ok(t.px > 0, `${where} sized a word to nothing`);
    assert.ok(g.title[0].accent && !g.title[1].accent,
      `${where}: the first word carries the accent and the second does not`);

    /* The two words are told apart by the space between them. Set solid, with
     * the same face at the same width, GRANITE and GUARANTEE ran together. */
    assert.equal(g.title[0].y, g.titleTop, `${where}: the first word left the top`);
    const gap = g.title[1].y - (g.title[0].y + g.title[0].px * 0.82);
    assert.ok(gap >= Math.min(g.title[0].px, g.title[1].px) * 0.20,
      `${where}: only ${gap.toFixed(0)}px between the two words of the lockup`);

    // It fits between the masthead and the bar, and inside the frame.
    const last = g.title[g.title.length - 1];
    const bottom = last.y + last.px * 0.82;
    const floor = g.bar ? g.bar.y : g.frame.y + g.frame.h;
    assert.ok(bottom <= floor + 1,
      `${where}: the lockup runs ${(bottom - floor).toFixed(0)}px past the bar`);
    assert.ok(g.titleTop >= g.frame.y, `${where}: the lockup starts above the frame`);
    if (g.kick) assert.ok(g.kick.y >= g.frame.y, `${where}: the masthead is outside the frame`);

    // The four words are there, and they are four.
    assert.ok(g.bar, `${where} lost the bar`);
    assert.equal(g.bar.items.length, 4, `${where}: the bar carries ${g.bar.items.length} phrases`);
    assert.ok(g.bar.y + g.bar.h <= g.frame.y + g.frame.h + 1, `${where}: the bar is outside the frame`);
  }
});

test('the size dials move the ceiling, and the width still wins', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  /* A band, so there is a headline and a row of faces to move. Every round's
   * message side has a shape of its own now, so this asks for the band the
   * address side uses and drops the carrier's panel. */
  const piece = MAIL_PROGRAMS[0].pieces.find((x) => x.id === 'contract');
  const list = slate(4);
  /* With a district line on it, so there is a body block to watch as well as a
   * headline. The programme itself does not carry one any more. */
  const copy = { ...SIDE_COMMON, ...piece.back, list: null, footer: 'Belknap District 5' };
  const at = (style) => solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
    style: { composition: 'promise', mailPanel: 'none', ...style } }, measure);

  const base = at({});
  const big = at({ headScale: 1.6 });
  const small = at({ headScale: 0.7 });
  assert.ok(big.band.head.block.px > base.band.head.block.px,
    'asking for a bigger headline did nothing');
  assert.ok(small.band.head.block.px < base.band.head.block.px,
    'asking for a smaller headline did nothing');

  // A bigger headline takes its room from the faces, which is the honest trade.
  assert.ok(big.band.figures[0].slot.h < base.band.figures[0].slot.h,
    'the headline grew and nothing gave the room up');

  // The body dial moves the district line and the names with it.
  const bodyUp = at({ textScale: 1.4 });
  const bodyDown = at({ textScale: 0.7 });
  assert.ok(bodyUp.band.seat.block.px > base.band.seat.block.px, 'the district line did not grow');
  assert.ok(bodyDown.band.seat.block.px < base.band.seat.block.px, 'the district line did not shrink');
  assert.ok(bodyDown.band.figures[0].name.px < base.band.figures[0].name.px,
    'the name band ignored the dial');

  /* Out of range is held, not honoured, and a piece still comes out the other
   * side with everything on it wherever the dials are set. */
  for (const style of [{}, { headScale: 5 }, { headScale: 0.01 },
    { textScale: 9 }, { textScale: 0 }, { headScale: 2, textScale: 1.6 }]) {
    const p = at(style);
    const b = p.band;
    const where = JSON.stringify(style);
    assert.ok(b.head && b.cta && b.seat, `${where} lost a block`);
    assert.ok(b.head.block.px > 0 && b.cta.block.px > 0, `${where} sized something to nothing`);
    assert.ok(b.cta.y + b.cta.h <= b.bandRect.y + 1, `${where} put the foot below the slate`);
    assert.ok(b.head.y >= 0, `${where} pushed the headline off the top`);
    assert.ok(b.figures.length === 4, `${where} lost somebody`);
    for (const f of b.figures) assert.ok(f.slot.h > 0, `${where} sized a face to nothing`);
  }
});

test('every issue round names them first and answers second', () => {
  /* Copy is not all strings. A comparison is a list of lines with a direction on
   * each, and the filler used to turn it into an empty string, which took the
   * whole block off the artwork without saying so. */
  const list = [{ dir: 'down', text: 'one' }, { dir: 'up', text: 'two' }];
  const d = { id: 'r25', county: 'Rockingham', district: 25, towns: [], nominees: slate(2) };
  assert.equal(fillTokens(list, d), list, 'a list of lines did not survive the filler');
  assert.equal(fillTokens(7, d), 7);
  assert.equal(fillTokens('{{COUNTY}} {{DISTRICT}}', d), 'Rockingham 25');

  const c = CANVASES.find((x) => x.id === 'mail6');
  const rounds = MAIL_PROGRAMS[0].pieces.filter((x) => x.contrast && x.contrast.versus);
  assert.equal(rounds.length, 6, 'every issue round should carry its own comparison');
  const piece = rounds.find((x) => x.id === 'energy');
  assert.ok(piece, 'the energy round lost its arrows');
  const copy = { ...SIDE_COMMON, ...sideCopyFor(piece, 'front', true) };
  const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: slate(4), copy,
    style: sideStyle(piece, 'front', true) }, measure);
  const v = p.contrast.versus;
  assert.ok(v, 'the comparison did not reach the plan');
  assert.equal(v.rows.length, 2, 'a comparison takes two sides');
  assert.deepEqual(v.rows.map((r) => r.dir), ['up', 'down'],
    'theirs is named first and ours answers it');
  for (const r of v.rows) assert.ok(r.block.lines.length, 'an arrow with no line beside it');

  // The rows stack without landing on each other, and the block stays in the column.
  assert.ok(v.rows[1].dy >= v.rows[0].dy + v.rows[0].h, 'the two sides overlap');
  assert.ok(v.y + v.h <= p.contrast.cta.y + 1, 'the comparison lands on the foot');
  assert.ok(v.arrowW + v.gap < p.contrast.col.w, 'the arrow leaves no room for the line');

  /* Every round names them first and answers second, and the mark says which is
   * which before a word of it is read. */
  const AGAINST = ['up', 'no'];
  const FOR = ['down', 'yes'];
  for (const round of rounds) {
    const dirs = round.contrast.versus.map((r) => r.dir);
    assert.equal(dirs.length, 2, `${round.id}: a comparison takes two sides`);
    assert.ok(AGAINST.includes(dirs[0]), `${round.id}: does not name them first`);
    assert.ok(FOR.includes(dirs[1]), `${round.id}: does not answer with ours`);
    for (const r of round.contrast.versus) {
      assert.ok(CONTRAST_DIRS.includes(r.dir), `${round.id}: no mark called ${r.dir}`);
      assert.ok(String(r.text || '').trim().length > 10, `${round.id}: a mark with no line on it`);
    }
    // And no two rounds argue the same way.
    const twin = rounds.filter((x) => x.contrast.versus[1].text === round.contrast.versus[1].text);
    assert.equal(twin.length, 1, `${round.id}: two rounds say the same thing`);
  }
});

test('nothing is set in a colour that cannot be read on the ground under it', async () => {
  const { contrastRatio, readableOn } = await import('../public/render.js');

  /* The thing this guards. The Granite Guarantee green on the Granite Guarantee
   * navy is 2.6 to 1, which is under the floor for text of any size, and it is
   * why a kicker set in the accent on a dark ground could not be read. */
  assert.ok(contrastRatio('#2F7C4E', '#12314E') < 3,
    'the accent on the plate used to be readable; this test has nothing to guard');

  for (const pal of PALETTES) {
    const ground = pal.plateColor || '#12314E';
    const where = pal.id || pal.name || 'a palette';
    const chosen = readableOn(pal.accent, ground, pal.plateAccent, 4.5);
    assert.ok(contrastRatio(chosen, ground) >= 4.5,
      `${where}: accent text on the dark ground is ${contrastRatio(chosen, ground).toFixed(2)} to 1`);
    assert.ok(contrastRatio('#FFFFFF', ground) >= 4.5,
      `${where}: white on the dark ground is too close`);
    // White on the solid accent block, which is where the call to action sits.
    assert.ok(contrastRatio('#FFFFFF', pal.accent) >= 3,
      `${where}: the call to action is ${contrastRatio('#FFFFFF', pal.accent).toFixed(2)} to 1`);
  }

  /* And with no light accent to fall back on it lifts the accent itself until
   * it carries, rather than printing the brand colour and hoping. */
  const lifted = readableOn('#BF0A30', '#12314E', null, 4.5);
  assert.notEqual(lifted.toLowerCase(), '#bf0a30', 'the unreadable accent was used as it is');
  assert.ok(contrastRatio(lifted, '#12314E') >= 4.5,
    `lifting stopped at ${contrastRatio(lifted, '#12314E').toFixed(2)} to 1`);
});

test('the issue rounds argue on one side and carry the team on the other', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const list = slate(4);
  const seen = { contrast: 0, slate: 0, shaped: 0 };
  for (const piece of MAIL_PROGRAMS[0].pieces) {
    for (const side of ['front', 'back']) {
      const copy = { ...SIDE_COMMON, ...sideCopyFor(piece, side, true) };
      const style = sideStyle(piece, side, true);
      const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy, style }, measure);
      const where = `${piece.id} ${side}`;

      // The address side always carries the slate. A piece that never shows the
      // team is not a slate piece.
      if (side === 'back') {
        assert.ok(p.band, `${where} dropped the slate off the address side`);
        assert.equal(p.band.figures.length, 4, `${where} lost somebody`);
        continue;
      }
      if (piece.shape) {
        // A round with a shape of its own: not a band, and nobody's face on it.
        seen.shaped++;
        assert.ok(!p.band, `${where} asked for ${piece.shape} and got a band`);
        assert.equal(p.composition, piece.shape, `${where} did not come out as ${piece.shape}`);
        continue;
      }
      if (!piece.contrast) { seen.slate++; assert.ok(p.band, `${where} is not a slate side`); continue; }


      seen.contrast++;
      const b = p.contrast;
      assert.ok(b, `${where} did not solve as a contrast side`);
      // Nobody's face is on it.
      assert.equal(p.tiles.length, 0, `${where} drew a tile`);
      assert.equal(p.band, undefined, `${where} still carries the slate`);

      // It says something, it cites it, and it says when to vote.
      assert.ok(b.head, `${where} has no headline`);
      assert.ok(b.cta, `${where} has no call to action`);
      assert.match(b.cta.block.lines[0], /NOV\.? ?3/, `${where} does not say when to vote`);
      assert.equal(p.disclaimer, null, `${where} printed a disclaimer the print shop sets`);

      // The mark is one the painter can actually draw.
      assert.ok(b.mark, `${where} has no mark`);
      assert.ok(CONTRAST_MARKS.includes(b.mark.id), `${where} asks for a mark called ${b.mark.id}`);

      /* A photograph is the ground of the piece, so the words sit on it and it
       * runs the whole paper. A drawing has no ground, so it keeps a panel of
       * its own and the words stay out of it. */
      if (b.mark.art) {
        assert.equal(b.mark.rect.x, 0, `${where} the photograph does not start at the edge`);
        assert.equal(b.mark.rect.w, c.w, `${where} the photograph does not run the full width`);
        assert.equal(b.mark.rect.h, c.h, `${where} the photograph does not run the full height`);
        assert.ok(b.col.w < c.w * 0.7, `${where} the words take the whole width of the picture`);
      } else {
        assert.ok(b.col.x + b.col.w <= b.mark.rect.x + 1, `${where} the words run under the drawing`);
        assert.ok(b.mark.rect.x + b.mark.rect.w <= c.w, `${where} the drawing runs off the paper`);
        assert.ok(b.mark.rect.y + b.mark.rect.h <= b.cta.y + 1, `${where} the drawing sits on the foot`);
      }

      // Nothing in the column lands on the foot.
      for (const at of [b.kicker, b.head, b.number, b.caption]) {
        if (at) assert.ok(at.y + at.block.h <= b.cta.y + 1, `${where} the words land on the foot`);
      }
      // A side that attacks a record and does not cite it says so out loud.
      const cited = String(copy.source || '').trim();
      const warned = p.warnings.some((x) => /source line/.test(x));
      assert.equal(warned, !cited, `${where} warning and source line disagree`);
    }
  }
  assert.equal(seen.contrast, 6, 'six issue rounds should argue');
  assert.equal(seen.slate, 0, 'every round now gives its message side a shape');
  assert.equal(seen.shaped, 2, 'the guarantee opens the drop and the ballot closes it');
});

test('the slate takes the width it needs and the words take what is left', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const piece = MAIL_PROGRAMS[0].pieces[0];
  const seen = {};
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const list = slate(n);
    for (const side of ['front', 'back']) {
      const copy = { ...SIDE_COMMON, ...piece[side] };
      const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
        style: sideStyle(piece, side) }, measure);
      const b = p.band;
      const where = `${side} n=${n}`;
      const a = b.aside;
      (seen[side] = seen[side] || []).push(a ? a.tier : 'none');

      if (!a) {
        /* Nothing is taking the leftover, so the slate has it: the first face
         * starts at the left margin and the last one ends at the right. */
        const pad = b.pad;
        const l = Math.min(...b.figures.map((f) => f.slot.x));
        const r = Math.max(...b.figures.map((f) => f.slot.x + f.slot.w));
        assert.ok(Math.abs(l - pad) <= 2, `${where} the slate does not start at the margin`);
        assert.ok(Math.abs(r - (c.w - pad)) <= 2,
          `${where} the slate does not reach the far margin (${(c.w - pad - r).toFixed(0)}px short)`);
        continue;
      }
      assert.ok(['words', 'plate'].includes(a.tier), `${where} unknown block ${a.tier}`);

      // The block takes what is left. It never takes a face's ground.
      const right = Math.max(...b.figures.map((f) => f.slot.x + f.slot.w));
      assert.ok(a.rect.x >= right, `${where} the block starts inside the slate`);
      assert.ok(a.rect.x + a.rect.w <= c.w, `${where} the block runs off the paper`);
      assert.ok(a.rect.w > 0 && a.rect.h > 0, `${where} the block has no size`);

      // And it never enters the corner the carrier is standing in.
      if (p.mailPanel) {
        const m = p.mailPanel;
        assert.ok(a.rect.x + a.rect.w <= m.x + 1 || a.rect.y + a.rect.h <= m.y + 1,
          `${where} the block is in the carrier corner`);
      }
    }
  }
  /* One candidate frees most of the piece and something stands in it. A full
   * slate of eight frees nothing and nothing does. */
  assert.equal(seen.front[0], 'words', 'one candidate does not free the column');
  assert.equal(seen.back[0], 'plate', 'one candidate does not free a block on the address side');
  assert.equal(seen.front[7], 'none', 'eight candidates still left a block on the message side');
  assert.equal(seen.back[7], 'none', 'eight candidates still left a block on the address side');
  // And once the slate has taken the width, it keeps it.
  for (const side of ['front', 'back']) {
    const firstNone = seen[side].indexOf('none');
    assert.ok(firstNone > 0, `${side} never ran out of room`);
    assert.ok(seen[side].slice(firstNone).every((t) => t === 'none'),
      `${side} got a block back after losing it: ${seen[side].join(',')}`);
  }
});

test('two rows are a montage under one band, not two slates', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const piece = MAIL_PROGRAMS[0].pieces[0];
  for (const n of [6, 7, 8]) {
    const list = slate(n);
    const copy = { ...SIDE_COMMON, ...piece.back };
    const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
      style: { ...sideStyle(piece, 'back'), twoRows: true } }, measure);
    const b = p.band;
    const where = `two rows n=${n}`;
    assert.equal(b.rows.length, 2, `${where} did not come out in two rows`);

    // One band, under the group. The upper row has none of its own.
    assert.equal(b.rows.filter((r) => r.band).length, 1, `${where} drew a band per row`);
    assert.ok(!b.rows[0].band, `${where} put a band between the rows`);

    /* A team photograph, not a grid. The back row's heads stay above the front
     * row's, the front row comes up into it rather than clearing it, and the
     * back row is cut at the line the front row stands on. */
    assert.ok(b.rows[1].y > b.rows[0].y, `${where} the back row is not above the front`);
    assert.ok(b.rows[1].y < b.rows[0].y + b.rows[0].h,
      `${where} the rows clear each other instead of clumping`);
    const back = b.figures.filter((f) => f.slot.y === b.rows[0].y);
    assert.ok(back.every((f) => Math.abs(f.slot.y + f.clipH - b.rows[1].y) <= 1),
      `${where} the back row is not cut at the front row's line`);
    assert.ok(b.figures.filter((f) => f.slot.y === b.rows[1].y)
      .every((f) => f.clipH >= f.slot.h - 1), `${where} the front row is cut too`);

    /* The second row stands in the gaps of the first, not in a grid behind it:
     * it is offset by half a face. */
    const step = b.figures[1].slot.x - b.figures[0].slot.x;
    const off = b.rows[1] && b.figures.find((f) => f.slot.y === b.rows[1].y).slot.x
      - b.figures[0].slot.x;
    assert.ok(Math.abs(off - step / 2) <= 2,
      `${where} the second row is not offset half a face (${off.toFixed(0)} of ${step.toFixed(0)})`);

    /* Every name is inside that one band, on the line under its own row, and
     * side by side with the names beside it. */
    const boxes = b.figures.map((f) => f.nameBox);
    const bandBottom = b.bandRect.y + b.bandRect.h;
    for (const x of boxes) {
      assert.ok(x.y >= b.bandRect.y - 1 && x.y + x.h <= bandBottom + 1,
        `${where} a name sits outside the band`);
    }
    const perRow = b.rows[0].h && b.figures.filter((f) => f.slot.y === b.rows[0].y).length;
    for (let i = 1; i < boxes.length; i++) {
      const sameLine = Math.abs(boxes[i].y - boxes[i - 1].y) <= 1;
      if (sameLine) {
        /* Side by side. The cells overlap a little because the shoulders do,
         * so the test is that each one clears most of the one before it. */
        assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].w * 0.85,
          `${where} name ${i} lands on the one before it`);
      } else {
        assert.ok(boxes[i].y > boxes[i - 1].y,
          `${where} the second row's names are not under the first row's`);
        assert.equal(i, perRow, `${where} the line broke in the wrong place`);
      }
    }
    assert.deepEqual(b.figures.map((f) => f.candidate.name), list.map((x) => x.name),
      `${where} is not in ballot order`);
    // And the faces still stand on it.
    for (const r of b.rows) {
      assert.ok(r.y + r.h <= b.bandRect.y + 1, `${where} faces run past the band`);
    }
  }
});

test('the name band says every name the same way, and never drops a surname', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const piece = MAIL_PROGRAMS[0].pieces[0];
  const run = (n) => solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: slate(n),
    copy: { ...SIDE_COMMON, ...piece.front },
    style: sideStyle(piece, 'front') }, measure).band;

  for (const n of [1, 4, 6, 9, 10]) {
    const b = run(n);
    const sizes = new Set(b.figures.map((f) => Math.round(f.name.px * 100)));
    assert.equal(sizes.size, 1, `${n} names came out at ${sizes.size} different sizes`);
    const forms = new Set(b.figures.map((f) => f.name.dropped));
    assert.equal(forms.size, 1, `${n} names: some introduced, some filed`);
    for (const f of b.figures) {
      assert.ok(f.name.text.toUpperCase().includes(f.candidate.last.toUpperCase()),
        `${f.candidate.name} lost the surname, which is what a voter matches on the ballot`);
    }
  }
  // Every name is readable in the cell it is in, whichever form it took.
  for (const n of [1, 4, 6, 9, 10]) {
    const b = run(n);
    for (const f of b.figures) {
      assert.ok(f.name.px <= f.nameBox.w * 0.5,
        `${n} names: ${f.name.text} is set wider than the cell it is under`);
    }
  }
});

/* --------------------------------------------------------------- portraits */

test('a photo already on file can be re-framed, not only a newly picked one', async () => {
  /* The zoom and the drag used to appear the moment somebody picked a new file
   * and never otherwise, so the only way to move a face up an inch in an
   * existing portrait was to find the original and upload it again. The editor
   * loads what is on file, which means every control it has works on it. */
  const src = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  assert.match(src, /function loadForReframe\b/, 'the editor never loads what is on file');
  assert.match(src, /loadForReframe\(n, ed\.token\)/, 'opening the editor does not load it');
  // The knockout is off while re-framing: a cutout cut out twice loses its edges.
  assert.match(src, /ed\.reframing = true;[\s\S]{0,200}ed\.knockout = false;/,
    're-framing turns the knockout on');
  assert.match(src, /\$\('#photo-knockout'\)\.closest\('\.inline'\)\.hidden = !picking \|\| ed\.reframing;/,
    'the knockout is still offered while re-framing');
});

test('the app says where an uploaded photo lives and how to share it', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  // A photo dropped in on a hosted copy is in one browser's storage and nowhere
  // else. Somebody asked how to share them, which means the app was not saying.
  assert.match(src, /in this browser and nowhere else/);
  assert.match(src, /public\/cutouts/);
  assert.match(src, /npm run index:cutouts/);
});
