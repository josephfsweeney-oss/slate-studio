import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, bestGrid, PHOTO_AR, PLATE_AR } from '../public/layout.js';
import { nameParts, slugify } from '../public/names.js';
import { fillTokens, CANVASES, TEMPLATES } from '../public/presets.js';

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

test('every slate size fits every canvas without overflow', () => {
  for (const c of CANVASES) {
    for (let n = 1; n <= 10; n++) {
      const p = solve({ canvas: { w: c.w, h: c.h }, slate: slate(n), copy: COPY, style: {} }, measure);
      assert.equal(p.tiles.length, n, `${c.id} n=${n} tile count`);
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
