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

const ROLES = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Administrador'];
const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

for (const rol of ROLES) {
  const pin = String(990000 + ROLES.indexOf(rol));
  const { data, error } = await sb
    .from('usuarios')
    .insert([{ nombre: `Test ${rol}`, pin, rol, sucursal_id: 'MAIN' }])
    .select('id');
  if (error) console.log(`FAIL ${rol}:`, error.message);
  else {
    console.log(`OK   ${rol}`);
    if (data?.[0]?.id) await sb.from('usuarios').delete().eq('id', data[0].id);
  }
}
