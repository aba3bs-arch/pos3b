import { obtenerIdDispositivoLocal } from './dispositivoUsuario.js';
import { puedeRecibirNotificacionesDispositivo, registrarServiceWorkerNotificaciones } from './notificacionesDispositivo.js';
import { credencialesSupabasePublicas } from './supabase.js';

/** Reenvíos de la alarma por si el celular tenía la app cerrada y el primer push no se mostró. */
export const DEMORAS_REFUERZO_ASALTO_MS = [12_000, 35_000];

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
export async function suscribirWebPush(supabase, { usuarioNombre, usuarioId, rol, user } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const quien = user || { id: usuarioId, nombre: usuarioNombre, rol };
  if (!puedeRecibirNotificacionesDispositivo(quien)) {
    return { ok: false, skipped: true, error: 'Solo Administrador, Gerente o personal MAIN/indirecto.' };
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
    usuario_nombre: String(usuarioNombre || user?.nombre || '').trim() || null,
    usuario_id: (usuarioId != null ? String(usuarioId) : null) || (user?.id != null ? String(user.id) : null),
    rol: String(rol || user?.rol || '').trim() || null,
    dispositivo_id: obtenerIdDispositivoLocal(),
    user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 280) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('pos_push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  void publicarConfigPushEnServiceWorker({
    usuarioNombre: row.usuario_nombre,
    usuarioId: row.usuario_id,
    rol: row.rol,
    dispositivoId: row.dispositivo_id,
  });
  if (error) {
    if (faltaTablaPush(error)) return { ok: false, error: AVISO_SIN_TABLA_PUSH, sinTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, endpoint };
}

/**
 * Deja en el service worker la config para renovar la suscripción y revisar
 * alarmas aunque esta pestaña ya no esté abierta.
 */
export async function publicarConfigPushEnServiceWorker({
  usuarioNombre = null,
  usuarioId = null,
  rol = null,
  dispositivoId = null,
} = {}) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return { ok: false };
  const { url, key } = credencialesSupabasePublicas();
  if (!url || !key) return { ok: false, error: 'Sin credenciales de Supabase.' };
  try {
    const reg = await registrarServiceWorkerNotificaciones();
    const sw = reg?.active || navigator.serviceWorker.controller;
    if (!sw) return { ok: false, error: 'Service worker inactivo.' };
    sw.postMessage({
      type: 'pos3b-push-config',
      supabaseUrl: url,
      supabaseKey: key,
      vapidPublic: vapidPublicKey(),
      usuarioNombre,
      usuarioId,
      rol,
      dispositivoId: dispositivoId || obtenerIdDispositivoLocal(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Invoca Edge Function enviar-push.
 * No exige la clave VAPID en el build: suscribir sí la necesita, enviar la tiene el servidor.
 */
export async function dispararPushRemoto(supabase, {
  titulo,
  mensaje,
  id,
  tipo,
  usuarioIds = null,
  modo = null,
  sucursalId = null,
  excluirDispositivoId = null,
  refuerzo = false,
} = {}) {
  if (!supabase) return { ok: false, skipped: true, error: 'Sin conexión.' };
  try {
    const { data, error } = await supabase.functions.invoke('enviar-push', {
      body: {
        titulo: titulo || 'POS 3B',
        mensaje: mensaje || '',
        id: id || null,
        tipo: tipo || null,
        usuario_ids: Array.isArray(usuarioIds) ? usuarioIds.map(String) : null,
        modo: modo || null,
        sucursal_id: sucursalId != null ? String(sucursalId) : null,
        excluir_dispositivo_id: excluirDispositivoId != null ? String(excluirDispositivoId) : null,
        refuerzo: Boolean(refuerzo),
      },
    });
    if (error) return { ok: false, error: error.message || String(error), data: data || null };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

const refuerzosAsalto = new Map();

/** El servidor no tiene push configurado: reintentar no lo arregla. */
export function pushAsaltoSinReintento(res) {
  const err = String(res?.error || res?.data?.error || '');
  return /faltan secrets|vapid_private_key|function not found|failed to fetch the function/i.test(err);
}

/**
 * Vuelve a enviar la alarma a los 12 s y a los 35 s.
 * Si el celular tenía la app cerrada y el primer aviso no se mostró, el siguiente sí entra
 * (misma etiqueta: no se acumulan, vuelve a sonar).
 */
export function programarRefuerzoPushAsalto(supabase, payload, deps = {}) {
  if (!supabase || !payload) return { ok: false };
  const delays = deps.delays || DEMORAS_REFUERZO_ASALTO_MS;
  const enviar = deps.enviar || dispararPushRemoto;
  const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms));
  const clear = deps.clear || ((t) => clearTimeout(t));
  const clave = String(payload.id || payload.titulo || 'asalto');
  const prev = refuerzosAsalto.get(clave);
  if (prev) prev.forEach((t) => clear(t));
  const timers = delays.map((ms) => schedule(() => {
    void enviar(supabase, { ...payload, refuerzo: true, modo: payload.modo || 'asalto' });
  }, ms));
  refuerzosAsalto.set(clave, timers);
  return { ok: true, veces: timers.length };
}
