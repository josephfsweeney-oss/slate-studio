/* QR encoder. Byte mode, error correction level H, versions 1 to 10.
 *
 * Written out rather than pulled in because this app has no runtime
 * dependencies and a dead QR code kills a whole mail drop. Level H is the
 * 30 percent one: it survives a logo dropped in the middle, a fold through the
 * code, and the ink spread you get on cheap uncoated stock.
 *
 * Returns a square boolean matrix, dark = true, with no quiet zone. The painter
 * adds the quiet zone, which has to be at least four modules on every side.
 *
 * Verified by decoding the rendered pixels, not by reading this file. See
 * test/qr.test.js and build/decode-qr.py.
 */

/* Per version at level H: [ecPerBlock, blocksInGroup1, dataPerBlockG1,
 * blocksInGroup2, dataPerBlockG2]. Straight out of the standard's tables. */
const EC_H = {
  1: [17, 1, 9, 0, 0],
  2: [28, 1, 16, 0, 0],
  3: [22, 2, 13, 0, 0],
  4: [16, 4, 9, 0, 0],
  5: [22, 2, 11, 2, 12],
  6: [28, 4, 15, 0, 0],
  7: [26, 4, 13, 1, 14],
  8: [26, 4, 14, 2, 15],
  9: [24, 4, 12, 4, 13],
  10: [28, 6, 15, 2, 16],
};

/** Row and column centres of the alignment patterns, by version. */
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const dataCodewords = (v) => {
  const [, b1, d1, b2, d2] = EC_H[v];
  return b1 * d1 + b2 * d2;
};

/** Bytes of message a version can carry in byte mode at level H. */
function capacity(v) {
  const countBits = v >= 10 ? 16 : 8;
  return Math.floor((dataCodewords(v) * 8 - 4 - countBits) / 8);
}

/* ------------------------------------------------------------------- GF(256) */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;          // the QR field's generator polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* The divisor polynomial for `n` error correction codewords: the product of
 * (x - a^i) for i in 0..n-1. Held highest degree first with the leading 1 left
 * implicit, which is the form the remainder loop below wants. Getting the term
 * order the wrong way round produces a polynomial of the right length and the
 * wrong values, and a QR code that scans as nothing. */
function generator(n) {
  const g = new Array(n).fill(0);
  g[n - 1] = 1;
  let root = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g[j] = mul(g[j], root);
      if (j + 1 < n) g[j] ^= g[j + 1];
    }
    root = mul(root, 2);
  }
  return g;
}

/** Reed-Solomon remainder: the error correction codewords for one block. */
function ecBytes(data, n) {
  const g = generator(n);
  const out = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    for (let i = 0; i < n; i++) out[i] ^= mul(g[i], factor);
  }
  return out;
}

/* ------------------------------------------------------------------ encoding */

function encodeData(text, version) {
  const bytes = new TextEncoder().encode(text);
  const total = dataCodewords(version);
  const countBits = version >= 10 ? 16 : 8;
  const bits = [];
  const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };

  push(0b0100, 4);                       // byte mode
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);

  // Terminator, then pad to a byte, then the two alternating pad codewords.
  push(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  for (let i = 0; out.length < total; i++) out.push(i % 2 ? 0x11 : 0xec);
  return out;
}

/** Interleave the data and error correction blocks, as the standard requires. */
function interleave(data, version) {
  const [ecLen, b1, d1, b2, d2] = EC_H[version];
  const blocks = [];
  let at = 0;
  for (let i = 0; i < b1; i++) { blocks.push(data.slice(at, at + d1)); at += d1; }
  for (let i = 0; i < b2; i++) { blocks.push(data.slice(at, at + d2)); at += d2; }
  const ecs = blocks.map((b) => ecBytes(b, ecLen));

  const out = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

/* ------------------------------------------------------------------- drawing */

function blankMatrix(size) {
  return { m: Array.from({ length: size }, () => new Array(size).fill(false)),
           fixed: Array.from({ length: size }, () => new Array(size).fill(false)), size };
}

function place(g, x, y, dark) {
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return;
  g.m[y][x] = dark;
  g.fixed[y][x] = true;
}

function finder(g, ox, oy) {
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      const inRing = (x === 0 || x === 6) && y >= 0 && y <= 6;
      const inTop = (y === 0 || y === 6) && x >= 0 && x <= 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      place(g, ox + x, oy + y, inRing || inTop || core);
    }
  }
}

function alignment(g, cx, cy) {
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      place(g, cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  }
}

/** 15-bit BCH format information: level H is 10, plus the mask. */
function formatBits(mask) {
  let value = (0b10 << 3) | mask;
  let rem = value << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  return ((value << 10) | rem) ^ 0b101010000010010;
}

/** 18-bit BCH version information, needed from version 7 up. */
function versionBits(v) {
  let rem = v << 12;
  for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  return (v << 12) | rem;
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

/** The standard's four penalty rules. Lowest score wins the mask. */
function penalty(m, size) {
  let score = 0;
  const runScore = (line) => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    if (run >= 5) score += 3 + (run - 5);
  };
  for (let y = 0; y < size; y++) runScore(m[y]);
  for (let x = 0; x < size; x++) runScore(m.map((row) => row[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = m[y][x];
      if (a === m[y][x + 1] && a === m[y + 1][x] && a === m[y + 1][x + 1]) score += 3;
    }
  }

  const bad = [true, false, true, true, true, false, true, false, false, false, false];
  const bad2 = [false, false, false, false, true, false, true, true, true, false, true];
  const hunt = (line) => {
    for (let i = 0; i + 11 <= size; i++) {
      let hitA = true, hitB = true;
      for (let k = 0; k < 11; k++) {
        if (line[i + k] !== bad[k]) hitA = false;
        if (line[i + k] !== bad2[k]) hitB = false;
      }
      if (hitA) score += 40;
      if (hitB) score += 40;
    }
  };
  for (let y = 0; y < size; y++) hunt(m[y]);
  for (let x = 0; x < size; x++) hunt(m.map((row) => row[x]));

  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** The smallest version that holds `text` at level H, or null if none does. */
export function versionFor(text) {
  const len = new TextEncoder().encode(text).length;
  for (let v = 1; v <= 10; v++) if (len <= capacity(v)) return v;
  return null;
}

/** The longest message this module can carry. */
export const MAX_BYTES = capacity(10);

/**
 * Encode `text` as a QR matrix.
 * @returns {{ size: number, modules: boolean[][], version: number }}
 * @throws if the text is longer than version 10 at level H can hold.
 */
export function encode(text) {
  const str = String(text || '');
  const version = versionFor(str);
  if (!version) {
    throw new Error(`${new TextEncoder().encode(str).length} bytes is more than a QR code `
      + `at high error correction holds here. The limit is ${MAX_BYTES}. Use a short URL.`);
  }
  const size = version * 4 + 17;
  const g = blankMatrix(size);

  finder(g, 0, 0);
  finder(g, size - 7, 0);
  finder(g, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    place(g, i, 6, i % 2 === 0);
    place(g, 6, i, i % 2 === 0);
  }
  const centres = ALIGN[version];
  for (const cy of centres) {
    for (const cx of centres) {
      const onFinder = (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= size - 9) || (cx >= size - 9 && cy <= 8);
      if (!onFinder) alignment(g, cx, cy);
    }
  }
  place(g, 8, size - 8, true);            // the always-dark module

  /* Reserve the format areas before the data is laid in. Row 6 and column 6 are
   * skipped: those are the timing pattern, which runs straight through the
   * format strip. Blanking them leaves a QR that looks flawless, passes a
   * module-count check, and decodes on some versions and not others. */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { place(g, i, 8, false); place(g, 8, i, false); }
  }
  for (let i = 0; i < 8; i++) { place(g, size - 1 - i, 8, false); place(g, 8, size - 1 - i, false); }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      place(g, Math.floor(i / 3), size - 11 + (i % 3), false);
      place(g, size - 11 + (i % 3), Math.floor(i / 3), false);
    }
  }

  // Data, snaking up and down in two-module columns from the bottom right.
  const bytes = interleave(encodeData(str, version), version);
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let at = 0;
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;           // the vertical timing column is skipped
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (const x of [right, right - 1]) {
        if (g.fixed[y][x]) continue;
        g.m[y][x] = at < bits.length ? bits[at] === 1 : false;
        at++;
      }
    }
    up = !up;
  }

  // Mask, score, keep the best.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = g.m.map((row, y) => row.map((v, x) => (g.fixed[y][x] ? v : v !== MASKS[mask](x, y))));
    /* Format information, twice. Written as (x, y) below and indexed m[y][x],
     * because getting those the wrong way round transposes the two copies and
     * the code still looks perfectly well formed to the eye while decoding to
     * nothing at all. It did. */
    const fmt = formatBits(mask);
    const set = (x, y, bit) => { m[y][x] = bit; };
    for (let i = 0; i <= 5; i++) set(8, i, ((fmt >> i) & 1) === 1);
    set(8, 7, ((fmt >> 6) & 1) === 1);
    set(8, 8, ((fmt >> 7) & 1) === 1);
    set(7, 8, ((fmt >> 8) & 1) === 1);
    for (let i = 9; i <= 14; i++) set(14 - i, 8, ((fmt >> i) & 1) === 1);
    for (let i = 0; i <= 7; i++) set(size - 1 - i, 8, ((fmt >> i) & 1) === 1);
    for (let i = 8; i <= 14; i++) set(8, size - 15 + i, ((fmt >> i) & 1) === 1);
    set(8, size - 8, true);
    if (version >= 7) {
      const vb = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = ((vb >> i) & 1) === 1;
        m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
        m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
      }
    }
    const score = penalty(m, size);
    if (!best || score < best.score) best = { score, modules: m };
  }
  return { size, modules: best.modules, version };
}
