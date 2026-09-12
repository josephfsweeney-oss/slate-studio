/* Resolve Playwright for the build scripts only.
 *
 * The app itself has no dependencies and never loads this. The two build
 * scripts need a browser to encode WebP and to pack the atlases, so they ask
 * for one here and say plainly what to do when there isn't one.
 */
export async function chromium() {
  const tries = [
    'playwright',
    process.env.PLAYWRIGHT_MODULE,
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    '/usr/lib/node_modules/playwright/index.mjs',
  ].filter(Boolean);
  for (const spec of tries) {
    try {
      const m = await import(spec);
      if (m.chromium) return m.chromium;
    } catch { /* try the next one */ }
  }
  console.error(
    'This build step needs Playwright, which the app itself does not.\n'
    + '  npm install --no-save playwright && npx playwright install chromium\n'
    + 'Or point PLAYWRIGHT_MODULE at an existing install.');
  process.exit(1);
}
