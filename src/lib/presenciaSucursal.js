import { normalizarCodigoTienda, etiquetaTienda } from '../constants/sucursales.js';
import { obtenerIdDispositivoLocal } from './dispositivoUsuario.js';

/** Ventana para considerar la caja “en línea” (ms). */
export const PRESENCIA_ONLINE_MS = 2 * 60 * 1000;
/** Intervalo de latido del POS activo. */
export const PRESENCIA_HEARTBEAT_MS = 30 * 1000;

export const AVISO_SIN_TABLA_PRESENCIA =
  'Falta la tabla pos_presencia_sucursal. Ejecuta supabase/fix_presencia_sucursal.sql en Supabase.';

function faltaTablaPresencia(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('pos_presencia_sucursal') ||
    (msg.includes('schema cache') && msg.includes('presencia')) ||
    msg.includes('does not exist')
  );
}

export function presenciaEstaEnLinea(lastSeen, ahora = Date.now()) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (Number.isNaN(t)) return false;
  return ahora - t <= PRESENCIA_ONLINE_MS;
}

/** Mapa sucursal_id → { last_seen, usuario_nombre, online }. */
export async function cargarPresenciaSucursales(supabase) {
  if (!supabase) return { ok: false, map: {}, error: 'Sin conexión.' };
  const { data, error } = await supabase.from('pos_presencia_sucursal').select('sucursal_id,last_seen,usuario_nombre');
  if (error) {
    if (faltaTablaPresencia(error)) return { ok: false, map: {}, sinTabla: true, aviso: AVISO_SIN_TABLA_PRESENCIA };
    return { ok: false, map: {}, error: error.message };
  }
  const ahora = Date.now();
  const map = {};
  for (const row of data || []) {
    const id = normalizarCodigoTienda(row.sucursal_id);
    if (!id) continue;
    // Incluye MAIN: sesión activa en Central de administración.
    const online = presenciaEstaEnLinea(row.last_seen, ahora);
    map[id] = {
      last_seen: row.last_seen,
      usuario_nombre: row.usuario_nombre || '',
      online,
    };
  }
  return { ok: true, map };
}

/**
 * Latido de caja física (tienda fijada) o de sesión en Central (MAIN).
 * No latir al solo consultar otra tienda desde Central (el caller pasa solo latido válido).
 */
export async function enviarHeartbeatPresencia(supabase, { sucursal, usuarioNombre } = {}) {
  if (!supabase) return { ok: false };
  const sid = normalizarCodigoTienda(sucursal);
  if (!sid) return { ok: false, skipped: true };
  let dispositivo = null;
  try {
    dispositivo = typeof obtenerIdDispositivoLocal === 'function' ? obtenerIdDispositivoLocal() : null;
  } catch {
    dispositivo = null;
  }
  const { error } = await supabase.from('pos_presencia_sucursal').upsert(
    {
      sucursal_id: sid,
      last_seen: new Date().toISOString(),
      usuario_nombre: String(usuarioNombre || '').trim() || null,
      dispositivo_id: dispositivo,
    },
    { onConflict: 'sucursal_id' },
  );
  if (error) {
    if (faltaTablaPresencia(error)) return { ok: false, sinTabla: true, aviso: AVISO_SIN_TABLA_PRESENCIA };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Al cerrar sesión en una caja / central: marcar fuera de línea de inmediato. */
export async function marcarPresenciaFueraDeLinea(supabase, sucursal) {
  if (!supabase) return { ok: false };
  const sid = normalizarCodigoTienda(sucursal);
  if (!sid) return { ok: false, skipped: true };
  const { error } = await supabase.from('pos_presencia_sucursal').upsert(
    {
      sucursal_id: sid,
      last_seen: new Date(0).toISOString(),
      usuario_nombre: null,
    },
    { onConflict: 'sucursal_id' },
  );
  if (error) {
    if (faltaTablaPresencia(error)) return { ok: false, sinTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Texto de opción: 🟢 en línea · etiqueta tienda. */
export function etiquetaOpcionSucursal(codigo, presenciaMap) {
  const id = normalizarCodigoTienda(codigo);
  const online = Boolean(presenciaMap?.[id]?.online);
  const base = etiquetaTienda(id);
  return online ? `🟢 ${base}` : base;
}
