const RELOAD_FLAG = 'tb_build_reload_for';
const THROTTLE_MS = 60_000;

let lastCheckAt = 0;
let checking = false;

function localBuildId() {
  return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';
}

async function dropServiceWorkerCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
}

async function checkBuildVersion() {
  if (checking) return;
  checking = true;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const serverBuildId = String(data?.buildId ?? '').trim();
    const appBuildId = localBuildId();
    if (!serverBuildId || !appBuildId || serverBuildId === appBuildId) {
      sessionStorage.removeItem(RELOAD_FLAG);
      return;
    }
    if (sessionStorage.getItem(RELOAD_FLAG) === serverBuildId) return;
    sessionStorage.setItem(RELOAD_FLAG, serverBuildId);
    await dropServiceWorkerCaches();
    window.location.reload();
  } catch {
    /* Netzwerkfehler: nicht neu laden, sonst entsteht eine Schleife. */
  } finally {
    checking = false;
  }
}

function checkBuildVersionThrottled() {
  const now = Date.now();
  if (now - lastCheckAt < THROTTLE_MS) return;
  lastCheckAt = now;
  checkBuildVersion();
}

/** Start sofort, danach höchstens einmal pro Minute wenn der Tab wieder sichtbar wird. */
export function startBuildWatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  lastCheckAt = Date.now();
  checkBuildVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkBuildVersionThrottled();
  });
}
