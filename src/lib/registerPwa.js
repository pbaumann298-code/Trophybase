/** Persistent Storage anfragen und Service Worker nur im Production-Build registrieren. */

export function registerPwa() {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return;

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {
      /* Browser lehnt persist() ab oder API unvollständig */
    });
  }

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('Service Worker:', err.message);
    });
  });
}
