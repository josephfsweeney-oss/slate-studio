import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { _internal } from '../server/catalog.js';
import { ROOT } from '../server/config.js';

const csv = fs.readFileSync(path.join(ROOT, 'data', 'slate-manifest.csv'), 'utf8');

test('the bundled manifest matches the deck build', () => {
  const byId = _internal.fromManifest(csv);
  assert.equal(byId.size, 174, 'districts with at least one Republican nominee');
  const nominees = [...byId.values()].reduce((a, d) => a + d.nominees.length, 0);
  assert.equal(nominees, 330, 'Republican nominees');
  assert.equal([...byId.values()].filter((d) => d.built).length, 85, 'districts that built');
  assert.equal([...byId.values()].filter((d) => d.nominees.length >= 2).length, 81, 'multi-member slates');
});

test('Rockingham 25 reads the way the hand-checked roster reads', () => {
  const d = _internal.fromManifest(csv).get('Rockingham-25');
  assert.equal(d.seats, 9);
  assert.equal(d.nominees.length, 9);
  assert.equal(d.nominees[0].name, 'Lorie Ball');
  assert.equal(d.nominees[6].name, 'Joe Sweeney');
  assert.ok(d.missing.includes('John Sytek'));
});

test('deck filenames parse back to a district', () => {
  const m = _internal.DECK_RE.exec('NHGOP-Slate-Hillsborough-33-clean-1080x1080.png');
  assert.deepEqual(m.slice(1), ['Hillsborough', '33', 'clean', '1080', '1080']);
  assert.equal(_internal.DECK_RE.exec('README.md'), null);
});

test('roster.json wins over the manifest for seats and towns', () => {
  const byId = _internal.fromManifest(csv);
  _internal.mergeRoster(byId, [{
    county: 'Rockingham', district: 25, seats: 9, towns: ['Salem'], overfilled: false,
    nominees: [{ name: 'Joe Sweeney', town: 'Salem', incumbent: true, in_sos_primary: true }],
  }]);
  const d = byId.get('Rockingham-25');
  assert.deepEqual(d.towns, ['Salem']);
  assert.equal(d.nominees.length, 1);
  assert.equal(d.nominees[0].last, 'SWEENEY');
  assert.equal(d.nominees[0].incumbent, true);
});
