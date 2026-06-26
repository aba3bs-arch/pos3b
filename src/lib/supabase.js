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

/** Cliente Supabase; se inicializa en main.jsx tras cargar pos3b-config.js */
export let supabase = null;
export let supabaseConfigured = false;

export function initSupabaseClient() {
  const { url, key } = leerCredencialesSupabase();
  supabaseConfigured = Boolean(url && key);
  supabase = supabaseConfigured ? createClient(url, key) : null;
  return supabase;
}
