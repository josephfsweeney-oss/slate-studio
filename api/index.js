/* Vercel entry. Static files under public/ are served by Vercel itself;
 * everything else is rewritten here and goes through the same handler that
 * `npm start` uses, so local and hosted behave identically. */
import { handler } from '../server/index.js';

export default function (req, res) {
  // Vercel leaves req.url as the path the browser asked for. Guard anyway, so a
  // rewrite that does collapse the path still lands on the app rather than 404.
  if (req.url && req.url.startsWith('/api/index')) req.url = '/';
  return handler(req, res);
}
