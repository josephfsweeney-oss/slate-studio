/* Google OAuth 2.0, plain fetch, no SDK.
 * Read access to the slate folder, plus drive.file so the app can write finished
 * graphics into a folder it owns. It can never touch anything else in Drive. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config, paths } from './config.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

let tokens = null;
try { tokens = JSON.parse(fs.readFileSync(paths.tokens, 'utf8')); } catch { /* first run */ }
// A hosted copy gets its refresh token from the environment: authorise once on
// your own machine, then set GOOGLE_REFRESH_TOKEN where you deploy.
if (!tokens?.refresh_token && config.refreshToken) tokens = { refresh_token: config.refreshToken };

function save() {
  try {
    fs.mkdirSync(config.stateDir, { recursive: true });
    fs.writeFileSync(paths.tokens, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  } catch (e) {
    // Read-only disk. The token still works for the life of this instance.
    console.warn('token not persisted:', e.message);
  }
}

/* ------------------------------------------------------- service account ---
 * The two-legged flow: sign a JWT with the account's private key and trade it
 * for an access token. No user, no consent screen, no refresh token to keep.
 * The key carries drive.readonly only, so a hosted copy cannot write to Drive
 * even if a write route were somehow reachable. */

let sa = null;
if (config.serviceAccount) {
  try {
    const raw = config.serviceAccount.trim().startsWith('{')
      ? config.serviceAccount
      : Buffer.from(config.serviceAccount, 'base64').toString('utf8');
    const key = JSON.parse(raw);
    if (!key.client_email || !key.private_key) throw new Error('missing client_email or private_key');
    sa = { email: key.client_email, privateKey: key.private_key, token: null, expiresAt: 0 };
  } catch (e) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON could not be read:', e.message);
  }
}

export const usingServiceAccount = () => Boolean(sa);

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Signed JWT assertion for the jwt-bearer grant. Exported so it can be tested
 *  without reaching Google. */
export function buildAssertion(account, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: account.email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: TOKEN,
    iat: now,
    exp: now + 3600,
  }));
  const body = `${header}.${claims}`;
  const sig = crypto.createSign('RSA-SHA256').update(body).end()
    .sign(account.privateKey);
  return `${body}.${b64url(sig)}`;
}

async function serviceAccountToken() {
  if (sa.token && Date.now() < sa.expiresAt) return sa.token;
  const t = await post({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: buildAssertion(sa),
  });
  sa.token = t.access_token;
  sa.expiresAt = Date.now() + (t.expires_in - 60) * 1000;
  return sa.token;
}

export const redirectUri = () => `${config.baseUrl}/auth/callback`;

export function configured() {
  return Boolean(config.clientId && config.clientSecret);
}

export function authUrl() {
  const q = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  });
  return `${AUTH}?${q}`;
}

async function post(body) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`google token: ${json.error_description || json.error || res.status}`);
  return json;
}

export async function exchangeCode(code) {
  const t = await post({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || tokens?.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
  };
  save();
}

export async function accessToken() {
  if (sa) return serviceAccountToken();
  if (!tokens?.refresh_token && !tokens?.access_token) return null;
  if (tokens.access_token && Date.now() < (tokens.expires_at || 0)) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  const t = await post({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  tokens.access_token = t.access_token;
  tokens.expires_at = Date.now() + (t.expires_in - 60) * 1000;
  save();
  return tokens.access_token;
}

export function signedIn() { return Boolean(sa || tokens?.refresh_token); }

export function signOut() {
  tokens = null;
  try { fs.unlinkSync(paths.tokens); } catch { /* already gone */ }
}

/** Printed by `npm run token` so it can be pasted into a hosting environment. */
export function refreshToken() { return tokens?.refresh_token || ''; }
