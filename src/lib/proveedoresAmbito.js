/**
 * Ámbito de proveedores: tienda (sucursales) vs cedis (almacén).
 * No se mezclan: cada lado tiene su propio catálogo.
 * Venta en Ruta usa un solo proveedor: CEDIS LAS 3B.
 */

import { esAlmacenCentral, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esProveedorCedisLas3b, PROVEEDOR_CEDIS_NOMBRE } from './catalogoCedis.js';

export const AMBITO_PROVEEDOR_TIENDA = 'tienda';
export const AMBITO_PROVEEDOR_CEDIS = 'cedis';

export const AVISO_FALTA_PROVEEDORES_AMBITO_SQL =
  'Ejecuta supabase/fix_proveedores_ambito.sql en Supabase para separar proveedores de CEDIS y de tiendas.';

export function normalizarAmbitoProveedor(raw, { sucursal = null, forzar = null } = {}) {
  if (forzar === AMBITO_PROVEEDOR_CEDIS || forzar === AMBITO_PROVEEDOR_TIENDA) return forzar;
  const v = String(raw || '').trim().toLowerCase();
  if (v === AMBITO_PROVEEDOR_CEDIS || v === AMBITO_PROVEEDOR_TIENDA) return v;
  if (sucursal != null && esAlmacenCentral(sucursal)) return AMBITO_PROVEEDOR_CEDIS;
  return AMBITO_PROVEEDOR_TIENDA;
}

export function ambitoProveedorParaSucursal(sucursal) {
  return esAlmacenCentral(sucursal) ? AMBITO_PROVEEDOR_CEDIS : AMBITO_PROVEEDOR_TIENDA;
}

export function etiquetaAmbitoProveedor(ambito) {
  return normalizarAmbitoProveedor(ambito) === AMBITO_PROVEEDOR_CEDIS
    ? 'CEDIS (almacén)'
    : 'Sucursales';
}

function faltaColumnaAmbito(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('ambito')
    && (msg.includes('column') || msg.includes('schema cache') || msg.includes('does not exist'))
  );
}

/**
 * Filtra proveedores según el ámbito de la sucursal/sesión.
 * - CEDIS: solo ambito=cedis (o, sin columna, solo CEDIS LAS 3B por nombre).
 * - Tienda: solo ambito=tienda (excluye CEDIS LAS 3B).
 */
export function filtrarProveedoresPorAmbito(proveedores, sucursal, { incluirCedisLas3bEnTienda = false } = {}) {
  const list = Array.isArray(proveedores) ? proveedores : [];
  const want = ambitoProveedorParaSucursal(sucursal);
  const tieneColumna = list.some((p) => p && Object.prototype.hasOwnProperty.call(p, 'ambito') && p.ambito != null);

  if (!tieneColumna) {
    // Fallback sin SQL: CEDIS solo ve CEDIS LAS 3B; tiendas ven el resto.
    if (want === AMBITO_PROVEEDOR_CEDIS) {
      return list.filter((p) => esProveedorCedisLas3b(p));
    }
    return list.filter((p) => incluirCedisLas3bEnTienda || !esProveedorCedisLas3b(p));
  }

  return list.filter((p) => {
    const a = normalizarAmbitoProveedor(p?.ambito);
    if (want === AMBITO_PROVEEDOR_CEDIS) return a === AMBITO_PROVEEDOR_CEDIS;
    if (esProveedorCedisLas3b(p) && !incluirCedisLas3bEnTienda) return false;
    return a === AMBITO_PROVEEDOR_TIENDA;
  });
}

/**
 * Lista proveedores del ámbito correcto desde Supabase.
 */
export async function listarProveedoresPorAmbito(supabase, sucursal, { select = 'id, nombre, ambito' } = {}) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  const want = ambitoProveedorParaSucursal(sucursal);
  const { data, error } = await supabase
    .from('proveedores')
    .select(select)
    .order('nombre');

  if (error && faltaColumnaAmbito(error)) {
    // Reintento sin columna ambito
    const cols = String(select)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'ambito' && !s.startsWith('ambito'));
    const sel = cols.length ? cols.join(', ') : 'id, nombre';
    const retry = await supabase.from('proveedores').select(sel).order('nombre');
    if (retry.error) return { data: [], error: retry.error.message, aviso: AVISO_FALTA_PROVEEDORES_AMBITO_SQL };
    return {
      data: filtrarProveedoresPorAmbito(retry.data || [], sucursal),
      aviso: AVISO_FALTA_PROVEEDORES_AMBITO_SQL,
      sinColumna: true,
    };
  }
  if (error) return { data: [], error: error.message };

  const filtrados = filtrarProveedoresPorAmbito(data || [], sucursal);
  // Si pedimos CEDIS y no hay nadie, aún así devolver filtrados (puede estar vacío).
  void want;
  return { data: filtrados };
}

/**
 * Asegura que «CEDIS LAS 3B» tenga ambito=cedis.
 */
export async function asegurarProveedorCedisLas3bAmbito(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre, ambito')
    .ilike('nombre', PROVEEDOR_CEDIS_NOMBRE)
    .limit(5);
  if (error && faltaColumnaAmbito(error)) {
    return { ok: true, aviso: AVISO_FALTA_PROVEEDORES_AMBITO_SQL, sinColumna: true };
  }
  if (error) return { ok: false, error: error.message };
  const row = (data || []).find((p) => esProveedorCedisLas3b(p)) || (data || [])[0];
  if (!row?.id) {
    return { ok: false, error: `No existe el proveedor «${PROVEEDOR_CEDIS_NOMBRE}». Créalo en CEDIS → Proveedores.` };
  }
  if (normalizarAmbitoProveedor(row.ambito) === AMBITO_PROVEEDOR_CEDIS) {
    return { ok: true, proveedor: row };
  }
  const { error: upErr } = await supabase
    .from('proveedores')
    .update({ ambito: AMBITO_PROVEEDOR_CEDIS })
    .eq('id', row.id);
  if (upErr && faltaColumnaAmbito(upErr)) {
    return { ok: true, proveedor: row, aviso: AVISO_FALTA_PROVEEDORES_AMBITO_SQL, sinColumna: true };
  }
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, proveedor: { ...row, ambito: AMBITO_PROVEEDOR_CEDIS } };
}

/**
 * Payload al guardar: fija ambito según sucursal (no se puede cruzar).
 */
export function payloadAmbitoAlGuardarProveedor({ sucursal, editId = null, rowActual = null } = {}) {
  const want = ambitoProveedorParaSucursal(sucursal);
  // Al editar, conservar ámbito existente si ya está bien; no permitir cambiar de lado.
  if (editId && rowActual) {
    const actual = normalizarAmbitoProveedor(rowActual.ambito, { sucursal });
    if (actual !== want) {
      return {
        ok: false,
        error: actual === AMBITO_PROVEEDOR_CEDIS
          ? 'Este proveedor es de CEDIS y no puede editarse desde una sucursal.'
          : 'Este proveedor es de sucursales y no puede editarse desde CEDIS.',
      };
    }
    return { ok: true, ambito: actual };
  }
  return { ok: true, ambito: want };
}

export function puedeVerProveedorEnSucursal(proveedor, sucursal) {
  const list = filtrarProveedoresPorAmbito([proveedor], sucursal);
  return list.length > 0;
}

export function sucursalNormalizadaOMain(sucursal) {
  return normalizarCodigoTienda(sucursal) || 'MAIN';
}
