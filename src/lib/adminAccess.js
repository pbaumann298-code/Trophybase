import { ALLOWED_ADMINS, normalizeEmail } from './maintenanceAccess.js';
import { adminOverlaysHidden } from './adminOverlayPreference.js';
import { AUTH_STORAGE_KEY, sharedAuthStorage } from './authStorage.js';

export const ADMIN_RETURN_STORAGE_KEY = 'tb_admin_return';
export const ADMIN_ORIGIN_STORAGE_KEY = 'tb_admin_origin';
export const ADMIN_TAB_STORAGE_KEY = 'tb_admin_tab';
export const INTRANET_GAME_SEARCH_STORAGE_KEY = 'tb_intranet_game_search';
export const DRAFT_RETURN_STORAGE_KEY = 'tb_draft_return_context';
export const LAB_MODE_STORAGE_KEY = 'tb_lab_mode';
export const STAFF_DEVICE_STORAGE_KEY = 'tb_device_is_staff';
export const POST_LOGIN_ENTRY_KEY = 'tb_post_login_entry';
const POST_LOGIN_MAX_AGE_MS = 30 * 60 * 1000;

export function savePostLoginEntry(entry) {
  if (typeof window === 'undefined' || !entry) return;
  try {
    window.localStorage.setItem(
      POST_LOGIN_ENTRY_KEY,
      JSON.stringify({ entry: String(entry), savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function consumePostLoginEntry() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(POST_LOGIN_ENTRY_KEY);
    if (!raw) return '';
    window.localStorage.removeItem(POST_LOGIN_ENTRY_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.entry) return '';
    if (parsed.savedAt && Date.now() - Number(parsed.savedAt) > POST_LOGIN_MAX_AGE_MS) {
      return '';
    }
    return String(parsed.entry);
  } catch {
    return '';
  }
}

export const ADMIN_SUBDOMAIN_PREFIXES = new Set([
  'apps',
  'bugs',
  'drafts',
  'workflows',
  'radar',
  'krankenstation',
  'reports',
  'db',
  'creators',
  'admin',
  'intranet',
]);

export function isAdminSubdomainHost(hostname = '') {
  const host = String(
    hostname || (typeof window !== 'undefined' ? window.location.hostname : ''),
  ).toLowerCase();
  if (!host.endsWith('.trophybase.app')) return false;
  const prefix = host.slice(0, -'.trophybase.app'.length);
  return ADMIN_SUBDOMAIN_PREFIXES.has(prefix);
}

function isAdminLocationContext() {
  if (typeof window === 'undefined') return false;
  if (isAdminSubdomainHost(window.location.hostname)) return true;
  const path = String(window.location.pathname || '').toLowerCase();
  return path.includes('/admin') || path.includes('/intranet');
}

function markDeviceAsStaff() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STAFF_DEVICE_STORAGE_KEY, '1');
    }
  } catch {
    /* ignore */
  }
}

/** Öffentliche SPA darf /intranet, /admin und Admin-Subdomains nicht als Startseite rendern. */
const STAFF_HTML_BY_PATH = {
  '/intranet': '/intranet.html',
  '/admin': '/admin.html',
};

const STAFF_HTML_BY_HOST = {
  'apps.trophybase.app': '/admin-apps/index.html',
  'bugs.trophybase.app': '/admin-apps/roadmap/index.html',
  'drafts.trophybase.app': '/admin-apps/drafts/index.html',
  'workflows.trophybase.app': '/admin-apps/workflows/index.html',
  'radar.trophybase.app': '/admin-apps/radar/index.html',
  'krankenstation.trophybase.app': '/admin-apps/krankenstation/index.html',
  'reports.trophybase.app': '/admin-apps/reports/index.html',
  'db.trophybase.app': '/admin-apps/db/index.html',
  'creators.trophybase.app': '/admin-apps/creators/index.html',
  'admin.trophybase.app': '/admin.html',
  'intranet.trophybase.app': '/intranet.html',
};

export const AUTH_SESSION_TIMEOUT_MS = 3000;

/**
 * Liest synchron den gecachten Supabase-User aus dem gemeinsamen `.trophybase.app`-Cookie
 * oder `localStorage` (`tb-auth-token` / `sb-*-auth-token`), falls `supabase.auth.getSession()`
 * durch einen internen Lock verzögert wird.
 */
export function readCachedSessionUser() {
  if (typeof window === 'undefined') return null;
  try {
    const rawPrimary = sharedAuthStorage.getItem(AUTH_STORAGE_KEY);
    const candidates = [rawPrimary];
    if (window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          candidates.push(window.localStorage.getItem(k));
        }
      }
    }
    for (const raw of candidates) {
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const user = parsed?.user || parsed?.currentSession?.user || parsed?.session?.user || null;
      if (user && typeof user === 'object' && (user.id || user.email)) {
        return user;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function pathWithoutTrailingSlash(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!path || path === '/') return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

export function staffAppHtmlForPath(pathname, hostname) {
  const host = String(
    hostname || (typeof window !== 'undefined' ? window.location.hostname : ''),
  ).toLowerCase();
  const hostHtml = STAFF_HTML_BY_HOST[host];
  if (hostHtml) {
    const rawPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
    if (rawPath !== hostHtml) return hostHtml;
  }
  return STAFF_HTML_BY_PATH[pathWithoutTrailingSlash(pathname)] ?? null;
}

export async function getSessionOrTimeout(client, timeoutMs = AUTH_SESSION_TIMEOUT_MS) {
  let timerId = null;
  const timeout = new Promise((resolve) => {
    timerId = window.setTimeout(() => {
      resolve({ data: { session: null }, timedOut: true });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([client.auth.getSession(), timeout]);
    if (timerId) window.clearTimeout(timerId);
    if (result?.timedOut) {
      const cachedUser = readCachedSessionUser();
      return {
        data: { session: cachedUser ? { user: cachedUser } : null },
        timedOut: true,
      };
    }
    const session = result?.data?.session ?? null;
    if (!session) {
      const cachedUser = readCachedSessionUser();
      if (cachedUser) {
        return { data: { session: { user: cachedUser } }, timedOut: false };
      }
    }
    return { data: { session }, timedOut: false };
  } catch {
    if (timerId) window.clearTimeout(timerId);
    const cachedUser = readCachedSessionUser();
    return {
      data: { session: cachedUser ? { user: cachedUser } : null },
      timedOut: false,
    };
  }
}

/** Admin hat die Website geöffnet und kann zurück zum Panel. */
export function setAdminReturnFlag(active = true, originPath = null) {
  try {
    if (active) {
      sessionStorage.setItem(ADMIN_RETURN_STORAGE_KEY, '1');
      let resolvedOrigin = originPath;
      if (!resolvedOrigin && typeof window !== 'undefined') {
        const pathname = String(window.location.pathname || '');
        const lower = pathname.toLowerCase();
        if (isAdminSubdomainHost(window.location.hostname)) {
          resolvedOrigin = `${window.location.origin}${pathname || '/'}`;
        } else if (lower.startsWith('/admin-apps/')) {
          resolvedOrigin = pathname;
        } else if (lower.includes('intranet')) {
          resolvedOrigin = '/intranet.html';
        } else if (lower.includes('admin')) {
          resolvedOrigin = '/admin.html';
        }
      }
      if (!resolvedOrigin) {
        resolvedOrigin = localStorage.getItem(ADMIN_ORIGIN_STORAGE_KEY) || '/intranet.html';
      }
      localStorage.setItem(ADMIN_ORIGIN_STORAGE_KEY, resolvedOrigin);
    } else {
      sessionStorage.removeItem(ADMIN_RETURN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getAdminReturnUrl(fallback = '/intranet.html') {
  try {
    return localStorage.getItem(ADMIN_ORIGIN_STORAGE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function isStaffOrPreviewContext() {
  if (typeof window === 'undefined') return false;
  if (adminOverlaysHidden() && !isAdminLocationContext()) {
    return false;
  }
  if (isAdminLocationContext()) {
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('preview') === '0' ||
      params.get('lab') === '0' ||
      params.get('guest') === '1'
    ) {
      return false;
    }
    if (
      params.get('preview') === '1' ||
      params.get('rohmaterial') === '1' ||
      params.get('lab') === '1'
    ) {
      return true;
    }
    if (sessionStorage.getItem(ADMIN_RETURN_STORAGE_KEY) === '1') {
      return true;
    }
    return sessionStorage.getItem(LAB_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function hasAdminReturnFlag() {
  if (!isStaffOrPreviewContext()) return false;
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
    let defaultStaffPath = '/intranet.html#entwuerfe';
    if (typeof window !== 'undefined') {
      if (isAdminSubdomainHost(window.location.hostname)) {
        defaultStaffPath = window.location.href;
      } else if (window.location.pathname.includes('admin')) {
        defaultStaffPath = '/admin.html';
      }
    }
    const payload = {
      gameId: String(ctx.gameId),
      creatorName: String(ctx.creatorName ?? ''),
      title: String(ctx.title ?? ''),
      filterQuery: String(ctx.filterQuery ?? ''),
      activeDataSource: ctx.activeDataSource === 'rohmaterial' ? 'rohmaterial' : 'staging',
      staffPath: String(ctx.staffPath || defaultStaffPath),
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

export function resolvePublicSiteUrl(href = '/') {
  if (!href) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (typeof window !== 'undefined' && isAdminSubdomainHost(window.location.hostname)) {
    const normalized = href.startsWith('/') ? href : `/${href}`;
    return `https://trophybase.app${normalized}`;
  }
  return href;
}

/**
 * Spielvorschau aus Admin/Intranet: Admin-Tab offen lassen (Suche bleibt),
 * Return-Flag setzen. Nur wenn kein neues Fenster geht → gleiche Seite.
 * Auf Subdomain-WebAPKs wird ein relativer Pfad automatisch auf `https://trophybase.app` aufgelöst.
 */
export function handleStaffGamePreviewClick(event, href) {
  if (!href) return;
  event.preventDefault();
  setAdminReturnFlag(true);
  const resolvedHref = resolvePublicSiteUrl(href);
  const opened = window.open(resolvedHref, '_blank');
  if (!opened) {
    window.location.assign(resolvedHref);
  }
}

/** Gast-Simulation gilt nur auf der öffentlichen Seite, nie im Intranet oder Admin. */
function guestSimulationBlocksAdmin() {
  if (!adminOverlaysHidden()) return false;
  if (typeof window === 'undefined') return false;
  if (isAdminLocationContext()) return false;
  return true;
}

export function isAdminUser(user, { allowPublic = false, ignoreGuestSimulation = false } = {}) {
  if (!ignoreGuestSimulation && guestSimulationBlocksAdmin()) return false;
  if (!user?.email) return false;
  if (!allowPublic && !isStaffOrPreviewContext()) return false;
  const isAdm = ALLOWED_ADMINS.includes(normalizeEmail(user.email));
  if (isAdm) {
    markDeviceAsStaff();
  }
  return isAdm;
}

export function isStaffDeviceOrSession(user = null) {
  if (typeof window !== 'undefined' && adminOverlaysHidden() && !isAdminLocationContext()) {
    return false;
  }
  const effectiveUser = user || readCachedSessionUser();
  if (isAdminUser(effectiveUser, { allowPublic: true })) return true;
  if (isStaffOrPreviewContext()) return true;
  if (hasAdminReturnFlag()) return true;
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage &&
      window.localStorage.getItem(STAFF_DEVICE_STORAGE_KEY) === '1'
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function setLabModeFlag(active = true) {
  try {
    sessionStorage.setItem(LAB_MODE_STORAGE_KEY, active ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * V2-Sandbox-Gate: für den eingeloggten Admin standardmäßig aktiv
 * (außer explizit ?lab=0 oder sessionStorage === '0').
 * Normale Besucher (!isAdminUser) sehen weiterhin zu 100 % die eingefrorene V1-UI.
 */
export function isLabModeActive(sessionUser) {
  if (adminOverlaysHidden()) return false;
  if (!isAdminUser(sessionUser, { allowPublic: true })) return false;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const labParam = params.get('lab');
    if (labParam === '0') {
      setLabModeFlag(false);
      return false;
    }
    if (labParam === '1') {
      setLabModeFlag(true);
      return true;
    }
    return sessionStorage.getItem(LAB_MODE_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Prüft über die DB-RPC `tb_get_my_creator_profile`, ob der aktuell eingeloggte
 * Supabase-User einem aktiven Creator in `public.content_creators` zugeordnet ist.
 * Gibt `{ id, channel_name, youtube_url, auto_approve }` oder `null` zurück.
 */
export async function fetchMyCreatorProfile(client, timeoutMs = 2500) {
  if (!client) return null;
  let timerId = null;
  const timeout = new Promise((resolve) => {
    timerId = window.setTimeout(() => resolve({ data: null, error: new Error('timeout') }), timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([
      client.rpc('tb_get_my_creator_profile'),
      timeout,
    ]);
    if (timerId) window.clearTimeout(timerId);
    if (error || !data || typeof data !== 'object' || !data.id) {
      return null;
    }
    return {
      id: data.id,
      slug: String(data.slug ?? '').trim(),
      channel_name: String(data.channel_name ?? '').trim(),
      youtube_url: String(data.youtube_url ?? '').trim(),
      auto_approve: Boolean(data.auto_approve),
      user_id: data.user_id ?? null,
    };
  } catch {
    if (timerId) window.clearTimeout(timerId);
    return null;
  }
}

export { ALLOWED_ADMINS };
