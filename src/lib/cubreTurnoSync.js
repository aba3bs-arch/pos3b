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

/**
 * Solo consulta si la tienda actual tiene PIN (no descarga ni guarda el valor en el navegador).
 * Actualiza el flag en memoria para el aviso de login.
 */
export async function sincronizarPinsCubreTurnoDesdeNube(supabase, sucursal) {
  purgarCacheLocalPinCubreTurno();
  if (!supabase) return { ok: true, aviso: null, cambio: false };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: true, cambio: false };

  const { data, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin')
    .eq('sucursal_id', suc)
    .maybeSingle();

  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, aviso: AVISO_SIN_TABLA_PIN_CUBRE, cambio: false, sinTabla: true, error: error.message };
    }
    return { ok: false, error: error.message, cambio: false };
  }

  const activo = Boolean(String(data?.pin || '').trim());
  marcarPinCubreTurnoActivo(suc, activo);
  return { ok: true, cambio: true, activo };
}

/**
 * Lee el PIN de una sucursal desde Supabase (login / checador). No lo guarda en localStorage.
 */
export async function refrescarPinCubreTurnoSucursal(supabase, sucursal) {
  purgarCacheLocalPinCubreTurno();
  if (!supabase) return { ok: false, error: 'Sin Supabase.', pin: '' };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.', pin: '' };

  const { data, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin, updated_at')
    .eq('sucursal_id', suc)
    .maybeSingle();

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
    return { ok: false, error: error.message, pin: '' };
  }

  const remotoPin = String(data?.pin || '').trim();
  marcarPinCubreTurnoActivo(suc, Boolean(remotoPin));
  return { ok: true, pin: remotoPin, desdeNube: true };
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

  const pins = {};
  for (const row of data || []) {
    const suc = normalizarCodigoTienda(row.sucursal_id);
    if (!suc) continue;
    const p = String(row.pin || '').trim();
    pins[suc] = p;
    marcarPinCubreTurnoActivo(suc, Boolean(p));
  }
  return { ok: true, pins };
}

/** Sube el PIN de una sucursal a Supabase. */
export async function subirPinCubreTurnoANube(supabase, sucursal, pin) {
  if (!supabase) return { ok: false, error: 'Sin Supabase.' };
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return { ok: false, error: 'Sucursal no válida.' };
  const p = String(pin || '').trim();
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
  marcarPinCubreTurnoActivo(suc, Boolean(p));
  return { ok: true, updated_at, pin: p, sucursal_id: suc };
}

/** True si el PIN coincide con el de cubre turno de esa sucursal. */
export async function pinEsCubreTurnoDeSucursal(supabase, pin, sucursal) {
  const r = await refrescarPinCubreTurnoSucursal(supabase, sucursal);
  const p = String(pin || '').trim();
  const remoto = String(r.pin || '').trim();
  if (!p || !remoto) return { coincide: false, error: r.ok === false ? r.error : null };
  return { coincide: p === remoto };
}
