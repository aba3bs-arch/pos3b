import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { productoParaGuardar, productoVacio } from '../src/lib/productoForm.js';

function loadEnv() {
  const raw = readFileSync('.env', 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const testId = `TEST_COL_${Date.now()}`;
const payload = productoParaGuardar({ ...productoVacio(), id: testId, nombre: 'Test columnas DELETE ME' });

console.log('Payload keys:', Object.keys(payload).join(', '));
const { data, error } = await sb.from('productos').upsert([payload]).select('id').single();
if (error) {
  console.log('UPSERT ERROR:', error.code, error.message);
  console.log('Details:', error.details, error.hint);
} else {
  console.log('UPSERT OK:', data?.id);
  await sb.from('productos').delete().eq('id', testId);
}
