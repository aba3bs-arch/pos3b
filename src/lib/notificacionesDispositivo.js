import { leerLogoUrl, leerNombreNegocio } from './branding.js';
import { normalizarRol } from './roles.js';

const notificacionesMostradas = new Set();
let swRegistroPromise = null;

export function detectarMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function detectarIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function esPwaInstalada() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

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

export async function registrarServiceWorkerNotificaciones() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (swRegistroPromise) return swRegistroPromise;
  swRegistroPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw-notifications.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return reg;
    } catch {
      swRegistroPromise = null;
      return null;
    }
  })();
  return swRegistroPromise;
}

export async function solicitarPermisoNotificacionesDispositivo() {
  if (!notificacionesDispositivoDisponibles()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    await registrarServiceWorkerNotificaciones();
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

async function mostrarViaServiceWorker({ tag, titulo, mensaje }) {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg?.showNotification) return false;
    await reg.showNotification(titulo || leerNombreNegocio(), {
      body: mensaje || '',
      tag,
      icon: iconoNotificacion(),
      badge: '/logo.svg',
      requireInteraction: true,
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function mostrarNotificacionDispositivo({ id, titulo, mensaje, onClick } = {}) {
  if (!notificacionesDispositivoDisponibles()) return false;
  if (Notification.permission !== 'granted') return false;

  const tag = id ? `pos3b-${id}` : `pos3b-${titulo}`;
  if (id && notificacionesMostradas.has(String(id))) return false;
  if (id) notificacionesMostradas.add(String(id));

  const opts = {
    tag,
    titulo: titulo || leerNombreNegocio(),
    mensaje: mensaje || '',
  };

  if (await mostrarViaServiceWorker(opts)) {
    return true;
  }

  try {
    const n = new Notification(opts.titulo, {
      body: opts.mensaje,
      tag: opts.tag,
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

export async function enviarNotificacionPrueba(supabase = null) {
  const okLocal = await mostrarNotificacionDispositivo({
    id: `prueba-${Date.now()}`,
    titulo: `${leerNombreNegocio()} — Prueba`,
    mensaje: 'Si ve esto, las alertas del dispositivo están funcionando.',
  });
  if (supabase) {
    try {
      const { dispararPushRemoto } = await import('./webPush.js');
      await dispararPushRemoto(supabase, {
        id: `prueba-push-${Date.now()}`,
        titulo: `${leerNombreNegocio()} — Prueba Push`,
        mensaje: 'Web Push activo: esta alerta también llega con la app cerrada.',
        tipo: 'prueba',
      });
    } catch {
      /* ignore */
    }
  }
  return okLocal;
}

export function limpiarNotificacionesDispositivoMostradas() {
  notificacionesMostradas.clear();
}

export function intervaloMonitorNotificacionesMs() {
  return detectarMobile() ? 8_000 : 12_000;
}
