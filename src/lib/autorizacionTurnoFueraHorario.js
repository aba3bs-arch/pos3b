import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';

export const LS_AUTORIZACION_TURNO_FH = 'pos3b_autorizacion_turno_fh';
export const DURACION_AUTORIZACION_TURNO_MS = 8 * 60 * 60 * 1000;

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

/** Busca administrador por PIN en cualquier sucursal (para autorizar fuera de horario). */
export async function verificarPinAdministradorGlobal(supabase, pin) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const p = String(pin || '').trim();
  if (!p) return { ok: false, error: 'Indica el PIN del administrador.' };

  const { data, error } = await supabase.from('usuarios').select('*').eq('pin', p);
  if (error) return { ok: false, error: error.message };

  const admins = (data || []).filter((u) => normalizarRol(u.rol) === 'Administrador');
  if (!admins.length) return { ok: false, error: 'Solo un administrador puede autorizar la entrada.' };
  // Varios admins pueden compartir PIN en seeds antiguos: toma el primero (login ya prioriza tienda/MAIN).
  return { ok: true, user: admins[0], nombre: admins[0].nombre };
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
