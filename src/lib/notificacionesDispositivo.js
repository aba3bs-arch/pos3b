import { leerLogoUrl, leerNombreNegocio } from './branding.js';
import { normalizarRol } from './roles.js';

const notificacionesMostradas = new Set();

export function puedeRecibirNotificacionesDispositivo(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

export function permisoNotificacionesDispositivo() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function notificacionesDispositivoDisponibles() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function solicitarPermisoNotificacionesDispositivo() {
  if (!notificacionesDispositivoDisponibles()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function iconoNotificacion() {
  try {
    const logo = leerLogoUrl();
    if (logo && !logo.startsWith('data:')) return logo;
  } catch {
    /* ignore */
  }
  return '/logo.svg';
}

export function mostrarNotificacionDispositivo({ id, titulo, mensaje, onClick } = {}) {
  if (!notificacionesDispositivoDisponibles()) return false;
  if (Notification.permission !== 'granted') return false;

  const tag = id ? `pos3b-${id}` : `pos3b-${titulo}`;
  if (id && notificacionesMostradas.has(String(id))) return false;
  if (id) notificacionesMostradas.add(String(id));

  try {
    const n = new Notification(titulo || leerNombreNegocio(), {
      body: mensaje || '',
      tag,
      icon: iconoNotificacion(),
      badge: '/logo.svg',
      requireInteraction: true,
      silent: false,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      onClick?.();
      n.close();
    };
    return true;
  } catch {
    if (id) notificacionesMostradas.delete(String(id));
    return false;
  }
}

export function limpiarNotificacionesDispositivoMostradas() {
  notificacionesMostradas.clear();
}
