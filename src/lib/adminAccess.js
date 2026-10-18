import { ALLOWED_ADMINS, normalizeEmail } from './maintenanceAccess';
import { isStandaloneApp } from './reloadHistory';

export const ADMIN_RETURN_STORAGE_KEY = 'tb_admin_return';
export const ADMIN_TAB_STORAGE_KEY = 'tb_admin_tab';
export const INTRANET_GAME_SEARCH_STORAGE_KEY = 'tb_intranet_game_search';

/** Öffentliche SPA darf /intranet und /admin nicht als Startseite rendern. */
const STAFF_HTML_BY_PATH = {
  '/intranet': '/intranet.html',
  '/admin': '/admin.html',
};

export const AUTH_SESSION_TIMEOUT_MS = 8000;

function pathWithoutTrailingSlash(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!path || path === '/') return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

export function staffAppHtmlForPath(pathname) {
  return STAFF_HTML_BY_PATH[pathWithoutTrailingSlash(pathname)] ?? null;
}

export async function getSessionOrTimeout(client, timeoutMs = AUTH_SESSION_TIMEOUT_MS) {
  const timeout = new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ data: { session: null }, timedOut: true });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([client.auth.getSession(), timeout]);
    if (result?.timedOut) return { data: { session: null }, timedOut: true };
    return { data: { session: result?.data?.session ?? null }, timedOut: false };
  } catch {
    return { data: { session: null }, timedOut: false };
  }
}

/** Admin hat die Website geöffnet und kann zurück zum Panel. */
export function setAdminReturnFlag(active = true) {
  try {
    if (active) {
      sessionStorage.setItem(ADMIN_RETURN_STORAGE_KEY, '1');
    } else {
      sessionStorage.removeItem(ADMIN_RETURN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function hasAdminReturnFlag() {
  try {
    return sessionStorage.getItem(ADMIN_RETURN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function readAdminTab(fallback = 'database') {
  try {
    const tab = localStorage.getItem(ADMIN_TAB_STORAGE_KEY);
    return tab || fallback;
  } catch {
    return fallback;
  }
}

export function writeAdminTab(tab) {
  try {
    if (tab) localStorage.setItem(ADMIN_TAB_STORAGE_KEY, tab);
    else localStorage.removeItem(ADMIN_TAB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readIntranetGameSearchState() {
  try {
    const raw = localStorage.getItem(INTRANET_GAME_SEARCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : null,
      hasSearched: Boolean(parsed.hasSearched),
    };
  } catch {
    return null;
  }
}

export function writeIntranetGameSearchState({ filters, hasSearched }) {
  try {
    if (!hasSearched) {
      localStorage.removeItem(INTRANET_GAME_SEARCH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      INTRANET_GAME_SEARCH_STORAGE_KEY,
      JSON.stringify({ filters, hasSearched: true }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Spielvorschau aus Admin/Intranet: Return-Flag setzen.
 * In der installierten App im selben Fenster bleiben, damit Zurück/Admin
 * wieder zur Suche führen statt die PWA zu verlassen.
 */
export function handleStaffGamePreviewClick(event, href) {
  if (!href) return;
  setAdminReturnFlag(true);
  if (isStandaloneApp()) {
    event.preventDefault();
    window.location.assign(href);
  }
}

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ALLOWED_ADMINS.includes(normalizeEmail(user.email));
}

export { ALLOWED_ADMINS };
