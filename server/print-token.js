/* npm run token -- prints the Drive refresh token from the local sign-in, so it
 * can be pasted into a hosted deployment as GOOGLE_REFRESH_TOKEN. */
import { refreshToken, signedIn } from './google-auth.js';

if (!signedIn()) {
  console.error('Not signed in. Run `npm start`, open /auth/google, then try again.');
  process.exit(1);
}
console.log(refreshToken());
