import { resolveViewForSession } from './trophyBaseAuth';
import { getLocale, normalizeLocale } from './locale';
import {
  buildPrettyGamePath,
  hardwareToUrlSegment,
  parsePrettyGamePath,
} from './gameSlug';
import { getGameUuid, getPlatformGameId, UUID_PATTERN } from './gameModel';
import { isGuidePublished, PUBLISH_LOCALE } from './guidePublication';

/** NPWR-IDs haben das Format NPWR12345_00 (legacy platform_game_id) */
export const NPWR_ID_PATTERN = /^NPWR\d+_\d+$/i;

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
export function getViewFromPath(pathname = '', search) {
  const path = normalizePath(pathname);
  if (path === '/impressum') return 'impressum';
  if (path === '/datenschutz' || path === '/privacy') return 'datenschutz';
  if (path === '/suche' || path === '/search') {
    const queryString =
      search ??
      (typeof window !== 'undefined' && normalizePath(window.location.pathname) === path
        ? window.location.search
        : '');
    if (String(new URLSearchParams(queryString).get('q') ?? '').trim()) {
      return 'search-results';
    }
    return 'advanced-search';
  }
  if (path === '/profile') return 'profile';
  if (path.startsWith('/admin/qa')) return 'qa_admin';
  if (path.startsWith('/guide/')) return 'game_info';
  if (path === '/beta' || path.startsWith('/beta/')) return 'beta';
  if (parsePrettyGamePath(path)) return 'game_info';
  if (getGameIdFromPath(path)) return 'game_info';
  return null;
}

/**
 * Pretty-URL nur für veröffentlichte Guides (statische HTML-Seite).
 * Unveröffentlichte Admin-Vorschau bleibt /guide/{uuid} in der SPA.
 */
export function gameGuidePath(gameOrRef, locale = getLocale()) {
  if (!gameOrRef) return '/';

  if (typeof gameOrRef === 'string') {
    const id = gameOrRef.trim();
    return id ? `/guide/${id}` : '/';
  }

  const id = getGameUuid(gameOrRef) || getPlatformGameId(gameOrRef);
  const published = isGuidePublished(gameOrRef, PUBLISH_LOCALE);
  if (published) {
    const slug = String(gameOrRef.slug ?? '').trim();
    const hardware = hardwareToUrlSegment(gameOrRef.hardware);
    const pretty = buildPrettyGamePath(normalizeLocale(locale), hardware, slug);
    if (pretty) return pretty;
  }

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

export function parseSearchPageParam(search = '') {
  const params = new URLSearchParams(
    search || (typeof window !== 'undefined' ? window.location.search : ''),
  );
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

export function parseSimpleSearchParams(search = '') {
  const source = search || (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(source);
  return {
    q: String(params.get('q') ?? '').trim(),
    page: parseSearchPageParam(source),
  };
}

export function buildSimpleSearchPath(query = '', page = 1) {
  const q = String(query ?? '').trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const safePage = Number.parseInt(String(page), 10);
  if (Number.isFinite(safePage) && safePage > 1) params.set('page', String(safePage));
  const qs = params.toString();
  return qs ? `/suche?${qs}` : '/suche';
}

export function navigateToSimpleSearch(query = '', { page = 1, replace = false } = {}) {
  writeAppPath(buildSimpleSearchPath(query, page), { replace });
}

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

export function buildAdvancedSearchPath(filters = {}, page = 1) {
  const params = new URLSearchParams();
  for (const key of ADVANCED_SEARCH_QUERY_KEYS) {
    const value = String(filters[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  const safePage = Number.parseInt(String(page), 10);
  if (Number.isFinite(safePage) && safePage > 1) params.set('page', String(safePage));
  const qs = params.toString();
  return qs ? `/suche?${qs}` : '/suche';
}

export function navigateToAdvancedSearch(filters = {}, { replace = false, page = 1 } = {}) {
  writeAppPath(buildAdvancedSearchPath(filters, page), { replace });
}

export function navigateToGame(gameOrRef, { replace = false, locale = getLocale() } = {}) {
  writeAppPath(gameGuidePath(gameOrRef, locale), { replace });
}

/** Interne Reiter-IDs der Guide-Ansicht in fester Reihenfolge. */
export const GUIDE_TAB_IDS = ['reiter0', 'reiter1', 'reiter2', 'reiter3'];

export const DEFAULT_GUIDE_TAB = GUIDE_TAB_IDS[0];

/** Sprechende URL-Slugs, damit geteilte Links lesbar bleiben (?tab=collectibles). */
const GUIDE_TAB_SLUGS = {
  reiter0: 'trophies',
  reiter1: 'walkthrough',
  reiter2: 'collectibles',
  reiter3: 'bosses',
};

const GUIDE_TAB_ID_BY_SLUG = Object.fromEntries(
  Object.entries(GUIDE_TAB_SLUGS).map(([tabId, slug]) => [slug, tabId]),
);

export function guideTabSlug(tabId) {
  return GUIDE_TAB_SLUGS[tabId] ?? GUIDE_TAB_SLUGS[DEFAULT_GUIDE_TAB];
}

/** Liest ?tab=… — unbekannte Werte ergeben null, damit der Aufrufer den Default wählt. */
export function parseGuideTabParam(search) {
  const source =
    search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const slug = String(new URLSearchParams(source).get('tab') ?? '')
    .trim()
    .toLowerCase();
  return GUIDE_TAB_ID_BY_SLUG[slug] ?? null;
}

/** Hängt ?tab=… an einen Guide-Pfad; der Default-Reiter bleibt parameterfrei. */
export function withGuideTabParam(path, tabId) {
  const [pathname] = String(path ?? '').split('?');
  if (!tabId || tabId === DEFAULT_GUIDE_TAB || !GUIDE_TAB_SLUGS[tabId]) return pathname;
  return `${pathname}?tab=${guideTabSlug(tabId)}`;
}

/**
 * Reiterwechsel ersetzt den History-Eintrag: Swipen soll den Zurück-Button
 * nicht mit Dutzenden Einträgen zumüllen, Reload und geteilte Links bleiben aber korrekt.
 */
export function navigateToGuideTab(tabId, { replace = true } = {}) {
  if (typeof window === 'undefined') return;
  writeAppPath(withGuideTabParam(window.location.pathname, tabId), { replace });
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
