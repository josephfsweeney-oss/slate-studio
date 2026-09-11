import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** .env is read here so nobody has to export variables by hand. */
function loadDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

// Serverless filesystems are read-only apart from /tmp, and nothing written
// there survives a cold start. That is fine for a cache; it is not fine for the
// Drive token, which comes from GOOGLE_REFRESH_TOKEN when hosted.
export const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export const config = {
  port: Number(process.env.PORT || 5173),
  host: process.env.HOST || '0.0.0.0',
  // Render and Vercel each publish the deployed URL, so BASE_URL is one less
  // thing to set by hand. An explicit BASE_URL still wins.
  baseUrl: (process.env.BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || `http://localhost:${process.env.PORT || 5173}`).replace(/\/$/, ''),
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Name or id of the Drive folder holding Decks/ Cutouts/ build/.
  driveFolderName: process.env.SLATE_DRIVE_FOLDER || '2026 Slate Decks',
  // The 2026 Slate Decks folder. Pinned by id so no name lookup can miss it.
  driveFolderId: process.env.SLATE_DRIVE_FOLDER_ID || '1HYMAdrQ4w5vizodC5ICHYzSM0uRUUdAH',
  // Point at the same tree on disk to run with no Google account at all.
  localDir: process.env.SLATE_LOCAL_DIR || '',
  stateDir: process.env.SLATE_STATE_DIR || (serverless ? '/tmp/slate-studio' : path.join(ROOT, '.slate-studio')),
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  // A service-account key is the headless path: no OAuth client, no consent
  // screen, no redirect URI, no browser round trip. Share the Drive folder with
  // the account's email and it can read it. Raw JSON or base64.
  serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  // Set to lock the app behind a shared password when it is deployed publicly.
  password: process.env.SLATE_PASSWORD || '',
  // Open to the internet. Everything that writes, spends Drive quota, or can
  // revoke the app's own access is shut off. See PUBLIC MODE in the README.
  isPublic: process.env.SLATE_PUBLIC === '1',
  // The committee this deployment builds for. Another committee sets its own.
  disclaimer: process.env.SLATE_DISCLAIMER || '',
  // Show only districts whose portraits are all present, so the photo gap is
  // not on display. Off by default: it hides 89 of 174 districts.
  readyOnly: process.env.SLATE_PUBLIC_READY_ONLY === '1',
};

export const paths = {
  tokens: path.join(config.stateDir, 'tokens.json'),
  catalog: path.join(config.stateDir, 'catalog.json'),
  cache: path.join(config.stateDir, 'cache'),
};

fs.mkdirSync(paths.cache, { recursive: true });
