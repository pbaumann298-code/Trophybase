/* TrophyBase Service Worker: Pass-Through + Admin Web Push.
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
  if (path === '/admin-apps' || path.startsWith('/admin-apps/')) return true;
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

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || '🚨 TrophyBase Admin';
  const targetUrl = payload.url || '/admin-apps/reports/';
  const topic = payload.topic || 'community_reports';
  const reportId = payload.reportId ?? null;

  const options = {
    body: payload.body || 'Neue Community-Meldung eingegangen.',
    icon: payload.icon || '/icons/apps/reports-192.png',
    badge: payload.badge || '/icons/apps/reports-192.png',
    tag: payload.tag || 'tb-admin-push',
    renotify: true,
    vibrate: [180, 90, 220],
    data: {
      url: targetUrl,
      topic,
      reportId,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            if (client.url.includes('/admin')) {
              client.postMessage({
                type: 'TB_PUSH_RECEIVED',
                topic,
                reportId,
              });
            }
          }
        })
        .catch(() => {}),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification?.data?.url || '/admin-apps/reports/';
  const targetUrl = new URL(rawTarget, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes('/admin-apps/reports')) {
            client.postMessage({
              type: 'TB_PUSH_RECEIVED',
              topic: event.notification?.data?.topic || 'community_reports',
            });
            if ('focus' in client) {
              return client.focus();
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      }),
  );
});
