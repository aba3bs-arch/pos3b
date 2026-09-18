/**
 * Purga total del módulo Venta en Ruta (solo admin principal).
 * Borra datos operativos y maestros del módulo para arrancar limpio.
 * NO toca: catálogo productos, precio_ruta, privilegios, ni stock CEDIS restaurado.
 */

import { limpiarTodosCarritosPosRuta } from './carritoPosRutaPersistencia.js';

export const LS_VENTA_RUTA_CLAVES = [
  'pos3b_ruta_clientes',
  'pos3b_ruta_cargas',
  'pos3b_ruta_carga_lineas',
  'pos3b_ruta_ventas',
  'pos3b_ruta_cxc_movimientos',
  'pos3b_cortes_ruta',
  'pos3b_ruta_vendedor_sesion',
  'pos3b_ruta_admin_corte',
];

/** Tablas nube en orden seguro (FKs). Las que falten se ignoran. */
export const TABLAS_VENTA_RUTA_PURGA = [
  'ruta_cxc_movimientos',
  'ruta_liquidaciones',
  'ruta_ventas',
  'ruta_cortes_caja',
  'ruta_carga_lineas',
  'ruta_cargas',
  'ruta_clientes',
  'ruta_camiones',
  // Legado / deprecado
  'ruta_efectivo_movimientos',
  'ruta_capital_solicitudes',
  'ruta_preinventario_sesiones',
  'cedis_ruta_movimientos',
  'cedis_ruta_stock',
];

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || msg.includes('does not exist')
    || msg.includes('schema cache')
  );
}

/** Borra todas las filas de una tabla (o ignora si no existe). */
async function vaciarTabla(supabase, tabla) {
  // Filtro siempre verdadero para que PostgREST acepte el DELETE.
  const { error } = await supabase.from(tabla).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (!error) return { ok: true, tabla, borrada: true };
  if (faltaTabla(error)) return { ok: true, tabla, omitida: true };

  // Algunas tablas legacy usan producto_id como PK (cedis_ruta_stock).
  const { error: err2 } = await supabase.from(tabla).delete().not('producto_id', 'is', null);
  if (!err2) return { ok: true, tabla, borrada: true };
  if (faltaTabla(err2)) return { ok: true, tabla, omitida: true };

  // Último intento: cualquier fila con created_at
  const { error: err3 } = await supabase.from(tabla).delete().gte('created_at', '1970-01-01');
  if (!err3) return { ok: true, tabla, borrada: true };
  if (faltaTabla(err3)) return { ok: true, tabla, omitida: true };

  return { ok: false, tabla, error: error.message || err2?.message || err3?.message };
}

function limpiarLocalStorageVentaRuta() {
  const borradas = [];
  try {
    for (const k of LS_VENTA_RUTA_CLAVES) {
      if (localStorage.getItem(k) != null) {
        localStorage.removeItem(k);
        borradas.push(k);
      }
    }
    const extras = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('pos3b_ruta_') || k.startsWith('pos3b_carrito_pos_ruta_')) {
        extras.push(k);
      }
    }
    for (const k of extras) {
      localStorage.removeItem(k);
      borradas.push(k);
    }
  } catch {
    /* ignore */
  }
  limpiarTodosCarritosPosRuta();
  return borradas;
}

/**
 * Borra tránsito generado por ventas/cobros de ruta (no toca recolecciones de tienda).
 */
async function borrarTransitoVentaRuta(supabase) {
  const { error } = await supabase
    .from('transito_efectivo')
    .delete()
    .eq('tipo_movimiento', 'Venta Ruta');
  if (!error) return { ok: true, detalle: 'Tránsito de Venta Ruta eliminado.' };
  if (faltaTabla(error)) return { ok: true, detalle: 'Tránsito de Venta Ruta (tabla ausente, omitido).' };
  return { ok: false, error: error.message };
}

/**
 * Purga completa del módulo Venta en Ruta.
 * @returns {{ ok: boolean, detalle?: string, error?: string, errores?: string[] }}
 */
export async function borrarDatosVentaEnRuta(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  const hechos = [];
  const errores = [];

  for (const tabla of TABLAS_VENTA_RUTA_PURGA) {
    const r = await vaciarTabla(supabase, tabla);
    if (!r.ok) errores.push(`${tabla}: ${r.error}`);
    else if (r.borrada) hechos.push(tabla);
  }

  const tr = await borrarTransitoVentaRuta(supabase);
  if (tr.ok) hechos.push(tr.detalle || 'transito_venta_ruta');
  else errores.push(tr.error);

  const ls = limpiarLocalStorageVentaEnRutaSafe();
  hechos.push(`caché local (${ls.length} clave(s))`);

  if (!hechos.length && errores.length) {
    return { ok: false, error: errores.join('\n'), errores };
  }

  return {
    ok: errores.length === 0,
    detalle:
      `Venta en Ruta reiniciada: ${hechos.join(', ')}.`
      + (errores.length ? ` Avisos: ${errores.join(' · ')}` : '')
      + ' No se restauró stock CEDIS ni se borró precio_ruta del catálogo.',
    errores,
  };
}

function limpiarLocalStorageVentaEnRutaSafe() {
  try {
    return limpiarLocalStorageVentaRuta();
  } catch {
    return [];
  }
}
