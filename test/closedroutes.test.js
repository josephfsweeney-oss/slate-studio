import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../server/config.js';

/* The routes that write to Drive, spend Drive quota, or can revoke the app's
 * own access used to stay open until somebody remembered to set SLATE_PUBLIC on
 * every new deployment. Forget it once and a link that looks read-only is not.
 *
 * So the app shuts them itself whenever there is no credential behind them.
 * These tests hold that line: each credential mode runs the real handler in a
 * clean child process and checks what the three routes actually answer. */

const PROBE = path.join(ROOT, 'test', 'helpers', 'probe-routes.mjs');

function probe(env) {
  const out = execFileSync(process.execPath, [PROBE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      // A developer's own .env must not decide a test about having nothing set.
      SLATE_NO_DOTENV: '1',
      SLATE_STATE_DIR: path.join(ROOT, '.slate-studio', 'test-probe'),
      ...env,
    },
  });
  return JSON.parse(out);
}

test('with no credential at all, every credential-backed route is shut', () => {
  // This is the deployment that ships its own portraits: the common case, and
  // the one that used to depend on remembering a flag.
  const r = probe({});
  assert.equal(r.authStart.status, 403, 'sign-in is a dead end with no client; it must not answer 500');
  assert.equal(r.signOut.status, 403, 'a passer-by must not be able to revoke the app\'s access');
  assert.equal(r.save.status, 403, 'an unauthenticated write into somebody\'s Drive');
  assert.equal(r.state.readOnly, true);
  assert.equal(r.state.writesClosed, true);
  assert.equal(r.state.authClosed, true);
});

test('SLATE_PUBLIC still shuts everything', () => {
  const r = probe({ SLATE_PUBLIC: '1' });
  assert.equal(r.authStart.status, 403);
  assert.equal(r.signOut.status, 403);
  assert.equal(r.save.status, 403);
  assert.equal(r.state.isPublic, true);
});

test('a service-account key reads Drive but can never write to it', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const r = probe({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      client_email: 'probe@example.iam.gserviceaccount.com',
      private_key: privateKey,
    }),
  });
  assert.equal(r.state.signedIn, true, 'a key counts as signed in');
  assert.equal(r.save.status, 403, 'the key is read-only, so the write route is not merely broken');
  assert.equal(r.signOut.status, 403, 'signing out cannot revoke a key set in the environment');
  assert.equal(r.state.readOnly, true);
});

test('a configured OAuth client keeps sign-in open, because that is fixable', () => {
  // The one route that must stay open: nobody has signed in yet, but somebody
  // can. Shutting this would lock the owner out of their own deployment.
  const r = probe({ GOOGLE_CLIENT_ID: 'probe.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'shh' });
  assert.equal(r.authStart.status, 302, 'sign-in must still start');
  assert.equal(r.signOut.status, 403, 'nothing to sign out of yet');
  assert.equal(r.save.status, 400, 'save says how to fix it rather than refusing outright');
  assert.equal(r.state.authClosed, false);
  assert.equal(r.state.writesClosed, true, 'no credential yet, so nothing can be written');
});
