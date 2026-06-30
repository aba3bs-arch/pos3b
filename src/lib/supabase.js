import { createClient } from '@supabase/supabase-js';

function esPlaceholder(val) {
  const s = String(val || '').trim().toLowerCase();
  if (!s) return true;
  return s.includes('tu-proyecto') || s.includes('tu_anon') || s.includes('tu-clave') || s === 'tu_clave_anon';
}

function leerCredencialesSupabase() {
  const runtime =
    typeof window !== 'undefined' && window.__POS3B_CONFIG__
      ? window.__POS3B_CONFIG__
      : null;
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = (!esPlaceholder(envUrl) ? envUrl : null) || runtime?.url || '';
  const key = (!esPlaceholder(envKey) ? envKey : null) || runtime?.anonKey || '';
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
