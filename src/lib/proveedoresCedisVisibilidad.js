/**
 * Visibilidad de proveedores en CEDIS (almacén).
 * Ocultar aquí NO borra el proveedor de las tiendas: solo deja de listarse en CEDIS.
 */

import { esAlmacenCentral } from '../constants/sucursales.js';
import { esProveedorCedisLas3b, PROVEEDOR_CEDIS_NOMBRE } from './catalogoCedis.js';

const LS_OCULTOS = 'pos3b_proveedores_ocultos_cedis';

export const AVISO_FALTA_PROVEEDORES_CEDIS_SQL =
  'Ejecuta supabase/fix_proveedores_ocultos_cedis.sql en Supabase para sincronizar proveedores ocultos en CEDIS entre cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_proveedores_ocultos_cedis')
    || (msg.includes('schema cache') && msg.includes('ocult'))
  );
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_OCULTOS);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((id) => String(id || '').trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function escribirLocal(ids) {
  const clean = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  localStorage.setItem(LS_OCULTOS, JSON.stringify(clean));
  return clean;
}

export function listarIdsProveedoresOcultosCedis() {
  return leerLocal();
}

export function proveedorOcultoEnCedis(proveedorId) {
  const id = String(proveedorId || '').trim();
  if (!id) return false;
  return leerLocal().includes(id);
}

/** Filtra la lista de proveedores para la vista CEDIS. */
export function filtrarProveedoresVisiblesCedis(proveedores, { incluirOcultos = false } = {}) {
  const list = Array.isArray(proveedores) ? proveedores : [];
  if (incluirOcultos) return list;
  const ocultos = new Set(leerLocal());
  return list.filter((p) => !ocultos.has(String(p?.id || '').trim()));
}

export function puedeOcultarProveedorEnCedis(proveedorOrNombre) {
  if (esProveedorCedisLas3b(proveedorOrNombre)) return false;
  return true;
}

/**
 * Oculta un proveedor solo en CEDIS (local + nube opcional).
 * No elimina la fila de `proveedores`.
 */
export async function ocultarProveedorEnCedis(proveedorId, supabase = null, proveedorRow = null) {
  const id = String(proveedorId || '').trim();
  if (!id) return { ok: false, error: 'Proveedor inválido.' };
  if (!puedeOcultarProveedorEnCedis(proveedorRow || { id })) {
    return {
      ok: false,
      error: `No se puede ocultar «${PROVEEDOR_CEDIS_NOMBRE}»: es el proveedor del catálogo CEDIS.`,
    };
  }
  // Si solo tenemos id, aún permitimos ocultar; la UI bloquea CEDIS LAS 3B por nombre.

  const actuales = leerLocal();
  if (!actuales.includes(id)) {
    actuales.push(id);
    escribirLocal(actuales);
  }

  let aviso = null;
  if (supabase) {
    try {
      const { error } = await supabase.from('pos_proveedores_ocultos_cedis').upsert(
        {
          proveedor_id: id,
          oculto: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'proveedor_id' },
      );
      if (error) {
        if (faltaTabla(error)) aviso = AVISO_FALTA_PROVEEDORES_CEDIS_SQL;
        else aviso = error.message;
      }
    } catch (e) {
      aviso = e?.message || String(e);
    }
  }

  return { ok: true, aviso };
}

/** Vuelve a mostrar el proveedor en CEDIS (sigue existiendo en tiendas). */
export async function restaurarProveedorEnCedis(proveedorId, supabase = null) {
  const id = String(proveedorId || '').trim();
  if (!id) return { ok: false, error: 'Proveedor inválido.' };

  escribirLocal(leerLocal().filter((x) => x !== id));

  let aviso = null;
  if (supabase) {
    try {
      const { error } = await supabase
        .from('pos_proveedores_ocultos_cedis')
        .delete()
        .eq('proveedor_id', id);
      if (error) {
        if (faltaTabla(error)) aviso = AVISO_FALTA_PROVEEDORES_CEDIS_SQL;
        else aviso = error.message;
      }
    } catch (e) {
      aviso = e?.message || String(e);
    }
  }

  return { ok: true, aviso };
}

/** Fusiona ocultos desde la nube. */
export async function sincronizarProveedoresOcultosCedis(supabase) {
  if (!supabase) {
    return { ok: true, ids: listarIdsProveedoresOcultosCedis(), aviso: null };
  }
  try {
    const { data, error } = await supabase
      .from('pos_proveedores_ocultos_cedis')
      .select('proveedor_id, oculto')
      .eq('oculto', true)
      .limit(2000);
    if (error) {
      if (faltaTabla(error)) {
        return { ok: true, ids: listarIdsProveedoresOcultosCedis(), aviso: AVISO_FALTA_PROVEEDORES_CEDIS_SQL };
      }
      return { ok: false, error: error.message, ids: listarIdsProveedoresOcultosCedis() };
    }
    const fromNube = (data || []).map((r) => String(r.proveedor_id || '').trim()).filter(Boolean);
    const merged = [...new Set([...leerLocal(), ...fromNube])];
    escribirLocal(merged);
    return { ok: true, ids: merged, aviso: null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), ids: listarIdsProveedoresOcultosCedis() };
  }
}

export function aplicaOcultarProveedoresCedis(sucursal) {
  return esAlmacenCentral(sucursal);
}
