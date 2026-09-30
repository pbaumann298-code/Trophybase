import { createClient } from '@supabase/supabase-js';

export const SITE_ORIGIN = 'https://trophybase.app';

export function getPublicSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase-URL oder Anon-Key fehlt (Vercel-Env bzw. .env.local).');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicOrigin(requestUrl) {
  try {
    const host = requestUrl.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return requestUrl.origin;
    }
  } catch {
    /* ignore */
  }
  return SITE_ORIGIN;
}
