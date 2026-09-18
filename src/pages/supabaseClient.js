import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen ' +
      '(.env.example nach .env.local kopieren).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
