import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    let raw = readFileSync('.env', 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim().replace(/^\uFEFF/, '')] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const TABLAS = [
  { nombre: 'usuarios', select: 'id,nombre,pin,rol,sucursal_id,turno_id,turno_horario', modulo: 'Login / Usuarios' },
  {
    nombre: 'productos',
    select:
      'id,nombre,descripcion,foto_url,cat,clave_sat,impuesto,precio_compra_sin,precio_compra_con,ganancia_pct,precio_venta_sin,precio,stock,stock_minimo,en_venta,en_favoritos,created_at',
    modulo: 'Productos / Ventas',
  },
  { nombre: 'ventas', select: 'id,total,sucursal_id,created_at,turno_id,turno_nombre,usuario_id', modulo: 'Ventas / Consultas' },
  { nombre: 'logins', select: 'id,nombre,sucursal,created_at,turno_id,evento', modulo: 'Auditoría login' },
  { nombre: 'clientes', select: 'id,nombre', modulo: 'Clientes' },
  { nombre: 'proveedores', select: 'id,nombre', modulo: 'Proveedores / Compras' },
  { nombre: 'compras', select: 'id,total,items,items_pedido,estado', modulo: 'Compras' },
  { nombre: 'proveedor_producto', select: 'id,proveedor_id,producto_id', modulo: 'Proveedores ↔ Productos' },
  { nombre: 'asistencias', select: 'id,nombre,tipo,sucursal_id', modulo: 'Checador' },
  { nombre: 'cortes_caja', select: 'id,sucursal_id,fecha,turno_id,turno_nombre', modulo: 'Corte de caja' },
  { nombre: 'cancelaciones', select: 'id,sucursal_id,total', modulo: 'Cancelaciones caja' },
];

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key || url.includes('tu-proyecto')) {
  console.log('ERROR: Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function probarTabla(t) {
  const { data, error } = await supabase.from(t.nombre).select(t.select).limit(1);
  if (error) {
    const msg = error.message || String(error);
    let fix = '';
    if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
      fix = ' → Ejecuta supabase/migracion_completa.sql o supabase/fix_supabase_todas_columnas.sql';
    } else if (t.nombre === 'productos') {
      fix = ' → Ejecuta supabase/fix_productos_campos.sql o supabase/fix_supabase_todas_columnas.sql';
    } else if (t.nombre === 'compras' && msg.includes('items')) {
      fix = ' → Ejecuta supabase/fix_compras_items.sql';
    } else if (t.nombre === 'cancelaciones') {
      fix = ' → Ejecuta supabase/fix_cancelaciones.sql';
    } else if (t.nombre === 'cortes_caja' && !msg.includes('turno')) {
      fix = ' → Ejecuta supabase/fix_cortes_caja.sql';
    } else if (t.nombre === 'usuarios' && msg.includes('sucursal_id')) {
      fix = ' → Ejecuta supabase/fix_usuarios_sucursal.sql';
    } else if (t.nombre === 'usuarios' && (msg.includes('turno_id') || msg.includes('turno_horario'))) {
      fix = ' → Ejecuta supabase/fix_turnos_seguridad.sql o supabase/fix_supabase_todas_columnas.sql';
    } else if (t.nombre === 'ventas' && msg.includes('turno')) {
      fix = ' → Ejecuta supabase/fix_turnos_seguridad.sql';
    } else if (t.nombre === 'logins' && (msg.includes('created_at') || msg.includes('turno'))) {
      fix = ' → Ejecuta supabase/migracion_completa.sql o supabase/fix_supabase_todas_columnas.sql';
    } else if (t.nombre === 'ventas' && msg.includes('created_at')) {
      fix = ' → Ejecuta supabase/fix_ventas_created_at.sql';
    }
    return { ok: false, filas: 0, error: msg, fix };
  }
  return { ok: true, filas: data?.length ?? 0, error: null, fix: '' };
}

console.log('Verificando tablas Supabase...\n');
let ok = 0;
let fail = 0;

for (const t of TABLAS) {
  const r = await probarTabla(t);
  if (r.ok) {
    ok += 1;
    console.log(`OK   ${t.nombre.padEnd(20)} [${t.modulo}] — lectura OK (${r.filas} fila muestra)`);
  } else {
    fail += 1;
    console.log(`FAIL ${t.nombre.padEnd(20)} [${t.modulo}]`);
    console.log(`     ${r.error}${r.fix}`);
  }
}

console.log(`\nResumen: ${ok} OK, ${fail} con error de ${TABLAS.length} tablas`);
process.exit(fail > 0 ? 1 : 0);
