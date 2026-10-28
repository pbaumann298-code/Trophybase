import { parseServertotPath, servertotPublicPath } from './servertotPage.js';
import { parseEasyPlatinsPath, easyPlatinsPublicPath } from './easyPlatinsPage.js';
import { parseQuickwinsPath, quickwinsPublicPath } from './quickwinsPage.js';
import { resolveViewForSession } from './trophyBaseAuth.js';
import { getLocale, normalizeLocale } from './locale.js';
import {
  buildPrettyGamePath,
  hardwareToUrlSegment,
  parsePrettyGamePath,
} from './gameSlug.js';
import { getGameUuid, getPlatformGameId } from './gameModel.js';
import { publishedGuideLocales } from './guidePublication.js';
import { coerceToAvailableLocale } from './contentLocales.js';

/** NPWR-IDs haben das Format NPWR12345_00 (legacy platform_game_id) */
export const NPWR_ID_PATTERN = /^NPWR\d+_\d+$/i;

/** Views die auch im Wartungsmodus ohne Bypass erreichbar sind (öffentliche Inhalte). */
export const PUBLIC_APP_VIEWS = new Set([
  'game_info',
  'search-results',
  'advanced-search',
  'quickwins',
  'servertot',
  'easyplatins',
  'watchlist',
  'platform-trophies',
  'impressum',
  'datenschutz',
  'guide-help',
]);

/** Views die eingeloggte Nutzer auch im Wartungsmodus sehen dürfen. */
export const AUTHENTICATED_APP_VIEWS = new Set(['home', 'profile', 'watchlist']);

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
  if (path === '/platinliste' || path === '/platform-trophies') return 'platform-trophies';
  if (path === '/impressum') return 'impressum';
  if (path === '/datenschutz' || path === '/privacy') return 'datenschutz';
  if (path === '/kurz-erklaert') return 'guide-help';
  if (path === '/quickwins' || parseQuickwinsPath(path)) return 'quickwins';
  if (path === '/servertot' || parseServertotPath(path)) return 'servertot';
  if (path === '/easy-platins' || path === '/easyplatins' || parseEasyPlatinsPath(path)) {
    return 'easyplatins';
  }
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
  if (path === '/profile' || path === '/cockpit') return 'profile';
  if (path === '/watchlist') return 'watchlist';
  if (path.startsWith('/admin/qa')) return 'qa_admin';
  if (path === '/beta' || path.startsWith('/beta/')) return 'beta';
  if (parsePrettyGamePath(path)) return 'game_info';
  if (getGameIdFromPath(path)) return 'game_info';
  return null;
}

/**
 * Pretty-URL nur für veröffentlichte Guides (statische HTML-Seite).
 * Unveröffentlichte Vorschau: /guide/{NPWR} statt /guide/{uuid}.
 */
export function gameGuidePath(gameOrRef, locale = getLocale()) {
  if (!gameOrRef) return '/';

  if (typeof gameOrRef === 'string') {
    const id = gameOrRef.trim();
    return id ? `/guide/${id}` : '/';
  }

  const id = getPlatformGameId(gameOrRef) || getGameUuid(gameOrRef);
  const publishedLocales = publishedGuideLocales(gameOrRef);
  if (publishedLocales.length > 0) {
    const slug = String(gameOrRef.slug ?? '').trim();
    const hardware = hardwareToUrlSegment(gameOrRef.hardware);
    const pathLocale = coerceToAvailableLocale(locale, publishedLocales);
    const pretty = buildPrettyGamePath(pathLocale, hardware, slug);
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
    if (id && NPWR_ID_PATTERN.test(id)) {
      return id;
    }
    return null;
  }

  const segment = path.slice(1);
  if (NPWR_ID_PATTERN.test(segment)) {
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

export const PROFILE_PATH = '/profile';

export function navigateToProfile({ replace = false } = {}) {
  writeAppPath(PROFILE_PATH, { replace });
}

export const WATCHLIST_PATH = '/watchlist';

export function navigateToWatchlist({ replace = false } = {}) {
  writeAppPath(WATCHLIST_PATH, { replace });
}

export const PLATFORM_TROPHIES_PATH = '/platinliste';

export function navigateToPlatformTrophies({ replace = false } = {}) {
  writeAppPath(PLATFORM_TROPHIES_PATH, { replace });
}

export function navigateToImpressum() {
  writeAppPath('/impressum');
}

export function navigateToPrivacy() {
  writeAppPath('/datenschutz');
}

export function navigateToGuideHelp(section = '') {
  const href = section ? `/kurz-erklaert#${section}` : '/kurz-erklaert';
  const here = `${normalizePath(window.location.pathname)}${window.location.hash}`;
  if (here === href) return;
  window.history.pushState({}, '', href);
}

const ADVANCED_SEARCH_QUERY_KEYS = ['title', 'developer', 'genre', 'console', 'tag', 'onlineMode'];

export function parseSearchPageParam(search = '') {
  const params = new URLSearchParams(
    search || (typeof window !== 'undefined' ? window.location.search : ''),
  );
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

/** true = Quickwins ausblenden. quick=1 in der URL holt sie dazu. */
export function parseExcludeQuickwins(search = '') {
  const params = new URLSearchParams(
    search || (typeof window !== 'undefined' ? window.location.search : ''),
  );
  return params.get('quick') !== '1';
}

function applyExcludeQuickwinsParam(params, excludeQuickwins) {
  if (excludeQuickwins === false) params.set('quick', '1');
  else params.delete('quick');
}

/** true = auch Spiele ohne freigegebenen Guide (nur Trophäen). Nur für Login-User. */
export function parseIncludeTrophiesOnly(search = '') {
  const params = new URLSearchParams(
    search || (typeof window !== 'undefined' ? window.location.search : ''),
  );
  return params.get('trophies') === '1';
}

function applyIncludeTrophiesOnlyParam(params, includeTrophiesOnly) {
  if (includeTrophiesOnly) params.set('trophies', '1');
  else params.delete('trophies');
}

export function parseSimpleSearchParams(search = '') {
  const source = search || (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(source);
  return {
    q: String(params.get('q') ?? '').trim(),
    page: parseSearchPageParam(source),
    excludeQuickwins: parseExcludeQuickwins(source),
    includeTrophiesOnly: parseIncludeTrophiesOnly(source),
  };
}

export function buildSimpleSearchPath(
  query = '',
  page = 1,
  excludeQuickwins = true,
  includeTrophiesOnly = false,
) {
  const q = String(query ?? '').trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  applyExcludeQuickwinsParam(params, excludeQuickwins);
  applyIncludeTrophiesOnlyParam(params, includeTrophiesOnly);
  const safePage = Number.parseInt(String(page), 10);
  if (Number.isFinite(safePage) && safePage > 1) params.set('page', String(safePage));
  const qs = params.toString();
  return qs ? `/suche?${qs}` : '/suche';
}

export function navigateToSimpleSearch(
  query = '',
  { page = 1, replace = false, excludeQuickwins = true, includeTrophiesOnly = false } = {},
) {
  writeAppPath(buildSimpleSearchPath(query, page, excludeQuickwins, includeTrophiesOnly), { replace });
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

export function buildAdvancedSearchPath(
  filters = {},
  page = 1,
  excludeQuickwins = true,
  includeTrophiesOnly = false,
) {
  const params = new URLSearchParams();
  for (const key of ADVANCED_SEARCH_QUERY_KEYS) {
    const value = String(filters[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  applyExcludeQuickwinsParam(params, excludeQuickwins);
  applyIncludeTrophiesOnlyParam(params, includeTrophiesOnly);
  const safePage = Number.parseInt(String(page), 10);
  if (Number.isFinite(safePage) && safePage > 1) params.set('page', String(safePage));
  const qs = params.toString();
  return qs ? `/suche?${qs}` : '/suche';
}

export function navigateToAdvancedSearch(
  filters = {},
  { replace = false, page = 1, excludeQuickwins = true, includeTrophiesOnly = false } = {},
) {
  writeAppPath(
    buildAdvancedSearchPath(filters, page, excludeQuickwins, includeTrophiesOnly),
    { replace },
  );
}

/** Vorläufiger Pfad – Quickwins hat noch keinen sprachspezifischen Slug. */
export const QUICKWINS_PATH = '/quickwins';
/** Legacy-Einstieg; öffentliche Adresse ist /{locale}/unerreichbare-platins usw. */
export const SERVERTOT_PATH = '/servertot';
/** Legacy-Einstieg; öffentliche Adresse ist /{locale}/easy-platins usw. */
export const EASY_PLATINS_PATH = '/easy-platins';

export const QUICKWIN_SORTS = ['title-asc', 'title-desc', 'year-asc', 'year-desc'];

export const DEFAULT_QUICKWIN_SORT = 'title-asc';

export function parseQuickwinsParams(search = '') {
  const source = search || (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(source);
  const sort = params.get('sort');
  return {
    title: String(params.get('title') ?? '').trim(),
    publisher: String(params.get('publisher') ?? '').trim(),
    sort: QUICKWIN_SORTS.includes(sort) ? sort : DEFAULT_QUICKWIN_SORT,
    page: parseSearchPageParam(source),
  };
}

export function buildQuickwinsPath({
  title = '',
  publisher = '',
  sort = DEFAULT_QUICKWIN_SORT,
  page = 1,
  path = QUICKWINS_PATH,
} = {}) {
  const params = new URLSearchParams();
  const titleValue = String(title ?? '').trim();
  const publisherValue = String(publisher ?? '').trim();
  if (titleValue) params.set('title', titleValue);
  if (publisherValue) params.set('publisher', publisherValue);
  if (sort && sort !== DEFAULT_QUICKWIN_SORT) params.set('sort', sort);
  const safePage = Number.parseInt(String(page), 10);
  if (Number.isFinite(safePage) && safePage > 1) params.set('page', String(safePage));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function navigateToQuickwins(params = {}, { replace = false, path = QUICKWINS_PATH } = {}) {
  writeAppPath(buildQuickwinsPath({ ...params, path }), { replace });
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
  const normalized = normalizeLocale(nextLocale);
  const pretty = parsePrettyGamePath(window.location.pathname);
  if (pretty) {
    if (pretty.locale === normalized) return;
    writeAppPath(buildPrettyGamePath(normalized, pretty.hardware, pretty.slug), { replace: true });
    return;
  }
  if (parseServertotPath(window.location.pathname)) {
    const nextPath = `${servertotPublicPath(normalized)}${window.location.search}`;
    writeAppPath(nextPath, { replace: true });
    return;
  }
  if (parseEasyPlatinsPath(window.location.pathname)) {
    const nextPath = `${easyPlatinsPublicPath(normalized)}${window.location.search}`;
    writeAppPath(nextPath, { replace: true });
    return;
  }
  if (parseQuickwinsPath(window.location.pathname)) {
    const nextPath = `${quickwinsPublicPath(normalized)}${window.location.search}`;
    writeAppPath(nextPath, { replace: true });
  }
}

export { parsePrettyGamePath };
