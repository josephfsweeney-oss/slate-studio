import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

/* The photo editor was unusable for the person it was built for, and the two
 * reasons were both in the markup rather than in any logic:
 *
 *   accept="image/*" leaves HEIC greyed out and unselectable in the macOS file
 *   dialog, and an iPhone shoots HEIC by default, so the most likely photo
 *   anybody has could not be picked at all;
 *
 *   a hidden input clicked from script is the fragile way to open a file
 *   dialog. It is unreliable on iOS and blocked in some embeddings. A label
 *   wrapping the input needs no script and works everywhere.
 *
 * Neither shows up in a unit test of the engine, and the browser test that
 * existed used setInputFiles, which writes straight to the input and never
 * touches the button. So these are checked in the markup. */

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'app.css'), 'utf8');

test('the photo input is inside its own label and is not hidden', () => {
  const label = /<label id="photo-pick"[\s\S]*?<\/label>/.exec(html);
  assert.ok(label, 'the pick control is not a label');
  assert.match(label[0], /<input type="file" id="photo-file"/,
    'the file input is not inside the label, so a tap will not reach it');
  assert.ok(!/id="photo-file"[^>]*\shidden/.test(html),
    'the file input carries the hidden attribute; a hidden input cannot be relied on');
  assert.ok(!/\$\('#photo-file'\)\.click\(\)/.test(appjs),
    'something still opens the dialog by clicking a hidden input from script');
  // The input has to be the thing under the pointer, at zero opacity.
  assert.match(css, /\.pick input\[type=file\]\{[^}]*opacity:0/,
    'the input is not laid over the button');
});

test('the file dialog offers the format an iPhone actually produces', () => {
  const accept = /<input type="file" id="photo-file"[\s\S]*?accept="([^"]+)"/.exec(html);
  assert.ok(accept, 'the file input has no accept list');
  const list = accept[1].toLowerCase();
  for (const want of ['.heic', '.heif', '.jpg', '.png', 'image/*']) {
    assert.ok(list.includes(want), `accept does not offer ${want}: ${list}`);
  }
});

test('a file the browser cannot read says which file and what to do', () => {
  // whyNot is not exported, so read the strings it has to contain. A generic
  // "would not open as an image" is what sent somebody away from the feature.
  assert.ok(!/would not open as an image/.test(appjs),
    'the generic decode failure message is still there');
  for (const must of ['HEIC', 'Most Compatible', 'Export as JPEG']) {
    assert.ok(appjs.includes(must), `the HEIC message is missing "${must}"`);
  }
  assert.match(appjs, /createImageBitmap/,
    'no second decode attempt, so Safari cannot open a HEIC the way it can');
});

test('the roster panel resolves everybody on the piece, not just the roster', () => {
  /* The governor was the one person whose photo could not be changed, because
   * every lookup from a roster row searched the district's nominees and she is
   * not one of them. Clicking her thumbnail found nobody and returned, which
   * from the outside is a button that does nothing at all. */
  assert.match(appjs, /const personByName = /, 'there is no shared resolver');
  assert.match(appjs, /TOPPERS\.find\(\(t\) => t\.name === name\)/,
    'the resolver does not look at the toppers');
  const bare = [...appjs.matchAll(/district\(\)\?\.nominees\.find\([^)]*\)/g)]
    .map((m) => m[0]);
  assert.equal(bare.length, 1,
    `${bare.length} places search only the district roster; they must go through `
    + `personByName:\n  ${bare.join('\n  ')}`);
  // And the cutout path on a topper is a hope, not a fact, so nothing may read
  // it as proof a portrait exists.
  assert.ok(!/n\?\.cutout \? 'The portrait that ships/.test(appjs),
    'the editor still treats a topper cutout path as a portrait that is there');
});

test('there are three ways to get a photo in, not one', () => {
  assert.match(appjs, /addEventListener\('drop'/, 'no drag and drop');
  assert.match(appjs, /addEventListener\('paste'/, 'no paste');
  assert.match(html, /id="photo-ways"/, 'the other two ways in are not mentioned on screen');
  assert.match(html, /<input type="file" id="photo-file"/, 'no file input');
});
