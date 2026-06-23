import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const raw = readFileSync('.env', 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const sb = createClient(loadEnv().VITE_SUPABASE_URL, loadEnv().VITE_SUPABASE_ANON_KEY);
const cols = ['costo', 'precio_compra', 'categoria', 'sku', 'barcode', 'activo'];
for (const c of cols) {
  const r = await sb.from('productos').select(c).limit(1);
  console.log(c, r.error ? r.error.message : 'OK');
}
