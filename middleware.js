import { next, rewrite } from '@vercel/functions';
import { isCrawler } from './shared/crawler.js';
import { parsePrettyGuidePath } from './server/prettyPath.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/|assets/|icons/|src/).*)'],
};

/**
 * Pretty-URLs (/de/ps5/…) gehen in vercel.json an die Guide-HTML für Crawler.
 * Ein Neuladen im Browser (Pull-to-refresh) muss dieselbe URL als App ausliefern,
 * sonst bleibt eine Textseite ohne Navigation und Zurück verlässt die App.
 * Der Rewrite läuft vor dem CDN-Cache, damit Guide-HTML und App nicht dieselbe
 * Cache-Antwort teilen.
 */
export default function middleware(request) {
  const url = new URL(request.url);
  if (!parsePrettyGuidePath(url.pathname)) return next();
  if (isCrawler(request.headers.get('user-agent'))) return next();

  const target = new URL(request.url);
  target.pathname = '/index.html';
  target.search = '';
  return rewrite(target);
}
