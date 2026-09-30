import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // VITE_-Variablen werden beim Build fest ins Bundle eingesetzt. Fehlen sie
  // dort, hilft kein Neustart – sie muessen vor dem Build gesetzt sein.
  throw new Error(
    'Supabase-Konfiguration fehlt: VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY sind nicht gesetzt. ' +
      'Lokal: .env.example nach .env.local kopieren. ' +
      'Beim Hosting (Vercel): als Environment Variables hinterlegen und neu deployen.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
