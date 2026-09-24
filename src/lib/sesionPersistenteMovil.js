/**
 * Sesión persistente en móvil para quien recibe alertas (admin / gerente / MAIN).
 * Así, al reabrir la PWA o el navegador, siguen logueados y pueden oír la alarma de asalto.
 * No guarda el PIN. Se limpia al pulsar «Cerrar sesión».
 */
import {
  detectarMobile,
  puedeRecibirNotificacionesDispositivo,
} from './notificacionesDispositivo.js';

export const LS_SESION_PERSISTENTE_MOVIL = 'pos3b_sesion_persistente_movil_v1';

const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 45; // 45 días

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** ¿Conviene guardar sesión en este dispositivo? */
export function convieneSesionPersistenteMovil(user) {
  if (!detectarMobile()) return false;
  if (!user || user.esCtMovil) return false;
  if (user.esCubreTurno || user.esSocio) return false;
  return puedeRecibirNotificacionesDispositivo(user);
}

export function leerSesionPersistenteMovil() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const data = safeParse(localStorage.getItem(LS_SESION_PERSISTENTE_MOVIL));
    if (!data?.user?.id || !data?.savedAt) return null;
    if (Date.now() - Number(data.savedAt) > MAX_AGE_MS) {
      limpiarSesionPersistenteMovil();
      return null;
    }
    if (!convieneSesionPersistenteMovil(data.user)) return null;
    return {
      user: data.user,
      sucursal: data.sucursal || null,
      vista: data.vista || 'Inicio',
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Guarda lo mínimo para restaurar UI (sin PIN).
 * @returns {{ ok: boolean, skipped?: boolean }}
 */
export function guardarSesionPersistenteMovil({ user, sucursal, vista } = {}) {
  if (typeof localStorage === 'undefined') return { ok: false, skipped: true };
  if (!convieneSesionPersistenteMovil(user)) {
    limpiarSesionPersistenteMovil();
    return { ok: false, skipped: true };
  }
  const slim = {
    id: user.id,
    nombre: user.nombre,
    rol: user.rol,
    sucursal_id: user.sucursal_id || null,
    tipo_empleado: user.tipo_empleado || null,
    telefono: user.telefono || null,
    // Flags útiles al restaurar (sin secretos)
    esCtMovil: false,
  };
  try {
    localStorage.setItem(
      LS_SESION_PERSISTENTE_MOVIL,
      JSON.stringify({
        user: slim,
        sucursal: sucursal || user.sucursal_id || 'MAIN',
        vista: vista || 'Inicio',
        savedAt: Date.now(),
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function limpiarSesionPersistenteMovil() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LS_SESION_PERSISTENTE_MOVIL);
  } catch {
    /* ignore */
  }
}

/** Actualiza solo la vista guardada (si hay sesión persistente). */
export function actualizarVistaSesionPersistenteMovil(vista) {
  const cur = leerSesionPersistenteMovil();
  if (!cur) return;
  guardarSesionPersistenteMovil({
    user: cur.user,
    sucursal: cur.sucursal,
    vista: vista || cur.vista,
  });
}
