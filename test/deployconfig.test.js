import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

/* A malformed vercel.json is not caught by anything else: the app runs fine
 * locally and the import fails in the browser, in front of whoever is deploying.
 * JSON has no comments, and Vercel rejects unknown keys outright. */

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const TOP = new Set(['$schema', 'functions', 'rewrites', 'redirects', 'headers',
  'cleanUrls', 'trailingSlash', 'regions', 'crons', 'buildCommand',
  'outputDirectory', 'installCommand', 'framework', 'git', 'images', 'public']);
const FN = new Set(['memory', 'maxDuration', 'runtime', 'includeFiles',
  'excludeFiles', 'architecture', 'experimentalTriggers']);
const REWRITE = new Set(['source', 'destination', 'has', 'missing', 'statusCode',
  'env', 'respectOriginCacheControl', 'transforms']);

test('vercel.json has no keys Vercel will reject', () => {
  for (const k of Object.keys(vercel)) {
    assert.ok(TOP.has(k), `top level: unknown key "${k}"`);
  }
  for (const [name, cfg] of Object.entries(vercel.functions || {})) {
    for (const k of Object.keys(cfg)) {
      assert.ok(FN.has(k),
        `functions."${name}": unknown key "${k}". JSON takes no comments, and `
        + 'Vercel refuses the whole import over one.');
    }
  }
  for (const r of vercel.rewrites || []) {
    for (const k of Object.keys(r)) {
      assert.ok(REWRITE.has(k), `rewrite ${r.source}: unknown key "${k}"`);
    }
  }
});

test('the function bundle includes the file it reads at runtime', () => {
  const fn = vercel.functions?.['api/index.js'];
  assert.ok(fn, 'api/index.js must be configured');
  assert.match(fn.includeFiles || '', /data/,
    'data/slate-manifest.csv is read through a runtime path the tracer cannot '
    + 'follow; without includeFiles the function throws ENOENT on every request');
});

test('every route the app owns is rewritten to the function', () => {
  const sources = (vercel.rewrites || []).map((r) => r.source);
  for (const needed of ['/api/(.*)', '/auth/(.*)']) {
    assert.ok(sources.includes(needed), `no rewrite for ${needed}`);
  }
  for (const r of vercel.rewrites || []) {
    assert.equal(r.destination, '/api/index', `${r.source} points somewhere else`);
  }
});

test('render.yaml stays valid enough to deploy', () => {
  const y = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
  assert.match(y, /startCommand:\s*npm start/);
  assert.match(y, /SLATE_PUBLIC/);
  assert.match(y, /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.ok(!/\t/.test(y), 'YAML must not contain tabs');
});

test('the portrait index matches what is on disk', () => {
  // The server reads data/cutouts.json because a serverless function is not
  // bundled with public/. If that index drifts from the folder, the deployed
  // app shows placeholders while the CDN happily serves the real images.
  const dir = path.join(ROOT, 'public', 'cutouts');
  if (!fs.existsSync(dir)) return;                       // a code-only checkout
  const onDisk = fs.readdirSync(dir).filter((f) => /\.(webp|png)$/i.test(f)).sort();
  const indexed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cutouts.json'), 'utf8')).sort();
  assert.deepEqual(indexed, onDisk,
    'data/cutouts.json is stale. Run: npm run index:cutouts');
});

test('everything the function reads at runtime is bundled into it', () => {
  const include = vercel.functions?.['api/index.js']?.includeFiles || '';
  assert.match(include, /data/, 'data/ carries the manifest and the portrait index');
  // public/ is served by the CDN, never read by the function. If that changes,
  // this is the test that should fail first.
  const catalog = fs.readFileSync(path.join(ROOT, 'server', 'catalog.js'), 'utf8');
  const readsPublic = /readdirSync\([^)]*'public'/.test(catalog)
    && !/data', 'cutouts\.json'/.test(catalog);
  assert.ok(!readsPublic,
    'catalog.js lists public/ without a data/ index; that finds nothing on a serverless host');
});
