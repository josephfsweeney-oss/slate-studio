import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, bestGrid, PHOTO_AR, PLATE_AR, COMPOSITIONS } from '../public/layout.js';
import { nameParts, slugify } from '../public/names.js';
import { fillTokens, CANVASES, TEMPLATES } from '../public/presets.js';
import { MAIL_PROGRAMS, sideStyle } from '../public/mailers.js';

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

test('every Granite Guarantee piece lays out on both sides without collision', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const prog = MAIL_PROGRAMS[0];
  const typed = { TAX_RATE: '$14.72', OPP_LAST: 'Spahr', OPP_VOTE: 'no',
    POLL_HOURS: '7 AM to 7 PM', POLL_PLACE: 'Salem High School' };
  for (const piece of prog.pieces) {
    for (const n of [1, 2, 5, 9]) {
      const list = slate(n);
      const d = { id: 'r25', county: 'Rockingham', district: 25, seats: n,
                  towns: ['Salem'], nominees: list };
      for (const side of ['front', 'back']) {
        const raw = { ...piece[side], disclaimer: COPY.disclaimer };
        const copy = {};
        for (const [k, v] of Object.entries(raw)) {
          copy[k] = fillTokens(v, d, { lead: list[0], typed });
        }
        const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list, copy,
          style: sideStyle(piece, side) }, measure);
        const where = `${piece.id} ${side} n=${n}`;
        assert.equal(p.composition, side === 'front' ? 'promise' : 'proof', where);

        const g = p.promise || p.proof;
        // Nothing typed may leave the column it was measured into.
        for (const b of g.bands) {
          assert.ok(b.y >= 0 && b.y + b.h <= c.h + 1, `${where} ${b.role} off the piece`);
          assert.ok(b.block.w <= g.col.w + 1, `${where} ${b.role} wider than its column`);
        }
        // Nor may it reach the carrier's corner.
        if (p.mailPanel) {
          const right = g.col.x + g.col.w;
          const low = g.bands.some((b) => b.y + b.h > p.mailPanel.y);
          assert.ok(!(right > p.mailPanel.x && low), `${where} copy in the mail panel`);
        }
        // The faces stay inside the panel that holds them.
        for (const t of p.tiles) {
          assert.ok(t.x >= g.well.x - 1 && t.x + t.w <= g.well.x + g.well.w + 1, `${where} face off the panel`);
          assert.ok(t.y >= g.well.y - 1 && t.y + t.h <= g.well.y + g.well.h + 1, `${where} face off the panel`);
        }
        if (side === 'back') {
          assert.ok(p.disclaimer, `${where} lost the disclaimer`);
          assert.ok(!p.warnings.some((x) => /needs one under RSA/.test(x)), where);
        }
      }
    }
  }
});

test('a bulleted item gets one dot however many lines it wraps to', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const d = { id: 'r25', county: 'Rockingham', district: 25, seats: 1, towns: ['Salem'], nominees: slate(1) };
  const items = [
    'A short one.',
    'A much longer item that has no chance of fitting on a single line of type at this size, and so wraps.',
    'Another short one.',
  ];
  const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: slate(1),
    copy: { kicker: 'Proof', headline: 'The record', record: items.join('\n'),
            disclaimer: COPY.disclaimer },
    style: { composition: 'proof' } }, measure);
  const body = p.proof.bands.find((b) => b.role === 'body');
  assert.ok(body, 'the evidence lines are on the piece');
  assert.ok(body.block.lines.length > items.length, 'the long item really did wrap');
  assert.equal(body.block.starts.length, items.length, 'one dot per item, not per line');
  assert.equal(body.block.starts[0], 0);
});

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

test('the roster card floats: a margin of photograph on every side, and the copy clear of it', () => {
  const c = CANVASES.find((x) => x.id === 'mail6');
  const prog = MAIL_PROGRAMS[0];
  for (const piece of prog.pieces) {
    for (const n of [1, 4, 9]) {
      const list = slate(n);
      const p = solve({ canvas: { w: c.w, h: c.h }, dpi: c.dpi, slate: list,
        copy: { ...piece.front, disclaimer: COPY.disclaimer },
        style: sideStyle(piece, 'front') }, measure);
      const g = p.promise;
      const where = `${piece.id} n=${n}`;
      // Inset on all four sides: a card edge to edge is the seam this replaced.
      assert.ok(g.card.x > 0 && g.card.x + g.card.w < c.w, `${where} card touches a side`);
      assert.ok(g.card.y > 0 && g.card.y + g.card.h < c.h, `${where} card touches top or foot`);
      // The words never run under it.
      const colRight = g.col.x + g.col.w;
      const cardRight = g.card.x + g.card.w;
      assert.ok(colRight <= g.card.x + 1 || g.col.x >= cardRight - 1,
        `${where} the copy column overlaps the card`);
      for (const b of g.bands) {
        assert.ok(b.block.w <= g.col.w + 1, `${where} ${b.role} wider than its column`);
      }
      // And the faces stay on the card, clear of its caption strip.
      const footTop = g.bar ? g.bar.y : g.card.y + g.card.h;
      for (const t of p.tiles) {
        assert.ok(t.x >= g.card.x - 1 && t.x + t.w <= cardRight + 1, `${where} face off the card`);
        assert.ok(t.y >= g.card.y - 1 && t.y + t.h <= footTop + 1, `${where} face under the caption`);
      }
      // The photograph is the whole piece, so it can bleed.
      assert.equal(g.photo.w, c.w, `${where} the photograph is not full bleed`);
      assert.equal(g.photo.h, c.h, `${where} the photograph is not full bleed`);
    }
  }
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
