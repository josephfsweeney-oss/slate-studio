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
