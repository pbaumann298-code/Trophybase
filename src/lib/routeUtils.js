import { resolveViewForSession } from './trophyBaseAuth';

/** View aus URL-Pfad (Deep Links bei F5 / Direktaufruf). */
export function getViewFromPath(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (path.startsWith('/admin/qa')) return 'qa_admin';
  if (path.startsWith('/guide/')) return 'game_info';
  if (path === '/beta' || path.startsWith('/beta/')) return 'beta';
  return null;
}

/** NPWR-ID aus /guide/{id} */
export function getGameIdFromPath(pathname = '') {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!path.startsWith('/guide/')) return null;
  const id = path.split('/')[2]?.trim();
  return id || null;
}

/**
 * Session-View, aber Deep Links (/guide/…) haben Vorrang vor home/login-Redirect.
 */
export function resolveAppViewForSession(user, pathname) {
  const pathView = getViewFromPath(pathname);
  if (pathView) return pathView;
  return resolveViewForSession(user);
}
