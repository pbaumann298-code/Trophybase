/* TrophyBase service worker
 * Static assets → Cache First
 * Navigations → Network, fallback /offline.html
 * Supabase / API → Network Only (keine Trophäenstände im Cache)
 */
const CACHE_VERSION = 'tb-static-v2';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-16.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

const STATIC_EXTENSIONS = ['.js', '.css', '.svg', '.png', '.ico', '.webp', '.woff', '.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isDatabaseRequest(url) {
  const host = url.hostname;
  if (host.endsWith('.supabase.co') || host.endsWith('.supabase.net')) return true;
  if (url.pathname === '/api/geo-locale' || url.pathname.startsWith('/api/')) return true;
  return false;
}

function isStaticAsset(url) {
  if (url.origin === self.location.origin) {
    return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
  }
  if (hostIsCdn(url.hostname)) {
    return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)) || url.pathname.includes('tailwind');
  }
  return false;
}

function hostIsCdn(hostname) {
  return hostname === 'cdn.tailwindcss.com';
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, copy);
  }
  return response;
}

async function networkOnly(request) {
  return fetch(request);
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) return response;
  } catch {
    /* offline */
  }
  const offline = await caches.match(OFFLINE_URL);
  return (
    offline ||
    new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.pathname === '/sw.js') return;

  if (isDatabaseRequest(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      cacheFirst(request).catch(() => caches.match(OFFLINE_URL)),
    );
  }
});
