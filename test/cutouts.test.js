import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../server/config.js';

/* /api/cutout/ writes a file into the repo, so the filename is the whole
 * security surface. It is checked against a pattern and then against the
 * roster: a name that is not <Slug>.webp|png never reaches the disk, and
 * neither does a slug nobody is standing for. */

const PROBE = path.join(ROOT, 'test', 'helpers', 'probe-cutouts.mjs');

function probe(env = {}) {
  const out = execFileSync(process.execPath, [PROBE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      SLATE_NO_DOTENV: '1',
      // Its own state dir, so invalidating the catalog does not clear a
      // developer's while they are working.
      SLATE_STATE_DIR: path.join(ROOT, '.slate-studio', 'test-cutouts'),
      ...env,
    },
  });
  return JSON.parse(out);
}

/** True in a checkout that carries the code without the portraits. */
const noCutouts = (r) => Boolean(r.noCutouts);
const skipReason = 'no public/cutouts in this checkout, so there is nothing to overwrite';

test('a portrait can be written and the index follows it', (t) => {
  const r = probe();
  if (noCutouts(r)) return t.skip(skipReason);
  assert.equal(r.write.status, 200, r.write.body);
  assert.equal(r.write.json.file, r.victim);
  assert.ok(r.write.json.name, 'the response names the candidate, not just the slug');
  assert.equal(r.landed, true, 'the bytes posted are the bytes on disk');
  assert.equal(r.indexed, true, 'data/cutouts.json lists it, which is how a hosted copy finds it');
  assert.equal(r.restored, true, 'the probe put the original back');
});

test('the top of the ticket can have a portrait saved for her', (t) => {
  /* She is on the piece without being on a district roster, and the route
   * checks the slug against the roster to stop it being a way to write any
   * file into the repo. Leaving the toppers out of that check is what made
   * her the one person whose photo could not be changed. */
  const r = probe();
  if (noCutouts(r)) return t.skip(skipReason);
  assert.equal(r.topper.status, 200, r.topper.body);
  assert.equal(r.topper.json.name, 'Kelly Ayotte');
  assert.equal(r.topperLanded, true, 'the file was not written');
});

test('a filename that is not a portrait never reaches the disk', (t) => {
  const r = probe();
  if (noCutouts(r)) return t.skip(skipReason);
  for (const key of ['traversal', 'dotdot', 'wrongExt']) {
    assert.equal(r[key].status, 400, `${key} was not refused: ${r[key].body}`);
  }
  assert.equal(r.strangerSlug.status, 404,
    'a well-formed name for nobody on the roster is still refused');
  assert.equal(r.empty.status, 400, 'an empty body would blank out a portrait');
  assert.equal(r.getIsRefused.status, 405, 'the route writes; GET has nothing to do here');
  assert.equal(r.untouched, true, 'a refused request left the file alone');
});

test('a public deployment cannot write portraits at all', (t) => {
  const r = probe({ SLATE_PUBLIC: '1' });
  if (noCutouts(r)) return t.skip(skipReason);
  assert.equal(r.write.status, 403, r.write.body);
  assert.equal(r.landed, false, 'nothing was written');
  assert.equal(r.getIsRefused.status, 403);
});
