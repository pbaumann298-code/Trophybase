import { resolveViewForSession } from './trophyBaseAuth';
import { getLocale, normalizeLocale } from './locale';
import {
  buildPrettyGamePath,
  hardwareToUrlSegment,
  parsePrettyGamePath,
} from './gameSlug';

/** NPWR-IDs haben das Format NPWR12345_00 (legacy platform_game_id) */
export const NPWR_ID_PATTERN = /^NPWR\d+_\d+$/i;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Views die auch im Wartungsmodus ohne Bypass erreichbar sind (öffentliche Inhalte). */
export const PUBLIC_APP_VIEWS = new Set([
  'game_info',
  'search-results',
  'advanced-search',
  'impressum',
  'datenschutz',
]);

/** Views die eingeloggte Nutzer auch im Wartungsmodus sehen dürfen. */
export const AUTHENTICATED_APP_VIEWS = new Set(['home', 'profile']);

export function canRenderAppContent({ isMaintenanceMode, maintenanceBypass, sessionUser, currentView }) {
  if (!isMaintenanceMode) return true;
  if (maintenanceBypass) return true;
  if (PUBLIC_APP_VIEWS.has(currentView)) return true;
  if (sessionUser && AUTHENTICATED_APP_VIEWS.has(currentView)) return true;
  return false;
}

export function normalizePath(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!path || path === '/') return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

/** View aus URL-Pfad (Deep Links bei F5 / Direktaufruf). */
export function getViewFromPath(pathname = '') {
  const path = normalizePath(pathname);
  if (path === '/impressum') return 'impressum';
  if (path === '/datenschutz' || path === '/privacy') return 'datenschutz';
  if (path === '/suche' || path === '/search') return 'advanced-search';
  if (path === '/profile') return 'profile';
  if (path.startsWith('/admin/qa')) return 'qa_admin';
  if (path.startsWith('/guide/')) return 'game_info';
  if (path === '/beta' || path.startsWith('/beta/')) return 'beta';
  if (parsePrettyGamePath(path)) return 'game_info';
  if (getGameIdFromPath(path)) return 'game_info';
  return null;
}

/**
 * Pretty-URL wenn slug + Konsole da sind: /de/ps5/astro-bot
 * sonst Legacy /guide/{platform_game_id|uuid}.
 * @param {object|string|null|undefined} gameOrRef
 * @param {string} [locale]
 */
export function gameGuidePath(gameOrRef, locale = getLocale()) {
  if (!gameOrRef) return '/';

  if (typeof gameOrRef === 'string') {
    const id = gameOrRef.trim();
    return id ? `/guide/${id}` : '/';
  }

  const slug = String(gameOrRef.slug ?? '').trim();
  const hardware = hardwareToUrlSegment(gameOrRef.hardware);
  const pretty = buildPrettyGamePath(normalizeLocale(locale), hardware, slug);
  if (pretty) return pretty;

  const fallback = gameOrRef.platform_game_id ?? gameOrRef.id ?? gameOrRef.game_id;
  const id = String(fallback ?? '').trim();
  return id ? `/guide/${id}` : '/';
}

/**
 * Route segment from /guide/{id} — UUID or platform_game_id (e.g. NPWR…)
 * Pretty-URLs /:locale/:hardware/:slug werden von parsePrettyGamePath gelesen.
 */
export function getGameIdFromPath(pathname = '') {
  const path = normalizePath(pathname);

  if (path.startsWith('/guide/')) {
    const id = path.split('/')[2]?.trim();
    return id || null;
  }

  const segment = path.slice(1);
  if (NPWR_ID_PATTERN.test(segment) || UUID_PATTERN.test(segment)) {
    return segment;
  }

  return null;
}

/**
 * Session-View, aber Deep Links (/guide/…, /de/ps5/…, /NPWR…) haben Vorrang vor home/login-Redirect.
 */
export function resolveAppViewForSession(user, pathname) {
  const pathView = getViewFromPath(pathname);
  if (pathView) return pathView;
  return resolveViewForSession(user);
}

/** URL + History aktualisieren (SPA-Navigation). */
export function writeAppPath(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const target = path || '/';
  const qIndex = target.indexOf('?');
  const targetPath = normalizePath(qIndex === -1 ? target : target.slice(0, qIndex));
  const targetSearch = qIndex === -1 ? '' : target.slice(qIndex);
  const currentPath = normalizePath(window.location.pathname);
  const currentSearch = window.location.search;
  if (currentPath === targetPath && currentSearch === targetSearch) return;
  const href = `${targetPath}${targetSearch}`;
  if (replace) {
    window.history.replaceState({}, '', href);
  } else {
    window.history.pushState({}, '', href);
  }
}

export function navigateToHome() {
  writeAppPath('/');
}

export function navigateToProfile() {
  writeAppPath('/profile');
}

export function navigateToImpressum() {
  writeAppPath('/impressum');
}

export function navigateToPrivacy() {
  writeAppPath('/datenschutz');
}

const ADVANCED_SEARCH_QUERY_KEYS = ['title', 'developer', 'genre', 'console'];

export function parseAdvancedSearchParams(search = '') {
  const params = new URLSearchParams(
    search || (typeof window !== 'undefined' ? window.location.search : ''),
  );
  const filters = {};
  for (const key of ADVANCED_SEARCH_QUERY_KEYS) {
    filters[key] = String(params.get(key) ?? '').trim();
  }
  return filters;
}

export function buildAdvancedSearchPath(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ADVANCED_SEARCH_QUERY_KEYS) {
    const value = String(filters[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/suche?${qs}` : '/suche';
}

export function navigateToAdvancedSearch(filters = {}, { replace = false } = {}) {
  writeAppPath(buildAdvancedSearchPath(filters), { replace });
}

export function navigateToGame(gameOrRef, { replace = false, locale = getLocale() } = {}) {
  writeAppPath(gameGuidePath(gameOrRef, locale), { replace });
}

/** Sprachwechsel auf einer Pretty-URL: nur das Locale-Segment tauschen. */
export function syncPathLocale(nextLocale) {
  if (typeof window === 'undefined') return;
  const pretty = parsePrettyGamePath(window.location.pathname);
  if (!pretty) return;
  const normalized = normalizeLocale(nextLocale);
  if (pretty.locale === normalized) return;
  writeAppPath(buildPrettyGamePath(normalized, pretty.hardware, pretty.slug), { replace: true });
}

export { parsePrettyGamePath };
