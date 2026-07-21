import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const VENTAS_SELECT_BASE = 'id,total,metodo_pago,vendedor,sucursal_id,articulos';
export const VENTAS_SELECT_FULL = `${VENTAS_SELECT_BASE},created_at`;

export function errorFaltaCreatedAt(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('created_at') && (msg.includes('does not exist') || msg.includes('column'));
}

export const AVISO_SIN_CREATED_AT =
  'Falta la columna created_at en la tabla ventas. En Supabase → SQL Editor ejecuta: alter table public.ventas add column if not exists created_at timestamptz default now();';

/**
 * Consulta ventas con filtro por fecha cuando existe created_at.
 * Si la columna no existe, devuelve ventas recientes (orden por id) y sinFecha: true.
 */
export async function consultarVentas(supabase, opts = {}) {
  if (!supabase) return { data: [], error: 'Sin conexión a Supabase', sinFecha: false };

  const {
    columns = VENTAS_SELECT_FULL,
    desde = null,
    hasta = null,
    sucursal = null,
    limit = 500,
    orderAsc = false,
  } = opts;

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;

  const build = (cols) => {
    let q = supabase.from('ventas').select(cols);
    if (suc) q = q.eq('sucursal_id', suc);
    const usaFecha = cols.includes('created_at');
    if (usaFecha && desde) q = q.gte('created_at', desde.toISOString());
    if (usaFecha && hasta) q = q.lte('created_at', hasta.toISOString());
    if (usaFecha) q = q.order('created_at', { ascending: orderAsc });
    else q = q.order('id', { ascending: false });
    return q.limit(limit);
  };

  const { data, error } = await build(columns);
  if (!error) return { data: data || [], error: null, sinFecha: false };

  if (!errorFaltaCreatedAt(error)) {
    return { data: [], error: error.message, sinFecha: false };
  }

  const colsSin = columns
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'created_at')
    .join(',');

  const { data: d2, error: e2 } = await build(colsSin || VENTAS_SELECT_BASE);
  if (e2) return { data: [], error: e2.message, sinFecha: true };

  let list = d2 || [];
  if (desde || hasta) {
    list = list.filter((v) => {
      const t = v.created_at ? new Date(v.created_at) : null;
      if (!t) return true;
      if (desde && t < desde) return false;
      if (hasta && t > hasta) return false;
      return true;
    });
  }

  return {
    data: list,
    error: null,
    sinFecha: true,
    aviso: AVISO_SIN_CREATED_AT,
  };
}
