import { leerNombreNegocio } from './branding.js';
import { normalizarRol } from './roles.js';

const LS_PERMISO_SOLICITADO = 'pos3b_notif_permiso_solicitado';
const notificacionesMostradas = new Set();

export function puedeRecibirNotificacionesDispositivo(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

export function permisoNotificacionesDispositivo() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function solicitarPermisoNotificacionesDispositivo() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    localStorage.setItem(LS_PERMISO_SOLICITADO, '1');
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Solicita permiso una vez al iniciar sesión (admin/gerente). */
export function solicitarPermisoNotificacionesSiCorresponde(rol) {
  if (!puedeRecibirNotificacionesDispositivo(rol)) return;
  if (permisoNotificacionesDispositivo() !== 'default') return;
  if (localStorage.getItem(LS_PERMISO_SOLICITADO)) return;
  solicitarPermisoNotificacionesDispositivo();
}

export function mostrarNotificacionDispositivo({ id, titulo, mensaje, onClick } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const tag = id ? `pos3b-${id}` : `pos3b-${titulo}`;
  if (id && notificacionesMostradas.has(String(id))) return false;
  if (id) notificacionesMostradas.add(String(id));

  try {
    const n = new Notification(titulo || leerNombreNegocio(), {
      body: mensaje || '',
      tag,
      icon: '/favicon.ico',
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function limpiarNotificacionesDispositivoMostradas() {
  notificacionesMostradas.clear();
}
