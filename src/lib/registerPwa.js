/** Persistent Storage anfragen und Service Worker nur im Production-Build registrieren. */

export function registerPwa() {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return;

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {
      /* Browser lehnt persist() ab oder API unvollständig */
    });
  }

  if (!('serviceWorker' in navigator)) return;

  // Der allererste Claim (Seite hatte noch keinen Controller) darf nicht neu laden.
  // Jeder spätere Wechsel ist ein neues Bundle und lädt einmalig neu.
  let ignoreNextClaim = !navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ignoreNextClaim) {
      ignoreNextClaim = false;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const requestUpdate = () => {
    navigator.serviceWorker.getRegistration('/').then((registration) => {
      registration?.update().catch(() => {});
    }).catch(() => {});
  };

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
      requestUpdate();
    }).catch((err) => {
      console.warn('Service Worker:', err.message);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdate();
  });
}
