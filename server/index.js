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
import { config, paths, ROOT, serverless } from './config.js';
import * as auth from './google-auth.js';
import * as drive from './drive.js';
import * as catalog from './catalog.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const json = (res, code, body, extra = {}) => {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(s),
    ...extra,
  });
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

/* --------------------------------------------------------------- public mode */

/* Which of the credential-backed routes are open, and why.
 *
 * SLATE_PUBLIC shuts all of them. But most of them should also be shut when
 * there is simply nothing behind them: an OAuth route with no client
 * configured is a dead end that answers 500, and a save route with no
 * credential cannot write anywhere. Leaving those open until somebody
 * remembers a flag is how a deployment ends up looking exposed when it is
 * only broken, and how a real one ends up genuinely exposed.
 *
 * Returns null when the route is open, or the reason it is not. */
function closedReason(pathname) {
  const isAuthFlow = pathname === '/auth/google' || pathname.startsWith('/auth/callback');
  const isSignOut = pathname === '/auth/signout';
  const isSave = pathname === '/api/save';
  const isCutout = pathname.startsWith('/api/cutout/');
  if (!isAuthFlow && !isSignOut && !isSave && !isCutout) return null;

  if (config.isPublic) return 'This deployment is public and read-only.';
  if (isCutout && !cutoutsWritable()) {
    return 'This copy cannot set default portraits: it has no writable checkout '
      + 'of public/cutouts. Download the file and add it to the repo instead.';
  }
  if (isCutout) return null;
  if (isAuthFlow && !auth.configured()) {
    return 'No Google client is configured here, so there is no sign-in to start. '
      + 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use a service-account key.';
  }
  if (isSignOut && !auth.signedIn()) return 'Not signed in, so there is nothing to sign out of.';
  if (isSignOut && auth.fromEnvironment()) {
    return 'The credential here comes from the environment, so signing out cannot '
      + 'revoke it. Remove it where it is set instead.';
  }
  if (isSave && auth.readOnlyCredential()) {
    return 'This copy reads Drive with a read-only service account and cannot write to it.';
  }
  if (isSave && !auth.signedIn() && !auth.configured()) {
    return 'No Drive credential is configured here, so there is nothing to write with. '
      + 'Use Download PNG instead.';
  }
  // A client is configured but nobody has signed in yet: that is fixable, and
  // /api/save answers with how, rather than refusing outright.
  return null;
}

/** Read-only in effect: either declared, or because nothing can write. */
function effectivelyReadOnly() {
  return config.isPublic || !auth.signedIn() || auth.readOnlyCredential();
}

/* Writing a new default portrait means writing into the repo: public/cutouts
 * and the index beside it. That only makes sense where the repo actually is, on
 * somebody's own machine. A serverless host has a read-only disk apart from
 * /tmp, and nothing written to /tmp survives the next cold start, so a portrait
 * "saved" there would vanish without ever telling anyone. */
function cutoutsWritable() {
  if (serverless || config.isPublic) return false;
  const dir = fs.existsSync(catalog.CUTOUTS_DIR) ? catalog.CUTOUTS_DIR : path.join(ROOT, 'public');
  try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; }
}

/* A portrait filename, and nothing else. The route writes to disk, so the name
 * is checked against this and then against the roster: a slug nobody is
 * standing for is refused, which keeps a typo from leaving an orphan file and
 * keeps the route from being a way to write anywhere at all. */
const CUTOUT_FILE = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}\.(webp|png)$/;

/** Crude per-IP ceiling on the endpoints that can reach Drive. In-memory, so on
 *  serverless it is per instance: a speed bump, not a guarantee. */
const hits = new Map();
function rateLimited(req, limit = 600, windowMs = 600000) {
  if (!effectivelyReadOnly()) return false;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) { hits.set(ip, { n: 1, resetAt: now + windowMs }); return false; }
  rec.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  return rec.n > limit;
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
      isPublic: config.isPublic,
      readOnly: effectivelyReadOnly(),
      writesClosed: Boolean(closedReason('/api/save')) || !auth.signedIn(),
      authClosed: Boolean(closedReason('/auth/google')),
      canWriteCutouts: cutoutsWritable(),
      readyOnly: config.readyOnly,
      disclaimer: config.disclaimer,
      driveConfigured: auth.configured(),
      signedIn: auth.signedIn(),
      localMode: Boolean(config.localDir && fs.existsSync(config.localDir)),
      source: cat?.source || null,
      driveError: cat?.driveError || null,
      counts: cat?.counts || null,
      builtAt: cat?.builtAt || null,
    });
  }

  if (p === '/api/catalog') {
    // Refresh re-crawls Drive. Not something a stranger gets to trigger.
    const refresh = !effectivelyReadOnly() && url.searchParams.get('refresh') === '1';
    const cat = await catalog.get({ refresh });
    // Rebuilding the catalog is several Drive calls, which a serverless host
    // would otherwise repeat on every cold start. An hour at the CDN keeps that
    // rare while still picking up a newly added headshot the same morning.
    const extra = effectivelyReadOnly() && !cat.driveError
      ? { 'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }
      : { 'cache-control': 'no-store' };
    if (!config.readyOnly) return json(res, 200, cat, extra);
    const districts = cat.districts.filter((d) => d.ready);
    return json(res, 200, { ...cat, districts, counts: { ...cat.counts, districts: districts.length } }, extra);
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
    // Cutouts shipped with the app are served statically; nothing to proxy.
    if (String(ref).startsWith('/')) {
      res.writeHead(302, { location: ref });
      return res.end();
    }
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

  /* /api/cutout/<Slug>.webp -- make a photo the default for that candidate.
   *
   * POST writes it into public/cutouts and rewrites data/cutouts.json, so it is
   * a real default for every canvas and every district from the next request
   * on, and a `git add public/cutouts data/cutouts.json` away from being the
   * default for everybody. DELETE takes it back out. */
  if (p.startsWith('/api/cutout/')) {
    const file = decodeURIComponent(p.slice('/api/cutout/'.length));
    if (!CUTOUT_FILE.test(file)) {
      return json(res, 400, { error: 'A portrait filename is <Slug>.webp or <Slug>.png, nothing else.' });
    }
    const slug = file.replace(/\.(webp|png)$/i, '');
    const cat = await catalog.get();
    const who = cat.districts.flatMap((d) => d.nominees).find((n) => n.slug === slug);
    if (!who) return json(res, 404, { error: `No candidate on the roster has the slug ${slug}.` });
    const target = path.join(catalog.CUTOUTS_DIR, file);

    if (req.method === 'DELETE') {
      // Only the pair this route could have written. A .png next to a .webp of
      // the same name is dead weight once the .webp is gone, so both go.
      let gone = 0;
      for (const ext of ['webp', 'png']) {
        const f = path.join(catalog.CUTOUTS_DIR, `${slug}.${ext}`);
        if (fs.existsSync(f)) { fs.rmSync(f); gone++; }
      }
      if (!gone) return json(res, 404, { error: `No portrait on disk for ${who.name}.` });
      const left = catalog.reindexBundled();
      return json(res, 200, { ok: true, removed: gone, name: who.name, portraits: left });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'POST or DELETE' });
    const body = await readBody(req, 12 * 1024 * 1024);
    if (!body.length) return json(res, 400, { error: 'no image' });
    fs.mkdirSync(catalog.CUTOUTS_DIR, { recursive: true });
    fs.writeFileSync(target, body);
    // A .png left over from before would otherwise sit there being ignored.
    const other = path.join(catalog.CUTOUTS_DIR, `${slug}.${file.endsWith('webp') ? 'png' : 'webp'}`);
    if (fs.existsSync(other)) fs.rmSync(other);
    const total = catalog.reindexBundled();
    return json(res, 200, {
      ok: true, name: who.name, file, bytes: body.length, portraits: total,
      path: path.relative(ROOT, target),
    });
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

/** Serve a Drive file id or a local path, cached on disk after the first fetch.
 *
 *  The `s-maxage` matters on a serverless host, where there is no disk to cache
 *  to: the CDN holds the portrait instead, so Drive is hit about once per
 *  portrait per region per day rather than on every cold start. A day, not a
 *  week, because the whole point of the PHOTO NEEDED tiles is that new
 *  headshots keep arriving and should appear without a redeploy. */
async function sendAsset(res, key, ref) {
  const cacheFile = path.join(paths.cache, key.replace(/[^A-Za-z0-9._-]/g, '_') + '.png');
  const headers = {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  };
  if (fs.existsSync(cacheFile)) {
    res.writeHead(200, headers);
    return fs.createReadStream(cacheFile).pipe(res);
  }
  let buf;
  if (config.localDir && !/^[A-Za-z0-9_-]{20,}$/.test(ref)) {
    // Cutout paths are absolute; deck paths are relative to the local tree.
    buf = fs.readFileSync(path.isAbsolute(ref) ? ref : path.join(config.localDir, ref));
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
    const shut = closedReason(url.pathname);
    if (shut) {
      return url.pathname.startsWith('/api/')
        ? json(res, 403, { error: shut })
        : text(res, 403, shut);
    }
    if ((url.pathname.startsWith('/api/portrait/') || url.pathname.startsWith('/api/deck/'))
        && rateLimited(req)) {
      return text(res, 429, 'Too many requests. Try again shortly.', { 'retry-after': '120' });
    }
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
    if (config.isPublic) {
      console.log('PUBLIC MODE: read-only, no Drive sign-in, no writes, rate limited'
        + (config.readyOnly ? ', portrait-ready districts only' : ''));
    }
    try {
      const cat = await catalog.get();
      console.log(`catalog: ${cat.source} - ${cat.counts.districts} districts, `
        + `${cat.counts.nominees} nominees, ${cat.counts.withCutouts} portraits`);
      if (cat.source === 'local') {
        console.log(cat.meta.cutoutsDir
          ? `portraits from ${cat.meta.cutoutsDir}`
          : 'NO PORTRAITS FOUND. Looked in:\n  '
            + (cat.meta.lookedIn || []).join('\n  ')
            + '\nSet SLATE_CUTOUTS_DIR to the folder holding the background-free PNGs.');
      }
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
