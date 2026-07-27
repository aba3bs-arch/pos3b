import { normalizarRol } from './roles.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';
import { sucursalFijaPorEntorno, tiendaBloqueadaEnEsteEquipo } from '../constants/sucursales.js';

const LS_DISPOSITIVO = 'pos3b_dispositivo_id';

/** Máximo de equipos anclados por PIN de cajero/repartidor (ej. 2 celulares de tienda). */
export const MAX_DISPOSITIVOS_POR_USUARIO = 2;

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

/** Cajeros y repartidores quedan ligados al equipo de tienda fijada.
 * Administradores (y el resto de roles) NO se anclan a ningún dispositivo. */
export function rolExigeDispositivoUnico(rol) {
  const r = normalizarRol(rol);
  return r === 'Cajero' || r === 'Repartidor';
}

export function esTerminalTiendaFijada() {
  return Boolean(sucursalFijaPorEntorno() || tiendaBloqueadaEnEsteEquipo());
}

function faltaColumnaDispositivo(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    (msg.includes('dispositivo_id') || msg.includes('dispositivo_id_2')) &&
    (msg.includes('does not exist') || msg.includes('column'))
  );
}

export function dispositivosVinculadosUsuario(user) {
  const d1 = String(user?.dispositivo_id || '').trim();
  const d2 = String(user?.dispositivo_id_2 || '').trim();
  return [d1, d2].filter(Boolean);
}

/**
 * @returns {{ ok: boolean, error?: string, vincular?: boolean, deviceId?: string, aviso?: string, sinAnclaje?: boolean }}
 */
export function evaluarVinculoDispositivo(user, opts = {}) {
  // Administrador y roles que no son cajero/repartidor: acceso desde cualquier PC o celular.
  if (!user || esUsuarioCubreTurno(user) || !rolExigeDispositivoUnico(user.rol)) {
    return { ok: true, sinAnclaje: true };
  }

  const deviceId = obtenerIdDispositivoLocal();
  const terminalFijada = opts.terminalFijada ?? esTerminalTiendaFijada();
  const slots = dispositivosVinculadosUsuario(user);

  if (slots.includes(deviceId)) return { ok: true, deviceId };

  // Sin equipos aún: en terminal fijada se ancla el primero; fuera de caja no obliga.
  if (slots.length === 0) {
    if (!terminalFijada) return { ok: true, deviceId };
    return { ok: true, vincular: true, deviceId };
  }

  // Ya tiene 1 equipo: en otra terminal de tienda fijada se permite el 2.º (mismo PIN, 2 celulares).
  if (terminalFijada && slots.length < MAX_DISPOSITIVOS_POR_USUARIO) {
    return { ok: true, vincular: true, deviceId };
  }

  if (terminalFijada && slots.length >= MAX_DISPOSITIVOS_POR_USUARIO) {
    return {
      ok: false,
      error:
        'Este PIN ya está vinculado a 2 dispositivos (máximo por cajero). Pide al administrador que libere el equipo en Usuarios si cambió de celular.',
      deviceId,
    };
  }

  return {
    ok: false,
    error:
      'Este PIN ya está vinculado a otra computadora o dispositivo. Solo puede usarse en las terminales de tienda donde se fijó. Pide al administrador que libere el equipo en Usuarios si cambió de PC.',
    deviceId,
  };
}

/** Ancla el dispositivo en el primer slot libre (dispositivo_id o dispositivo_id_2). */
export async function vincularDispositivoUsuario(supabase, userId, deviceId, userRow = null) {
  if (!supabase || !userId || !deviceId) return { ok: false, error: 'Datos incompletos.' };

  let row = userRow;
  if (!row) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('dispositivo_id, dispositivo_id_2')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (faltaColumnaDispositivo(error)) return { ok: false, error: AVISO_FALTA_DISPOSITIVO };
      return { ok: false, error: error.message };
    }
    row = data;
  }

  const d1 = String(row?.dispositivo_id || '').trim();
  const d2 = String(row?.dispositivo_id_2 || '').trim();
  if (d1 === deviceId || d2 === deviceId) return { ok: true, slot: d1 === deviceId ? 1 : 2 };

  const ahora = new Date().toISOString();
  let patch;
  let slot;
  if (!d1) {
    patch = { dispositivo_id: deviceId, dispositivo_vinculado_at: ahora };
    slot = 1;
  } else if (!d2) {
    patch = { dispositivo_id_2: deviceId, dispositivo_vinculado_at: ahora };
    slot = 2;
  } else {
    return {
      ok: false,
      error: 'Este PIN ya tiene 2 dispositivos anclados. Libera un equipo en Usuarios para registrar otro.',
    };
  }

  const { error } = await supabase.from('usuarios').update(patch).eq('id', userId);
  if (!error) return { ok: true, slot, ...patch };
  if (faltaColumnaDispositivo(error)) {
    // Columna 2 aún no existe: solo primer slot
    if (slot === 2) {
      return {
        ok: false,
        error: 'Falta la columna dispositivo_id_2. Ejecuta supabase/fix_usuarios_dispositivo.sql en Supabase.',
      };
    }
    return { ok: false, error: AVISO_FALTA_DISPOSITIVO };
  }
  return { ok: false, error: error.message };
}

export async function liberarDispositivoUsuario(supabase, userId) {
  if (!supabase || !userId) return { ok: false, error: 'Sin usuario.' };
  const { error } = await supabase
    .from('usuarios')
    .update({ dispositivo_id: null, dispositivo_id_2: null, dispositivo_vinculado_at: null })
    .eq('id', userId);
  if (!error) return { ok: true };
  if (faltaColumnaDispositivo(error)) {
    const { error: e2 } = await supabase
      .from('usuarios')
      .update({ dispositivo_id: null, dispositivo_vinculado_at: null })
      .eq('id', userId);
    if (!e2) return { ok: true };
    if (faltaColumnaDispositivo(e2)) return { ok: false, error: AVISO_FALTA_DISPOSITIVO };
    return { ok: false, error: e2.message };
  }
  return { ok: false, error: error.message };
}

export function etiquetaDispositivoUsuario(user) {
  const n = dispositivosVinculadosUsuario(user).length;
  if (n === 0) return 'Sin vincular';
  if (n === 1) return '1 equipo vinculado';
  return `${n} equipos vinculados`;
}
