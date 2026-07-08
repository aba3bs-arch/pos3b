import {
  guardarPinCubreTurno,
  leerPinCubreTurno,
  leerPinCubreTurnoMeta,
  leerPinsCubreTurno,
} from './cubreTurno.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_SIN_TABLA_PIN_CUBRE =
  'Falta la tabla en Supabase: ejecuta supabase/fix_pin_cubre_turno.sql (SQL Editor) para sincronizar el PIN de cubre turno entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  // PostgREST: PGRST205 = tabla/vista no en schema cache; 42P01 = relation missing.
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('pos_pin_cubre_turno') ||
    (msg.includes('schema cache') && msg.includes('cubre'))
  );
}

function ts(val) {
  const n = Date.parse(val);
  return Number.isFinite(n) ? n : 0;
}

function aplicarFilaRemota(row) {
  const suc = normalizarCodigoTienda(row?.sucursal_id);
  if (!suc) return false;
  const remotoPin = String(row.pin || '').trim();
  const remotoAt = row.updated_at || null;
  const remotoMs = ts(remotoAt);
  const localMs = ts(leerPinCubreTurnoMeta(suc));
  const localPin = leerPinCubreTurno(suc);

  // Sin PIN local: siempre adoptar el remoto (aunque el timestamp local sea raro/vacío).
  if (!localPin && remotoPin) {
    guardarPinCubreTurno(suc, remotoPin, { updatedAt: remotoAt || new Date().toISOString(), silencioso: false });
    return true;
  }

  if (remotoMs >= localMs && remotoMs > 0) {
    const distinto = remotoMs > localMs || remotoPin !== localPin;
    if (distinto) {
      guardarPinCubreTurno(suc, remotoPin, { updatedAt: remotoAt, silencioso: false });
      return true;
    }
  }
  return false;
}

/** Descarga pines de cubre turno si la nube tiene versiones más recientes. */
export async function sincronizarPinsCubreTurnoDesdeNube(supabase) {
  if (!supabase) return { ok: true, aviso: null, cambio: false };
  const { data, error } = await supabase
    .from('pos_pin_cubre_turno')
    .select('sucursal_id, pin, updated_at');
  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, aviso: AVISO_SIN_TABLA_PIN_CUBRE, cambio: false, sinTabla: true, error: error.message };
    }
    return { ok: false, error: error.message, cambio: false };
  }
  if (!Array.isArray(data) || data.length === 0) return { ok: true, cambio: false };

  let cambio = false;
  for (const row of data) {
    if (aplicarFilaRemota(row)) cambio = true;
  }
  return { ok: true, cambio };
}

/**
 * Fuerza lectura del PIN de una sucursal desde Supabase (login / caja sin cache local).
 * Aplica el valor remoto a localStorage si viene pin.
 */
export async function refrescarPinCubreTurnoSucursal(supabase, sucursal) {
  if (!supabase) return { ok: true, pin: leerPinCubreTurno(sucursal) };
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
        pin: leerPinCubreTurno(suc),
      };
    }
    return { ok: false, error: error.message, pin: leerPinCubreTurno(suc) };
  }

  if (data) {
    const remotoPin = String(data.pin || '').trim();
    const localPin = leerPinCubreTurno(suc);
    if (localPin !== remotoPin || ts(leerPinCubreTurnoMeta(suc)) !== ts(data.updated_at)) {
      guardarPinCubreTurno(suc, remotoPin, {
        updatedAt: data.updated_at || new Date().toISOString(),
        silencioso: false,
      });
    }
    return { ok: true, pin: remotoPin, desdeNube: true };
  }

  return { ok: true, pin: leerPinCubreTurno(suc), desdeNube: false };
}

/** Sube el PIN de una sucursal a Supabase. */
export async function subirPinCubreTurnoANube(supabase, sucursal, pin) {
  if (!supabase) return { ok: true, aviso: null };
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
  return { ok: true, updated_at, pin: p, sucursal_id: suc };
}

/** Sube todos los pines locales (útil tras migración inicial). */
export async function subirTodosPinsCubreTurnoANube(supabase) {
  if (!supabase) return { ok: true };
  const map = leerPinsCubreTurno();
  const entries = Object.entries(map);
  for (const [suc, pin] of entries) {
    const r = await subirPinCubreTurnoANube(supabase, suc, pin);
    if (!r.ok) return r;
    if (r.updated_at) {
      guardarPinCubreTurno(suc, r.pin, { updatedAt: r.updated_at, silencioso: true });
    }
  }
  return { ok: true };
}
