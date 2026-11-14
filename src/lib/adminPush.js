/**
 * TrophyBase Admin Web Push (VAPID / RFC 8291).
 * Öffentlicher VAPID-Schlüssel (P-256 uncompressed base64url) – Gegenstück liegt verschlüsselt im Supabase Vault.
 */
export const ADMIN_VAPID_PUBLIC_KEY =
  'BBqMpRYu8Mn0l4YHDIhXbXDGxvQwYWxAbgt2RTXbrqWMD9e5Vv_zqX5HiEmVJ6lfIGBv0mNK_NvWzLVLyK8bNqs';

export function isWebPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Stellt sicher, dass `/sw.js` aktiv registriert ist – auch wenn React erst nach `window.load` mountet.
 */
export async function ensureAdminServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service Worker wird von diesem Browser nicht unterstützt.');
  }

  let registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } else {
    registration.update().catch(() => {});
  }

  if (registration.active) {
    return registration;
  }

  const readyOrTimeout = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Service Worker Start-Timeout.')), 6000);
    }),
  ]);
  return readyOrTimeout;
}

export function detectPushDeviceLabel(appTitle = 'Admin') {
  if (typeof navigator === 'undefined') return appTitle;
  const ua = navigator.userAgent || '';
  let platform = 'Browser';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X/i.test(ua)) platform = 'Mac';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  const standalone =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)')?.matches;

  const suffix = standalone ? `${appTitle} (App)` : appTitle;
  return `${platform} · ${suffix}`.slice(0, 80);
}

/**
 * Liest Browser-Push-Status + alle in Supabase hinterlegten Admin-Geräte.
 */
export async function fetchAdminPushState(supabase) {
  if (!isWebPushSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      localEndpoint: null,
      isSubscribedHere: false,
      devices: [],
      error: null,
    };
  }

  const permission = Notification.permission;
  let localEndpoint = null;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (registration) {
      const sub = await registration.pushManager.getSubscription();
      localEndpoint = sub?.endpoint || null;
    }
  } catch {
    /* ignore local read error */
  }

  const { data, error } = await supabase
    .from('admin_push_subscriptions')
    .select('id, endpoint, device_label, topics, is_active, last_sent_at, last_error, updated_at')
    .order('updated_at', { ascending: false });

  const devices = data ?? [];
  const matchingDbRow = localEndpoint
    ? devices.find((d) => d.endpoint === localEndpoint && d.is_active)
    : null;

  return {
    supported: true,
    permission,
    localEndpoint,
    isSubscribedHere: Boolean(localEndpoint && matchingDbRow),
    devices,
    error: error?.message || null,
  };
}

/**
 * Aktiviert Web Push für dieses Gerät und speichert das Abo in `public.admin_push_subscriptions`.
 */
export async function subscribeAdminPush(supabase, sessionUser, appTitle = 'TB Reports') {
  if (!isWebPushSupported()) {
    throw new Error('Web Push wird in diesem Browser nicht unterstützt.');
  }
  if (!sessionUser?.id) {
    throw new Error('Keine aktive Admin-Session gefunden.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Benachrichtigungen wurden im Browser blockiert. Bitte in den App-/Website-Einstellungen freigeben.');
  }

  const registration = await ensureAdminServiceWorker();
  const applicationServerKey = urlBase64ToUint8Array(ADMIN_VAPID_PUBLIC_KEY);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (err) {
      // Falls ein altes Abo mit anderem Key hing, einmal bereinigen und neu abonnieren
      const stale = await registration.pushManager.getSubscription().catch(() => null);
      if (stale) {
        await stale.unsubscribe().catch(() => {});
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } else {
        throw err;
      }
    }
  }

  const subJson = subscription.toJSON();
  const endpoint = subJson?.endpoint || subscription.endpoint;
  const p256dh = subJson?.keys?.p256dh || '';
  const auth = subJson?.keys?.auth || '';

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Push-Schlüssel konnten vom Browser nicht erzeugt werden.');
  }

  const { error } = await supabase
    .from('admin_push_subscriptions')
    .upsert(
      {
        user_id: sessionUser.id,
        endpoint,
        p256dh,
        auth,
        device_label: detectPushDeviceLabel(appTitle),
        user_agent: (navigator.userAgent || '').slice(0, 250),
        topics: ['community_reports'],
        is_active: true,
        last_error: null,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    throw new Error(error.message);
  }

  return endpoint;
}

/**
 * Deaktiviert Web Push auf diesem Gerät (Browser + Supabase).
 */
export async function unsubscribeAdminPush(supabase) {
  if (!isWebPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint || null;

  if (endpoint) {
    await supabase.from('admin_push_subscriptions').delete().eq('endpoint', endpoint);
  }
  if (subscription) {
    await subscription.unsubscribe().catch(() => {});
  }
}

/**
 * Entfernt ein einzelnes hinterlegtes Gerät aus der Admin-Push-Tabelle.
 */
export async function deleteAdminPushDevice(supabase, id, currentEndpoint = null, rowEndpoint = null) {
  const { error } = await supabase.from('admin_push_subscriptions').delete().eq('id', id);
  if (error) throw new Error(error.message);

  if (currentEndpoint && rowEndpoint && currentEndpoint === rowEndpoint) {
    const registration = await navigator.serviceWorker.getRegistration('/').catch(() => null);
    const sub = await registration?.pushManager.getSubscription().catch(() => null);
    if (sub) await sub.unsubscribe().catch(() => {});
  }
}

/**
 * Löst über die Supabase Edge Function `admin-push-dispatch` sofort einen echten Test-Push aus.
 */
export async function triggerAdminTestPush(supabase, endpoint = null) {
  const { data, error } = await supabase.functions.invoke('admin-push-dispatch', {
    body: {
      action: 'test',
      endpoint: endpoint || undefined,
    },
  });

  if (error) {
    throw new Error(error.message || 'Test-Push fehlgeschlagen.');
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}
