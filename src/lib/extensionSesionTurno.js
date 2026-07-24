import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const LS_EXTENSION_SESION_TURNO = 'pos3b_extension_sesion_turno';
export const MINUTOS_EXTENSION_SESION = 30;
export const EVENTO_EXTENSION_SESION = 'pos3b-extension-sesion';

function claveExtension(usuarioId, sucursal) {
  return `${String(usuarioId)}|${normalizarCodigoTienda(sucursal)}`;
}

function emitirCambio() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_EXTENSION_SESION));
  } catch {
    /* ignore */
  }
}

function limpiarExpiradas(lista, ahora = Date.now()) {
  return (lista || []).filter((a) => a.expiraEn > ahora);
}

export function leerExtensionesSesionTurno() {
  try {
    const raw = localStorage.getItem(LS_EXTENSION_SESION_TURNO);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const vigentes = limpiarExpiradas(list);
    if (vigentes.length !== list.length) {
      localStorage.setItem(LS_EXTENSION_SESION_TURNO, JSON.stringify(vigentes));
    }
    return vigentes;
  } catch {
    return [];
  }
}

export function extensionSesionActiva(user, sucursal, date = new Date()) {
  if (!user?.id || !sucursal) return null;
  const clave = claveExtension(user.id, sucursal);
  const ahora = date.getTime();
  return leerExtensionesSesionTurno().find((a) => a.clave === clave && a.expiraEn > ahora) || null;
}

export function tieneExtensionSesionTurno(user, sucursal, date = new Date()) {
  return Boolean(extensionSesionActiva(user, sucursal, date));
}

/** Otorga o renueva +N minutos de sesión para terminar corte / entrega. */
export function otorgarExtensionSesionTurno({
  usuarioId,
  sucursal,
  minutos = MINUTOS_EXTENSION_SESION,
  turnoId = null,
}) {
  if (!usuarioId || !sucursal) return null;
  const ahora = Date.now();
  const mins = Math.min(180, Math.max(5, parseInt(minutos, 10) || MINUTOS_EXTENSION_SESION));
  const entry = {
    clave: claveExtension(usuarioId, sucursal),
    usuarioId: String(usuarioId),
    sucursal: normalizarCodigoTienda(sucursal),
    turnoId: turnoId ? String(turnoId) : null,
    otorgadoEn: ahora,
    minutos: mins,
    expiraEn: ahora + mins * 60 * 1000,
  };
  const next = [...leerExtensionesSesionTurno().filter((a) => a.clave !== entry.clave), entry];
  localStorage.setItem(LS_EXTENSION_SESION_TURNO, JSON.stringify(next));
  emitirCambio();
  return entry;
}

export function limpiarExtensionSesionTurno(usuarioId, sucursal) {
  if (!usuarioId || !sucursal) return;
  const clave = claveExtension(usuarioId, sucursal);
  const next = leerExtensionesSesionTurno().filter((a) => a.clave !== clave);
  localStorage.setItem(LS_EXTENSION_SESION_TURNO, JSON.stringify(next));
  emitirCambio();
}

export function minutosRestantesExtension(user, sucursal, date = new Date()) {
  const entry = extensionSesionActiva(user, sucursal, date);
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.expiraEn - date.getTime()) / 60000));
}
