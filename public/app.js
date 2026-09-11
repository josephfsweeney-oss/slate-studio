/* Slate Studio front end. */
import { solve, BRAND } from './layout.js';
import { paint, makeMeasurer } from './render.js';
import { CANVASES, TEMPLATES, PALETTES, GROUNDS, TOKENS, fillTokens, buildFilename } from './presets.js';
import { makeZip } from './zip.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const DEFAULT_DISCLAIMER = 'Paid for by [committee name], [treasurer], [address].';

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
  canvasId: '1x1',
  cw: 1080, ch: 1080,
  copy: { kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '', disclaimer: '' },
  // Defaults are the Granite Guarantee sheet: green and navy on white.
  style: {
    composition: 'auto', align: 'auto', plate: true, density: 1,
    paletteId: 'guarantee', ground: 'palette',
    bgType: 'solid', bgColor: '#FFFFFF', bgColor2: '#235E3B', bgDim: 0.45,
    accent: '#2F7C4E', plateColor: '#12314E', plateAccent: '#95DAB1',
    bar: ['#2F7C4E', '#12314E'],
    faceSource: 'cutouts',
    flagBar: true, headlineShadow: true, twoTone: true,
    logoPos: 'top-right', logoScale: 0.16,
  },
  waiveDisclaimer: false,
  ticked: new Set(),
};

const assets = { portraits: {}, bgImage: null, logo: null, deck: null };
let measure = null;
let plan = null;

/* ------------------------------------------------------------------ plumbing */

const saveLocal = () => {
  try {
    localStorage.setItem('slate-studio', JSON.stringify({
      districtId: state.districtId, canvasId: state.canvasId, cw: state.cw, ch: state.ch,
      copy: state.copy, style: state.style, waiveDisclaimer: state.waiveDisclaimer,
      drop: Object.fromEntries(Object.entries(state.drop).map(([k, v]) => [k, [...v]])),
      order: state.order,
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
      order: s.order || {},
      drop: Object.fromEntries(Object.entries(s.drop || {}).map(([k, v]) => [k, new Set(v)])),
    });
  } catch { /* first visit */ }
}

const district = () => state.catalog?.districts.find((d) => d.id === state.districtId) || null;

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
  return list;
}

const canvasSize = () => {
  if (state.canvasId === 'custom') return { w: state.cw, h: state.ch };
  const c = CANVASES.find((x) => x.id === state.canvasId) || CANVASES[0];
  return { w: c.w, h: c.h };
};

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

async function loadPortraits(d) {
  const out = {};
  await Promise.all((d?.nominees || []).map(async (n) => {
    if (!n.cutout) return;
    const im = await loadImage(`/api/portrait/${encodeURIComponent(n.slug)}.png`);
    if (im) out[n.name] = im;
  }));
  return out;
}

/* ----------------------------------------------------------------- rendering */

let pending = null;
function scheduleDraw() {
  clearTimeout(pending);
  pending = setTimeout(draw, 110);
}

function resolvedCopy(d) {
  const c = {};
  for (const [k, v] of Object.entries(state.copy)) c[k] = fillTokens(v, d);
  return c;
}

function buildPlan(d, size, slate) {
  const style = { ...state.style };
  if (style.align === 'auto') delete style.align;
  if (style.faceSource === 'deck') {
    const pick = pickDeck(d, size);
    // Nominal aspect, so the layout is right before the image finishes loading.
    if (pick) style.deckAspect = pick.h / pick.w;
  }
  return solve({ canvas: size, slate, copy: resolvedCopy(d), style }, measure);
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
  paint(ctx, plan, state.style, assets);
  paintWarnings(d, slate);
  $('#stage-size').textContent = `${size.w} x ${size.h} px  ·  ${plan.composition}  ·  ${plan.grid.cols}x${plan.grid.rows} grid`;
}

function paintWarnings(d, slate) {
  const out = [];
  const noDisc = !state.copy.disclaimer.trim() && !state.waiveDisclaimer;
  if (noDisc) {
    out.push({ bad: true, text: 'No disclaimer. A finished political ad needs one under RSA 664:14. Add it, or tick "asset layer" if this is a layer somebody else will finish.' });
  }
  // Deck mode only really applies when a deck exists; otherwise the piece has
  // already fallen back to the cutout rebuild and reads normally.
  const usingDeck = state.style.faceSource === 'deck' && Boolean(assets.deck);
  const gaps = usingDeck ? [] : slate.filter((n) => !assets.portraits[n.name]);
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
  paint(ctx, p, state.style, assets);
  return cv;
}

/* ------------------------------------------------------------------ district */

function renderDistrictList() {
  const q = $('#search').value.trim().toLowerCase();
  const filter = $$('.chip').find((c) => c.classList.contains('on'))?.dataset.filter || 'all';
  const batching = !$('#batch').hidden;
  const html = [];
  let county = null;

  for (const d of state.catalog.districts) {
    if (filter === 'ready' && !d.ready) continue;
    if (filter === 'multi' && d.nominees.length < 2) continue;
    if (filter === 'gap' && d.ready) continue;
    if (q) {
      const hay = `${d.county} ${d.district} ${(d.towns || []).join(' ')} ${d.nominees.map((n) => n.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (d.county !== county) { county = d.county; html.push(`<div class="county">${esc(county)}</div>`); }
    const have = d.nominees.filter((n) => n.cutout).length;
    const cls = have === d.nominees.length ? 'ready' : have ? 'part' : '';
    html.push(
      `<div class="d-row${d.id === state.districtId ? ' on' : ''}" data-id="${d.id}">` +
      (batching ? `<input type="checkbox" data-tick="${d.id}" ${state.ticked.has(d.id) ? 'checked' : ''}>` : '') +
      `<span class="dot ${cls}"></span><span class="num">${d.district}</span>` +
      `<span class="who">${esc(d.nominees.map((n) => n.last).join(', ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()))}</span>` +
      `<span class="tag">${d.nominees.length}</span></div>`
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
  saveLocal();
  draw();
}

function renderSlatePanel() {
  const d = district();
  $('#face-source').value = state.style.faceSource;
  if (!d) { $('#slate-list').innerHTML = ''; $('#slate-note').textContent = ''; $('#face-note').textContent = ''; return; }
  const pick = pickDeck(d, canvasSize());
  const usingDeck = state.style.faceSource === 'deck' && Boolean(pick);
  $('#face-note').textContent = state.style.faceSource === 'deck'
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
    const tag = n.cutout ? '' : `<span class="tag gap">${n.hasPhoto ? 'not loaded' : 'photo needed'}</span>`;
    return `<div class="p-row${on ? '' : ' off'}" data-name="${esc(n.name)}">
      <input type="checkbox" data-inc="${esc(n.name)}" ${on ? 'checked' : ''}>
      <span class="nm">${esc(n.name)}${n.incumbent ? ' <span class="tag">inc</span>' : ''}</span>${tag}
      <button data-mv="up" ${!on || i === 0 ? 'disabled' : ''}>&uarr;</button>
      <button data-mv="down" ${!on || i >= list.length - 1 ? 'disabled' : ''}>&darr;</button>
    </div>`;
  }).join('');
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

/* ------------------------------------------------------------------- exports */

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const filenameNow = (scale = 1) => {
  const d = district(), size = canvasSize();
  const base = buildFilename(d, size, $('#template').selectedOptions[0]?.textContent || 'Build');
  return scale === 1 ? base : base.replace(/\.png$/, '@2x.png');
};

async function exportPng(scale) {
  const d = district();
  if (!d) return;
  const cv = await renderTo(d, canvasSize(), scale);
  cv.toBlob((b) => download(b, filenameNow(scale)), 'image/png');
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
  if (scope === 'ready') return all.filter((d) => d.ready);
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

function fillSelects() {
  $('#canvas').innerHTML = CANVASES.map((c) => `<option value="${c.id}">${c.label} — ${c.w}x${c.h}</option>`).join('')
    + '<option value="custom">Custom size</option>';
  $('#template').innerHTML = '<option value="">Start blank</option>'
    + TEMPLATES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  $('#palettes').innerHTML = PALETTES.map((b) => `<button class="sw" data-pal="${b.id}">${b.label}</button>`).join('');
  $('#grounds').innerHTML = GROUNDS.map((g) => `<button class="sw" data-ground="${g.id}">${g.label}</button>`).join('');
  $('#tokens').innerHTML = TOKENS.map(([t]) => `<button class="tok" data-token="${t}">${t}</button>`).join('');
  $('#batch-canvases').innerHTML = CANVASES.map((c) =>
    `<button class="sw${['1x1', 'link', '16x9'].includes(c.id) ? ' on' : ''}" data-id="${c.id}">${c.label}</button>`).join('');
  const counties = [...new Set(state.catalog.districts.map((d) => d.county))];
  $('#batch-county').innerHTML = counties.map((c) => `<option>${c}</option>`).join('');
}

function syncControls() {
  $('#canvas').value = state.canvasId;
  $('#custom-size').hidden = state.canvasId !== 'custom';
  $('#cw').value = state.cw; $('#ch').value = state.ch;
  for (const k of ['kicker', 'headline', 'subhead', 'details', 'cta', 'footer', 'disclaimer']) {
    $('#c-' + k).value = state.copy[k] || '';
  }
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

  for (const k of ['kicker', 'headline', 'subhead', 'details', 'cta', 'footer', 'disclaimer']) {
    $('#c-' + k).addEventListener('input', (e) => {
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

  $('#template').addEventListener('change', (e) => {
    const t = TEMPLATES.find((x) => x.id === e.target.value);
    if (!t) return;
    state.copy = { ...state.copy, ...{ kicker: '', headline: '', subhead: '', details: '', cta: '', footer: '' }, ...t.copy };
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

  const styleBind = [['#composition', 'composition'], ['#align', 'align'], ['#logo-pos', 'logoPos']];
  for (const [sel, key] of styleBind) {
    $(sel).addEventListener('change', (e) => { state.style[key] = e.target.value; saveLocal(); draw(); });
  }
  $('#density').addEventListener('input', (e) => { state.style.density = +e.target.value; scheduleDraw(); });
  for (const [sel, key] of [['#plate', 'plate'], ['#flagbar', 'flagBar'], ['#hshadow', 'headlineShadow'], ['#twotone', 'twoTone']]) {
    $(sel).addEventListener('change', async (e) => {
      state.style[key] = e.target.checked;
      if (key === 'plate') await refreshDeck();   // named and clean are separate files
      saveLocal(); draw();
    });
  }
  $('#disc-waive').addEventListener('change', (e) => { state.waiveDisclaimer = e.target.checked; saveLocal(); draw(); });

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

  $('#btn-png').addEventListener('click', () => exportPng(1));
  $('#btn-2x').addEventListener('click', () => exportPng(2));
  $('#btn-drive').addEventListener('click', saveToDrive);
  $('#btn-copy').addEventListener('click', copyImage);
  $('#btn-cycle').addEventListener('click', () => cyclePalette(1));
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
  const label = { drive: 'Google Drive', local: 'local folder', manifest: 'bundled manifest' }[c.source];
  $('#source').textContent = `${label} · ${c.counts.districts} districts · ${c.counts.withCutouts}/${c.counts.nominees} portraits`;
}

/* ---------------------------------------------------------------------- boot */

async function boot() {
  loadLocal();
  if (!state.copy.disclaimer) state.copy.disclaimer = DEFAULT_DISCLAIMER;

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
  ]);
  state.catalog = cat;

  state.server = st;
  fillSelects();
  syncControls();
  bind();
  showSource();
  renderDistrictList();

  // A public copy cannot write to Drive or sign in, so those controls go away
  // rather than sitting there failing.
  if (st.isPublic) {
    for (const id of ['#btn-drive', '#btn-refresh', '#btn-connect']) $(id)?.remove();
    $('#source').title = 'Read-only. Download the PNG, or copy it straight into a post.';
  }

  if (cat.source === 'manifest') {
    $('#btn-connect').hidden = !st.driveConfigured;
    notice(st.driveConfigured
      ? 'Running on the bundled manifest. Connect Drive to pull in the 187 cutouts.'
      : 'Running on the bundled manifest. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to reach the decks in Drive.');
  }

  const first = state.districtId && cat.districts.some((d) => d.id === state.districtId)
    ? state.districtId
    : (cat.districts.find((d) => d.ready && d.nominees.length > 2) || cat.districts[0])?.id;
  await selectDistrict(first);
}

boot();
