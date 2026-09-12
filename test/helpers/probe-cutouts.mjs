/* Drives the portrait-writing route in-process. Run as a child so the
 * credential mode is clean; see test/cutouts.test.js.
 *
 * The round trip deliberately overwrites a portrait that already exists and
 * puts the original bytes back, so the set of filenames never changes and a
 * crash halfway cannot leave the repo holding a file nobody stands behind. */
import fs from 'node:fs';
import path from 'node:path';
import { handler } from '../../server/index.js';
import { CUTOUTS_DIR } from '../../server/catalog.js';

function call(method, url, body = null) {
  const chunks = body ? [Buffer.from(body)] : [];
  const req = {
    method, url,
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; },
  };
  const out = { code: 0, body: '' };
  const res = {
    writeHead(code) { out.code = code; },
    end(b) { out.body = b ? String(b) : ''; },
  };
  return handler(req, res).then(() => {
    let json = null;
    try { json = JSON.parse(out.body); } catch { /* plain text */ }
    return { status: out.code, body: out.body.slice(0, 300), json };
  });
}

/* The ops repo carries the code without the 301 portraits, so there may be no
 * folder and nothing to overwrite. Say so rather than inventing a file: the
 * test skips on this and prints the reason. */
const present = fs.existsSync(CUTOUTS_DIR) ? fs.readdirSync(CUTOUTS_DIR) : [];
const victim = present.filter((f) => /\.webp$/i.test(f)).sort()[0];
if (!victim) {
  process.stdout.write(JSON.stringify({ noCutouts: true, dir: CUTOUTS_DIR }));
  process.exit(0);
}
const file = path.join(CUTOUTS_DIR, victim);
const original = fs.readFileSync(file);
const planted = Buffer.from('planted by the test, not an image');
const result = {};

try {
  result.traversal = await call('POST', '/api/cutout/..%2F..%2Fpackage.json', 'x');
  result.dotdot = await call('POST', '/api/cutout/' + encodeURIComponent('../package.json'), 'x');
  result.wrongExt = await call('POST', '/api/cutout/Someone.txt', 'x');
  result.strangerSlug = await call('POST', '/api/cutout/Nobody-At-All.webp', 'x');
  result.empty = await call('POST', `/api/cutout/${victim}`, '');
  result.getIsRefused = await call('GET', `/api/cutout/${victim}`);
  result.untouched = fs.readFileSync(file).equals(original);

  result.write = await call('POST', `/api/cutout/${victim}`, planted);
  result.landed = fs.readFileSync(file).equals(planted);
  result.indexed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'cutouts.json'), 'utf8')).includes(victim);
} finally {
  fs.writeFileSync(file, original);
  result.restored = fs.readFileSync(file).equals(original);
}

result.victim = victim;
process.stdout.write(JSON.stringify(result));
