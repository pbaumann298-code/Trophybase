/* TrophyBase Service Worker: Pass-Through.
 * HTML, /api, Intranet, Admin und Supabase werden nie gecacht.
 * Übrige Requests überlässt der Worker dem Browser.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isSupabase(url) {
  return url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.net');
}

function mustStayNetworkOnly(url, request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  const path = url.pathname;
  if (path === '/intranet.html' || path === '/admin.html') return true;
  if (path === '/intranet' || path === '/admin' || path.startsWith('/intranet/') || path.startsWith('/admin/')) {
    return true;
  }
  if (path === '/api' || path.startsWith('/api/')) return true;
  if (path.endsWith('.html')) return true;
  if (isSupabase(url)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (!mustStayNetworkOnly(url, request)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }));
});
