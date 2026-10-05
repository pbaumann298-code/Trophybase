import { getViewFromPath, normalizePath } from './routeUtils.js';

/**
 * Nach einem echten Neuladen (Daumen nach unten) ist die History der installierten
 * App oft nur noch ein Eintrag. Zurück würde die App schließen. Darunter legen
 * wir die Startseite, damit der erste Zurück-Schritt in der App bleibt.
 */
export function shouldAnchorReload({
  navigationType,
  standalone,
  coarsePointer,
  historyLength,
  pathname,
  search,
}) {
  if (navigationType !== 'reload') return false;
  const path = normalizePath(pathname);
  if (!getViewFromPath(path, search || '')) return false;
  if (standalone) return true;
  if (coarsePointer && Number(historyLength) <= 1) return true;
  return false;
}

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

export function anchorReloadInApp() {
  if (typeof window === 'undefined') return;
  const nav = performance.getEntriesByType?.('navigation')?.[0];
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (
    !shouldAnchorReload({
      navigationType: nav?.type,
      standalone: isStandaloneApp(),
      coarsePointer,
      historyLength: window.history.length,
      pathname: window.location.pathname,
      search: window.location.search,
    })
  ) {
    return;
  }

  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.replaceState({ tbHome: true }, '', '/');
  window.history.pushState({}, '', href);
}
