import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const AUTH_STORAGE_KEY = 'tb-auth-token';

/**
 * Migriert einmalig ein evtl. noch unter dem alten Standard-Key (`sb-*-auth-token`)
 * gespeichertes Supabase-Session-Token nach `tb-auth-token`, damit bestehende Logins
 * beim Wechsel des `storageKey` erhalten bleiben.
 */
function migrateLegacyAuthToken() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (existing) return;

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const legacyValue = window.localStorage.getItem(key);
        if (legacyValue) {
          window.localStorage.setItem(AUTH_STORAGE_KEY, legacyValue);
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
    },
  });

  if (typeof globalThis !== 'undefined') {
    globalThis[SINGLETON_KEY] = client;
  }

  return client;
}

export const supabase = getOrCreateSupabaseClient();
export default supabase;
