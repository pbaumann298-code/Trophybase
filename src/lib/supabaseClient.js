import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, sharedAuthStorage } from './authStorage.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export { AUTH_STORAGE_KEY };

/**
 * Migriert einmalig ein evtl. noch unter dem alten Standard-Key (`sb-*-auth-token`)
 * gespeichertes Supabase-Session-Token nach `tb-auth-token` (inkl. `.trophybase.app` Cookie-Sync),
 * damit bestehende Logins automatisch auf allen Subdomain-WebAPKs bereitstehen.
 */
function migrateLegacyAuthToken() {
  if (typeof window === 'undefined') return;
  try {
    const existing = sharedAuthStorage.getItem(AUTH_STORAGE_KEY);
    if (existing) return;
    if (!window.localStorage) return;

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const legacyValue = window.localStorage.getItem(key);
        if (legacyValue) {
          sharedAuthStorage.setItem(AUTH_STORAGE_KEY, legacyValue);
          break;
        }
      }
    }
  } catch {
    // localStorage im Private-Mode / SSR evtl. eingeschränkt – ignorieren
  }
}

migrateLegacyAuthToken();

const SINGLETON_KEY = '__tbSupabaseClientSingleton';

function getOrCreateSupabaseClient() {
  if (typeof globalThis !== 'undefined' && globalThis[SINGLETON_KEY]) {
    return globalThis[SINGLETON_KEY];
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
      storage: sharedAuthStorage,
    },
  });

  if (typeof globalThis !== 'undefined') {
    globalThis[SINGLETON_KEY] = client;
  }

  return client;
}

export const supabase = getOrCreateSupabaseClient();
export default supabase;
