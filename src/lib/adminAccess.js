import { ALLOWED_ADMINS, normalizeEmail } from './maintenanceAccess';

export const ADMIN_RETURN_STORAGE_KEY = 'tb_admin_return';
export const ADMIN_TAB_STORAGE_KEY = 'tb_admin_tab';
export const INTRANET_GAME_SEARCH_STORAGE_KEY = 'tb_intranet_game_search';
export const DRAFT_RETURN_STORAGE_KEY = 'tb_draft_return_context';

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

/**
 * Speichert den Entwurfs-Kontext, wenn der Admin aus der Vorabprüfung
 * zum aktuellen Live-Spiel wechselt, damit „Zurück zum Entwurf“ wieder
 * exakt bei demselben Spiel (und Filter) landet.
 */
export function setDraftReturnContext(ctx) {
  try {
    if (!ctx || !ctx.gameId) {
      sessionStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
      localStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
      return;
    }
    const payload = {
      gameId: String(ctx.gameId),
      creatorName: String(ctx.creatorName ?? ''),
      title: String(ctx.title ?? ''),
      filterQuery: String(ctx.filterQuery ?? ''),
      activeDataSource: ctx.activeDataSource === 'rohmaterial' ? 'rohmaterial' : 'staging',
      staffPath: String(
        ctx.staffPath ||
          (typeof window !== 'undefined' && window.location.pathname.includes('admin')
            ? '/admin.html'
            : '/intranet.html#entwuerfe'),
      ),
      reopenConflictModal: Boolean(ctx.reopenConflictModal),
      savedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload);
    sessionStorage.setItem(DRAFT_RETURN_STORAGE_KEY, serialized);
    localStorage.setItem(DRAFT_RETURN_STORAGE_KEY, serialized);
    setAdminReturnFlag(true);
  } catch {
    /* ignore */
  }
}

export function readDraftReturnContext() {
  try {
    const raw =
      sessionStorage.getItem(DRAFT_RETURN_STORAGE_KEY) ||
      localStorage.getItem(DRAFT_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.gameId) return null;
    if (parsed.savedAt && Date.now() - Number(parsed.savedAt) > 60 * 60 * 1000) {
      sessionStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
      localStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraftReturnContext() {
  try {
    sessionStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
    localStorage.removeItem(DRAFT_RETURN_STORAGE_KEY);
  } catch {
    /* ignore */
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

/** Bleibt im JS-Kontext der Admin-Seite erhalten (auch bei Tab-Remount). */
let intranetGameSearchMemory = null;

export function readIntranetGameSearchState() {
  if (intranetGameSearchMemory?.hasSearched) {
    return intranetGameSearchMemory;
  }
  try {
    const raw = localStorage.getItem(INTRANET_GAME_SEARCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.hasSearched) return null;
    const state = {
      filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : null,
      hasSearched: true,
      results: Array.isArray(parsed.results) ? parsed.results : [],
      count: Number(parsed.count) || 0,
    };
    intranetGameSearchMemory = state;
    return state;
  } catch {
    return null;
  }
}

export function writeIntranetGameSearchState({
  filters,
  hasSearched,
  results = [],
  count = 0,
}) {
  if (!hasSearched) {
    intranetGameSearchMemory = null;
    try {
      localStorage.removeItem(INTRANET_GAME_SEARCH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  const state = {
    filters,
    hasSearched: true,
    results: Array.isArray(results) ? results : [],
    count: Number(count) || 0,
  };
  intranetGameSearchMemory = state;

  try {
    localStorage.setItem(INTRANET_GAME_SEARCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota: Filter behalten, Trefferliste weglassen
    try {
      localStorage.setItem(
        INTRANET_GAME_SEARCH_STORAGE_KEY,
        JSON.stringify({ filters, hasSearched: true, results: [], count: state.count }),
      );
    } catch {
      /* ignore */
    }
  }
}

/**
 * Spielvorschau aus Admin/Intranet: Admin-Tab offen lassen (Suche bleibt),
 * Return-Flag setzen. Nur wenn kein neues Fenster geht → gleiche Seite.
 */
export function handleStaffGamePreviewClick(event, href) {
  if (!href) return;
  event.preventDefault();
  setAdminReturnFlag(true);
  const opened = window.open(href, '_blank');
  if (!opened) {
    window.location.assign(href);
  }
}

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ALLOWED_ADMINS.includes(normalizeEmail(user.email));
}

export { ALLOWED_ADMINS };
