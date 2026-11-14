/* TrophyBase Service Worker: Reiner Pass-Through + Admin Web Push.
 * Wichtig: Niemals `fetch(request, { cache: 'no-store' })` auf `mode: 'navigate'` aufrufen,
 * da Chromium sonst `TypeError: Cannot construct a Request with a Request object that has mode 'navigate'`
 * wirft und jede Seitennavigation mit `ERR_FAILED` abbricht!
 * Ohne `event.respondWith()` übernimmt der Browser alle Netzwerk-Requests nativ.
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

self.addEventListener('fetch', () => {
  /* Bewusst kein event.respondWith(): Browser + Vercel-Header regeln alle Abrufe direkt. */
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
