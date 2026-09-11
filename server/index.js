/* Slate Studio server.
 *
 * Small on purpose: it serves the builder, hands the browser the district
 * catalog, streams portraits out of Drive through a disk cache, and writes
 * finished graphics back. All the design work happens in the browser.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, paths, ROOT } from './config.js';
import * as auth from './google-auth.js';
import * as drive from './drive.js';
import * as catalog from './catalog.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};
const text = (res, code, body, extra = {}) => {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', ...extra });
  res.end(body);
};

async function readBody(req, limit = 40 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/* ------------------------------------------------------------- password gate */

const gateToken = config.password
  ? crypto.createHash('sha256').update(`slate-studio:${config.password}`).digest('hex').slice(0, 32)
  : '';

function gated(req, res, url) {
  if (!config.password) return false;
  const open = url.pathname === '/login' || url.pathname === '/api/login' || url.pathname.startsWith('/assets/');
  if (open) return false;
  const cookie = /slate_gate=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (cookie && cookie[1] === gateToken) return false;
  if (url.pathname.startsWith('/api/')) { json(res, 401, { error: 'locked' }); return true; }
  res.writeHead(302, { location: '/login' });
  res.end();
  return true;
}

const LOGIN_PAGE = `<!doctype html><meta charset=utf-8><title>Slate Studio</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 system-ui;background:#012360;color:#fff;display:grid;place-items:center;height:100vh;margin:0}
form{background:#0A3078;padding:32px;border-radius:14px;min-width:280px}h1{font-size:20px;margin:0 0 16px}
input,button{width:100%;padding:11px;border-radius:8px;border:0;font:inherit;box-sizing:border-box}
button{margin-top:12px;background:#BF0A30;color:#fff;font-weight:700;cursor:pointer}</style>
<form method=post action=/api/login><h1>Slate Studio</h1>
<input type=password name=password placeholder=Password autofocus>
<button>Open</button></form>`;

/* ------------------------------------------------------------------- routing */

async function api(req, res, url) {
  const p = url.pathname;

  if (p === '/api/state') {
    const cat = catalog.peek();
    return json(res, 200, {
      driveConfigured: auth.configured(),
      signedIn: auth.signedIn(),
      localMode: Boolean(config.localDir && fs.existsSync(config.localDir)),
      source: cat?.source || null,
      counts: cat?.counts || null,
      builtAt: cat?.builtAt || null,
    });
  }

  if (p === '/api/catalog') {
    const cat = await catalog.get({ refresh: url.searchParams.get('refresh') === '1' });
    return json(res, 200, cat);
  }

  // /api/portrait/<slug>.png -- cutout for one candidate
  if (p.startsWith('/api/portrait/')) {
    const slug = decodeURIComponent(p.slice('/api/portrait/'.length)).replace(/\.png$/i, '');
    const cat = await catalog.get();
    let ref = null;
    for (const d of cat.districts) {
      const n = d.nominees.find((x) => x.slug === slug);
      if (n?.cutout) { ref = n.cutout; break; }
    }
    if (!ref) return text(res, 404, 'no cutout for ' + slug);
    return sendAsset(res, `cutout-${slug}`, ref);
  }

  // /api/deck/<County-District>/<WxH>/<variant>.png -- the pre-built deck layer
  if (p.startsWith('/api/deck/')) {
    const [id, size, file] = p.slice('/api/deck/'.length).split('/');
    const variant = (file || '').replace(/\.png$/i, '');
    const cat = await catalog.get();
    const d = cat.districts.find((x) => x.id === decodeURIComponent(id || ''));
    const ref = d?.decks?.[size]?.[variant];
    if (!ref) return text(res, 404, 'no deck for that district, size and variant');
    return sendAsset(res, `deck-${id}-${size}-${variant}`, ref);
  }

  if (p === '/api/save' && req.method === 'POST') {
    if (!auth.signedIn()) return json(res, 400, { error: 'Connect Google Drive first.' });
    const png = await readBody(req);
    if (!png.length) return json(res, 400, { error: 'no image' });
    const folder = await drive.ensureFolder(url.searchParams.get('folder') || 'Slate Studio Builds', null);
    const name = url.searchParams.get('name') || 'slate.png';
    const file = await drive.upload(name, folder, png);
    return json(res, 200, { ok: true, id: file.id, name: file.name, link: file.webViewLink });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const body = (await readBody(req, 4096)).toString('utf8');
    const given = new URLSearchParams(body).get('password') || '';
    if (config.password && given === config.password) {
      res.writeHead(302, { location: '/', 'set-cookie': `slate_gate=${gateToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
      return res.end();
    }
    res.writeHead(302, { location: '/login' });
    return res.end();
  }

  return json(res, 404, { error: 'no such endpoint' });
}

/** Serve a Drive file id or a local path, cached on disk after the first fetch. */
async function sendAsset(res, key, ref) {
  const cacheFile = path.join(paths.cache, key.replace(/[^A-Za-z0-9._-]/g, '_') + '.png');
  const headers = { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' };
  if (fs.existsSync(cacheFile)) {
    res.writeHead(200, headers);
    return fs.createReadStream(cacheFile).pipe(res);
  }
  let buf;
  if (config.localDir && !/^[A-Za-z0-9_-]{20,}$/.test(ref)) {
    buf = fs.readFileSync(path.join(config.localDir, ref));
  } else {
    buf = await drive.download(ref);
  }
  fs.writeFileSync(cacheFile, buf);
  res.writeHead(200, { ...headers, 'content-length': buf.length });
  res.end(buf);
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return text(res, 404, 'not found');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=300',
  });
  fs.createReadStream(file).pipe(res);
}

/** One request handler, shared by `npm start` and the serverless entry. */
export async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (gated(req, res, url)) return;
    if (url.pathname === '/login') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(LOGIN_PAGE); }

    if (url.pathname === '/auth/google') {
      if (!auth.configured()) return text(res, 500, 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then restart.');
      res.writeHead(302, { location: auth.authUrl() });
      return res.end();
    }
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code) return text(res, 400, 'no code returned: ' + (url.searchParams.get('error') || 'unknown'));
      await auth.exchangeCode(code);
      await catalog.build();
      res.writeHead(302, { location: '/' });
      return res.end();
    }
    if (url.pathname === '/auth/signout') {
      auth.signOut();
      res.writeHead(302, { location: '/' });
      return res.end();
    }

    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error(req.method, url.pathname, '->', err.message);
    if (url.pathname.startsWith('/api/')) return json(res, 500, { error: err.message });
    return text(res, 500, err.message);
  }
}

export function listen() {
  http.createServer(handler).listen(config.port, config.host, async () => {
    console.log(`Slate Studio  ${config.baseUrl}`);
    try {
      const cat = await catalog.get();
      console.log(`catalog: ${cat.source} - ${cat.counts.districts} districts, `
        + `${cat.counts.nominees} nominees, ${cat.counts.withCutouts} portraits`);
      if (cat.source === 'manifest') {
        console.log(auth.configured()
          ? 'Connect Drive at /auth/google to pull in the portraits.'
          : 'No Google client set. Running on the bundled manifest with placeholder portraits.');
      }
    } catch (e) { console.error('catalog:', e.message); }
  });
}

// Listen only when this file is what was run. Imported by the serverless entry,
// it must not. Comparing the resolved path is exact; matching on the filename
// would also fire for api/index.js.
if (process.argv[1] === fileURLToPath(import.meta.url)) listen();
