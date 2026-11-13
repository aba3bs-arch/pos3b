import { equivalentesCodigoTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
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

/** Copia en memoria: si localStorage está lleno, la caja igual puede entrar. */
const memoriaAutorizaciones = new Map();

function limpiarExpiradas(lista, ahora = Date.now()) {
  return (lista || []).filter((a) => a.expiraEn > ahora);
}

function recordarEnMemoria(entry) {
  if (!entry?.clave || !(entry.expiraEn > Date.now())) return;
  memoriaAutorizaciones.set(entry.clave, entry);
}

/**
 * El servidor ya dijo que la fila sigue vigente (`expira_en > now()` de Postgres).
 * Si el reloj de la caja va adelantado, `expira_en` queda en el pasado local y
 * la autorización se borraba al guardarla: el empleado no podía entrar.
 * En ese caso se ancla la duración original al reloj de esta caja.
 */
export function expiracionLocalDesdeServidor(otorgadoEn, expiraEn, ahora = Date.now()) {
  const otorgado = Number(otorgadoEn);
  const expira = Number(expiraEn);
  if (!Number.isFinite(expira)) return ahora + 60 * 60 * 1000;
  if (expira > ahora) return expira;
  const duracion = Number.isFinite(otorgado) && expira > otorgado
    ? expira - otorgado
    : 60 * 60 * 1000;
  const acotada = Math.min(Math.max(duracion, 60 * 1000), 12 * 60 * 60 * 1000);
  return ahora + acotada;
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
    for (const a of vigentes) recordarEnMemoria(a);
    if (vigentes.length !== list.length) {
      try {
        localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(vigentes));
      } catch {
        /* cuota llena: la copia en memoria sigue valiendo */
      }
    }
    return vigentes;
  } catch {
    return [];
  }
}

function escribirAutorizacionesLocal(lista) {
  const vigentes = limpiarExpiradas(lista);
  for (const a of vigentes) recordarEnMemoria(a);
  try {
    localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(vigentes));
  } catch {
    /* cuota llena */
  }
}

export function tieneAutorizacionFueraHorario(user, sucursal, date = new Date()) {
  if (!user?.id || !sucursal) return false;
  const clave = claveAutorizacion(user.id, sucursal);
  const ahora = date.getTime();
  const mem = memoriaAutorizaciones.get(clave);
  if (mem && mem.expiraEn > ahora) return true;
  return leerAutorizacionesTurnoFueraHorario().some((a) => a.clave === clave && a.expiraEn > ahora);
}

/**
 * Otorga autorización local (+ nube si hay supabase).
 * Duración por defecto 8 h; el overlay de solicitud puede pasar 2–12 h.
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
    if (error) {
      entry.errorNube = faltaTablaAuthFh(error) ? AVISO_FALTA_AUTORIZACION_TURNO_FH : error.message;
      if (!faltaTablaAuthFh(error)) console.warn('autorizacion turno FH nube:', error.message);
    }
  }
  return entry;
}

/** Deja la autorización en este equipo (memoria + localStorage) sin depender de la red. */
export function aplicarAutorizacionEnEquipo({
  usuarioId,
  sucursal,
  adminId = '',
  adminNombre = 'Administrador',
  otorgadoEn,
  expiraEn,
} = {}) {
  if (!usuarioId || !sucursal) return null;
  const sid = normalizarCodigoTienda(sucursal);
  const otorgado = Number(otorgadoEn) || Date.now();
  const entry = {
    clave: claveAutorizacion(usuarioId, sid),
    usuarioId: String(usuarioId),
    sucursal: sid,
    adminId: String(adminId || ''),
    adminNombre: String(adminNombre || 'Administrador'),
    otorgadoEn: otorgado,
    expiraEn: expiracionLocalDesdeServidor(otorgado, Number(expiraEn)),
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  escribirAutorizacionesLocal(next);
  return entry;
}

export function revocarAutorizacionFueraHorario(usuarioId, sucursal) {
  const clave = claveAutorizacion(usuarioId, sucursal);
  const next = leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== clave);
  escribirAutorizacionesLocal(next);
  // leer() vuelve a copiar la fila vieja a memoria; se borra después de reescribir.
  memoriaAutorizaciones.delete(clave);
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
  const variantes = equivalentesCodigoTienda(sid);
  // `now` lo evalúa Postgres, no el reloj de la caja (en Fusión iba adelantado y
  // la autorización recién aprobada ya parecía vencida).
  const { data, error } = await supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .eq('usuario_id', String(usuarioId))
    .in('sucursal_id', variantes.length ? variantes : [sid])
    .gt('expira_en', 'now')
    .order('expira_en', { ascending: false })
    .limit(1);
  if (error) {
    if (faltaTablaAuthFh(error)) return { ok: true, vigente: false, aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
    return { ok: false, error: error.message, vigente: false };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, vigente: false };
  const otorgadoEn = new Date(row.otorgado_en).getTime();
  const expiraServidor = new Date(row.expira_en).getTime();
  const entry = {
    clave: claveAutorizacion(row.usuario_id, row.sucursal_id),
    usuarioId: String(row.usuario_id),
    sucursal: normalizarCodigoTienda(row.sucursal_id),
    adminId: String(row.admin_id || ''),
    adminNombre: String(row.admin_nombre || 'Administrador'),
    otorgadoEn,
    expiraEn: expiracionLocalDesdeServidor(otorgadoEn, expiraServidor),
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  escribirAutorizacionesLocal(next);
  return { ok: true, vigente: true, entry };
}

/** Lista autorizaciones vigentes (panel admin). */
export async function listarAutorizacionesFueraHorarioVigentes(supabase, { sucursal = null } = {}) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  let q = supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .gt('expira_en', 'now')
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

  const variantes = new Set([p]);
  // Variantes frecuentes: ceros a la izquierda / sin ceros (seeds y cajas antiguas).
  if (/^\d+$/.test(p)) {
    const sinCeros = p.replace(/^0+/, '') || '0';
    variantes.add(sinCeros);
    if (p.length < 6) variantes.add(p.padStart(4, '0'));
  }

  let lista = [];
  let lastError = null;
  for (const candidato of variantes) {
    const { data, error } = await supabase.from('usuarios').select('*').eq('pin', candidato);
    if (error) {
      lastError = error;
      continue;
    }
    const hits = (data || []).filter(usuarioEstaActivo);
    if (hits.length) {
      lista = hits;
      break;
    }
    // Conservar inactivos solo si no hay activos en ninguna variante
    if (!lista.length && (data || []).length) lista = data || [];
  }

  if (lastError && !lista.length) return { ok: false, error: lastError.message };

  const activos = lista.filter(usuarioEstaActivo);
  if (!activos.length) {
    if (lista.length) return { ok: false, error: 'Ese usuario está dado de baja.' };
    return { ok: false, error: 'PIN incorrecto.' };
  }

  // Incluye roles personalizados con plantilla Administrador/Gerente.
  const autorizadores = activos.filter((u) => rolPuedeAutorizarFueraHorario(u.rol));
  if (!autorizadores.length) {
    return {
      ok: false,
      error: 'Solo un administrador o gerente puede autorizar la entrada. Verifica que tu usuario tenga ese rol.',
    };
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
