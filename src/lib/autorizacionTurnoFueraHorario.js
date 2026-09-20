import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { rolSistemaEfectivo } from './roles.js';
import { normalizarPinComparacion } from './cubreTurno.js';
import { usuarioEstaActivo } from './usuariosAuth.js';

export const LS_AUTORIZACION_TURNO_FH = 'pos3b_autorizacion_turno_fh';
export const DURACION_AUTORIZACION_TURNO_MS = 8 * 60 * 60 * 1000;

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

export function tieneAutorizacionFueraHorario(user, sucursal, date = new Date()) {
  if (!user?.id || !sucursal) return false;
  const clave = claveAutorizacion(user.id, sucursal);
  const ahora = date.getTime();
  return leerAutorizacionesTurnoFueraHorario().some((a) => a.clave === clave && a.expiraEn > ahora);
}

export function otorgarAutorizacionFueraHorario({ usuarioId, sucursal, admin, duracionMs = DURACION_AUTORIZACION_TURNO_MS }) {
  if (!usuarioId || !sucursal || !admin?.id) return null;
  const ahora = Date.now();
  const entry = {
    clave: claveAutorizacion(usuarioId, sucursal),
    usuarioId: String(usuarioId),
    sucursal: normalizarCodigoTienda(sucursal),
    adminId: String(admin.id),
    adminNombre: String(admin.nombre || 'Administrador'),
    otorgadoEn: ahora,
    expiraEn: ahora + Math.max(15 * 60 * 1000, duracionMs),
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(next));
  return entry;
}

export function revocarAutorizacionFueraHorario(usuarioId, sucursal) {
  const clave = claveAutorizacion(usuarioId, sucursal);
  const next = leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== clave);
  localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(next));
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
