/* Push the photos in this browser straight into the repository.
 *
 * The app has no server that can write to disk, and it must not have one: the
 * site is public, and a token sitting on a public server is a token anybody can
 * use. So the push runs here, in the browser, with a token the person at the
 * keyboard typed in themselves. It is kept in this browser's localStorage if
 * they ask for it to be and nowhere else. It is never sent to the app's own
 * server, never written into a file, and never committed.
 *
 * Use a fine-grained personal access token, scoped to the one repository, with
 * Contents set to read and write and nothing else ticked. That token can add a
 * portrait. It cannot do anything else with the account.
 *
 * One commit per push: every photo plus the rebuilt index, so the tree is never
 * half updated. It goes through the Git Data API rather than the contents
 * endpoint for exactly that reason.
 */

const API = 'https://api.github.com';
const KEY = 'slate-studio-gh';

/** What is remembered between visits. The token is only here if asked for. */
export function settings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function remember(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window */ }
}

export function forget() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

/** "owner/repo", loosely. Anything else is a typo worth catching early. */
export function parseRepo(text) {
  const m = String(text || '').trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function call(token, path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (e) {
    /* A published Artifact cannot reach github.com: the page is served under a
     * policy that blocks every host it was not given. Say which wall this is. */
    throw new Error('The browser could not reach api.github.com. A published '
      + 'Artifact is not allowed to; open the app on its own address and push '
      + `from there. (${e.message})`);
  }
  const body = await res.text();
  if (!res.ok) {
    let why = body.slice(0, 300);
    try { why = JSON.parse(body).message || why; } catch { /* keep the text */ }
    if (res.status === 401) why = 'GitHub refused the token. Check it, and check it has not expired.';
    if (res.status === 403) why = 'The token reached GitHub but is not allowed to write here. '
      + 'It needs Contents: read and write on this repository.';
    if (res.status === 404) why = 'GitHub cannot see that repository or that branch with this token. '
      + 'A fine-grained token only sees repositories it was given.';
    throw new Error(`${opts.method || 'GET'} ${path}: ${res.status}. ${why}`);
  }
  return body ? JSON.parse(body) : null;
}

/** Bytes to base64, in chunks, because one big apply() overflows the stack. */
async function b64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Whoever this token belongs to, so the app can say so before it writes. */
export async function whoami(token) {
  const me = await call(token, '/user');
  return me.login;
}

/**
 * One commit: every file, plus data/cutouts.json rebuilt to match.
 *
 * files: [{ path, blob }]        where they go in the repository
 * indexPath: 'data/cutouts.json' rebuilt from the branch's own copy, so the
 *                                index is never built from a stale list
 */
export async function push({ owner, repo, branch, token, files, indexPath, message, onStep }) {
  const step = (t) => { if (onStep) onStep(t); };
  const base = `/repos/${owner}/${repo}`;

  step('Finding the branch');
  const ref = await call(token, `${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  const head = ref.object.sha;
  const headCommit = await call(token, `${base}/git/commits/${head}`);

  const tree = [];
  let n = 0;
  for (const f of files) {
    n += 1;
    step(`Uploading ${n} of ${files.length}: ${f.path.split('/').pop()}`);
    const blob = await call(token, `${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: await b64(f.blob), encoding: 'base64' }),
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  if (indexPath) {
    step('Rebuilding the portrait index');
    let list = [];
    try {
      const cur = await call(token,
        `${base}/contents/${indexPath}?ref=${encodeURIComponent(branch)}`);
      list = JSON.parse(atob(String(cur.content || '').replace(/\n/g, '')));
    } catch { list = []; }
    const names = new Set(Array.isArray(list) ? list : []);
    for (const f of files) {
      if (f.path.startsWith('public/cutouts/')) names.add(f.path.split('/').pop());
    }
    const next = [...names].sort();
    tree.push({ path: indexPath, mode: '100644', type: 'blob',
      content: JSON.stringify(next) });
  }

  step('Writing the tree');
  const newTree = await call(token, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  });

  step('Committing');
  const commit = await call(token, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
  });

  step('Moving the branch');
  await call(token, `${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { sha: commit.sha, url: commit.html_url
    || `https://github.com/${owner}/${repo}/commit/${commit.sha}` };
}
