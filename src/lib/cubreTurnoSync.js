import { marcarPinCubreTurnoActivo, purgarCacheLocalPinCubreTurno } from './cubreTurno.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_SIN_TABLA_PIN_CUBRE =
  'Falta la tabla en Supabase: ejecuta supabase/fix_pin_cubre_turno.sql (SQL Editor) para sincronizar el PIN de cubre turno entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('pos_pin_cubre_turno') ||
    (msg.includes('schema cache') && msg.includes('cubre'))
  );
}

function pinLimpio(v) {
  return String(v || '').trim();
}

/** Elige la fila más reciente entre varias con el mismo código de tienda (p. ej. 3b3 vs 3B3). */
export function elegirFilaPinCubreMasReciente(filas, sucursalCanon) {
  const suc = normalizarCodigoTienda(sucursalCanon);
  if (!suc) return null;
  const matches = (filas || []).filter((r) => normalizarCodigoTienda(r?.sucursal_id) === suc);
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ta = Date.parse(a?.updated_at || '') || 0;
    const tb = Date.parse(b?.updated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    // Preferir la clave canónica si empatan en fecha.
    const aCanon = String(a?.sucursal_id || '') === suc ? 1 : 0;
    const bCanon = String(b?.sucursal_id || '') === suc ? 1 : 0;
    return bCanon - aCanon;
  });
  return matches[0];
}

/** Mapa sucursal→pin; si hay duplicados por capitalización, gana el updated_at más nuevo. */
export function mapaPinsCubreDesdeFilas(filas) {
  const pins = {};
  const bestAt = {};
  for (const row of filas || []) {
    const suc = normalizarCodigoTienda(row?.sucursal_id);
    if (!suc) continue;
    const p = pinLimpio(row?.pin);
    const at = Date.parse(row?.updated_at || '') || 0;
    if (bestAt[suc] != null && at < bestAt[suc]) continue;
    if (bestAt[suc] === at && pins[suc] && String(row?.sucursal_id || '') !== suc) continue;
    bestAt[suc] = at;
    pins[suc] = p;
  }
  return pins;
}

/**
 * Solo consulta si la tienda actual tiene PIN (no descarga ni guarda el valor en el navegador).
 * Actualiza el flag en memoria para el aviso de login.
 */
export async function sincronizarPinsCubreTurnoDesdeNube(supabase, sucursal) {
  purgarCacheLocalPinCubreTurno();
  if (!supabase) return { ok: true, aviso: null, cambio: false };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: true, cambio: false };

  const r = await refrescarPinCubreTurnoSucursal(supabase, suc);
  if (!r.ok && r.sinTabla) {
    return { ok: false, aviso: r.aviso || AVISO_SIN_TABLA_PIN_CUBRE, cambio: false, sinTabla: true, error: r.error };
  }
  if (!r.ok) return { ok: false, error: r.error, cambio: false };
  return { ok: true, cambio: true, activo: Boolean(r.pin) };
}

/**
 * Lee el PIN de una sucursal desde Supabase (login / checador). No lo guarda en localStorage.
 * Tolera filas antiguas con distinta capitalización en sucursal_id (elige la más reciente).
 */
export async function refrescarPinCubreTurnoSucursal(supabase, sucursal) {
  purgarCacheLocalPinCubreTurno();
  if (!supabase) return { ok: false, error: 'Sin Supabase.', pin: '' };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.', pin: '' };

  const { data: todas, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin, updated_at');

  if (error) {
    if (faltaTabla(error)) {
      return {
        ok: false,
        sinTabla: true,
        aviso: AVISO_SIN_TABLA_PIN_CUBRE,
        error: error.message,
        pin: '',
      };
    }
    // Fallback estrecho si el SELECT * falla por permisos raros.
    const { data, error: errOne } = await supabase
      .from('pos_pin_cubre_turno')
      .select('sucursal_id, pin, updated_at')
      .eq('sucursal_id', suc)
      .maybeSingle();
    if (errOne) {
      return { ok: false, error: errOne.message || error.message, pin: '' };
    }
    const remotoPin = pinLimpio(data?.pin);
    marcarPinCubreTurnoActivo(suc, Boolean(remotoPin));
    return { ok: true, pin: remotoPin, desdeNube: true, sucursal_id: suc };
  }

  const row = elegirFilaPinCubreMasReciente(todas, suc);
  const remotoPin = pinLimpio(row?.pin);
  marcarPinCubreTurnoActivo(suc, Boolean(remotoPin));
  return {
    ok: true,
    pin: remotoPin,
    desdeNube: true,
    sucursal_id: row ? normalizarCodigoTienda(row.sucursal_id) : suc,
  };
}

/**
 * Descarga todos los PIN solo para la pantalla de Configuración (estado React, no localStorage).
 */
export async function cargarPinsCubreTurnoDesdeNube(supabase) {
  purgarCacheLocalPinCubreTurno();
  if (!supabase) return { ok: false, error: 'Sin Supabase.', pins: {} };

  const { data, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin, updated_at');

  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, aviso: AVISO_SIN_TABLA_PIN_CUBRE, sinTabla: true, error: error.message, pins: {} };
    }
    return { ok: false, error: error.message, pins: {} };
  }

  const pins = mapaPinsCubreDesdeFilas(data);
  for (const [suc, p] of Object.entries(pins)) {
    marcarPinCubreTurnoActivo(suc, Boolean(p));
  }
  return { ok: true, pins };
}

/**
 * Borra filas duplicadas con otra capitalización del mismo código (deja solo la canónica).
 * Best-effort: no falla el guardado si el delete no se puede.
 */
async function limpiarDuplicadosPinCubre(supabase, sucursalCanon, pinCanon) {
  const suc = normalizarCodigoTienda(sucursalCanon);
  if (!suc || !supabase) return;
  try {
    const { data: todas } = await supabase
      .from('pos_pin_cubre_turno')
      .select('sucursal_id, pin, updated_at');
    const dupes = (todas || []).filter(
      (r) => normalizarCodigoTienda(r.sucursal_id) === suc && String(r.sucursal_id) !== suc,
    );
    for (const d of dupes) {
      await supabase.from('pos_pin_cubre_turno').delete().eq('sucursal_id', d.sucursal_id);
    }
    // Asegura fila canónica con el PIN vigente (por si solo existía la variante).
    if (dupes.length && pinCanon != null) {
      await supabase.from('pos_pin_cubre_turno').upsert({
        sucursal_id: suc,
        pin: pinLimpio(pinCanon),
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    /* ignore */
  }
}

/** Sube el PIN de una sucursal a Supabase. */
export async function subirPinCubreTurnoANube(supabase, sucursal, pin) {
  if (!supabase) return { ok: false, error: 'Sin Supabase.' };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = pinLimpio(pin);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('pos_pin_cubre_turno').upsert({
    sucursal_id: suc,
    pin: p,
    updated_at,
  });
  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, aviso: AVISO_SIN_TABLA_PIN_CUBRE, sinTabla: true, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  await limpiarDuplicadosPinCubre(supabase, suc, p);
  marcarPinCubreTurnoActivo(suc, Boolean(p));
  return { ok: true, updated_at, pin: p, sucursal_id: suc };
}

/** True si el PIN coincide con el de cubre turno de esa sucursal. */
export async function pinEsCubreTurnoDeSucursal(supabase, pin, sucursal) {
  const r = await refrescarPinCubreTurnoSucursal(supabase, sucursal);
  const { esPinCubreTurno } = await import('./cubreTurno.js');
  if (!pinLimpio(pin) || !pinLimpio(r.pin)) {
    return { coincide: false, error: r.ok === false ? r.error : null };
  }
  return { coincide: esPinCubreTurno(pin, r.pin), error: r.ok === false ? r.error : null };
}

/**
 * Si el PIN no es de la tienda actual, indica en qué sucursal sí está configurado
 * (evita «PIN incorrecto» confuso cuando la caja está en otra tienda).
 */
export async function sucursalDePinCubreTurno(supabase, pin) {
  const p = pinLimpio(pin);
  if (!supabase || !p) return { ok: false, sucursal: null };
  const { data, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin, updated_at');
  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, sinTabla: true, aviso: AVISO_SIN_TABLA_PIN_CUBRE, sucursal: null };
    }
    return { ok: false, error: error.message, sucursal: null };
  }
  const { esPinCubreTurno } = await import('./cubreTurno.js');
  const pins = mapaPinsCubreDesdeFilas(data);
  for (const [suc, pinCfg] of Object.entries(pins)) {
    if (esPinCubreTurno(p, pinCfg)) {
      return { ok: true, sucursal: suc };
    }
  }
  return { ok: true, sucursal: null };
}
