import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { encode, versionFor, MAX_BYTES } from '../public/qr.js';
import { writeQr } from '../build/qr-png.mjs';
import { ROOT } from '../server/config.js';

/* A dead QR code kills a whole mail drop, and a QR code that is wrong looks
 * exactly like one that is right. So this file never checks the encoder against
 * itself. It checks the algebra against its own defining property, the format
 * information by reading it back out of the finished matrix, and the modules by
 * putting them through a real decoder.
 *
 * Two bugs were caught here that no amount of reading the code would have
 * found: the error correction divisor built in the wrong term order, and the
 * format reservation blanking two modules of the timing pattern. Both produced
 * a QR code that looked perfectly well formed. */

/* ------------------------------------------------------- shape and capacity */

test('the version grows with the message and the size follows the version', () => {
  const sizeOf = (v) => v * 4 + 17;
  let last = 0;
  for (const [text, want] of [['X', 1], ['A'.repeat(7), 1], ['A'.repeat(8), 2],
    ['A'.repeat(14), 2], ['A'.repeat(15), 3], ['A'.repeat(119), 10]]) {
    assert.equal(versionFor(text), want, `${text.length} bytes wanted version ${want}`);
    const q = encode(text);
    assert.equal(q.version, want);
    assert.equal(q.size, sizeOf(want));
    assert.equal(q.modules.length, q.size);
    assert.ok(q.modules.every((r) => r.length === q.size), 'the matrix is not square');
    assert.ok(q.size >= last);
    last = q.size;
  }
});

test('a message too long to encode is refused with the reason', () => {
  assert.equal(MAX_BYTES, 119);
  assert.equal(versionFor('A'.repeat(120)), null);
  assert.throws(() => encode('A'.repeat(120)), /short URL/,
    'an over-long string has to say what to do about it, not just fail');
});

test('the fixed patterns are where a scanner looks for them', () => {
  const q = encode('https://nhhousegop.com/salem');
  const { modules: m, size } = q;
  // Three finders: a 7x7 ring with a 3x3 core, and a light separator round it.
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    assert.equal(m[oy][ox], true, 'finder corner');
    assert.equal(m[oy + 1][ox + 1], false, 'finder ring gap');
    assert.equal(m[oy + 3][ox + 3], true, 'finder core');
  }
  // The timing pattern alternates the whole way between the finders, and is
  // dark on even coordinates. Blanking it is invisible and fatal.
  for (let i = 8; i < size - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, `timing row broken at x=${i}`);
    assert.equal(m[i][6], i % 2 === 0, `timing column broken at y=${i}`);
  }
  assert.equal(m[size - 8][8], true, 'the always-dark module is not dark');
});

/* --------------------------------------------------------- the algebra holds */

test('the error correction satisfies the property that defines it', () => {
  /* A Reed-Solomon codeword is one whose polynomial has roots at the first n
   * powers of the field generator. Checking that is checking the maths, not
   * checking one implementation against another. The first version of the
   * divisor here built its terms in the wrong order: right length, right
   * degree, wrong polynomial, and every code it made was unreadable. */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  // Read the codewords back out of a finished matrix: unmask, then walk the
  // snake, then de-interleave the one block a version 1 code has.
  const q = encode('X');
  const size = q.size;
  const fixed = fixedMap(size);
  const mask = readMask(q.modules, size);
  const bits = snake(q.modules, fixed, size, mask);
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  assert.equal(cw.length, 26, 'a version 1 code is 26 codewords');
  assert.deepEqual(cw.slice(0, 3), [0x40, 0x15, 0x80], 'byte mode, one byte, the letter X');

  let bad = 0;
  for (let i = 0; i < 17; i++) {          // 17 error correction codewords at level H
    let acc = 0;
    const a = EXP[i];
    for (const c of cw) acc = mul(acc, a) ^ c;
    if (acc !== 0) bad++;
  }
  assert.equal(bad, 0, 'the codeword polynomial does not have the roots it must have');
});

test('the format information reads back as level H and the mask that was used', () => {
  for (const text of ['X', 'https://nhhousegop.com/d25', 'A'.repeat(90)]) {
    const q = encode(text);
    const size = q.size;
    const value = formatValue(q.modules, size, 'first');
    assert.equal(value, formatValue(q.modules, size, 'second'),
      'the two copies of the format information disagree');
    assert.equal(value >> 3, 0b10, 'the error correction level is not H');
    const mask = value & 7;
    assert.ok(mask >= 0 && mask <= 7);
    // The mask the format claims has to be the one actually applied. Read a
    // known data module back through it and check the bit stream starts right.
    const bits = snake(q.modules, fixedMap(size), size, mask);
    const head = bits.slice(0, 4).join('');
    assert.equal(head, '0100', `mask ${mask} does not undo to byte mode`);
  }
});

/* ------------------------------------------------------------- real decoding */

const DECODER = path.join(ROOT, 'build', 'decode-qr.py');
function decoderAvailable() {
  try {
    execFileSync('python3', ['-c', 'import cv2'], { stdio: 'ignore' });
    return fs.existsSync(DECODER);
  } catch { return false; }
}

test('the codes a campaign actually prints come back off a decoder as themselves', (t) => {
  if (!decoderAvailable()) {
    return t.skip('no OpenCV here. Install it to run the decode check: pip install opencv-python-headless');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-qr-'));
  const cases = [
    'https://nhhousegop.com',
    'https://nhhousegop.com/salem',
    'https://votesweeney.com/rockingham-25',
    'https://nhhousegop.com/absentee?d=rockingham-25',
    'https://www.nhhousegop.com/rockingham-25/absentee-ballot?src=palm',
    'Vote Republican, November 3',
  ];
  for (const text of cases) {
    const file = path.join(dir, 'q.png');
    const q = writeQr(text, file, 8, 4);
    const got = execFileSync('python3', [DECODER, file], { encoding: 'utf8' });
    assert.equal(got, text, `version ${q.version} did not decode back to itself`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a code still decodes at the smallest size the skill allows in print', (t) => {
  if (!decoderAvailable()) return t.skip('no OpenCV here');
  /* 0.75 inch is the floor, 1 inch preferred. At 300 dpi that is 225 px for a
   * version 4 code, so about 6 px per module. Below that the ink spread on
   * uncoated stock closes the gaps. */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-qr-'));
  const text = 'https://nhhousegop.com/salem';
  for (const scale of [6, 8, 12]) {
    const file = path.join(dir, `q${scale}.png`);
    writeQr(text, file, scale, 4);
    const got = execFileSync('python3', [DECODER, file], { encoding: 'utf8' });
    assert.equal(got, text, `${scale} px per module did not decode`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ helpers */

/** Which modules are function patterns, so the snake can skip them. */
function fixedMap(size) {
  const f = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) f[y][x] = true; };
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) mark(ox + x, oy + y);
  }
  for (let i = 0; i < size; i++) { mark(i, 6); mark(6, i); }
  for (let i = 0; i <= 8; i++) { mark(i, 8); mark(8, i); }
  for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  const version = (size - 17) / 4;
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  for (const cy of ALIGN[version] || []) {
    for (const cx of ALIGN[version] || []) {
      const onFinder = (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= size - 9) || (cx >= size - 9 && cy <= 8);
      if (onFinder) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) mark(cx + x, cy + y);
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      mark(Math.floor(i / 3), size - 11 + (i % 3));
      mark(size - 11 + (i % 3), Math.floor(i / 3));
    }
  }
  return f;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function formatCells(size) {
  const first = [];
  for (let i = 0; i <= 5; i++) first.push([8, i]);
  first.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i <= 14; i++) first.push([14 - i, 8]);
  const second = [];
  for (let i = 0; i <= 7; i++) second.push([size - 1 - i, 8]);
  for (let i = 8; i <= 14; i++) second.push([8, size - 15 + i]);
  return { first, second };
}

/* The format cells are listed bit 0 first, and bit 0 is the least significant,
 * so the list has to be reversed before it is read as a number. */
function formatValue(m, size, which = 'first') {
  const cells = formatCells(size)[which];
  const bits = cells.map(([x, y]) => (m[y][x] ? 1 : 0)).reverse().join('');
  return (parseInt(bits, 2) ^ 0b101010000010010) >> 10;
}

const readMask = (m, size) => formatValue(m, size) & 7;

/** Walk the data modules the way the standard lays them out, un-masking. */
function snake(m, fixed, size, mask) {
  const bits = [];
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (const x of [right, right - 1]) {
        if (fixed[y][x]) continue;
        bits.push((m[y][x] !== MASKS[mask](x, y)) ? 1 : 0);
      }
    }
    up = !up;
  }
  return bits;
}
