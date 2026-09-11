/* npm run verify -- https://your-deployment
 *
 * Checks a deployed copy from the outside: that it works, and that the routes a
 * public URL must not expose are actually shut. Exits non-zero on any failure,
 * so it is usable in CI as well as by hand.
 */
const url = (process.argv[2] || '').replace(/\/$/, '');
const expectPrivate = process.argv.includes('--private');

if (!url || !/^https?:\/\//.test(url)) {
  console.error('Usage: npm run verify -- https://your-deployment [--private]');
  process.exit(2);
}

const pass = [], fail = [], warn = [];
const ok = (m) => { pass.push(m); console.log(`  PASS  ${m}`); };
const no = (m, detail) => { fail.push(m); console.log(`  FAIL  ${m}${detail ? `\n        ${detail}` : ''}`); };
const hm = (m) => { warn.push(m); console.log(`  NOTE  ${m}`); };

async function req(path, init = {}) {
  try {
    const res = await fetch(url + path, { redirect: 'manual', ...init });
    const text = await res.text().catch(() => '');
    return { status: res.status, headers: res.headers, text };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: '', error: e.message };
  }
}

function section(name) { console.log(`\n${name}`); }

const main = async () => {
  console.log(`\nSlate Studio, checking ${url}`);

  /* ---------------------------------------------------------- it is alive */
  section('Reachable');
  const home = await req('/');
  if (home.status === 0) {
    no('the site answers', home.error);
    return report();
  }
  home.status === 200 ? ok('the site answers') : no('the site answers', `got HTTP ${home.status}`);
  /Slate Studio/.test(home.text)
    ? ok('the builder page is served')
    : no('the builder page is served', 'the response did not look like the app');

  /* ------------------------------------------------------------ its state */
  section('Configuration');
  const state = await req('/api/state');
  let st = {};
  try { st = JSON.parse(state.text); } catch { /* handled below */ }
  if (state.status !== 200) {
    no('/api/state answers', `got HTTP ${state.status}`);
    return report();
  }
  ok('/api/state answers');

  if (expectPrivate) {
    st.isPublic ? no('this copy is private', 'SLATE_PUBLIC is set: it is open') : ok('this copy is private');
  } else if (st.isPublic) {
    ok('public mode is on, so the write and auth routes are shut');
  } else {
    no('public mode is on', 'SLATE_PUBLIC is not set to 1. Everything below is exposed.');
  }

  st.signedIn
    ? ok('Drive credentials are loaded')
    : no('Drive credentials are loaded', 'no service account key and no refresh token');

  /* -------------------------------------------------------- the real data */
  section('Data');
  const cat = await req('/api/catalog');
  let c = {};
  try { c = JSON.parse(cat.text); } catch { /* handled below */ }
  if (cat.status !== 200) {
    no('/api/catalog answers', `got HTTP ${cat.status}`);
  } else if (c.driveError) {
    no('Drive is reachable', c.driveError);
  } else if (c.source === 'drive') {
    ok(`reading Drive: ${c.counts.districts} districts, ${c.counts.nominees} nominees`);
    c.counts.withCutouts > 0
      ? ok(`${c.counts.withCutouts} portraits available, ${c.counts.ready} districts complete`)
      : no('portraits are available', 'Drive answered but no cutouts were found');
    if (c.counts.withCutouts < 187) {
      hm(`${c.counts.withCutouts} portraits, fewer than the 187 the deck build produced`);
    }
  } else {
    no('reading Drive', `running on the ${c.source} source, so the portraits are placeholders`);
  }

  /* a real portrait, end to end */
  const withPhoto = (c.districts || []).flatMap((d) => d.nominees).find((n) => n.cutout);
  if (withPhoto) {
    const p = await req(`/api/portrait/${encodeURIComponent(withPhoto.slug)}.png`);
    const isPng = p.status === 200 && /image\/png/.test(p.headers.get('content-type') || '');
    isPng ? ok(`a portrait loads (${withPhoto.name})`)
          : no('a portrait loads', `HTTP ${p.status}, type ${p.headers.get('content-type')}`);
    /s-maxage/.test(p.headers.get('cache-control') || '')
      ? ok('portraits carry CDN cache headers')
      : hm('portraits have no s-maxage, so every request goes back to Drive');
  } else if (!c.driveError) {
    hm('no portrait could be tested: none of the districts has a cutout');
  }

  /* ------------------------------------------------- what must stay closed */
  if (!expectPrivate) {
    section('Closed to the public');
    const closed = [
      ['/api/save', 'POST', 'writing files into your Drive'],
      ['/auth/signout', 'GET', 'revoking the site\'s Drive access'],
      ['/auth/google', 'GET', 'starting an OAuth flow against your client'],
      ['/auth/callback?code=x', 'GET', 'completing one'],
    ];
    for (const [path, method, what] of closed) {
      const r = await req(path, { method });
      r.status === 403
        ? ok(`${method} ${path.split('?')[0]} is refused`)
        : no(`${method} ${path.split('?')[0]} is refused`,
             `got HTTP ${r.status}. A stranger could be ${what}.`);
    }
  }

  report();
};

function report() {
  const line = '-'.repeat(58);
  console.log(`\n${line}`);
  if (fail.length) {
    console.log(`${fail.length} FAILED, ${pass.length} passed${warn.length ? `, ${warn.length} to note` : ''}`);
    console.log('\nDo not share the link yet. Failures:');
    for (const f of fail) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`All ${pass.length} checks passed${warn.length ? `, ${warn.length} to note` : ''}.`);
  console.log('Safe to share.');
  process.exit(0);
}

main();
