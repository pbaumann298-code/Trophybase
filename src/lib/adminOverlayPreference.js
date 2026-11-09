/** Öffentliche Seite: Admin-Buttons ausblenden, Layout wie für Besucher. */
export const ADMIN_OVERLAY_STORAGE_KEY = 'tb_hide_admin_overlays';

const listeners = new Set();

function readStored() {
  try {
    return localStorage.getItem(ADMIN_OVERLAY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let hidden = readStored();

function syncDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('tb-user-view', hidden);
}

syncDocument();

export function adminOverlaysHidden() {
  return hidden;
}

export function setAdminOverlaysHidden(next) {
  hidden = Boolean(next);
  try {
    localStorage.setItem(ADMIN_OVERLAY_STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    /* privater Modus */
  }
  syncDocument();
  listeners.forEach((listener) => listener(hidden));
}

export function subscribeAdminOverlays(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
