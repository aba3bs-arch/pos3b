/**
 * Solicitud de más tiempo / entrada fuera de horario.
 * Empleado pide desde login (o al vencer el turno) → notificación → admin aprueba
 * en overlay flotante con PIN y elige 2 / 4 / 6 / 8 / 12 horas.
 */

import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  crearNotificacion,
  marcarNotificacionAtendida,
  TIPOS_NOTIF,
} from './contabilidadNotificaciones.js';
import {
  otorgarAutorizacionFueraHorario,
  verificarPinAdministradorGlobal,
} from './autorizacionTurnoFueraHorario.js';
import { auditarPinAdmin } from './auditoriaUso.js';

export const AVISO_FALTA_SOLICITUD_EXTENSION =
  'Falta la tabla de solicitudes de tiempo. Ejecuta supabase/fix_solicitud_extension_turno.sql';

/** Horas que el admin puede otorgar desde el overlay. */
export const HORAS_EXTENSION_OPCIONES = [2, 4, 6, 8, 12];

export const REF_TABLA_SOLICITUD_EXTENSION = 'pos_solicitud_extension_turno';

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || m.includes('pos_solicitud_extension_turno')
    || (m.includes('schema cache') && m.includes('solicitud_extension'))
  );
}

function roundHoras(h) {
  const n = parseInt(h, 10);
  if (!HORAS_EXTENSION_OPCIONES.includes(n)) return null;
  return n;
}

/**
 * Empleado solicita más tiempo. Crea fila + notificación para admin/gerente.
 */
export async function solicitarExtensionTurno(supabase, {
  usuario,
  sucursal,
  origen = 'login',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!usuario?.id) return { ok: false, error: 'Sin empleado.' };
  const suc = normalizarCodigoTienda(sucursal) || String(sucursal || '').trim();
  if (!suc) return { ok: false, error: 'Sin tienda.' };

  // Evitar spam: si ya hay pendiente para este usuario+tienda, reutilizar.
  const { data: prev, error: errPrev } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .select('*')
    .eq('usuario_id', String(usuario.id))
    .eq('sucursal_id', suc)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errPrev && faltaTabla(errPrev)) {
    return { ok: false, error: AVISO_FALTA_SOLICITUD_EXTENSION, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  }
  if (errPrev) return { ok: false, error: errPrev.message };

  if (prev?.id) {
    return {
      ok: true,
      data: prev,
      reutilizada: true,
      mensaje: 'Ya hay una solicitud pendiente. Espera a que un administrador la apruebe en su celular.',
    };
  }

  const row = {
    usuario_id: String(usuario.id),
    usuario_nombre: String(usuario.nombre || 'Empleado'),
    usuario_rol: usuario.rol ? String(usuario.rol) : null,
    sucursal_id: suc,
    origen: String(origen || 'login').slice(0, 40),
    estado: 'pendiente',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .insert([row])
    .select('*')
    .single();

  if (error && faltaTabla(error)) {
    return { ok: false, error: AVISO_FALTA_SOLICITUD_EXTENSION, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  }
  if (error) return { ok: false, error: error.message };

  const notif = await crearNotificacion(supabase, {
    sucursal_id: suc,
    tipo: TIPOS_NOTIF.EXTENSION_TURNO_PIN,
    ref_tabla: REF_TABLA_SOLICITUD_EXTENSION,
    ref_id: data.id,
    titulo: `Más tiempo · ${row.usuario_nombre} · ${etiquetaTienda(suc)}`,
    mensaje:
      `${row.usuario_nombre}${row.usuario_rol ? ` (${row.usuario_rol})` : ''} solicita entrar `
      + `fuera de horario en ${etiquetaTienda(suc)}.\n`
      + 'Aprueba con tu PIN y elige 2, 4, 6, 8 o 12 horas.',
  });

  return {
    ok: true,
    data,
    notificacionId: notif?.id || null,
    aviso: notif?.aviso || null,
    mensaje: 'Solicitud enviada. Un administrador puede aprobarla desde su celular.',
  };
}

export async function obtenerSolicitudExtension(supabase, id) {
  if (!supabase || !id) return { data: null };
  const { data, error } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  if (error) return { data: null, error: error.message };
  return { data };
}

/** Estado de la solicitud pendiente del empleado (login esperando). */
export async function estadoSolicitudExtensionEmpleado(supabase, { usuarioId, sucursal } = {}) {
  if (!supabase || !usuarioId || !sucursal) return { data: null };
  const suc = normalizarCodigoTienda(sucursal);
  const { data, error } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .select('*')
    .eq('usuario_id', String(usuarioId))
    .eq('sucursal_id', suc)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  if (error) return { data: null, error: error.message };
  return { data };
}

/**
 * Admin/gerente aprueba con PIN y elige horas (2–12).
 * Otorga autorización en pos_autorizacion_turno_fh (nube + local del admin).
 */
export async function aprobarExtensionTurnoConPin(supabase, {
  solicitudId,
  pin,
  horas,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const hrs = roundHoras(horas);
  if (!hrs) return { ok: false, error: 'Elige 2, 4, 6, 8 o 12 horas.' };

  const auth = await verificarPinAdministradorGlobal(supabase, pin);
  if (!auth.ok) return { ok: false, error: auth.error || 'PIN incorrecto.' };

  const { data: sol, error: errSol } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (errSol && faltaTabla(errSol)) {
    return { ok: false, error: AVISO_FALTA_SOLICITUD_EXTENSION, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  }
  if (errSol) return { ok: false, error: errSol.message };
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.estado !== 'pendiente') {
    return { ok: false, error: `La solicitud ya está ${sol.estado}.` };
  }

  const duracionMs = hrs * 60 * 60 * 1000;
  const entry = await otorgarAutorizacionFueraHorario({
    usuarioId: sol.usuario_id,
    sucursal: sol.sucursal_id,
    admin: auth.user,
    duracionMs,
    supabase,
  });
  if (!entry) return { ok: false, error: 'No se pudo otorgar la autorización.' };

  const ahora = new Date().toISOString();
  const { error: errUp } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .update({
      estado: 'aprobada',
      horas_otorgadas: hrs,
      admin_id: String(auth.user.id),
      admin_nombre: String(auth.user.nombre || 'Administrador'),
      updated_at: ahora,
      atendida_at: ahora,
    })
    .eq('id', solicitudId)
    .eq('estado', 'pendiente');
  if (errUp) return { ok: false, error: errUp.message };

  await marcarNotificacionAtendida(
    supabase,
    REF_TABLA_SOLICITUD_EXTENSION,
    solicitudId,
    auth.user.nombre || auth.user.id,
  );

  void auditarPinAdmin(supabase, {
    admin: auth.user,
    usuarioObjetivo: { id: sol.usuario_id, nombre: sol.usuario_nombre },
    sucursal: sol.sucursal_id,
    motivo: `extension_turno_${hrs}h`,
  });

  return {
    ok: true,
    horas: hrs,
    admin: auth.user.nombre || 'Administrador',
    usuarioNombre: sol.usuario_nombre,
    sucursal: sol.sucursal_id,
    entry,
  };
}

export async function rechazarExtensionTurnoConPin(supabase, {
  solicitudId,
  pin,
  motivo = '',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!solicitudId) return { ok: false, error: 'Solicitud inválida.' };

  const auth = await verificarPinAdministradorGlobal(supabase, pin);
  if (!auth.ok) return { ok: false, error: auth.error || 'PIN incorrecto.' };

  const { data: sol, error: errSol } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (errSol && faltaTabla(errSol)) {
    return { ok: false, error: AVISO_FALTA_SOLICITUD_EXTENSION, aviso: AVISO_FALTA_SOLICITUD_EXTENSION };
  }
  if (errSol) return { ok: false, error: errSol.message };
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.estado !== 'pendiente') {
    return { ok: false, error: `La solicitud ya está ${sol.estado}.` };
  }

  const ahora = new Date().toISOString();
  const { error: errUp } = await supabase
    .from(REF_TABLA_SOLICITUD_EXTENSION)
    .update({
      estado: 'rechazada',
      admin_id: String(auth.user.id),
      admin_nombre: String(auth.user.nombre || 'Administrador'),
      motivo_rechazo: String(motivo || '').trim() || null,
      updated_at: ahora,
      atendida_at: ahora,
    })
    .eq('id', solicitudId)
    .eq('estado', 'pendiente');
  if (errUp) return { ok: false, error: errUp.message };

  await marcarNotificacionAtendida(
    supabase,
    REF_TABLA_SOLICITUD_EXTENSION,
    solicitudId,
    auth.user.nombre || auth.user.id,
  );

  return { ok: true, admin: auth.user.nombre || 'Administrador' };
}
