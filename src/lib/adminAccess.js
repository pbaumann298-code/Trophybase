import { ALLOWED_ADMINS, normalizeEmail } from './maintenanceAccess';

export const ADMIN_RETURN_STORAGE_KEY = 'tb_admin_return';

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

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ALLOWED_ADMINS.includes(normalizeEmail(user.email));
}

export { ALLOWED_ADMINS };
