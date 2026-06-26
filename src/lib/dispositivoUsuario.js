import { normalizarRol } from './roles.js';
import { sucursalFijaPorEntorno, tiendaBloqueadaEnEsteEquipo } from '../constants/sucursales.js';

const LS_DISPOSITIVO = 'pos3b_dispositivo_id';

export const AVISO_FALTA_DISPOSITIVO =
  'Falta la columna dispositivo_id en usuarios. Ejecuta supabase/fix_usuarios_dispositivo.sql';

export function obtenerIdDispositivoLocal() {
  try {
    let id = localStorage.getItem(LS_DISPOSITIVO);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(LS_DISPOSITIVO, id);
    }
    return id;
  } catch {
    return `dev-fallback-${Date.now()}`;
  }
}

/** Cajeros y repartidores quedan ligados al primer equipo donde fijan tienda. */
export function rolExigeDispositivoUnico(rol) {
  const r = normalizarRol(rol);
  return r === 'Cajero' || r === 'Repartidor';
}

export function esTerminalTiendaFijada() {
  return Boolean(sucursalFijaPorEntorno() || tiendaBloqueadaEnEsteEquipo());
}

function faltaColumnaDispositivo(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('dispositivo_id') && (msg.includes('does not exist') || msg.includes('column'));
}

/**
 * @returns {{ ok: boolean, error?: string, vincular?: boolean, deviceId?: string, aviso?: string }}
 */
export function evaluarVinculoDispositivo(user, opts = {}) {
  if (!user || !rolExigeDispositivoUnico(user.rol)) return { ok: true };

  const deviceId = obtenerIdDispositivoLocal();
  const terminalFijada = opts.terminalFijada ?? esTerminalTiendaFijada();
  const vinculado = String(user.dispositivo_id || '').trim();

  if (!vinculado) {
    if (!terminalFijada) return { ok: true, deviceId };
    return { ok: true, vincular: true, deviceId };
  }

  if (vinculado === deviceId) return { ok: true, deviceId };

  return {
    ok: false,
    error:
      'Este PIN ya está vinculado a otra computadora o dispositivo. Solo puede usarse en la terminal de tienda donde se fijó por primera vez. Pide al administrador que libere el equipo en Usuarios si cambió de PC.',
    deviceId,
  };
}

export async function vincularDispositivoUsuario(supabase, userId, deviceId) {
  if (!supabase || !userId || !deviceId) return { ok: false, error: 'Datos incompletos.' };
  const { error } = await supabase
    .from('usuarios')
    .update({
      dispositivo_id: deviceId,
      dispositivo_vinculado_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (!error) return { ok: true };
  if (faltaColumnaDispositivo(error)) return { ok: false, error: AVISO_FALTA_DISPOSITIVO };
  return { ok: false, error: error.message };
}

export async function liberarDispositivoUsuario(supabase, userId) {
  if (!supabase || !userId) return { ok: false, error: 'Sin usuario.' };
  const { error } = await supabase
    .from('usuarios')
    .update({ dispositivo_id: null, dispositivo_vinculado_at: null })
    .eq('id', userId);
  if (!error) return { ok: true };
  if (faltaColumnaDispositivo(error)) return { ok: false, error: AVISO_FALTA_DISPOSITIVO };
  return { ok: false, error: error.message };
}

export function etiquetaDispositivoUsuario(user) {
  if (!user?.dispositivo_id) return 'Sin vincular';
  return 'Vinculado a un equipo';
}
