/* The district catalog: who is on each slate, which cutout belongs to whom, and
 * which pre-built deck PNGs already exist.
 *
 * Three sources, tried in order, so the app is useful before anybody has set up
 * a Google client:
 *   drive    - the live 2026 Slate Decks folder (full function)
 *   local    - the same tree on disk, for the Mac that builds the decks
 *   manifest - the bundled SLATE-MANIFEST.csv (district list and names only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, paths, ROOT } from './config.js';
import { signedIn } from './google-auth.js';
import * as drive from './drive.js';
import { nameParts, slugify } from '../public/names.js';

const DECK_RE = /^NHGOP-Slate-([A-Za-z]+)-(\d+)-(named|clean)-(\d+)x(\d+)\.png$/;

let cache = null;
try { cache = JSON.parse(fs.readFileSync(paths.catalog, 'utf8')); } catch { /* not built yet */ }

function blankDistrict(county, district) {
  return {
    id: `${county}-${district}`, county, district: Number(district),
    seats: null, towns: [], nominees: [], decks: {}, built: false, missing: [],
  };
}

function addNominee(d, name, extra = {}) {
  const { first, last } = nameParts(name);
  d.nominees.push({ name, first, last, slug: slugify(name), cutout: null, ...extra });
}

/* ------------------------------------------------------------------ manifest */

/** Minimal CSV reader. The manifest has quoted fields but no embedded newlines. */
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function fromManifest(text) {
  const byId = new Map();
  for (const row of parseCsv(text)) {
    const county = row.County, num = row.District;
    if (!county || !num) continue;
    const d = blankDistrict(county, num);
    d.seats = Number(row.Seats) || null;
    d.built = String(row['Built?']).toUpperCase() === 'YES';
    d.missing = (row['Missing photos'] || '').split(';').map((s) => s.trim()).filter(Boolean);
    for (const name of (row.Nominees || '').split(';').map((s) => s.trim()).filter(Boolean)) {
      addNominee(d, name, { hasPhoto: !d.missing.includes(name) });
    }
    byId.set(d.id, d);
  }
  return byId;
}

function bundledManifest() {
  return fs.readFileSync(path.join(ROOT, 'data', 'slate-manifest.csv'), 'utf8');
}

/* --------------------------------------------------------------------- roster */

/** build/roster.json carries seats, towns and incumbency. Better than the CSV. */
function mergeRoster(byId, roster) {
  for (const r of roster) {
    const id = `${r.county}-${r.district}`;
    let d = byId.get(id);
    if (!d) { d = blankDistrict(r.county, r.district); byId.set(id, d); }
    d.seats = r.seats ?? d.seats;
    d.towns = r.towns || [];
    d.overfilled = Boolean(r.overfilled);
    const known = new Map(d.nominees.map((n) => [n.name, n]));
    d.nominees = (r.nominees || []).map((n) => {
      const prev = known.get(n.name) || {};
      const { first, last } = nameParts(n.name);
      return {
        name: n.name, first, last, slug: slugify(n.name),
        town: n.town || null, incumbent: Boolean(n.incumbent),
        site: n.site_url || null,
        writeIn: n.in_sos_primary === false,
        cutout: prev.cutout || null,
        hasPhoto: prev.hasPhoto ?? false,
      };
    });
  }
}

/* ---------------------------------------------------------------------- drive */

async function resolveRootId() {
  if (config.driveFolderId) return config.driveFolderId;
  const esc = config.driveFolderName.replace(/'/g, "\\'");
  const hits = await drive.list(
    `name = '${esc}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'id,name'
  );
  if (!hits.length) throw new Error(`Drive folder "${config.driveFolderName}" not found. Set SLATE_DRIVE_FOLDER_ID.`);
  return hits[0].id;
}

async function buildFromDrive() {
  const rootId = await resolveRootId();
  const children = await drive.list(`'${rootId}' in parents and trashed = false`, 'id,name,mimeType');
  const find = (name) => children.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const cutoutsFolder = find('Cutouts');
  const buildFolder = find('build');
  const manifestFile = find('SLATE-MANIFEST.csv');

  let byId;
  if (manifestFile) byId = fromManifest(await drive.downloadText(manifestFile.id));
  else byId = fromManifest(bundledManifest());

  if (buildFolder) {
    const files = await drive.list(`'${buildFolder.id}' in parents and trashed = false`, 'id,name');
    const roster = files.find((f) => f.name === 'roster.json');
    if (roster) {
      try { mergeRoster(byId, JSON.parse(await drive.downloadText(roster.id))); }
      catch (e) { console.warn('roster.json unreadable:', e.message); }
    }
  }

  // Cutouts, one query, keyed by the filename stem the Photoshop step produced.
  const cutouts = new Map();
  if (cutoutsFolder) {
    for (const f of await drive.list(`'${cutoutsFolder.id}' in parents and trashed = false and mimeType contains 'image/'`, 'id,name')) {
      cutouts.set(f.name.replace(/\.png$/i, ''), f.id);
    }
  }

  // Pre-built deck PNGs, one query across the whole tree.
  const decks = await drive.list(
    `name contains 'NHGOP-Slate-' and mimeType = 'image/png' and trashed = false`, 'id,name'
  );
  for (const f of decks) {
    const m = DECK_RE.exec(f.name);
    if (!m) continue;
    const d = byId.get(`${m[1]}-${Number(m[2])}`);
    if (!d) continue;
    const size = `${m[4]}x${m[5]}`;
    (d.decks[size] ||= {})[m[3]] = f.id;
  }

  attachCutouts(byId, (slug) => cutouts.get(slug) || null);
  return finalize(byId, 'drive', { rootId, cutouts: cutouts.size, decks: decks.length });
}

/* ---------------------------------------------------------------------- local */

function buildFromLocal() {
  const dir = config.localDir;
  const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
  const exists = (p) => fs.existsSync(path.join(dir, p));

  const byId = fromManifest(exists('SLATE-MANIFEST.csv') ? read('SLATE-MANIFEST.csv') : bundledManifest());
  if (exists('build/roster.json')) {
    try { mergeRoster(byId, JSON.parse(read('build/roster.json'))); }
    catch (e) { console.warn('roster.json unreadable:', e.message); }
  }

  const cutouts = new Map();
  const cdir = path.join(dir, 'Cutouts');
  if (fs.existsSync(cdir)) {
    for (const f of fs.readdirSync(cdir)) {
      if (/\.png$/i.test(f)) cutouts.set(f.replace(/\.png$/i, ''), path.join('Cutouts', f));
    }
  }

  let deckCount = 0;
  const ddir = path.join(dir, 'Decks');
  if (fs.existsSync(ddir)) {
    for (const sub of fs.readdirSync(ddir)) {
      const full = path.join(ddir, sub);
      if (!fs.statSync(full).isDirectory()) continue;
      for (const f of fs.readdirSync(full)) {
        const m = DECK_RE.exec(f);
        if (!m) continue;
        const d = byId.get(`${m[1]}-${Number(m[2])}`);
        if (!d) continue;
        (d.decks[`${m[4]}x${m[5]}`] ||= {})[m[3]] = path.join('Decks', sub, f);
        deckCount++;
      }
    }
  }

  attachCutouts(byId, (slug) => cutouts.get(slug) || null);
  return finalize(byId, 'local', { dir, cutouts: cutouts.size, decks: deckCount });
}

/* ------------------------------------------------------------------- assemble */

/** Point each nominee at their cutout, by the slug make_decks.py wrote. */
function attachCutouts(byId, lookup) {
  for (const d of byId.values()) {
    for (const n of d.nominees) {
      const hit = lookup(n.slug);
      if (hit) { n.cutout = hit; n.hasPhoto = true; }
    }
  }
}

function finalize(byId, source, meta) {
  const districts = [...byId.values()]
    .filter((d) => d.nominees.length)
    .sort((a, b) => a.county.localeCompare(b.county) || a.district - b.district);
  for (const d of districts) {
    d.missing = d.nominees.filter((n) => !n.cutout).map((n) => n.name);
    d.ready = d.missing.length === 0;
    d.hasDeck = Object.keys(d.decks).length > 0;
  }
  return {
    source, meta, builtAt: new Date().toISOString(),
    districts,
    counts: {
      districts: districts.length,
      nominees: districts.reduce((a, d) => a + d.nominees.length, 0),
      ready: districts.filter((d) => d.ready).length,
      withCutouts: districts.reduce((a, d) => a + d.nominees.filter((n) => n.cutout).length, 0),
      multiMember: districts.filter((d) => d.nominees.length > 1).length,
    },
  };
}

function buildFromBundle() {
  const byId = fromManifest(bundledManifest());
  // No cutouts available: every tile renders as a marked placeholder.
  for (const d of byId.values()) for (const n of d.nominees) n.cutout = null;
  return finalize(byId, 'manifest', { note: 'Bundled manifest. Connect Drive for portraits.' });
}

/* ----------------------------------------------------------------------- api */

export async function build() {
  let cat;
  if (config.localDir && fs.existsSync(config.localDir)) cat = buildFromLocal();
  else if (signedIn()) cat = await buildFromDrive();
  else cat = buildFromBundle();
  cache = cat;
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(paths.catalog, JSON.stringify(cat));
  return cat;
}

export async function get({ refresh = false } = {}) {
  if (refresh || !cache) return build();
  // A cached bundle-only catalog should upgrade itself once Drive is connected.
  if (cache.source === 'manifest' && (signedIn() || config.localDir)) return build();
  // Local mode is a filesystem walk, so never serve a stale one. Drive is many
  // API calls, so that cache stands until Refresh asks for a new one.
  if (config.localDir && fs.existsSync(config.localDir)) return build();
  return cache;
}

export function peek() { return cache; }
export const _internal = { parseCsv, fromManifest, mergeRoster, DECK_RE };
