import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { rolSistemaEfectivo } from './roles.js';
import { normalizarPinComparacion } from './cubreTurno.js';
import { usuarioEstaActivo } from './usuariosAuth.js';

export const LS_AUTORIZACION_TURNO_FH = 'pos3b_autorizacion_turno_fh';
export const DURACION_AUTORIZACION_TURNO_MS = 8 * 60 * 60 * 1000;

export const AVISO_FALTA_AUTORIZACION_TURNO_FH =
  'Ejecuta supabase/fix_autorizacion_turno_fuera_horario.sql para autorizar entrada fuera de horario desde el panel admin (nube).';

/** Roles que pueden autorizar entrada fuera de horario (login / checador). */
export function rolPuedeAutorizarFueraHorario(rol) {
  const r = rolSistemaEfectivo(rol);
  return r === 'Administrador' || r === 'Gerente';
}

function claveAutorizacion(usuarioId, sucursal) {
  return `${String(usuarioId)}|${normalizarCodigoTienda(sucursal)}`;
}

function limpiarExpiradas(lista, ahora = Date.now()) {
  return (lista || []).filter((a) => a.expiraEn > ahora);
}

function faltaTablaAuthFh(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('pos_autorizacion_turno_fh') ||
    (msg.includes('schema cache') && msg.includes('autorizacion_turno'))
  );
}

export function leerAutorizacionesTurnoFueraHorario() {
  try {
    const raw = localStorage.getItem(LS_AUTORIZACION_TURNO_FH);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const vigentes = limpiarExpiradas(list);
    if (vigentes.length !== list.length) {
      localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(vigentes));
    }
    return vigentes;
  } catch {
    return [];
  }
}

function escribirAutorizacionesLocal(lista) {
  localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(limpiarExpiradas(lista)));
}

export function tieneAutorizacionFueraHorario(user, sucursal, date = new Date()) {
  if (!user?.id || !sucursal) return false;
  const clave = claveAutorizacion(user.id, sucursal);
  const ahora = date.getTime();
  return leerAutorizacionesTurnoFueraHorario().some((a) => a.clave === clave && a.expiraEn > ahora);
}

/**
 * Otorga autorización local (+ nube si hay supabase).
 * Vigente 8 h en esa tienda para ese cajero.
 */
export async function otorgarAutorizacionFueraHorario({
  usuarioId,
  sucursal,
  admin,
  duracionMs = DURACION_AUTORIZACION_TURNO_MS,
  supabase = null,
} = {}) {
  if (!usuarioId || !sucursal || !admin?.id) return null;
  const ahora = Date.now();
  const expiraEn = ahora + Math.max(15 * 60 * 1000, duracionMs);
  const sid = normalizarCodigoTienda(sucursal);
  const entry = {
    clave: claveAutorizacion(usuarioId, sid),
    usuarioId: String(usuarioId),
    sucursal: sid,
    adminId: String(admin.id),
    adminNombre: String(admin.nombre || 'Administrador'),
    otorgadoEn: ahora,
    expiraEn,
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  escribirAutorizacionesLocal(next);

  if (supabase) {
    const row = {
      usuario_id: String(usuarioId),
      sucursal_id: sid,
      admin_id: String(admin.id),
      admin_nombre: String(admin.nombre || 'Administrador'),
      otorgado_en: new Date(ahora).toISOString(),
      expira_en: new Date(expiraEn).toISOString(),
    };
    const { error } = await supabase
      .from('pos_autorizacion_turno_fh')
      .upsert(row, { onConflict: 'usuario_id,sucursal_id' });
    if (error && !faltaTablaAuthFh(error)) {
      console.warn('autorizacion turno FH nube:', error.message);
    }
  }
  return entry;
}

export function revocarAutorizacionFueraHorario(usuarioId, sucursal) {
  const clave = claveAutorizacion(usuarioId, sucursal);
  const next = leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== clave);
  escribirAutorizacionesLocal(next);
}

/** Revoca en local + nube. */
export async function revocarAutorizacionFueraHorarioNube(supabase, usuarioId, sucursal) {
  revocarAutorizacionFueraHorario(usuarioId, sucursal);
  if (!supabase || !usuarioId || !sucursal) return { ok: true };
  const sid = normalizarCodigoTienda(sucursal);
  const { error } = await supabase
    .from('pos_autorizacion_turno_fh')
    .delete()
    .eq('usuario_id', String(usuarioId))
    .eq('sucursal_id', sid);
  if (error && faltaTablaAuthFh(error)) {
    return { ok: true, aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Trae autorización vigente de la nube al local (antes de validar login).
 */
export async function sincronizarAutorizacionFueraHorarioDesdeNube(supabase, usuarioId, sucursal) {
  if (!supabase || !usuarioId || !sucursal) return { ok: true, vigente: false };
  const sid = normalizarCodigoTienda(sucursal);
  const ahoraIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .eq('usuario_id', String(usuarioId))
    .eq('sucursal_id', sid)
    .gt('expira_en', ahoraIso)
    .maybeSingle();
  if (error) {
    if (faltaTablaAuthFh(error)) return { ok: true, vigente: false, aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
    return { ok: false, error: error.message, vigente: false };
  }
  if (!data) return { ok: true, vigente: false };
  const entry = {
    clave: claveAutorizacion(data.usuario_id, data.sucursal_id),
    usuarioId: String(data.usuario_id),
    sucursal: normalizarCodigoTienda(data.sucursal_id),
    adminId: String(data.admin_id || ''),
    adminNombre: String(data.admin_nombre || 'Administrador'),
    otorgadoEn: new Date(data.otorgado_en).getTime(),
    expiraEn: new Date(data.expira_en).getTime(),
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  escribirAutorizacionesLocal(next);
  return { ok: true, vigente: true, entry };
}

/** Lista autorizaciones vigentes (panel admin). */
export async function listarAutorizacionesFueraHorarioVigentes(supabase, { sucursal = null } = {}) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  const ahoraIso = new Date().toISOString();
  let q = supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .gt('expira_en', ahoraIso)
    .order('expira_en', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(sucursal));
  const { data, error } = await q;
  if (error) {
    if (faltaTablaAuthFh(error)) return { ok: true, data: [], aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: data || [] };
}

/** Busca administrador/gerente por PIN en cualquier sucursal (para autorizar fuera de horario). */
export async function verificarPinAdministradorGlobal(supabase, pin) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const p = normalizarPinComparacion(pin);
  if (!p) return { ok: false, error: 'Indica el PIN del administrador.' };

  const { data, error } = await supabase.from('usuarios').select('*').eq('pin', p);
  if (error) return { ok: false, error: error.message };

  const lista = (data || []).filter(usuarioEstaActivo);
  if (!lista.length) {
    const algunoBaja = (data || []).some((u) => u && !usuarioEstaActivo(u));
    if (algunoBaja) return { ok: false, error: 'Ese usuario está dado de baja.' };
    return { ok: false, error: 'PIN incorrecto.' };
  }

  // Incluye roles personalizados con plantilla Administrador/Gerente.
  const autorizadores = lista.filter((u) => rolPuedeAutorizarFueraHorario(u.rol));
  if (!autorizadores.length) {
    return { ok: false, error: 'Solo un administrador o gerente puede autorizar la entrada.' };
  }
  // Preferir Administrador (sistema) sobre Gerente si hay varios con el mismo PIN.
  const admin = autorizadores.find((u) => rolSistemaEfectivo(u.rol) === 'Administrador') || autorizadores[0];
  return { ok: true, user: admin, nombre: admin.nombre };
}

export function etiquetaAutorizacionActiva(user, sucursal) {
  if (!tieneAutorizacionFueraHorario(user, sucursal)) return null;
  const clave = claveAutorizacion(user.id, sucursal);
  const entry = leerAutorizacionesTurnoFueraHorario().find((a) => a.clave === clave);
  if (!entry) return null;
  const restante = Math.max(0, entry.expiraEn - Date.now());
  const horas = Math.floor(restante / (60 * 60 * 1000));
  const mins = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
  const vigencia = horas > 0 ? `${horas} h ${mins} min` : `${mins} min`;
  return `Entrada autorizada por ${entry.adminNombre} (vigente ${vigencia} más)`;
}
