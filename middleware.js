import { next, rewrite } from '@vercel/functions';
import { isCrawler } from './shared/crawler.js';
import { parsePrettyGuidePath } from './server/prettyPath.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/|assets/|icons/|src/).*)'],
};

const ADMIN_SUBDOMAIN_APP_DIRS = {
  'apps.trophybase.app': '/admin-apps',
  'bugs.trophybase.app': '/admin-apps/roadmap',
  'drafts.trophybase.app': '/admin-apps/drafts',
  'workflows.trophybase.app': '/admin-apps/workflows',
  'radar.trophybase.app': '/admin-apps/radar',
  'krankenstation.trophybase.app': '/admin-apps/krankenstation',
  'reports.trophybase.app': '/admin-apps/reports',
  'db.trophybase.app': '/admin-apps/db',
  'creators.trophybase.app': '/admin-apps/creators',
};

const STATIC_ROOT_PASSTHROUGH = new Set([
  '/sw.js',
  '/registerSW.js',
  '/version.json',
  '/offline.html',
  '/robots.txt',
  '/admin.html',
  '/intranet.html',
]);

function resolveHostname(request, url) {
  const forwarded = request.headers.get('x-forwarded-host');
  const raw = (forwarded ? forwarded.split(',')[0] : '') || request.headers.get('host') || url.hostname || '';
  return raw.trim().toLowerCase().split(':')[0];
}

/**
 * 1) Subdomain-Mikro-Apps (*.trophybase.app):
 *    Muss zwingend in middleware.js VOR dem statischen Dateisystem laufen, da
 *    dist/index.html und dist/admin-apps/.../manifest.webmanifest real existieren
 *    und vercel.json-Rewrites erst NACH dem Dateisystem greifen würden.
 * 2) Pretty-URLs (/de/ps5/…) auf trophybase.app:
 *    Crawler bekommen Guide-HTML (/api/guide via vercel.json), Browser-Navigationen /index.html.
 */
export default function middleware(request) {
  const url = new URL(request.url);
  const host = resolveHostname(request, url);
  const pathname = url.pathname;

  const appDir = ADMIN_SUBDOMAIN_APP_DIRS[host];
  if (appDir) {
    if (pathname === '/manifest.webmanifest' || pathname === `${appDir}/manifest.webmanifest`) {
      const target = new URL(request.url);
      target.pathname = `${appDir}/subdomain-manifest.webmanifest`;
      target.search = '';
      return rewrite(target);
    }
    if (
      pathname.startsWith('/admin-apps/') ||
      STATIC_ROOT_PASSTHROUGH.has(pathname) ||
      pathname.startsWith('/favicon')
    ) {
      return next();
    }
    const target = new URL(request.url);
    target.pathname = `${appDir}/index.html`;
    target.search = '';
    return rewrite(target);
  }

  if (host === 'admin.trophybase.app' || host === 'intranet.trophybase.app') {
    if (
      pathname.startsWith('/admin-apps/') ||
      STATIC_ROOT_PASSTHROUGH.has(pathname) ||
      pathname.startsWith('/favicon') ||
      pathname === '/manifest.webmanifest'
    ) {
      return next();
    }
    const target = new URL(request.url);
    target.pathname = host === 'admin.trophybase.app' ? '/admin.html' : '/intranet.html';
    target.search = '';
    return rewrite(target);
  }

  if (host && host !== 'trophybase.app' && host !== 'www.trophybase.app') {
    return next();
  }
  if (!parsePrettyGuidePath(pathname)) return next();
  if (isCrawler(request.headers.get('user-agent'))) return next();

  const target = new URL(request.url);
  target.pathname = '/index.html';
  target.search = '';
  return rewrite(target);
}
