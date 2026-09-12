/* Slate Studio front end. */
import { solve, BRAND } from './layout.js';
import { paint, makeMeasurer } from './render.js';
import {
  CANVASES, TEMPLATES, PALETTES, GROUNDS, TOKENS, TOPPERS,
  fillTokens, buildFilename, buildName, canvasById, topperById,
} from './presets.js';
import { MAIL_PROGRAMS, MAIL_VARS, SHARED_BACK, SHARED_BACK_ART, SIDE_COMMON, artUrl,
  programById, pieceById, sideStyle } from './mailers.js';
import { makeZip } from './zip.js';
import * as photos from './photos.js';
import { printSheet, slugLine, drawSlug, inchesOf } from './print.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* The registered CEHR disclaimer, as it appears on the committee's own site.
 * A deployment for another committee sets SLATE_DISCLAIMER instead. */
const DEFAULT_DISCLAIMER = 'Paid for by Committee to Elect House Republicans, 75 S Main Street Unit 7 Box 159, Concord, NH 03301. Jason Osborne, Chairman.';

const COPY_FIELDS = ['kicker', 'headline', 'subhead', 'details', 'cta', 'footer',
  'disclaimer', 'returnAddress', 'indicia', 'values', 'record', 'callout', 'contrast',
  'stat', 'source', 'url'];

const COLOR_FIELDS = [
  ['#accent', 'accent'], ['#plate-accent', 'plateAccent'],
  ['#bg-color', 'bgColor'], ['#bg-color2', 'bgColor2'], ['#plate-color', 'plateColor'],
];

/** Step to the next of the four combinations, wrapping at either end. */
function cyclePalette(step) {
  const i = PALETTES.findIndex((p) => p.id === state.style.paletteId);
  const next = PALETTES[((i < 0 ? 0 : i + step) + PALETTES.length) % PALETTES.length];
  applyPalette(next);
  syncControls(); saveLocal(); draw();
}

/** A palette sets the ground and both accents at once. The ground choice
 *  (palette / photo / transparent) rides on top and is preserved. */
function applyPalette(pal) {
  if (!pal) return;
  Object.assign(state.style, {
    paletteId: pal.id, bgColor: pal.bgColor, bgColor2: pal.bgColor2 || pal.bgColor,
    accent: pal.accent, plateColor: pal.plateColor, plateAccent: pal.plateAccent,
    bar: pal.bar,
    bgType: state.style.ground === 'palette' ? pal.bgType : state.style.ground,
  });
}

const state = {
  server: {},
  catalog: null,
  districtId: null,
  drop: {},              // districtId -> Set of excluded candidate names
  order: {},             // districtId -> [names]
  tags: {},              // districtId -> { name -> tagline }
  reps: {},              // districtId -> Set of names ticked as sitting members
  canvasId: '1x1',
  cw: 1080, ch: 1080,
  copy: {
    kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '', disclaimer: '',
    values: '', record: '', callout: '', contrast: '', stat: '', source: '', url: '',
    returnAddress: 'Committee to Elect House Republicans\n75 S Main Street Unit 7 Box 159\nConcord, NH 03301',
    indicia: 'NONPROFIT ORG\nU.S. POSTAGE\nPAID\nPERMIT NO. ___',
  },
  // Defaults are the Granite Guarantee sheet: green and navy on white.
  style: {
    composition: 'auto', align: 'auto', plate: true, density: 1,
    paletteId: 'guarantee', ground: 'palette',
    bgType: 'solid', bgColor: '#FFFFFF', bgColor2: '#235E3B', bgDim: 0.45,
    accent: '#2F7C4E', plateColor: '#12314E', plateAccent: '#95DAB1',
    bar: ['#2F7C4E', '#12314E'],
    faceSource: 'cutouts', mailPanel: 'none', spotlight: '',
    topper: '', topperAt: 'first',
    flagBar: true, headlineShadow: true, twoTone: true, honorific: true,
    logoPos: 'top-right', logoScale: 0.16,
  },
  waiveDisclaimer: false,
  ticked: new Set(),
  // The mail programme: which piece of it is open, and which side of that piece.
  mail: { program: '', piece: '', side: 'front', sharedBack: true, twoRows: false },
  // Facts the app cannot look up, typed once per district and kept there.
  mailVars: {},
};

const assets = { portraits: {}, bgImage: null, logo: null, deck: null,
                 hero: null, evidence: null };
let measure = null;
let plan = null;

/** A link that opens this district, so a candidate can be sent the slate they
 *  are missing from rather than told about it. */
function shareLink() {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('d', state.districtId);
  if (state.canvasId !== '1x1') u.searchParams.set('c', state.canvasId);
  if (state.style.paletteId) u.searchParams.set('p', state.style.paletteId);
  return u.toString();
}

/* ------------------------------------------------------------------ plumbing */

const saveLocal = () => {
  try {
    localStorage.setItem('slate-studio', JSON.stringify({
      districtId: state.districtId, canvasId: state.canvasId, cw: state.cw, ch: state.ch,
      copy: state.copy, style: state.style, waiveDisclaimer: state.waiveDisclaimer,
      drop: Object.fromEntries(Object.entries(state.drop).map(([k, v]) => [k, [...v]])),
      order: state.order, tags: state.tags,
      reps: Object.fromEntries(Object.entries(state.reps).map(([k, v]) => [k, [...v]])),
      mail: state.mail, mailVars: state.mailVars,
    }));
  } catch { /* private window, no harm */ }
};

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem('slate-studio') || '{}');
    Object.assign(state, {
      districtId: s.districtId ?? null,
      canvasId: s.canvasId ?? state.canvasId,
      cw: s.cw ?? state.cw, ch: s.ch ?? state.ch,
      copy: { ...state.copy, ...(s.copy || {}) },
      style: { ...state.style, ...(s.style || {}) },
      waiveDisclaimer: Boolean(s.waiveDisclaimer),
      mail: { ...state.mail, ...(s.mail || {}) },
      mailVars: s.mailVars || {},
      order: s.order || {}, tags: s.tags || {},
      drop: Object.fromEntries(Object.entries(s.drop || {}).map(([k, v]) => [k, new Set(v)])),
      reps: Object.fromEntries(Object.entries(s.reps || {}).map(([k, v]) => [k, new Set(v)])),
    });
  } catch { /* first visit */ }
}

const district = () => state.catalog?.districts.find((d) => d.id === state.districtId) || null;

/* The catalog's own ready/missing fields are "does this nominee have a cutout
 * on the server". A photo added in this browser is a face too, and the whole
 * left rail would go on calling a finished slate incomplete if these read the
 * server's answer instead of working it out. Same rule as the server's, one
 * term wider. */
/* A topper's cutout path is where the portrait will be once somebody adds it,
 * not proof that it is there. So for a topper the test is what actually
 * loaded, otherwise the roster row claims a face the tile draws as a
 * placeholder. */
const hasFace = (n) => overrides.has(n.slug)
  || (n.topper ? Boolean(assets.portraits[n.name]) : Boolean(n.cutout));
const facesMissing = (d) => d.nominees.filter((n) => !hasFace(n)).length;
const isReady = (d) => facesMissing(d) === 0;

/** One headshot short of a complete slate. These are the cheapest to unlock,
 *  so they are worth calling out rather than burying in the list. */
const oneAway = (d) => facesMissing(d) === 1 && d.nominees.length >= 2;

/** The candidates actually on the graphic, in the chosen order. */
function activeSlate(d = district()) {
  if (!d) return [];
  const dropped = state.drop[d.id] || new Set();
  const order = state.order[d.id];
  let list = d.nominees.filter((n) => !dropped.has(n.name));
  if (order) {
    const pos = new Map(order.map((n, i) => [n, i]));
    list = [...list].sort((a, b) => (pos.get(a.name) ?? 99) - (pos.get(b.name) ?? 99));
  }
  const tags = state.tags[d.id] || {};
  /* Sitting members come off the manifest, and anything ticked here is on top
   * of that. The manifest is the shared truth; a tick is one person's piece
   * until it goes back into the file. */
  const marked = state.reps[d.id] || new Set();
  const out = list.map((n) => {
    const rep = Boolean(n.incumbent) || marked.has(n.name);
    if (!tags[n.name] && rep === Boolean(n.incumbent)) return n;
    return { ...n, ...(tags[n.name] ? { tag: tags[n.name] } : {}), incumbent: rep };
  });

  /* Whoever is at the top of the ticket, added to the drawing list only. The
   * district record is untouched, so she is never counted in the seats, never
   * closes a photo gap, and never gets a ballot oval. */
  const top = topperById(state.style.topper);
  if (!top) return out;
  return state.style.topperAt === 'last' ? [...out, top] : [top, ...out];
}

const canvasSize = () => {
  if (state.canvasId === 'custom') return { w: state.cw, h: state.ch };
  const c = canvasById(state.canvasId);
  return { w: c.w, h: c.h };
};

/** The canvas record behind whatever is selected. Custom has no print settings. */
const canvasRec = () => (state.canvasId === 'custom' ? {} : canvasById(state.canvasId));

/* ------------------------------------------------------------------ portraits */

const imgCache = new Map();
function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  imgCache.set(src, p);
  return p;
}

/** The built deck closest in shape to the canvas, and the variant matching the
 *  name-plate setting. Returns null when that district never built. */
function pickDeck(d, size) {
  const sizes = Object.keys(d?.decks || {});
  if (!sizes.length) return null;
  const want = size.w / size.h;
  const variant = state.style.plate ? 'named' : 'clean';
  let best = null;
  for (const key of sizes) {
    const [w, h] = key.split('x').map(Number);
    if (!d.decks[key][variant]) continue;
    const off = Math.abs(Math.log((w / h) / want));
    if (!best || off < best.off) best = { off, key, w, h, variant };
  }
  return best;
}

async function loadDeck(d, size) {
  const pick = pickDeck(d, size);
  if (!pick) return null;
  const im = await loadImage(`/api/deck/${encodeURIComponent(d.id)}/${pick.key}/${pick.variant}.png`);
  return im ? Object.assign(im, { _pick: pick }) : null;
}

/* Photos added in this browser, slug -> record, with a live object URL each.
 * They beat whatever the catalog points at, so a headshot that arrived this
 * morning is on the graphic before it is anywhere near the repo. */
let overrides = new Map();
const overrideUrls = new Map();

async function loadOverrides() {
  overrides = await photos.all();
  for (const u of overrideUrls.values()) URL.revokeObjectURL(u);
  overrideUrls.clear();
  for (const [slug, rec] of overrides) overrideUrls.set(slug, URL.createObjectURL(rec.blob));
}

/** The portrait shipped with the app: a public path the CDN serves directly, or
 *  a Drive id that goes through the proxy. */
function shippedSrc(n) {
  if (!n?.cutout) return null;
  return String(n.cutout).startsWith('/')
    ? n.cutout
    : `/api/portrait/${encodeURIComponent(n.slug)}.png`;
}

/* Every face the app draws comes through here, so there is one place that
 * knows an added photo beats the shipped one. The static build swaps the body
 * for an atlas lookup and inherits the same rule. */
async function portraitImage(n) {
  const mine = overrideUrls.get(n?.slug);
  if (mine) return loadImage(mine);
  const src = shippedSrc(n);
  return src ? loadImage(src) : null;
}

/** A URL for the roster thumbnail, or null when there is no face to show. */
async function portraitThumb(n) {
  return overrideUrls.get(n?.slug) || shippedSrc(n);
}

async function loadPortraits(d) {
  const out = {};
  // The toppers come along every time. It is one more image and it means the
  // face is there the moment somebody switches the governor on.
  const people = [...(d?.nominees || []), ...TOPPERS];
  await Promise.all(people.map(async (n) => {
    const im = await portraitImage(n);
    if (im) out[n.name] = im;
  }));
  return out;
}

/** Re-read the portraits for the district on screen and repaint. The left rail
 *  goes too: a face added here closes a gap, and the list counts gaps. */
async function refreshPortraits() {
  const d = district();
  assets.portraits = d ? await loadPortraits(d) : {};
  renderDistrictList();
  renderSlatePanel();
  draw();
}

/* ----------------------------------------------------------------- rendering */

let pending = null;
function scheduleDraw() {
  clearTimeout(pending);
  pending = setTimeout(draw, 110);
}

/* The typed variables for this district. They are kept per district because a
 * school tax rate and a polling place are facts about one town, and carrying
 * Salem's rate onto a Keene piece is how a wrong number gets printed. */
const varsFor = (d) => (d ? state.mailVars[d.id] || {} : {});

/* Who a piece that says "{{CAND_NAME}}" is about.
 *
 * A district with one nominee has one answer. A district with nine does not,
 * and picking the first name off the list is how "Vote Ball for State
 * Representative" gets printed for a slate of nine. With nobody picked the
 * token is left standing, so the warning fires and somebody chooses. */
function leadFor(d) {
  if (!d) return null;
  const list = activeSlate(d);
  const picked = list.find((n) => n.name === state.style.spotlight);
  if (picked) return picked;
  return list.length === 1 ? list[0] : null;
}

function resolvedCopy(d) {
  const c = {};
  const vars = { lead: leadFor(d), typed: varsFor(d) };
  for (const [k, v] of Object.entries(state.copy)) c[k] = fillTokens(v, d, vars);
  return c;
}

/** Tokens still standing in the copy after everything that can fill one has. */
function unfilledTokens(d) {
  const seen = new Set();
  for (const v of Object.values(resolvedCopy(d))) {
    for (const m of String(v || '').match(/\{\{[A-Z_]+\}\}/g) || []) seen.add(m);
  }
  return [...seen];
}

function buildPlan(d, size, slate) {
  const style = { ...state.style };
  if (style.align === 'auto') delete style.align;
  style.namesOnly = style.faceSource === 'names';
  if (style.faceSource === 'deck') {
    const pick = pickDeck(d, size);
    // Nominal aspect, so the layout is right before the image finishes loading.
    if (pick) style.deckAspect = pick.h / pick.w;
  }
  // The ballot layouts say how many ovals to fill, and that comes off the
  // district record, not off anything anybody types.
  return solve({
    canvas: size, slate, copy: resolvedCopy(d), style,
    seats: d?.seats ?? slate.length,
    die: canvasRec().die || null,
    dpi: canvasRec().dpi || 0,
  }, measure);
}

function draw() {
  const d = district();
  const cv = $('#preview');
  const size = canvasSize();
  cv.width = size.w;
  cv.height = size.h;
  const ctx = cv.getContext('2d');

  if (!d) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#5A6880'; ctx.textAlign = 'center';
    ctx.font = `400 ${size.h * 0.05}px Anton, sans-serif`;
    ctx.fillText('Pick a district', size.w / 2, size.h / 2);
    return;
  }

  const slate = activeSlate(d);
  plan = buildPlan(d, size, slate);
  window.__lastPlan = plan;   // for tests to inspect
  paint(ctx, plan, state.style, assets, resolvedCopy(d));
  paintWarnings(d, slate);
  $('#stage-size').textContent = `${size.w} x ${size.h} px  ·  ${plan.composition}  ·  ${plan.grid.cols}x${plan.grid.rows} grid`;
}

function paintWarnings(d, slate) {
  const out = [];
  /* A token that reached the canvas is a blank hole in a finished piece. It is
   * the loudest thing in this list because it is the one that gets noticed at
   * the mail house rather than here. */
  const left = unfilledTokens(d);
  if (left.length) {
    out.push({ bad: true, text: `${left.join(' ')} is still on the artwork. `
      + 'Fill it in under Mail program, or take it out of the copy. The app will not guess it.' });
  }
  const piece = mailPiece();
  if (piece) {
    out.push({ text: 'No disclaimer and a blank carrier corner, on purpose. The print shop '
      + 'sets the indicia, the return address, the address block, the barcode and the '
      + 'paid for line together. RSA 664:14 applies to the finished piece, so put that '
      + 'in the work order. The handoff note in Both sides already says it.' });
  }
  const noDisc = !piece && !state.copy.disclaimer.trim() && !state.waiveDisclaimer;
  if (noDisc) {
    out.push({ bad: true, text: 'No disclaimer. A finished political ad needs one under RSA 664:14. Add it, or tick "asset layer" if this is a layer somebody else will finish.' });
  }
  // Deck mode only really applies when a deck exists; otherwise the piece has
  // already fallen back to the cutout rebuild and reads normally.
  const usingDeck = state.style.faceSource === 'deck' && Boolean(assets.deck);
  const namesOnly = state.style.faceSource === 'names';
  const gaps = usingDeck || namesOnly ? [] : slate.filter((n) => !assets.portraits[n.name]);
  if (gaps.length) {
    const why = state.catalog.source === 'manifest'
      ? 'Connect Drive to load the portraits.'
      : state.server.isPublic
        ? 'They render as marked placeholders.'
        : `Still needs a headshot: ${gaps.map((n) => n.name).join(', ')}.`;
    out.push({ bad: false, text: `${gaps.length} of ${slate.length} portraits are placeholders. ${why}` });
  }
  if (state.style.faceSource === 'deck' && !assets.deck) {
    out.push({ bad: false, text: `${d.county} ${d.district} never built a deck, so this one is rebuilt from the cutouts instead.` });
  }
  if (!slate.length && !usingDeck) out.push({ bad: true, text: 'Every candidate is switched off. Turn at least one back on under Slate.' });
  if (d.overfilled) out.push({ bad: true, text: 'More names than seats here. The nomination is not settled. Check before this runs.' });
  for (const w of plan.warnings) out.push({ bad: false, text: w });

  $('#warnings').innerHTML = out.map((w) => `<div class="warn${w.bad ? ' bad' : ''}">${esc(w.text)}</div>`).join('');
  const blocked = noDisc || (!usingDeck && !slate.length);
  // Public mode removes some of these outright, so guard the lookup.
  for (const id of ['#btn-png', '#btn-2x', '#btn-drive', '#btn-copy']) {
    const el = $(id);
    if (el) el.disabled = blocked;
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Canvases with a real trim size, where bleed and crop marks mean something.
 *  A canvas declares that by carrying a dpi; a screen canvas has none. */
function isPrintCanvas() {
  return Boolean(canvasRec().dpi)
    || (state.canvasId === 'custom' && Math.max(state.cw, state.ch) >= 1500);
}

async function refreshDeck() {
  const d = district();
  assets.deck = d && state.style.faceSource === 'deck' ? await loadDeck(d, canvasSize()) : null;
}

/** Render one district at one canvas size into a fresh canvas. */
async function renderTo(d, size, scale = 1) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(size.w * scale);
  cv.height = Math.round(size.h * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  const p = buildPlan(d, size, activeSlate(d));
  paint(ctx, p, state.style, assets, resolvedCopy(d));
  return cv;
}

/* ------------------------------------------------------------------ district */

function renderGapSummary(filter) {
  const el = $('#gap-summary');
  const all = state.catalog.districts;
  const noms = all.reduce((a, d) => a + d.nominees.length, 0);
  const have = all.reduce((a, d) => a + d.nominees.filter(hasFace).length, 0);
  if (filter !== 'gap' || !noms) { el.hidden = true; return; }
  const close = all.filter(oneAway);
  el.hidden = false;
  el.innerHTML = `<b>${noms - have}</b> of ${noms} nominees still owe a headshot. `
    + `<b>${all.filter(isReady).length}</b> of ${all.length} districts are complete.`
    + (close.length
      ? `<br><b>${close.length}</b> slate${close.length > 1 ? 's are' : ' is'} one headshot from done.`
      : '');
}

function renderDistrictList() {
  const q = $('#search').value.trim().toLowerCase();
  const filter = $$('.chip').find((c) => c.classList.contains('on'))?.dataset.filter || 'all';
  renderGapSummary(filter);
  const batching = !$('#batch').hidden;
  const html = [];
  let county = null;

  for (const d of state.catalog.districts) {
    if (filter === 'ready' && !isReady(d)) continue;
    if (filter === 'multi' && d.nominees.length < 2) continue;
    if (filter === 'gap' && isReady(d)) continue;
    if (q) {
      const hay = `${d.county} ${d.district} ${(d.towns || []).join(' ')} ${d.nominees.map((n) => n.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (d.county !== county) { county = d.county; html.push(`<div class="county">${esc(county)}</div>`); }
    const have = d.nominees.filter(hasFace).length;
    const cls = have === d.nominees.length ? 'ready' : have ? 'part' : '';
    const close = oneAway(d);
    html.push(
      `<div class="d-row${d.id === state.districtId ? ' on' : ''}${close ? ' one-away' : ''}" data-id="${d.id}">` +
      (batching ? `<input type="checkbox" data-tick="${d.id}" ${state.ticked.has(d.id) ? 'checked' : ''}>` : '') +
      `<span class="dot ${cls}"></span><span class="num">${d.district}</span>` +
      `<span class="who">${esc(d.nominees.map((n) => n.last).join(', ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))}</span>` +
      `<span class="tag">${close ? '1 away' : d.nominees.length}</span></div>`
    );
  }
  $('#districts').innerHTML = html.join('') || '<div class="county">Nothing matches</div>';
}

async function selectDistrict(id) {
  state.districtId = id;
  const d = district();
  renderDistrictList();
  $('#stage-title').textContent = d ? `${d.county} District ${d.district}` : 'Pick a district';
  const towns = (d?.towns || []).join(', ');
  $('#stage-sub').textContent = d
    ? `${d.nominees.length} on the ballot${d.seats ? ` for ${d.seats} seat${d.seats > 1 ? 's' : ''}` : ''}${towns ? ` · ${towns}` : ''}`
    : '';
  assets.portraits = d ? await loadPortraits(d) : {};
  assets.deck = d && state.style.faceSource === 'deck' ? await loadDeck(d, canvasSize()) : null;
  renderSlatePanel();
  // A new district is a new slate, so the spotlight picker is out of date, and
  // so are the typed variables: a school rate belongs to one town.
  renderMailPanel();
  if (ONE_FACE.has(state.style.composition)) fillSpotlightPicker();
  saveLocal();
  draw();
}

/** Is this candidate a sitting member, from the manifest or from a tick here? */
const fromManifest = (n) => Boolean(n.incumbent);
const isRep = (d, n) => fromManifest(n) || (state.reps[d.id] || new Set()).has(n.name);

function renderSlatePanel() {
  const d = district();
  $('#face-source').value = state.style.faceSource;
  if (!d) { $('#slate-list').innerHTML = ''; $('#slate-note').textContent = ''; $('#face-note').textContent = ''; return; }
  const pick = pickDeck(d, canvasSize());
  const usingDeck = state.style.faceSource === 'deck' && Boolean(pick);
  $('#face-note').textContent = state.style.faceSource === 'names'
    ? 'Names only. The plate takes the whole tile and no photo is placed, so a '
      + 'district with portraits still out can go to print today. This is what a '
      + 'yard sign and a road sign want anyway: a name read at forty miles an hour.'
    : state.style.faceSource === 'deck'
      ? (pick
        ? `Placing the built ${pick.key} ${pick.variant} deck as one layer. Switching candidates off or reordering them does not apply to it.`
        : 'No deck was built for this district, so it falls back to the cutouts. The controls below apply.')
      : 'Rebuilt from the cutouts with the same grid and plate maths as make_decks.py, so it matches the built decks and also fits canvases no deck exists for.';
  $('#slate-list').style.display = usingDeck ? 'none' : '';
  const dropped = state.drop[d.id] || new Set();
  const list = activeSlate(d);
  const off = d.nominees.filter((n) => dropped.has(n.name));
  $('#slate-note').textContent = 'Ballot order is alphabetical by surname, the way November lists them. Reorder only when you have a reason.';
  $('#slate-list').innerHTML = [...list, ...off].map((n, i) => {
    const on = !dropped.has(n.name);
    const mine = overrides.has(n.slug);
    const tag = mine ? '<span class="tag mine">yours</span>'
      : hasFace(n) ? ''
        : `<span class="tag gap">${n.hasPhoto ? 'not loaded' : 'photo needed'}</span>`;
    return `<div class="p-row${on ? '' : ' off'}" data-name="${esc(n.name)}">
      <input type="checkbox" data-inc="${esc(n.name)}" ${on ? 'checked' : ''}>
      <button class="ph${mine ? ' mine' : ''}" data-photo="${esc(n.name)}"
        title="${hasFace(n) ? 'Change the photo' : 'Add a photo'}"><span class="plus">+</span></button>
      <button class="rep${isRep(d, n) ? ' on' : ''}" data-rep="${esc(n.name)}"
        title="${fromManifest(n) ? 'A sitting member, from the manifest' : 'Mark as a sitting member'}"
        ${fromManifest(n) ? 'disabled' : ''}>Rep.</button>
      <span class="nm">${esc(n.name)}${n.incumbent ? ' <span class="tag">inc</span>' : ''}</span>${tag}
      <button data-mv="up" ${!on || i === 0 ? 'disabled' : ''}>&uarr;</button>
      <button data-mv="down" ${!on || i >= list.length - 1 ? 'disabled' : ''}>&darr;</button>
    </div>
    <input class="tagline" data-tag="${esc(n.name)}" placeholder="Title or role, palm card only"
      value="${esc((state.tags[d.id] || {})[n.name] || '')}">`;
  }).join('');
  renderPhotoBank();
  renderRepBank();
  fillThumbs();
}

/* Ticks made here are one person's, in one browser. This is the way back into
 * the manifest, which is where a fact about who is a sitting member belongs. */
function renderRepBank() {
  const bank = $('#rep-bank');
  if (!bank) return;
  const rows = repRows();
  bank.hidden = rows.length === 0;
  if (!rows.length) return;
  const n = rows.reduce((a, r) => a + r.names.length, 0);
  $('#rep-bank-count').textContent =
    `${n} member${n > 1 ? 's' : ''} ticked across ${rows.length} district${rows.length > 1 ? 's' : ''}, `
    + 'in this browser only. Put them in the manifest and everybody gets them.';
}

/** The districts with local ticks, as manifest rows. */
function repRows() {
  const out = [];
  for (const [id, set] of Object.entries(state.reps)) {
    const names = [...set].filter(Boolean);
    if (!names.length) continue;
    const d = state.catalog?.districts.find((x) => x.id === id);
    if (!d) continue;
    // Anything already in the manifest is not somebody's tick to hand back.
    const fresh = names.filter((nm) => !d.nominees.some((x) => x.name === nm && x.incumbent));
    if (fresh.length) out.push({ id, county: d.county, district: d.district, names: fresh });
  }
  return out.sort((a, b) => a.county.localeCompare(b.county) || a.district - b.district);
}

async function copyRepsForManifest() {
  const rows = repRows();
  if (!rows.length) return;
  const csv = ['County,District,Incumbents',
    ...rows.map((r) => `${r.county},${r.district},"${r.names.join('; ')}"`)].join('\n');
  try {
    await navigator.clipboard.writeText(csv);
    notice(`${rows.length} row${rows.length > 1 ? 's' : ''} copied. Paste them into the `
      + 'Incumbents column of data/slate-manifest.csv, matching on County and District.');
  } catch {
    notice('This browser will not let a page write to the clipboard. The rows are in the console.', true);
    console.log(csv);
  }
}

/* The thumbnails arrive after the rows because the static build has to cut each
 * one out of a texture atlas. Rendering the row first keeps the list instant. */
function fillThumbs() {
  for (const btn of $$('#slate-list .ph')) {
    const n = personByName(btn.dataset.photo);
    if (!n) continue;
    portraitThumb(n).then((src) => {
      if (!src || !btn.isConnected) return;
      const im = new Image();
      im.alt = '';
      im.src = src;
      btn.replaceChildren(im);
    });
  }
}

/** Re-state the existing rows without rebuilding them. */
function refreshSlateRows() {
  const d = district();
  if (!d) return;
  const dropped = state.drop[d.id] || new Set();
  const on = activeSlate(d).map((n) => n.name);
  for (const row of $$('#slate-list .p-row')) {
    const name = row.dataset.name;
    const included = !dropped.has(name);
    row.classList.toggle('off', !included);
    const i = on.indexOf(name);
    row.querySelector('[data-mv="up"]').disabled = !included || i <= 0;
    row.querySelector('[data-mv="down"]').disabled = !included || i < 0 || i >= on.length - 1;
  }
}

/* ------------------------------------------------------------- photo editor */

/* Changing a face used to mean finding the candidate's slug, naming a file to
 * match, dropping it in public/cutouts, running the index script and pushing.
 * Here it is: click the thumbnail, pick the photo, drag it into the frame.
 *
 * The photo lands in this browser first, which is the only thing that works
 * everywhere: the hosted copy has no writable disk. From there it has two ways
 * out. Where the app is running on a real checkout it can be written straight
 * into public/cutouts as the default for everybody. Where it cannot, it comes
 * back as a correctly named file to drop into the repo. */

const REPO_STEPS = [
  'Adding these portraits to the app for everybody',
  '',
  '1. Copy the files in cutouts/ into public/cutouts/ in the slate-studio repo.',
  '2. Run: npm run index:cutouts',
  '   That rewrites data/cutouts.json, which is how a hosted copy finds them.',
  '3. Commit both and push. Vercel redeploys on its own.',
  '',
  'The filenames matter. Each one is the candidate slug the roster uses, so',
  'leave them exactly as they are.',
].join('\n');

const ed = {
  name: null, slug: null, img: null, view: null, base: 1,
  knockout: false, tol: 34, sourceName: '', token: 0,
};

/* Anybody on the piece, by name: on this district's roster, or a topper.
 *
 * Looking only at the roster is why the photo editor would not open for the
 * governor. Clicking her thumbnail found nobody and returned, silently, which
 * from the outside is a button that does nothing. Everything that resolves a
 * person from a row in the roster panel goes through here. */
const personByName = (name) => district()?.nominees.find((x) => x.name === name)
  || TOPPERS.find((t) => t.name === name)
  || null;

const nominee = personByName;
const edStatus = (msg = '', bad = false) => {
  const el = $('#photo-status');
  el.textContent = msg;
  el.style.color = bad ? 'var(--red)' : '';
};

function openPhotoEditor(name) {
  const n = nominee(name);
  if (!n) return;
  Object.assign(ed, {
    name: n.name, slug: n.slug, img: null, view: null, base: 1,
    knockout: false, tol: 34, sourceName: '', reframing: false, token: ed.token + 1,
  });
  $('#photo-who').textContent = n.name;
  $('#photo-file').value = '';
  $('#photo-knockout').checked = false;
  $('#photo-tol').value = '34';
  edStatus('');
  $('#photo').hidden = false;
  syncEditor();
  loadForReframe(n, ed.token);
}

/* The portrait already on file, opened for editing rather than only for
 * looking at.
 *
 * The zoom and the drag used to appear the moment somebody picked a new file
 * and never otherwise, so a photo that was already in the app could not be
 * re-framed at all: the only way to move a face up an inch was to find the
 * original and upload it again. It is loaded into the editor now, at the frame
 * it is already at, and the knockout is off, because a cutout that ships with
 * the app has been cut out once already and doing it twice eats the edges. */
async function loadForReframe(n, token) {
  const img = await portraitImage(n);
  if (!img || token !== ed.token || ed.img) return;
  ed.img = img;
  ed.reframing = true;
  ed.sourceName = '';
  ed.base = photos.minScale(img);
  ed.view = photos.clampView(img, photos.defaultView(img));
  ed.knockout = false;
  $('#photo-knockout').checked = false;
  $('#photo-zoom').value = '1';
  syncEditor();
}

function closePhotoEditor() {
  ed.token++;
  ed.img = null;
  $('#photo').hidden = true;
}

/** Buttons, notes and both canvases, from whatever state the editor is in. */
function syncEditor() {
  const n = nominee(ed.name);
  const mine = overrides.get(ed.slug);
  const picking = Boolean(ed.img);
  const canWrite = Boolean(state.server.canWriteCutouts);

  $('#photo-zoom-wrap').hidden = !picking;
  $('#photo-tol-wrap').hidden = !picking || !ed.knockout;
  // (set below, once the re-framing case is known)
  $('#photo-use').hidden = !picking;
  $('#photo-download').hidden = !picking && !mine;
  $('#photo-default').hidden = !canWrite || (!picking && !mine);
  $('#photo-remove').hidden = !(mine || (n && hasFace(n) && canWrite));
  $('#photo-remove').textContent = mine ? 'Remove my photo' : 'Remove the default';
  // The label's text, not the label's contents: the file input lives in there
  // and replacing textContent would throw it away.
  $('#photo-pick-label').textContent = picking || (n && hasFace(n)) ? 'Choose another file' : 'Choose a photo';
  // Re-framing a cutout that is already cut out only takes more off it.
  $('#photo-knockout').closest('.inline').hidden = !picking || ed.reframing;
  $('#photo-pick').className = picking ? 'pick ghost' : 'pick primary';

  $('#photo-sub').textContent = picking
    ? (ed.reframing
      ? 'Drag to move it, scroll or use the slider to zoom, then Use it. The frame is '
        + 'the 4:5 tile the slate uses.'
      : 'Drag to move it, scroll or use the slider to zoom. The frame is the 4:5 tile the slate uses.')
    : mine
      ? `Your photo, in this browser only. Download for the repo, commit it to `
        + 'public/cutouts, and everybody has it.'
      : n && hasFace(n)
        ? 'The portrait that ships with the app.'
        // A topper points at where its portrait will be, so asking whether the
        // file is actually there is the only honest test.
        : n?.topper
          ? `No portrait for ${ed.name} yet. Add one and it is on every piece.`
          : 'No headshot was ever sent, so this candidate shows as PHOTO NEEDED.';

  $('#photo-knock-note').hidden = !picking || ed.reframing;
  $('#photo-knock-note').textContent = ed.knockout
    ? 'Clearing everything that touches the edge of the frame and matches the corners. Works on a plain wall or a studio backdrop. Slide Edge up if a rim is left, down if it is eating the candidate.'
    : 'Leave this off for a photo already cut out, or one shot somewhere busy.';

  drawStage();
  drawPreview();
}

function drawStage() {
  const cv = $('#photo-stage');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const hint = $('#photo-hint');
  if (ed.img && ed.view) {
    photos.drawView(ctx, ed.img, ed.view, cv.width, cv.height);
    hint.hidden = true;
    return;
  }
  const token = ed.token;
  portraitImage(nominee(ed.name)).then((im) => {
    if (token !== ed.token || ed.img) return;
    if (!im) {
      hint.hidden = false;
      hint.textContent = `No headshot for ${ed.name}. Choose one below.`;
      return;
    }
    hint.hidden = true;
    const k = Math.min(cv.width / im.width, cv.height / im.height);
    ctx.drawImage(im, (cv.width - im.width * k) / 2, cv.height - im.height * k,
      im.width * k, im.height * k);
  });
}

let previewTimer = null;
const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(drawPreview, 170); };

/** The result, standing on the plate colour: the only place it is ever seen. */
function drawPreview() {
  const cv = $('#photo-preview');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const stand = (im) => {
    const k = Math.min(cv.width / im.width, cv.height / im.height);
    ctx.drawImage(im, (cv.width - im.width * k) / 2, cv.height - im.height * k,
      im.width * k, im.height * k);
  };
  if (ed.img && ed.view) {
    stand(photos.prepare(ed.img, ed.view, { knockout: ed.knockout, tolerance: ed.tol }));
    return;
  }
  const token = ed.token;
  portraitImage(nominee(ed.name)).then((im) => { if (im && token === ed.token && !ed.img) stand(im); });
}

/** One client pixel of drag, in source-image pixels. */
function sourcePerClientPx() {
  const cv = $('#photo-stage');
  const shown = cv.getBoundingClientRect().width || cv.width;
  return cv.width / shown / (ed.view.scale * (cv.width / photos.OUT_W));
}

function setZoom(mult) {
  const z = Math.min(4, Math.max(1, mult));
  $('#photo-zoom').value = String(z);
  ed.view = photos.clampView(ed.img, { ...ed.view, scale: ed.base * z });
  drawStage();
  schedulePreview();
}

/* Decode a file the browser will admit to understanding.
 *
 * Two goes at it. An <img> handles jpeg, png, webp and avif everywhere.
 * createImageBitmap reaches a few formats <img> will not, and on Safari that
 * includes HEIC, which is what an iPhone shoots by default. */
async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (img && img.width) return { img };
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file);
        if (bmp && bmp.width) return { img: bmp };
      } catch { /* fall through to the message below */ }
    }
    return { error: whyNot(file) };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
}

/** Why this browser could not read it, and what to do about it. */
function whyNot(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/.test(file.type || '')) {
    return 'This is a HEIC photo, which is what an iPhone shoots by default, and '
      + 'Chrome cannot read it. On a Mac open it in Preview and File, Export as JPEG. '
      + 'On the phone, Settings, Camera, Formats, Most Compatible. Or paste it here: '
      + 'copying out of Photos converts it.';
  }
  if (/\.(pdf|ai|psd|eps|indd|tif|tiff)$/.test(name)) {
    return `A ${name.split('.').pop().toUpperCase()} is not something a browser can open. `
      + 'Export a JPEG or a PNG first.';
  }
  if (file.size > 30 * 1024 * 1024) {
    return `That file is ${Math.round(file.size / 1048576)} MB, which is too big for the `
      + 'browser to decode. Export it smaller.';
  }
  if (!file.size) return 'That file is empty.';
  // A format the browser does support that still would not decode is a damaged
  // file, and saying "a JPEG will work" about a JPEG is no help to anybody.
  if (/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type || '')
      || /\.(jpe?g|png|webp|avif|gif)$/.test(name)) {
    return 'That looks like a damaged or incomplete file. Open it somewhere else '
      + 'to check it, then export it again.';
  }
  return `This browser cannot read ${file.type || 'that kind of file'}. `
    + 'A JPEG or a PNG will work.';
}

async function pickPhotoFile(file) {
  if (!file) return;
  edStatus(`Opening ${file.name || 'the photo'}...`);
  const { img, error } = await decodeFile(file);
  if (error) return edStatus(error, true);
  ed.img = img;
  ed.reframing = false;
  ed.sourceName = file.name;
  ed.base = photos.minScale(img);
  ed.view = photos.clampView(img, photos.defaultView(img));
  // A plain wall or a studio backdrop is worth knocking out by default. A
  // kitchen is not, and guessing wrong there takes half the candidate with it.
  ed.knockout = photos.backdropIsPlain(img);
  $('#photo-knockout').checked = ed.knockout;
  $('#photo-zoom').value = '1';
  edStatus(ed.knockout ? 'Plain background, so the knockout is on. Turn it off if it bites.' : '');
  syncEditor();
}

/** The prepared photo, encoded the way the repo already stores portraits. */
async function encodeEdited() {
  const out = photos.prepare(ed.img, ed.view, { knockout: ed.knockout, tolerance: ed.tol });
  return photos.encode(out);
}

/** Whatever is on offer: a freshly framed photo, else the stored override. */
async function currentFile() {
  if (ed.img) return encodeEdited();
  const mine = overrides.get(ed.slug);
  return mine ? { blob: mine.blob, type: mine.type, ext: mine.ext } : null;
}

async function usePhoto() {
  if (!ed.img) return;
  edStatus('Preparing...');
  const { blob, type, ext } = await encodeEdited();
  await photos.put({ slug: ed.slug, name: ed.name, blob, type, ext, sourceName: ed.sourceName });
  await loadOverrides();
  closePhotoEditor();
  await refreshPortraits();
  saveLocal();
  notice(`${ed.name} now uses your photo on every canvas. It stays in this browser `
    + 'until you make it the default or download it for the repo.');
}

async function makeDefault() {
  const file = await currentFile();
  if (!file) return;
  edStatus('Writing it into the repo...');
  try {
    const res = await fetch(`/api/cutout/${encodeURIComponent(ed.slug)}.${file.ext}`, {
      method: 'POST', headers: { 'content-type': file.type }, body: file.blob,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'that did not save');
    // It is the shipped portrait now, so the browser copy is just a duplicate.
    await photos.remove(ed.slug);
    await loadOverrides();
    closePhotoEditor();
    await reloadCatalog();
    notice(`${j.name} is the default portrait now, written to ${j.path}. `
      + `${j.portraits} portraits on file. Commit public/cutouts and data/cutouts.json to ship it.`);
  } catch (e) {
    edStatus(e.message, true);
  }
}

async function downloadForRepo() {
  const file = await currentFile();
  if (!file) return;
  download(file.blob, photos.cutoutName(ed.slug, file.ext));
  notice(`Saved as ${ed.slug}.${file.ext}. That filename is the candidate slug, so leave it `
    + 'alone. Put it in public/cutouts/, run npm run index:cutouts, then commit both and '
    + 'push. Vercel redeploys on its own and everybody has it.');
}

async function removePhoto() {
  const mine = overrides.get(ed.slug);
  if (mine) {
    await photos.remove(ed.slug);
    await loadOverrides();
    closePhotoEditor();
    await refreshPortraits();
    return notice(`Your photo for ${ed.name} is gone. Back to what ships with the app.`);
  }
  if (!confirm(`Delete the default portrait for ${ed.name} out of public/cutouts?`)) return;
  edStatus('Deleting...');
  try {
    const res = await fetch(`/api/cutout/${encodeURIComponent(ed.slug)}.webp`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'that did not delete');
    closePhotoEditor();
    await reloadCatalog();
    notice(`${j.name} has no portrait now and shows as PHOTO NEEDED. `
      + 'Commit public/cutouts and data/cutouts.json to make that stick.');
  } catch (e) {
    edStatus(e.message, true);
  }
}

/* ----------------------------------------------------------------- the bank */

function renderPhotoBank() {
  const bank = $('#photo-bank');
  if (!bank) return;
  bank.hidden = overrides.size === 0;
  if (!overrides.size) return;
  const n = overrides.size;
  /* Say plainly why they are stuck here and what moves them.
   *
   * A photo dropped in on the hosted copy lives in this browser's own storage
   * and nowhere else, because a hosted copy has no disk it is allowed to write
   * to. The only thing that puts a portrait in front of everybody is the file
   * landing in public/cutouts in the repository, which is one download and one
   * commit away. Somebody asked how to share them, which means the app was not
   * saying it. */
  $('#photo-bank-count').textContent =
    `${n} photo${n > 1 ? 's' : ''} you added, in this browser and nowhere else. `
    + (state.server.canWriteCutouts
      ? 'Make them the defaults writes them into public/cutouts here.'
      : 'A hosted copy cannot write to disk, so nobody else can see them yet. '
        + 'Download them for the repo gives you a zip of the files, named the way '
        + 'the roster expects, with the three steps in it. Commit that and everybody '
        + 'has them.');
  $('#photos-default').hidden = !state.server.canWriteCutouts;
}

async function photosZip() {
  if (!overrides.size) return;
  const files = [];
  for (const [slug, rec] of overrides) {
    files.push({
      name: `cutouts/${photos.cutoutName(slug, rec.ext)}`,
      data: new Uint8Array(await rec.blob.arrayBuffer()),
    });
  }
  files.push({ name: 'HOW-TO.txt', data: new TextEncoder().encode(REPO_STEPS) });
  download(makeZip(files), `slate-photos-${overrides.size}.zip`);
  notice(`${overrides.size} photo${overrides.size > 1 ? 's' : ''} zipped, named the way the repo `
    + 'expects. HOW-TO.txt inside says where they go.');
}

async function photosToDefault() {
  const list = [...overrides.values()];
  if (!list.length) return;
  let done = 0;
  const failed = [];
  for (const rec of list) {
    try {
      const res = await fetch(`/api/cutout/${encodeURIComponent(rec.slug)}.${rec.ext}`, {
        method: 'POST', headers: { 'content-type': rec.type }, body: rec.blob,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'refused');
      await photos.remove(rec.slug);
      done++;
    } catch (e) {
      failed.push(`${rec.name}: ${e.message}`);
    }
  }
  await loadOverrides();
  await reloadCatalog();
  notice(failed.length
    ? `${done} written, ${failed.length} refused. ${failed[0]}`
    : `${done} portrait${done > 1 ? 's' : ''} written into public/cutouts. `
      + 'Commit public/cutouts and data/cutouts.json to ship them.', failed.length > 0);
}

async function clearMyPhotos() {
  if (!confirm(`Clear all ${overrides.size} photos you added? Anything not downloaded or made the default is gone.`)) return;
  await photos.clear();
  await loadOverrides();
  await refreshPortraits();
  notice('Cleared. The slates are back to the portraits that ship with the app.');
}

/** Re-crawl and repaint after the portraits on disk change. */
async function reloadCatalog() {
  state.catalog = await (await fetch('/api/catalog?refresh=1')).json();
  imgCache.clear();
  showSource();
  renderDistrictList();
  await selectDistrict(state.districtId);
}

/* ------------------------------------------------------------------- exports */

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------------------------------------ mail programme */

/** The programme piece currently open, or null when none is. */
function mailPiece() {
  return state.mail.program ? pieceById(state.mail.program, state.mail.piece) : null;
}

/* One side's copy. The fields a piece owns come off the piece; the fields that
 * belong to the committee rather than to the piece (the disclaimer, the return
 * address, the indicia) stay as they are set, because they are the same on
 * every piece in the drop. */
function sideCopy(piece, side) {
  const blank = {
    kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '',
    values: '', record: '', callout: '', contrast: '', stat: '', source: '', brief: '',
  };
  const own = side === 'back' && state.mail.sharedBack ? SHARED_BACK : piece[side];
  /* Every side carries the district line and the call to action, and the piece
   * carries the issue. No disclaimer: the print shop sets it with the carrier's
   * corner, which is theirs. RSA 664:14 still applies to the finished piece, so
   * the handoff note says so in writing and the work order has to as well. */
  return { ...state.copy, ...blank, ...SIDE_COMMON, ...own, disclaimer: '' };
}

/** The programme picker, the piece list and the variables, redrawn from state. */
function renderMailPanel() {
  const prog = programById(state.mail.program);
  const piece = mailPiece();
  $('#mail-prog-body').hidden = !prog;
  if (prog) {
    $('#mail-piece').innerHTML = prog.pieces
      .map((x) => `<option value="${x.id}">${x.n}. ${esc(x.label)}</option>`).join('');
    $('#mail-piece').value = piece ? piece.id : prog.pieces[0].id;
  }
  if (prog) {
    $('#mail-shared-back').checked = state.mail.sharedBack !== false;
    $('#mail-two-rows').checked = state.mail.twoRows === true;
  }
  $('#mail-front').classList.toggle('on', state.mail.side !== 'back');
  $('#mail-back').classList.toggle('on', state.mail.side === 'back');

  const d = district();
  const typed = varsFor(d);
  /* Only the blanks this drop actually has. The programme runs on general
   * facts, so most drops have none, and five empty fields that fill nothing
   * read as five things somebody forgot to do. A token typed into the copy
   * fields brings its own field back. */
  const copyText = [
    ...(prog ? prog.pieces.flatMap((pc) => [pc.front, pc.back]) : []),
    SIDE_COMMON, state.copy,
  ].flatMap((o) => Object.values(o || {})).join(' ');
  const wanted = MAIL_VARS.filter((v) => copyText.includes(`{{${v.key}}}`));
  $('#mail-vars').innerHTML = wanted.map((v) => `
    <label class="f">${esc(v.label)} <span class="hint">${esc(v.hint)}</span>
      <input data-mailvar="${v.key}" placeholder="${esc(v.placeholder)}"
        value="${esc(typed[v.key] || '')}"></label>`).join('');

  /* A token still standing on the artwork is a blank the app could not fill.
   * Saying which one, and that nobody here is allowed to guess it, is the whole
   * point of the panel. */
  const left = d ? unfilledTokens(d) : [];
  const note = $('#mail-missing');
  note.hidden = !left.length;
  note.textContent = left.length
    ? `Still empty on the artwork: ${left.join(' ')}. Fill them in above. `
      + 'These are facts about your district and nobody here is going to guess them.'
    : '';
}

/** Put a side of the open piece into the boxes and on the canvas. */
function applyMailSide() {
  const piece = mailPiece();
  if (!piece) return;
  const side = state.mail.side === 'back' ? 'back' : 'front';
  state.copy = sideCopy(piece, side);
  Object.assign(state.style, sideStyle(piece, side));
  state.style.ground = 'palette';
  state.style.twoRows = state.mail.twoRows === true;
  // A finished piece has a photograph on it. Loading it with the piece is what
  // makes the programme a programme rather than eight blank image wells.
  loadProgrammeArt(piece);
}

/* The bundled photographs for the open piece: the front's, and the one on the
 * shared back. A picture somebody dropped in themselves wins, because they
 * chose it and the programme's is only a default. */
let artFor = '';
async function loadProgrammeArt(piece) {
  const key = piece ? `${piece.id}|${state.mail.sharedBack ? 's' : 'p'}` : '';
  if (!piece || artFor === key) return;
  artFor = key;
  const load = async (url) => {
    if (!url) return null;
    try { return await loadImage(url); } catch { return null; }
  };
  if (!$('#hero-file').value) assets.hero = await load(artUrl(piece));
  if (!$('#evidence-file').value) {
    assets.evidence = state.mail.sharedBack ? await load(SHARED_BACK_ART) : null;
  }
  draw();
}

/** The programme name for the filename: the piece, or whatever template is on. */
const programNow = () => {
  const piece = mailPiece();
  if (piece) return `${programById(state.mail.program).label} ${piece.n} ${piece.label}`;
  return $('#template').selectedOptions[0]?.textContent || 'Build';
};

/** Which physical side this is, when the layout says. */
function sideNow(styleOverride = state.style) {
  if (styleOverride.composition === 'promise') return 'front';
  if (styleOverride.composition === 'proof') return 'back';
  if (styleOverride.composition === 'palmback') return 'back';
  if (styleOverride.composition === 'palmcard') return 'front';
  if (styleOverride.mailPanel === 'right') return 'back';
  return '';
}

const filenameNow = (scale = 1, extra = {}) => {
  const d = district();
  const c = state.canvasId === 'custom'
    ? { id: 'custom', w: state.cw, h: state.ch }
    : canvasById(state.canvasId);
  const base = buildFilename(d, c, programNow(), { side: sideNow(), ...extra });
  return scale === 1 ? base : base.replace(/\.png$/, '@2x.png');
};

async function exportPng(scale) {
  const d = district();
  if (!d) return;
  const cv = await renderTo(d, canvasSize(), scale);
  cv.toBlob((b) => download(b, filenameNow(scale)), 'image/png');
}

/** One print-ready side: trim plus bleed, crop marks and a slug line. */
async function printSide(d, styleOverride = {}, side = '', copyOverride = null) {
  const size = canvasSize();
  const style = { ...state.style, ...styleOverride };
  const wasStyle = state.style;
  const wasCopy = state.copy;
  state.style = style;                   // buildPlan reads state.style
  if (copyOverride) state.copy = { ...state.copy, ...copyOverride };
  let plan;
  let copy;
  try {
    plan = buildPlan(d, size, activeSlate(d));
    copy = resolvedCopy(d);
  } finally { state.style = wasStyle; state.copy = wasCopy; }
  const dpi = canvasRec().dpi || 300;
  const sheet = printSheet({ plan, style, assets, copy, dpi });
  drawSlug(sheet.canvas.getContext('2d'), sheet.sheet,
    slugLine(plan, dpi, `${d.county} ${d.district}${side ? ' ' + side : ''}`), dpi);
  const blob = await new Promise((r) => sheet.canvas.toBlob(r, 'image/png'));
  return { blob, plan, dpi, inches: inchesOf(plan.canvas, dpi),
           name: filenameNow(1, { side }), side };
}

/** Trim size plus 1/8 inch of bleed, crop marks and a slug line. */
async function exportPrint() {
  const d = district();
  if (!d) return;
  const out = await printSide(d, {}, sideNow());
  download(out.blob, out.name);
  notice(`Print sheet: ${out.inches.w} x ${out.inches.h} in trim, 0.125 in bleed, crop marks, `
    + `${out.dpi} dpi. Files are RGB, so ask the printer to proof colour.`);
}

/* Both sides at once, with the handoff note a printer actually needs.
 *
 * A mail piece is one job with two sides, and sending them one at a time is how
 * a drop goes out with side two from last week. This builds the pair from the
 * same copy, names them front and back, and writes down the trim, the bleed,
 * the dpi, the decoded QR string and the disclaimer so nothing has to be asked
 * for over email. */
async function exportBothSides() {
  const d = district();
  if (!d) return;
  const sides = bothSides();
  if (!sides) return notice('This canvas has no second side. Use Print ready.', true);
  const btn = $('#btn-both');
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Building...';
  try {
    const files = [];
    const built = [];
    for (const s of sides) {
      const out = await printSide(d, s.style, s.side, s.copy || null);
      files.push({ name: out.name, data: new Uint8Array(await out.blob.arrayBuffer()) });
      built.push(out);
    }
    const note = handoffNote(d, built);
    files.push({ name: 'handoff.txt', data: new TextEncoder().encode(note) });
    const zipName = buildName({
      program: programNow(),
      surface: canvasRec().id || 'custom',
      canvas: canvasRec(),
      audience: `${d.county}-${d.district}`,
      side: 'both-sides',
      ext: 'zip',
    });
    download(makeZip(files), zipName);
    notice(`Both sides: ${built.map((b) => b.side).join(' and ')}, `
      + `${built[0].inches.w} x ${built[0].inches.h} in trim at ${built[0].dpi} dpi, `
      + 'with a handoff note. Open the PNGs and look at them before you send them.');
  } catch (e) {
    notice('Both sides failed: ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

/** What a printer needs in writing, so nobody has to ask for it by email. */
function handoffNote(d, built) {
  const c = canvasRec();
  const copy = resolvedCopy(d);
  const qr = built.map((b) => b.plan.qr).find(Boolean);
  const lines = [
    `${d.county} District ${d.district}`,
    `${programNow()} — ${c.label || 'custom'}`,
    '',
    'SPEC',
    `  Trim         ${built[0].inches.w} x ${built[0].inches.h} in`,
    `  Bleed        0.125 in on all four sides`,
    `  Crop marks   yes, outside the bleed`,
    `  Resolution   ${built[0].dpi} dpi`,
    `  Colour       RGB. Convert to CMYK and proof before the run.`,
    ...(c.die === 'hanger'
      ? ['  Die          door hanger, 2.25 in tab, 1.375 in hole. Guides are on the',
         '               artwork; cut from your own die and send a proof.'] : []),
    ...(built.some((b) => b.plan.mailPanel)
      ? ['  Mail panel   4 x 2.25 in, lower right of the trim on the back. Nothing of',
         '               ours is inside it. Address block and barcode zone are clear.'] : []),
    '',
    'FILES',
    ...built.map((b) => `  ${b.side.padEnd(6)} ${b.name}`),
    '',
    'CHECK BEFORE THE RUN',
    '  [ ] Both sides are the same drop and the same version',
    '  [ ] Disclaimer present and legible on every side',
    ...(qr ? ['  [ ] QR scanned with two different phones'] : []),
    '  [ ] Names, dates, addresses and the URL read character by character',
    '  [ ] Nothing live inside the bleed',
    '',
    'DISCLAIMER, as supplied',
    `  ${(copy.disclaimer || '').trim() || 'MISSING. Do not print without it.'}`,
  ];
  /* A programme piece hands the carrier's corner and the paid for line to the
   * mail house on purpose, so the note has to say so in the same breath it says
   * the artwork has no disclaimer on it. Otherwise the checklist above reads as
   * a piece that failed its own check. */
  if (mailPiece()) {
    lines.push('', 'THE PRINT SHOP SETS THE PANEL AND THE PAID FOR LINE',
      '  The carrier corner is blank on purpose and this artwork carries no',
      '  disclaimer. You set the indicia, the return address, the address block,',
      '  the barcode AND the paid for line. A finished political ad in New',
      '  Hampshire needs that line under RSA 664:14. Nothing of ours is in the',
      '  4 x 2.25 in corner, so the whole of it is yours.');
  }
  if (qr) {
    lines.push('', 'QR CODE', `  Points at: ${qr.url}`,
      `  Size on the piece: ${(qr.size / built[0].dpi).toFixed(2)} in square`,
      '  Error correction: high. Quiet zone: 4 modules.');
  }
  const warn = [...new Set(built.flatMap((b) => b.plan.warnings || []))];
  if (warn.length) lines.push('', 'THE APP FLAGGED', ...warn.map((x) => `  - ${x}`));
  return lines.join('\n') + '\n';
}

async function saveToDrive() {
  const d = district();
  if (!d) return;
  const btn = $('#btn-drive');
  const was = btn.textContent;
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    const cv = await renderTo(d, canvasSize(), 1);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const res = await fetch(`/api/save?name=${encodeURIComponent(filenameNow(1))}`, {
      method: 'POST', headers: { 'content-type': 'image/png' }, body: blob,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'save failed');
    notice(`Saved to Drive: ${j.name}`, false, j.link);
  } catch (e) {
    notice(e.message, true);
  } finally {
    btn.textContent = was;
    btn.disabled = false;
  }
}

async function copyImage() {
  const d = district();
  if (!d) return;
  const cv = await renderTo(d, canvasSize(), 1);
  cv.toBlob(async (b) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      notice('Copied. Paste it straight into a post or a deck.');
    } catch { notice('This browser will not let a page copy an image. Use Download instead.', true); }
  }, 'image/png');
}

function notice(msg, bad = false, link = null) {
  const el = $('#notice');
  el.hidden = false;
  el.className = 'notice' + (bad ? ' bad' : '');
  el.innerHTML = esc(msg) + (link ? ` <a href="${esc(link)}" target="_blank" rel="noopener">Open in Drive</a>` : '');
  clearTimeout(notice.t);
  notice.t = setTimeout(() => { el.hidden = true; }, 9000);
}

/* --------------------------------------------------------------------- batch */

function batchDistricts() {
  const scope = $('#batch-scope').value;
  const all = state.catalog.districts;
  if (scope === 'all') return all;
  if (scope === 'ready') return all.filter(isReady);
  if (scope === 'county') return all.filter((d) => d.county === $('#batch-county').value);
  return all.filter((d) => state.ticked.has(d.id));
}

async function runBatch() {
  const sizes = $$('#batch-canvases .sw.on').map((b) => {
    const c = CANVASES.find((x) => x.id === b.dataset.id);
    return { id: c.id, w: c.w, h: c.h };
  });
  if (!sizes.length) return notice('Pick at least one canvas.', true);
  const list = batchDistricts();
  if (!list.length) return notice('No districts in that scope.', true);

  const tag = $('#batch-tag').value || 'Build';
  const toDrive = $('#batch-drive').checked;
  const status = $('#batch-status');
  const run = $('#batch-run');
  run.disabled = true;

  const files = [];
  const keepId = state.districtId;
  try {
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      status.textContent = `${i + 1} of ${list.length}: ${d.county} ${d.district}`;
      state.districtId = d.id;
      assets.portraits = await loadPortraits(d);
      for (const size of sizes) {
        assets.deck = state.style.faceSource === 'deck' ? await loadDeck(d, size) : null;
        const cv = await renderTo(d, size, 1);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
        const name = buildFilename(d, size, tag);
        files.push({ name: `${d.county}-${d.district}/${name}`, data: new Uint8Array(await blob.arrayBuffer()) });
        if (toDrive) {
          await fetch(`/api/save?name=${encodeURIComponent(name)}`, {
            method: 'POST', headers: { 'content-type': 'image/png' }, body: blob,
          });
        }
      }
    }
    status.textContent = `Zipping ${files.length} files...`;
    download(makeZip(files), `NHGOP-${tag.replace(/[^A-Za-z0-9]+/g, '-')}-${files.length}-files.zip`);
    status.textContent = `Done. ${files.length} files across ${list.length} districts.`;
  } catch (e) {
    status.textContent = 'Stopped: ' + e.message;
  } finally {
    run.disabled = false;
    state.districtId = keepId;
    await selectDistrict(keepId);
  }
}

/* ---------------------------------------------------------------------- wire */

/** Which two sides this canvas and layout make a pair of, or null. */
function bothSides() {
  if (!isPrintCanvas()) return null;
  /* A programme piece is two different designs, not one design twice: the
   * message side and the address side carry their own copy. Building them from
   * the piece rather than from whatever is in the boxes is what stops a drop
   * going out with side two from last week. */
  const piece = mailPiece();
  if (piece) {
    return ['front', 'back'].map((side) => ({
      side, style: sideStyle(piece, side), copy: sideCopy(piece, side),
    }));
  }
  const comp = state.style.composition;
  const c = canvasRec();
  if (['palmcard', 'palmback'].includes(comp) || c.id === 'palm' || c.id === 'hanger') {
    return [
      { side: 'front', style: { composition: 'palmcard', mailPanel: 'none' } },
      { side: 'back', style: { composition: 'palmback', mailPanel: 'none' } },
    ];
  }
  // Any other print canvas: the design, then the same design with the
  // carrier's corner taken out of it.
  return [
    { side: 'front', style: { mailPanel: 'none' } },
    { side: 'back', style: { mailPanel: 'right' } },
  ];
}

function fillSelects() {
  $('#canvas').innerHTML = CANVASES.map((c) => `<option value="${c.id}">${c.label} — ${c.w}x${c.h}</option>`).join('')
    + '<option value="custom">Custom size</option>';
  $('#mail-program').innerHTML = '<option value="">None, use the templates below</option>'
    + MAIL_PROGRAMS.map((p) => `<option value="${p.id}">${esc(p.label)} — ${esc(p.note)}</option>`).join('');
  $('#template').innerHTML = '<option value="">Start blank</option>'
    + TEMPLATES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  $('#palettes').innerHTML = PALETTES.map((b) => `<button class="sw" data-pal="${b.id}">${b.label}</button>`).join('');
  $('#grounds').innerHTML = GROUNDS.map((g) => `<button class="sw" data-ground="${g.id}">${g.label}</button>`).join('');
  $('#tokens').innerHTML = TOKENS.map(([t]) => `<button class="tok" data-token="${t}">${t}</button>`).join('');
  $('#topper').innerHTML = '<option value="">Nobody, just the district slate</option>'
    + TOPPERS.map((t) => `<option value="${t.id}">Add ${esc(t.label)}</option>`).join('');
  $('#batch-canvases').innerHTML = CANVASES.map((c) =>
    `<button class="sw${['1x1', 'link', '16x9'].includes(c.id) ? ' on' : ''}" data-id="${c.id}">${c.label}</button>`).join('');
  const counties = [...new Set(state.catalog.districts.map((d) => d.county))];
  $('#batch-county').innerHTML = counties.map((c) => `<option>${c}</option>`).join('');
}

/** The candidates on this district's slate, for the spotlight picker. */
/* The layouts that put one person on the piece. Both need somebody chosen, and
 * both leave the choice to a person rather than taking the first name. */
const ONE_FACE = new Set(['spotlight', 'poster']);

function fillSpotlightPicker() {
  const list = activeSlate();
  const cur = state.style.spotlight;
  $('#spotlight').innerHTML = '<option value="">First on the ballot</option>'
    + list.map((n) => `<option value="${esc(n.name)}">${esc(n.name)}</option>`).join('');
  $('#spotlight').value = list.some((n) => n.name === cur) ? cur : '';
}

function syncControls() {
  $('#canvas').value = state.canvasId;
  $('#custom-size').hidden = state.canvasId !== 'custom';
  $('#cw').value = state.cw; $('#ch').value = state.ch;
  for (const k of COPY_FIELDS) {
    const el = $('#c-' + k);
    if (el) el.value = state.copy[k] || '';
  }
  $('#mailpanel').value = state.style.mailPanel;

  /* Only show a field the chosen layout actually paints. A values strip on a
   * square feed graphic is a box nobody can find the output of. */
  const comp = state.style.composition;
  $('#values-wrap').hidden = !['palmcard', 'palmback', 'versus'].includes(comp);
  $('#record-wrap').hidden = !['palmback', 'receipt'].includes(comp);
  $('#callout-wrap').hidden = !['palmback', 'spotlight'].includes(comp);
  $('#contrast-wrap').hidden = comp !== 'versus';
  $('#stat-wrap').hidden = !['stat', 'receipt'].includes(comp);
  $('#source-wrap').hidden = !['stat', 'receipt'].includes(comp);
  $('#spotlight-wrap').hidden = comp !== 'spotlight';
  if (ONE_FACE.has(comp)) fillSpotlightPicker();

  // The record field does two jobs, so it says which one it is doing.
  $('#record-wrap').querySelector('.hint').textContent = comp === 'receipt'
    ? 'one per line, as "What it was | 412"'
    : 'one thing delivered per line';

  $('#btn-both').hidden = !bothSides();
  $('#topper').value = state.style.topper || '';
  $('#topper-at').value = state.style.topperAt;
  $('#topper-at-wrap').hidden = !state.style.topper;
  const top = topperById(state.style.topper);
  $('#topper-note').textContent = top
    ? `${top.name} is on the piece as a face and a name. She is not on the House `
      + 'ballot line, so she gets no oval and is not counted in the seats.'
    : '';
  $('#btn-print').hidden = !isPrintCanvas();
  $('#mail-fields').hidden = state.style.mailPanel !== 'right';
  $('#composition').value = state.style.composition;
  $('#align').value = state.style.align;
  $('#density').value = state.style.density;
  for (const [sel, key] of COLOR_FIELDS) {
    $(sel).value = state.style[key];
    $(sel + '-hex').value = state.style[key].toUpperCase();
  }
  $('#plate').checked = state.style.plate;
  $('#flagbar').checked = state.style.flagBar;
  $('#hshadow').checked = state.style.headlineShadow;
  $('#twotone').checked = state.style.twoTone !== false;
  $('#honorific').checked = state.style.honorific !== false;
  $('#logo-pos').value = state.style.logoPos;
  $('#disc-waive').checked = state.waiveDisclaimer;
  $('#bg-upload-wrap').hidden = state.style.bgType !== 'image';
  $('#bg-dim-wrap').hidden = state.style.bgType !== 'image';
  $('#bg-dim').value = state.style.bgDim;
  $$('#palettes .sw').forEach((b) => b.classList.toggle('on', b.dataset.pal === state.style.paletteId));
  const pal = PALETTES.find((p) => p.id === state.style.paletteId);
  $('#btn-cycle').textContent = `Colors: ${pal ? pal.label : 'custom'}`;
  $$('#grounds .sw').forEach((b) => b.classList.toggle('on', b.dataset.ground === state.style.ground));
}

function bind() {
  $('#districts').addEventListener('click', (e) => {
    const tick = e.target.closest('[data-tick]');
    if (tick) {
      e.stopPropagation();
      const id = tick.dataset.tick;
      state.ticked.has(id) ? state.ticked.delete(id) : state.ticked.add(id);
      return;
    }
    const row = e.target.closest('.d-row');
    if (row) selectDistrict(row.dataset.id);
  });
  $('#search').addEventListener('input', renderDistrictList);
  $$('.chip').forEach((c) => c.addEventListener('click', () => {
    $$('.chip').forEach((x) => x.classList.remove('on'));
    c.classList.add('on');
    renderDistrictList();
  }));
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.remove('on'));
    $$('.panel').forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
    $(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('on');
  }));

  for (const k of COPY_FIELDS) {
    $('#c-' + k)?.addEventListener('input', (e) => {
      state.copy[k] = e.target.value;
      saveLocal(); scheduleDraw();
    });
  }
  $('#tokens').addEventListener('click', (e) => {
    const t = e.target.dataset.token;
    if (!t) return;
    const el = document.activeElement?.id?.startsWith('c-') ? document.activeElement : $('#c-headline');
    const k = el.id.slice(2);
    const at = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, at) + t + el.value.slice(el.selectionEnd ?? at);
    state.copy[k] = el.value;
    el.focus();
    saveLocal(); scheduleDraw();
  });

  /* Picking a programme takes the piece over: the canvas, the two layouts and
   * both sides' copy come from the piece, not from whatever is in the boxes.
   * Picking "None" hands the boxes back without wiping them. */
  $('#mail-program').addEventListener('change', async (e) => {
    state.mail.program = e.target.value;
    const prog = programById(state.mail.program);
    if (prog) {
      state.mail.piece = prog.pieces[0].id;
      state.mail.side = 'front';
      state.canvasId = prog.canvas;
      Object.assign(state, { cw: canvasSize().w, ch: canvasSize().h });
      applyMailSide();
      await refreshDeck();
    }
    renderMailPanel(); syncControls(); renderSlatePanel(); saveLocal(); draw();
  });

  $('#mail-piece').addEventListener('change', (e) => {
    state.mail.piece = e.target.value;
    applyMailSide();
    renderMailPanel(); syncControls(); saveLocal(); draw();
  });

  $('#mail-shared-back').addEventListener('change', (e) => {
    state.mail.sharedBack = e.target.checked;
    applyMailSide();
    renderMailPanel(); syncControls(); saveLocal(); draw();
  });

  $('#mail-two-rows').addEventListener('change', (e) => {
    state.mail.twoRows = e.target.checked;
    state.style.twoRows = e.target.checked;
    saveLocal(); draw();
  });

  $('#mail-art').addEventListener('change', (e) => {
    state.mail.art = e.target.checked;
    state.style.mailArt = e.target.checked;
    saveLocal(); draw();
  });

  for (const [sel, side] of [['#mail-front', 'front'], ['#mail-back', 'back']]) {
    $(sel).addEventListener('click', () => {
      state.mail.side = side;
      applyMailSide();
      renderMailPanel(); syncControls(); saveLocal(); draw();
    });
  }

  $('#mail-vars').addEventListener('input', (e) => {
    const key = e.target.dataset.mailvar;
    const d = district();
    if (!key || !d) return;
    (state.mailVars[d.id] ||= {})[key] = e.target.value;
    saveLocal();
    scheduleDraw();
    // Only the standing-token line moves, so the field keeps focus as you type.
    const left = unfilledTokens(d);
    const note = $('#mail-missing');
    note.hidden = !left.length;
    note.textContent = left.length
      ? `Still empty on the artwork: ${left.join(' ')}. Fill them in above. `
        + 'These are facts about your district and nobody here is going to guess them.'
      : '';
  });

  for (const [sel, key, what] of [['#hero-file', 'hero', 'hero'], ['#evidence-file', 'evidence', 'evidence']]) {
    $(sel).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) { assets[key] = null; return draw(); }
      const { img, error } = await decodeFile(f);
      if (error) { e.target.value = ''; return notice(error, true); }
      assets[key] = img;
      notice(`${what === 'hero' ? 'Hero' : 'Evidence'} photo in. It fills the well, cropped from the centre.`);
      draw();
    });
  }

  $('#template').addEventListener('change', (e) => {
    const t = TEMPLATES.find((x) => x.id === e.target.value);
    if (!t) return;
    // A template and a programme piece cannot both own the copy boxes.
    if (state.mail.program) { state.mail.program = ''; renderMailPanel(); }
    // Every field a template can fill is cleared first. Otherwise the record
    // from the palm card back is still sitting in the box when you pick the
    // absentee chase, and it comes back the next time a layout paints it.
    const blank = {
      kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '',
      values: '', record: '', callout: '', contrast: '',
    };
    state.copy = { ...state.copy, ...blank, ...t.copy };
    // A template that needs a particular layout says so. One that does not is
    // saying the canvas decides, so it must not inherit the last one's.
    state.style.composition = t.style?.composition || 'auto';
    if (t.style) {
      Object.assign(state.style, t.style);
      if (t.style.bgType) state.style.ground = t.style.bgType === 'transparent' ? 'transparent' : 'palette';
    }
    if (!state.copy.disclaimer) state.copy.disclaimer = DEFAULT_DISCLAIMER;
    syncControls(); saveLocal(); draw();
  });

  $('#canvas').addEventListener('change', async (e) => {
    state.canvasId = e.target.value;
    if (state.canvasId !== 'custom') Object.assign(state, { cw: canvasSize().w, ch: canvasSize().h });
    await refreshDeck();
    syncControls(); renderSlatePanel(); saveLocal(); draw();
  });
  $('#cw').addEventListener('input', (e) => { state.cw = +e.target.value || 1080; scheduleDraw(); });
  $('#ch').addEventListener('input', (e) => { state.ch = +e.target.value || 1080; scheduleDraw(); });

  $('#palettes').addEventListener('click', (e) => {
    const id = e.target.dataset.pal;
    if (!id) return;
    applyPalette(PALETTES.find((x) => x.id === id));
    syncControls(); saveLocal(); draw();
  });
  $('#grounds').addEventListener('click', (e) => {
    const id = e.target.dataset.ground;
    if (!id) return;
    state.style.ground = id;
    const pal = PALETTES.find((x) => x.id === state.style.paletteId) || PALETTES[0];
    state.style.bgType = id === 'palette' ? pal.bgType : id;
    syncControls(); saveLocal(); draw();
  });
  // Hex fields sit next to the colour wells so exact brand values can be pasted.
  for (const [sel, key] of COLOR_FIELDS) {
    $(sel).addEventListener('input', (e) => {
      state.style[key] = e.target.value;
      $(sel + '-hex').value = e.target.value.toUpperCase();
      if (key === 'accent' || key === 'plateColor') state.style.bar = [state.style.accent, state.style.plateColor];
      state.style.paletteId = null;
      saveLocal(); scheduleDraw();
    });
    $(sel + '-hex').addEventListener('change', (e) => {
      const v = e.target.value.trim().replace(/^#?/, '#');
      if (!/^#[0-9a-f]{6}$/i.test(v)) return syncControls();
      state.style[key] = v;
      if (key === 'accent' || key === 'plateColor') state.style.bar = [state.style.accent, state.style.plateColor];
      state.style.paletteId = null;
      syncControls(); saveLocal(); draw();
    });
  }
  $('#bg-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    assets.bgImage = f ? await loadImage(URL.createObjectURL(f)) : null;
    draw();
  });
  $('#bg-dim').addEventListener('input', (e) => { state.style.bgDim = +e.target.value; scheduleDraw(); });
  $('#logo-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    assets.logo = f ? await loadImage(URL.createObjectURL(f)) : null;
    draw();
  });
  $('#logo-clear').addEventListener('click', () => { assets.logo = null; $('#logo-file').value = ''; draw(); });

  $('#mailpanel').addEventListener('change', (e) => {
    state.style.mailPanel = e.target.value;
    $('#mail-fields').hidden = e.target.value !== 'right';
    saveLocal(); draw();
  });
  const styleBind = [['#composition', 'composition'], ['#align', 'align'], ['#logo-pos', 'logoPos']];
  for (const [sel, key] of styleBind) {
    $(sel).addEventListener('change', (e) => {
      state.style[key] = e.target.value;
      // The composition decides which fields are even relevant, so re-sync
      // rather than leaving the palm card's own field hidden.
      syncControls();
      saveLocal();
      draw();
    });
  }
  $('#spotlight').addEventListener('change', (e) => {
    state.style.spotlight = e.target.value;
    saveLocal(); draw();
  });
  for (const [sel, key] of [['#topper', 'topper'], ['#topper-at', 'topperAt']]) {
    $(sel).addEventListener('change', (e) => {
      state.style[key] = e.target.value;
      syncControls(); renderSlatePanel(); saveLocal(); draw();
    });
  }
  $('#density').addEventListener('input', (e) => { state.style.density = +e.target.value; scheduleDraw(); });
  for (const [sel, key] of [['#plate', 'plate'], ['#flagbar', 'flagBar'], ['#hshadow', 'headlineShadow'],
    ['#twotone', 'twoTone'], ['#honorific', 'honorific']]) {
    $(sel).addEventListener('change', async (e) => {
      state.style[key] = e.target.checked;
      if (key === 'plate') await refreshDeck();   // named and clean are separate files
      saveLocal(); draw();
    });
  }
  $('#disc-waive').addEventListener('change', (e) => { state.waiveDisclaimer = e.target.checked; saveLocal(); draw(); });

  $('#slate-list').addEventListener('input', (e) => {
    const name = e.target.dataset.tag;
    if (name === undefined) return;
    const d = district();
    if (!d) return;
    (state.tags[d.id] ||= {})[name] = e.target.value;
    saveLocal(); scheduleDraw();
  });
  $('#face-source').addEventListener('change', async (e) => {
    state.style.faceSource = e.target.value;
    const d = district();
    assets.deck = d && e.target.value === 'deck' ? await loadDeck(d, canvasSize()) : null;
    renderSlatePanel(); saveLocal(); draw();
  });
  $('#slate-list').addEventListener('click', (e) => {
    const d = district();
    if (!d) return;
    const row = e.target.closest('.p-row');
    if (!row) return;
    const name = row.dataset.name;
    const ph = e.target.closest('[data-photo]');
    if (ph) return openPhotoEditor(ph.dataset.photo);
    const rep = e.target.closest('[data-rep]');
    if (rep && !rep.disabled) {
      const set = (state.reps[d.id] ||= new Set());
      set.has(rep.dataset.rep) ? set.delete(rep.dataset.rep) : set.add(rep.dataset.rep);
      renderSlatePanel(); saveLocal(); draw();
      return;
    }
    if (e.target.dataset.inc !== undefined) {
      const set = (state.drop[d.id] ||= new Set());
      e.target.checked ? set.delete(name) : set.add(name);
      refreshSlateRows();
      saveLocal(); draw();
      return;
    }
    if (e.target.dataset.mv) {
      const list = activeSlate(d).map((n) => n.name);
      const i = list.indexOf(name);
      const j = e.target.dataset.mv === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      state.order[d.id] = list;
      renderSlatePanel(); saveLocal(); draw();
    }
  });

  /* photo editor */
  const wrap = $('#photo-stage-wrap');
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (!ed.img || !ed.view) return;
    drag = { x: e.clientX, y: e.clientY, cx: ed.view.cx, cy: ed.view.cy };
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add('dragging');
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = sourcePerClientPx();
    ed.view = photos.clampView(ed.img, {
      ...ed.view,
      cx: drag.cx - (e.clientX - drag.x) * k,
      cy: drag.cy - (e.clientY - drag.y) * k,
    });
    drawStage();
    schedulePreview();
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    wrap.addEventListener(ev, () => { drag = null; wrap.classList.remove('dragging'); });
  }
  wrap.addEventListener('wheel', (e) => {
    if (!ed.img) return;
    e.preventDefault();
    setZoom(Number($('#photo-zoom').value) * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });
  $('#photo-zoom').addEventListener('input', (e) => setZoom(Number(e.target.value)));
  $('#photo-knockout').addEventListener('change', (e) => {
    ed.knockout = e.target.checked;
    syncEditor();
  });
  $('#photo-tol').addEventListener('input', (e) => { ed.tol = Number(e.target.value); schedulePreview(); });
  /* No click handler on the label. The browser takes a tap on a label straight
   * to the input it wraps, which is the one path that works inside an iframe. */
  $('#photo-file').addEventListener('change', (e) => {
    pickPhotoFile(e.target.files[0]);
    // Cleared so choosing the same file twice still fires a change.
    e.target.value = '';
  });

  /* Two more ways in, because a file dialog is the thing most likely to be
   * blocked or awkward: on a locked-down browser, on a tablet, or on a phone
   * where the photo is already in the clipboard. */
  for (const ev of ['dragenter', 'dragover']) {
    wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'dragend']) {
    wrap.addEventListener(ev, () => wrap.classList.remove('over'));
  }
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('over');
    // Anything dropped goes through the same door. Deciding here that a file is
    // not an image loses the chance to say what it is and what to do instead.
    const f = [...(e.dataTransfer?.files || [])][0];
    if (f) pickPhotoFile(f);
    else edStatus('Nothing came with that drop. Try the button.', true);
  });
  document.addEventListener('paste', (e) => {
    if ($('#photo').hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) { e.preventDefault(); pickPhotoFile(f); }
  });
  $('#photo-use').addEventListener('click', usePhoto);
  $('#photo-default').addEventListener('click', makeDefault);
  $('#photo-download').addEventListener('click', downloadForRepo);
  $('#photo-remove').addEventListener('click', removePhoto);
  $('#photo-close').addEventListener('click', closePhotoEditor);
  $('#photo').addEventListener('click', (e) => { if (e.target.id === 'photo') closePhotoEditor(); });
  $('#reps-copy').addEventListener('click', copyRepsForManifest);
  $('#reps-clear').addEventListener('click', () => {
    state.reps = {};
    renderSlatePanel(); saveLocal(); draw();
    notice('Ticks cleared. Whoever the manifest says is a sitting member still is.');
  });
  $('#photos-zip').addEventListener('click', photosZip);
  $('#photos-default').addEventListener('click', photosToDefault);
  $('#photos-clear').addEventListener('click', clearMyPhotos);

  $('#btn-png').addEventListener('click', () => exportPng(1));
  $('#btn-print').addEventListener('click', exportPrint);
  $('#btn-both').addEventListener('click', exportBothSides);
  $('#btn-2x').addEventListener('click', () => exportPng(2));
  $('#btn-drive').addEventListener('click', saveToDrive);
  $('#btn-copy').addEventListener('click', copyImage);
  $('#btn-cycle').addEventListener('click', () => cyclePalette(1));
  $('#btn-link').addEventListener('click', async () => {
    const link = shareLink();
    try {
      await navigator.clipboard.writeText(link);
      const d = district();
      const gaps = d ? facesMissing(d) : 0;
      notice(gaps
        ? `Link copied. It opens ${d.county} ${d.district} with ${gaps} face${gaps > 1 ? 's' : ''} still missing.`
        : 'Link copied.');
    } catch { notice(link, false); }
  });
  // C steps the colours, Shift+C steps back. Ignored while typing copy.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (e.key.toLowerCase() !== 'c') return;
    e.preventDefault();
    cyclePalette(e.shiftKey ? -1 : 1);
  });

  $('#btn-batch').addEventListener('click', () => { $('#batch').hidden = false; renderDistrictList(); });
  $('#batch-close').addEventListener('click', () => { $('#batch').hidden = true; renderDistrictList(); });
  $('#batch-scope').addEventListener('change', (e) => { $('#batch-county-wrap').hidden = e.target.value !== 'county'; });
  $('#batch-canvases').addEventListener('click', (e) => { if (e.target.dataset.id) e.target.classList.toggle('on'); });
  $('#batch-run').addEventListener('click', runBatch);

  $('#btn-refresh').addEventListener('click', async () => {
    $('#btn-refresh').textContent = 'Reading...';
    state.catalog = await (await fetch('/api/catalog?refresh=1')).json();
    imgCache.clear();
    $('#btn-refresh').textContent = 'Refresh Drive';
    showSource();
    renderDistrictList();
    await selectDistrict(state.districtId);
  });
}

function showSource() {
  const c = state.catalog;
  const label = { bundled: 'bundled with the app', drive: 'Google Drive',
    local: 'local folder', manifest: 'bundled manifest' }[c.source] || c.source;
  $('#source').textContent = `${label} · ${c.counts.districts} districts · ${c.counts.withCutouts}/${c.counts.nominees} portraits`;
}

/* ---------------------------------------------------------------------- boot */

async function boot() {
  loadLocal();
  if (!state.copy.disclaimer.trim()) state.copy.disclaimer = DEFAULT_DISCLAIMER;

  // Measuring before the webfonts land would lay everything out against a
  // fallback face and then not match the export.
  await Promise.all([
    document.fonts.load('400 100px Anton'),
    document.fonts.load('700 100px "Barlow Condensed"'),
    document.fonts.load('600 100px "Barlow Condensed"'),
    document.fonts.load('500 100px "Barlow Condensed"'),
  ]).catch(() => {});
  await document.fonts.ready;
  measure = makeMeasurer(document.createElement('canvas').getContext('2d'));

  const [st, cat] = await Promise.all([
    fetch('/api/state').then((r) => r.json()),
    fetch('/api/catalog').then((r) => r.json()),
    // Before the first district is drawn, so an added photo is on the graphic
    // from the first paint rather than flicking in a moment later.
    loadOverrides(),
  ]);
  state.catalog = cat;

  state.server = st;
  if (st.disclaimer && !state.copy.disclaimer.trim()) state.copy.disclaimer = st.disclaimer;
  fillSelects();
  syncControls();
  renderMailPanel();
  bind();
  showSource();
  renderDistrictList();

  // A public copy cannot write to Drive or sign in, so those controls go away
  // rather than sitting there failing.
  if (st.isPublic) {
    for (const id of ['#btn-drive', '#btn-refresh', '#btn-connect']) $(id)?.remove();
    $('#source').title = 'Read-only. Download the PNG, or copy it straight into a post.';
  }

  if (cat.driveError) {
    notice(`Portraits are unavailable: ${cat.driveError}`, true);
  } else if (cat.source === 'manifest') {
    const btn = $('#btn-connect');
    if (btn) btn.hidden = !st.driveConfigured;
    notice(st.driveConfigured
      ? 'Running on the bundled manifest. Connect Drive to pull in the 187 cutouts.'
      : 'Running on the bundled manifest. Set a Google service account key to reach the decks in Drive.');
  }

  // A shared link wins over whatever was last open in this browser.
  const q = new URLSearchParams(location.search);
  const wanted = q.get('d');
  if (q.get('c') && (CANVASES.some((c) => c.id === q.get('c')) || q.get('c') === 'custom')) {
    state.canvasId = q.get('c');
    Object.assign(state, { cw: canvasSize().w, ch: canvasSize().h });
  }
  const pal = PALETTES.find((x) => x.id === q.get('p'));
  if (pal) applyPalette(pal);
  if (q.get('c') || pal) syncControls();

  const first = (wanted && cat.districts.some((d) => d.id === wanted) && wanted)
    || (state.districtId && cat.districts.some((d) => d.id === state.districtId) && state.districtId)
    || (cat.districts.find((d) => isReady(d) && d.nominees.length > 2) || cat.districts[0])?.id;
  await selectDistrict(first);
  if (wanted) {
    const d = district();
    if (d && facesMissing(d)) {
      notice(`${d.county} District ${d.district}: ${facesMissing(d)} of ${d.nominees.length} `
        + 'faces are placeholders because no usable headshot was ever sent.');
    }
  }
}

boot();
