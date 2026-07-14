import { obtenerIdDispositivoLocal } from './dispositivoUsuario.js';
import { puedeRecibirNotificacionesDispositivo, registrarServiceWorkerNotificaciones } from './notificacionesDispositivo.js';

export const AVISO_SIN_TABLA_PUSH =
  'Falta la tabla pos_push_subscriptions. Ejecuta supabase/fix_push_subscriptions.sql';

export function vapidPublicKey() {
  try {
    return String(import.meta.env?.VITE_VAPID_PUBLIC_KEY || '').trim();
  } catch {
    return '';
  }
}

export function webPushDisponible() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(vapidPublicKey())
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function faltaTablaPush(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('pos_push_subscriptions') ||
    (msg.includes('schema cache') && msg.includes('push'))
  );
}

/**
 * Registra este dispositivo para Web Push (Admin/Gerente).
 * Requiere permiso Notification = granted y VITE_VAPID_PUBLIC_KEY.
 */
export async function suscribirWebPush(supabase, { usuarioNombre, usuarioId, rol } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!puedeRecibirNotificacionesDispositivo(rol)) {
    return { ok: false, skipped: true, error: 'Solo Administrador o Gerente.' };
  }
  if (!webPushDisponible()) {
    return {
      ok: false,
      skipped: true,
      error: vapidPublicKey()
        ? 'Este navegador no soporta Web Push.'
        : 'Falta VITE_VAPID_PUBLIC_KEY en el entorno (ver supabase/web_push_setup.md).',
    };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, error: 'Permiso de notificaciones no concedido.' };
  }

  const reg = await registrarServiceWorkerNotificaciones();
  if (!reg) return { ok: false, error: 'No se pudo registrar el service worker.' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()),
      });
    } catch (e) {
      return { ok: false, error: e?.message || 'No se pudo suscribir al push.' };
    }
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Suscripción incompleta.' };
  }

  const row = {
    endpoint,
    p256dh,
    auth,
    usuario_nombre: String(usuarioNombre || '').trim() || null,
    usuario_id: usuarioId != null ? String(usuarioId) : null,
    rol: String(rol || '').trim() || null,
    dispositivo_id: obtenerIdDispositivoLocal(),
    user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 280) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('pos_push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if (error) {
    if (faltaTablaPush(error)) return { ok: false, error: AVISO_SIN_TABLA_PUSH, sinTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, endpoint };
}

/** Invoca Edge Function enviar-push (no bloquea al usuario si falla). */
export async function dispararPushRemoto(supabase, { titulo, mensaje, id, tipo } = {}) {
  if (!supabase || !vapidPublicKey()) return { ok: false, skipped: true };
  try {
    const { data, error } = await supabase.functions.invoke('enviar-push', {
      body: {
        titulo: titulo || 'POS 3B',
        mensaje: mensaje || '',
        id: id || null,
        tipo: tipo || null,
      },
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
