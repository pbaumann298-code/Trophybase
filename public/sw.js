/* TrophyBase service worker
 * JS/CSS → Network First (Offline-Fallback aus dem Cache)
 * Bilder → Cache First
 * Navigation → Netzwerk, nie ein gecachtes HTML-Dokument; offline nur /offline.html
 * Supabase / API → Network Only
 */
const CACHE_VERSION = 'tb-static-v12';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-16.png',
  '/icons/tb-apple-touch-icon.png',
  '/icons/tb-icon-192.png',
  '/icons/tb-icon-512.png',
  '/icons/tb-icon-maskable-192.png',
  '/icons/tb-icon-maskable-512.png',
  '/images/quickwins-tile.jpg',
  '/images/easy-platins-tile.jpg',
  '/images/unobtainable-platins-tile.jpg',
  '/images/fallback-cover.jpeg',
];

const CODE_EXTENSIONS = ['.js', '.css'];
const IMAGE_EXTENSIONS = ['.svg', '.png', '.ico', '.webp', '.jpg', '.jpeg', '.woff', '.woff2'];

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

function endsWithExt(pathname, extensions) {
  return extensions.some((ext) => pathname.endsWith(ext));
}

function isCodeAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return endsWithExt(url.pathname, CODE_EXTENSIONS);
}

function isImageAsset(url) {
  if (url.origin === self.location.origin) {
    return endsWithExt(url.pathname, IMAGE_EXTENSIONS);
  }
  if (url.hostname === 'cdn.tailwindcss.com') {
    return endsWithExt(url.pathname, IMAGE_EXTENSIONS) || url.pathname.includes('tailwind');
  }
  return false;
}

async function putCache(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  } catch {
    /* Speicher voll oder nicht cachebar */
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putCache(request, response);
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response) {
      await putCache(request, response);
      return response;
    }
  } catch {
    /* offline */
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  return new Response('', { status: 504, statusText: 'Offline' });
}

async function networkOnly(request) {
  return fetch(request, { cache: 'no-store' });
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response) return response;
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
  if (url.pathname === '/sw.js' || url.pathname === '/version.json' || url.pathname === '/registerSW.js') {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isDatabaseRequest(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (isCodeAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImageAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
