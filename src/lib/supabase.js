import { createClient } from '@supabase/supabase-js';

function leerCredencialesSupabase() {
  const runtime =
    typeof window !== 'undefined' && window.__POS3B_CONFIG__
      ? window.__POS3B_CONFIG__
      : null;
  const url = import.meta.env.VITE_SUPABASE_URL || runtime?.url || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || runtime?.anonKey || '';
  return { url, key };
}

const { url, key } = leerCredencialesSupabase();

export const supabaseConfigured = Boolean(url && key);

export const supabase = supabaseConfigured ? createClient(url, key) : null;
