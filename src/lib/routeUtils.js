import { resolveViewForSession } from './trophyBaseAuth';

/** NPWR-IDs haben das Format NPWR12345_00 (legacy platform_game_id) */
export const NPWR_ID_PATTERN = /^NPWR\d+_\d+$/i;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Views die auch im Wartungsmodus ohne Bypass erreichbar sind (öffentliche Inhalte). */
export const PUBLIC_APP_VIEWS = new Set(['game_info', 'search-results']);

/** Views die eingeloggte Nutzer auch im Wartungsmodus sehen dürfen. */
export const AUTHENTICATED_APP_VIEWS = new Set(['home', 'profile']);

export function canRenderAppContent({ isMaintenanceMode, maintenanceBypass, sessionUser, currentView }) {
  if (!isMaintenanceMode) return true;
  if (maintenanceBypass) return true;
  if (PUBLIC_APP_VIEWS.has(currentView)) return true;
  if (sessionUser && AUTHENTICATED_APP_VIEWS.has(currentView)) return true;
  return false;
}

/** View aus URL-Pfad (Deep Links bei F5 / Direktaufruf). */
export function getViewFromPath(pathname = '') {
  const path = normalizePath(pathname);
  if (path === '/profile') return 'profile';
  if (path.startsWith('/admin/qa')) return 'qa_admin';
  if (path.startsWith('/guide/')) return 'game_info';
  if (path === '/beta' || path.startsWith('/beta/')) return 'beta';
  if (getGameIdFromPath(path)) return 'game_info';
  return null;
}

/** Kanonische Guide-URL: platform_game_id bevorzugt, sonst games.id (UUID) */
export function gameGuidePath(gameOrRef) {
  if (!gameOrRef) return '/';
  if (typeof gameOrRef === 'string') {
    const id = gameOrRef.trim();
    return id ? `/guide/${id}` : '/';
  }
  const slug =
    gameOrRef.platform_game_id ??
    gameOrRef.NPWR_ID ??
    gameOrRef.npwr_id ??
    gameOrRef.id ??
    gameOrRef.game_id;
  const id = String(slug ?? '').trim();
  return id ? `/guide/${id}` : '/';
}

function normalizePath(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!path || path === '/') return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

/**
 * Route segment from /guide/{id} — UUID or platform_game_id (e.g. NPWR…)
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
 * Session-View, aber Deep Links (/guide/…, /NPWR…) haben Vorrang vor home/login-Redirect.
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
  if (replace) {
    window.history.replaceState({}, '', target);
  } else {
    window.history.pushState({}, '', target);
  }
}

export function navigateToHome() {
  writeAppPath('/');
}

export function navigateToProfile() {
  writeAppPath('/profile');
}

export function navigateToGame(gameOrRef, { replace = false } = {}) {
  writeAppPath(gameGuidePath(gameOrRef), { replace });
}
