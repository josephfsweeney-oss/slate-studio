/* Render a QR matrix to a PNG, for the decode check in test/qr.test.js.
 *
 * Lives in build/ and not in public/ because the app never needs it: the
 * painter draws QR modules straight onto the canvas. This exists so the
 * encoder can be checked against a real decoder rather than against itself.
 *
 *   node build/qr-png.mjs "https://example.org" out.png [scale] [quiet]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { encode } from '../public/qr.js';

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Greyscale PNG of the matrix, with `quiet` modules of white on every side. */
export function qrPng(modules, size, scale = 8, quiet = 4) {
  const side = (size + quiet * 2) * scale;
  const raw = Buffer.alloc((side + 1) * side, 0xff);
  for (let y = 0; y < side; y++) {
    raw[y * (side + 1)] = 0;                       // filter byte: none
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my][mx];
      raw[y * (side + 1) + 1 + x] = dark ? 0 : 0xff;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8;                                     // 8 bits, greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Encode `text` and write it to `file`. Returns the version used. */
export function writeQr(text, file, scale = 8, quiet = 4) {
  const q = encode(text);
  fs.writeFileSync(file, qrPng(q.modules, q.size, scale, quiet));
  return q;
}

if (process.argv[1] && process.argv[1].endsWith('qr-png.mjs')) {
  const [, , text, out, scale, quiet] = process.argv;
  const q = writeQr(text, out, Number(scale || 8), Number(quiet ?? 4));
  console.log(`${out}: version ${q.version}, ${q.size} modules`);
}
