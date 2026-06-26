import { listarSucursales, esAlmacenCentral } from '../constants/sucursales.js';
import { vaciarInventario } from './borrarInventario.js';

export const TIPOS_PURGA = [
  { id: 'ventas', label: 'Ventas', desc: 'Tickets y totales en la nube.' },
  { id: 'cortes_caja', label: 'Cortes de caja', desc: 'Historial de cortes del POS.' },
  { id: 'cortes_contabilidad', label: 'Cortes de contabilidad', desc: 'Virtual, Abarrotes y Garage (gastos, cierres, estado).' },
  { id: 'inventario', label: 'Inventario', desc: 'Pone en cero el stock (no borra el catálogo de productos).' },
  { id: 'cache_local', label: 'Caché local', desc: 'Movimientos, cortes locales y ajustes en este navegador.' },
];

const LS_PURGA_KEYS = [
  'pos3b_cortes_caja',
  'pos3b_movimientos_inventario',
  'pos3b_ajustes_inventario',
  'pos3b_cancelaciones',
  'pos3b_folio_ajuste_seq',
];

function toDateStart(ymd) {
  return new Date(`${ymd}T00:00:00`);
}

function toDateEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999`);
}

function aplicarFiltroTienda(q, sucursales) {
  if (!sucursales?.length) return q;
  if (sucursales.length === 1) return q.eq('sucursal_id', sucursales[0]);
  return q.in('sucursal_id', sucursales);
}

function aplicarFiltroFecha(q, desde, hasta) {
  let out = q;
  if (desde) out = out.gte('created_at', toDateStart(desde).toISOString());
  if (hasta) out = out.lte('created_at', toDateEnd(hasta).toISOString());
  return out;
}

async function borrarVentas(supabase, { sucursales, desde, hasta }) {
  let q = supabase.from('ventas').delete();
  q = aplicarFiltroTienda(q, sucursales);
  q = aplicarFiltroFecha(q, desde, hasta);
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, detalle: 'Ventas eliminadas.' };
}

async function borrarCortesCaja(supabase, { sucursales, desde, hasta }) {
  let q = supabase.from('cortes_caja').delete();
  q = aplicarFiltroTienda(q, sucursales);
  q = aplicarFiltroFecha(q, desde, hasta);
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, detalle: 'Cortes de caja eliminados.' };
}

async function borrarCortesContabilidad(supabase, { sucursales, desde, hasta }) {
  const tablas = ['cortes_contabilidad_gastos', 'cortes_contabilidad_cierres'];
  const res = [];
  for (const tabla of tablas) {
    let q = supabase.from(tabla).delete();
    q = aplicarFiltroTienda(q, sucursales);
    q = aplicarFiltroFecha(q, desde, hasta);
    const { error } = await q;
    if (error) res.push(`${tabla}: ${error.message}`);
  }

  if (sucursales?.length) {
    for (const sid of sucursales) {
      for (const modulo of ['virtual', 'abarrotes', 'garage']) {
        await supabase.from('cortes_contabilidad_estado').delete().eq('sucursal_id', sid).eq('modulo', modulo);
        await supabase.from('cortes_contabilidad_folios').delete().eq('sucursal_id', sid).eq('modulo', modulo);
      }
    }
  } else if (!desde && !hasta) {
    await supabase.from('cortes_contabilidad_estado').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('cortes_contabilidad_folios').delete().neq('sucursal_id', '');
  }

  if (res.length) return { ok: false, error: res.join('\n') };
  return { ok: true, detalle: 'Cortes de contabilidad eliminados.' };
}

function limpiarCacheLocal() {
  for (const k of LS_PURGA_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  return { ok: true, detalle: 'Caché local de reportes y movimientos limpiada.' };
}

/**
 * @param {object} opts
 * @param {string[]} opts.tipos - ids de TIPOS_PURGA
 * @param {string[]} [opts.sucursales] - vacío = todas las tiendas (incl. MAIN si borrarTodo)
 * @param {string} [opts.desde] - YYYY-MM-DD
 * @param {string} [opts.hasta] - YYYY-MM-DD
 * @param {boolean} [opts.borrarTodo]
 */
export async function ejecutarPurgaDatos(supabase, opts) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  const {
    tipos = [],
    sucursales = [],
    desde = '',
    hasta = '',
    borrarTodo = false,
    inventarioCompleto = [],
    sucursalActiva = 'MAIN',
    usuario = '—',
  } = opts;

  const tiposSet = new Set(borrarTodo ? TIPOS_PURGA.map((t) => t.id) : tipos);
  if (!tiposSet.size) return { ok: false, error: 'Selecciona al menos un tipo de dato a borrar.' };

  let tiendas =
    sucursales?.length > 0
      ? sucursales.map((s) => String(s).trim().toUpperCase())
      : borrarTodo
        ? listarSucursales()
        : listarSucursales().filter((s) => !esAlmacenCentral(s));

  if (!borrarTodo && !desde && !hasta) {
    return { ok: false, error: 'Indica un rango de fechas o activa «Borrar toda la información».' };
  }

  const resultados = [];
  const errores = [];

  if (tiposSet.has('ventas')) {
    const r = await borrarVentas(supabase, { sucursales: tiendas, desde: borrarTodo ? null : desde, hasta: borrarTodo ? null : hasta });
    if (r.ok) resultados.push(r.detalle);
    else errores.push(r.error);
  }

  if (tiposSet.has('cortes_caja')) {
    const r = await borrarCortesCaja(supabase, { sucursales: tiendas, desde: borrarTodo ? null : desde, hasta: borrarTodo ? null : hasta });
    if (r.ok) resultados.push(r.detalle);
    else errores.push(r.error);
  }

  if (tiposSet.has('cortes_contabilidad')) {
    const r = await borrarCortesContabilidad(supabase, {
      sucursales: tiendas,
      desde: borrarTodo ? null : desde,
      hasta: borrarTodo ? null : hasta,
    });
    if (r.ok) resultados.push(r.detalle);
    else errores.push(r.error);
  }

  if (tiposSet.has('inventario')) {
    let r;
    if (borrarTodo || !sucursales?.length) {
      r = await vaciarInventario(supabase, {
        inventarioCompleto,
        sucursal: sucursalActiva,
        alcance: 'global',
        usuario,
        motivo: borrarTodo ? 'Purga total (admin principal)' : 'Purga inventario global (admin principal)',
      });
    } else {
      const erroresInv = [];
      let aplicados = 0;
      for (const sid of tiendas) {
        const ri = await vaciarInventario(supabase, {
          inventarioCompleto,
          sucursal: sid,
          alcance: 'tienda',
          usuario,
          motivo: 'Purga inventario por tienda (admin principal)',
        });
        if (ri.ok) aplicados += ri.aplicados || 0;
        else erroresInv.push(`${sid}: ${ri.error}`);
      }
      r =
        aplicados > 0
          ? { ok: erroresInv.length === 0, mensaje: `Inventario vaciado en ${aplicados} actualización(es).`, error: erroresInv.join('\n') }
          : { ok: false, error: erroresInv.join('\n') || 'No se vació inventario.' };
    }
    if (r.ok) resultados.push(r.mensaje);
    else errores.push(r.error);
  }

  if (tiposSet.has('cache_local')) {
    const r = limpiarCacheLocal();
    resultados.push(r.detalle);
  }

  if (!resultados.length && errores.length) return { ok: false, error: errores.join('\n') };
  return {
    ok: errores.length === 0,
    mensaje: resultados.join(' · '),
    errores,
  };
}
