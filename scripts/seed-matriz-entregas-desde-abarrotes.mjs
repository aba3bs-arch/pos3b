/**
 * Rellena proveedor_entregas (3B2 / 3B5) desde gastos PROVEEDORES de corte Abarrotes.
 * Uso: node scripts/seed-matriz-entregas-desde-abarrotes.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const ALIAS = {
  'COCA COLA': 'Coca-Cola',
  COCACOLA: 'Coca-Cola',
  PEPSI: 'Pepsi',
  SABRITAS: 'Sabritas',
  BIMBO: 'bimbo',
  GAMEZA: 'Gamesa',
  GAMESA: 'Gamesa',
  'SNACKY PARTY': 'Snacky',
  SNACKY: 'Snacky',
  'BIG C FRUTS': 'Big',
  'BIG C FRUITS': 'Big',
  BIG: 'Big',
  TORTILLAS: 'tortillas',
  PANADERIA: 'PANADERIA',
  'PAN DULCE': 'PANADERIA',
  ABARROTES: 'Abarrotes',
  LALA: 'Lala',
  MONDELEZ: 'Mondelez',
  PEDIGREE: 'Pedigree',
  BARCEL: 'barcel',
  TOSTITOS: 'tostitos',
  PENAFIEL: 'peñafiel',
  KELLOGS: 'kelloggs',
  KELLOGGS: 'kelloggs',
};

function clave(n) {
  return String(n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nombreDesdeSub(sub) {
  const raw = String(sub || '').trim();
  if (!raw) return '';
  const k = clave(raw);
  if (!k || ['PAGO', 'MERCANCIA', 'OTROS', 'PROVEEDORES'].includes(k)) return '';
  return ALIAS[k] || raw.replace(/\s+/g, ' ').trim();
}

function diaMx(iso) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Hermosillo', weekday: 'short' }).format(new Date(iso));
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[w] || null;
}

async function fetchAll(sb, table, select, apply) {
  const out = [];
  let from = 0;
  const page = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + page - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const gastos = await fetchAll(
  sb,
  'cortes_contabilidad_gastos',
  'sucursal_id,categoria,subcategoria,created_at',
  (q) => q.eq('modulo', 'abarrotes').in('sucursal_id', ['3B2', '3B5']),
);

const pairs = new Map(); // key suc|nombre|dia
for (const g of gastos) {
  if (!String(g.categoria || '').toUpperCase().includes('PROVEEDOR')) continue;
  const nombre = nombreDesdeSub(g.subcategoria);
  if (!nombre) continue;
  const dia = diaMx(g.created_at);
  if (!dia) continue;
  const k = `${g.sucursal_id}|${clave(nombre)}|${dia}`;
  if (!pairs.has(k)) pairs.set(k, { sucursal: g.sucursal_id, nombre, dia });
}

console.log('celdas_a_registrar', pairs.size);

let proveedores = await fetchAll(sb, 'proveedores', 'id,nombre');
const byClave = new Map(proveedores.map((p) => [clave(p.nombre), p]));

let creados = 0;
let entregas = 0;
let ya = 0;
let errores = 0;

for (const row of pairs.values()) {
  let prov = byClave.get(clave(row.nombre));
  if (!prov) {
    const { data, error } = await sb
      .from('proveedores')
      .insert([{ nombre: row.nombre }])
      .select('id,nombre')
      .single();
    if (error) {
      console.error('crear_prov', row.nombre, error.message);
      errores += 1;
      continue;
    }
    prov = data;
    byClave.set(clave(prov.nombre), prov);
    creados += 1;
  }

  const { error } = await sb.from('proveedor_entregas').insert([
    { proveedor_id: prov.id, sucursal_id: row.sucursal, dia_semana: row.dia },
  ]);
  if (error) {
    if (error.code === '23505') {
      ya += 1;
      continue;
    }
    console.error('entrega', row, error.message);
    errores += 1;
    continue;
  }
  entregas += 1;
  console.log('OK', row.sucursal, 'dia', row.dia, '→', prov.nombre);
}

console.log(JSON.stringify({ creados, entregas, yaExistian: ya, errores, totalPares: pairs.size }, null, 2));
