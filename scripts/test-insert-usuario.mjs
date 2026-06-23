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

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const tests = [
  {
    label: 'con turno_horario (como la app)',
    payload: {
      nombre: 'Test User DELETE ME',
      pin: '999991',
      rol: 'Cajero',
      sucursal_id: 'MAIN',
      turno_id: null,
      turno_horario: null,
    },
  },
  {
    label: 'sin turno_horario',
    payload: {
      nombre: 'Test User DELETE ME 2',
      pin: '999992',
      rol: 'Cajero',
      sucursal_id: 'MAIN',
      turno_id: null,
    },
  },
  {
    label: 'con turno_id sin turno_horario',
    payload: {
      nombre: 'Test User DELETE ME 3',
      pin: '999993',
      rol: 'Cajero',
      sucursal_id: 'MAIN',
      turno_id: 'diurno',
    },
  },
];

for (const t of tests) {
  const { data, error } = await sb.from('usuarios').insert([t.payload]).select('id');
  console.log(`\n--- ${t.label} ---`);
  if (error) {
    console.log('ERROR:', error.code, error.message);
  } else {
    console.log('OK id:', data?.[0]?.id);
    if (data?.[0]?.id) await sb.from('usuarios').delete().eq('id', data[0].id);
  }
}
