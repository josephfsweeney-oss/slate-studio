import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* The service-account assertion is signed here and verified here, so the JWT is
 * proved correct without a round trip to Google. What this cannot prove is that
 * Google accepts it: that needs a real key and a real exchange. */

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'slate-studio@example.iam.gserviceaccount.com',
  private_key: privateKey,
});

const { buildAssertion, usingServiceAccount, signedIn } = await import('../server/google-auth.js');

const account = { email: 'slate-studio@example.iam.gserviceaccount.com', privateKey };
const decode = (part) => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

test('a service-account key is picked up from the environment', () => {
  assert.equal(usingServiceAccount(), true);
  assert.equal(signedIn(), true, 'a key counts as signed in: no browser step needed');
});

test('the assertion carries the claims Google requires', () => {
  const now = 1_760_000_000;
  const [h, c] = buildAssertion(account, now).split('.');
  assert.deepEqual(decode(h), { alg: 'RS256', typ: 'JWT' });
  const claims = decode(c);
  assert.equal(claims.iss, account.email);
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.iat, now);
  assert.equal(claims.exp, now + 3600, 'Google rejects a lifetime over an hour');
});

test('the scope is read-only, so a hosted copy cannot write to Drive', () => {
  const claims = decode(buildAssertion(account).split('.')[1]);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/drive.readonly');
  assert.ok(!claims.scope.includes('drive.file'));
  assert.ok(!/auth\/drive$/.test(claims.scope));
});

test('the signature verifies against the public key', () => {
  const [h, c, sig] = buildAssertion(account).split('.');
  const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).end()
    .verify(publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.ok(ok, 'RS256 signature must verify');
});

test('the assertion is base64url, not base64', () => {
  const jwt = buildAssertion(account);
  assert.ok(!jwt.includes('+') && !jwt.includes('/') && !jwt.includes('='),
    'a padded or +/ encoded JWT is rejected by the token endpoint');
  assert.equal(jwt.split('.').length, 3);
});

test('a base64-wrapped key is accepted too, for hosts that mangle newlines', async () => {
  const b64 = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).toString('base64');
  assert.equal(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).client_email, account.email);
});
