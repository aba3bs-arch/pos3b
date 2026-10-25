/* Service worker: alertas locales + Web Push (app cerrada). */
const ASALTO_PENDING_KEY = 'pos3b_asalto_pendiente_v1';
const CONFIG_CACHE = 'pos3b-push-config-v1';
const CONFIG_URL = '/__pos3b_push_config__';
const ULTIMO_ASALTO_URL = '/__pos3b_asalto_ultimo__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function guardarAsaltoEnCache(payload) {
  try {
    const cache = await caches.open('pos3b-asalto-v1');
    const body = JSON.stringify({ ...payload, savedAt: Date.now() });
    await cache.put(
      new Request('/__pos3b_asalto_pendiente__'),
      new Response(body, { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch {
    /* ignore */
  }
}

self.addEventListener('push', (event) => {
  let data = {
    titulo: 'POS 3B',
    mensaje: 'Tienes una notificación pendiente.',
    tag: `pos3b-${Date.now()}`,
    id: null,
    tipo: null,
    requireInteraction: true,
    silent: false,
    asalto: false,
    sucursal_id: null,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const txt = event.data && event.data.text();
      if (txt) data.mensaje = txt;
    } catch {
      /* ignore */
    }
  }

  const esAsalto = Boolean(data.asalto || data.tipo === 'asalto_en_proceso');
  const titulo = esAsalto
    ? (data.titulo || 'ASALTO EN PROCESO')
    : (data.titulo || 'POS 3B');
  const openUrl = esAsalto ? '/?alerta=asalto' : '/';

  const options = {
    body: data.mensaje || '',
    tag: esAsalto
      ? (data.tag || (data.id ? `pos3b-asalto-${data.id}` : 'pos3b-asalto'))
      : (data.tag || (data.id ? `pos3b-${data.id}` : `pos3b-${Date.now()}`)),
    icon: '/logo-3b.png',
    badge: '/icons/icon-192.png',
    // Persistente: no se auto-oculta; hay que tocarla o descartarla.
    requireInteraction: esAsalto ? true : data.requireInteraction !== false,
    renotify: esAsalto,
    silent: Boolean(data.silent),
    vibrate: esAsalto ? [400, 200, 400, 200, 600] : undefined,
    actions: esAsalto
      ? [{ action: 'abrir', title: 'Abrir alerta' }]
      : undefined,
    data: {
      id: data.id,
      tipo: data.tipo,
      url: openUrl,
      asalto: esAsalto,
      sucursal_id: data.sucursal_id || null,
      titulo,
      mensaje: data.mensaje || '',
    },
  };

  event.waitUntil(
    (async () => {
      if (esAsalto) {
        const payload = {
          id: data.id,
          titulo,
          mensaje: data.mensaje,
          tipo: data.tipo || 'asalto_en_proceso',
          sucursal_id: data.sucursal_id || null,
          at: new Date().toISOString(),
        };
        await guardarAsaltoEnCache(payload);
        if (data.id) {
          await guardarJsonCache(CONFIG_CACHE, ULTIMO_ASALTO_URL, { id: String(data.id), at: Date.now() });
        }
        try {
          const clientsList = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of clientsList) {
            client.postMessage({
              type: 'pos3b-asalto-push',
              payload,
            });
          }
        } catch {
          /* ignore */
        }
      }
      await self.registration.showNotification(titulo, options);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const nData = event.notification.data || {};
  const esAsalto = Boolean(nData.asalto || nData.tipo === 'asalto_en_proceso');
  event.notification.close();

  const targetUrl = esAsalto
    ? (nData.url || '/?alerta=asalto')
    : (nData.url || '/');

  event.waitUntil(
    (async () => {
      if (esAsalto) {
        await guardarAsaltoEnCache({
          id: nData.id,
          titulo: nData.titulo || 'ASALTO EN PROCESO',
          mensaje: nData.mensaje || '',
          tipo: nData.tipo || 'asalto_en_proceso',
          sucursal_id: nData.sucursal_id || null,
          at: new Date().toISOString(),
        });
      }

      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: esAsalto ? 'pos3b-asalto-push' : 'pos3b-notification-click',
            payload: nData,
          });
          if (esAsalto && 'navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* ignore */
            }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })(),
  );
});

async function leerJsonCache(cacheName, url) {
  try {
    const cache = await caches.open(cacheName);
    const res = await cache.match(url);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function guardarJsonCache(cacheName, url, data) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(
      new Request(url),
      new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch {
    /* ignore */
  }
}

function claveAplicacion(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function guardarSuscripcionEnSupabase(cfg, sub) {
  const json = sub.toJSON ? sub.toJSON() : sub;
  const endpoint = json.endpoint;
  const p256dh = json.keys && json.keys.p256dh;
  const auth = json.keys && json.keys.auth;
  if (!cfg?.supabaseUrl || !cfg?.supabaseKey || !endpoint || !p256dh || !auth) return false;
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/pos_push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      endpoint,
      p256dh,
      auth,
      usuario_nombre: cfg.usuarioNombre || null,
      usuario_id: cfg.usuarioId || null,
      rol: cfg.rol || null,
      dispositivo_id: cfg.dispositivoId || null,
      user_agent: 'sw-renovacion',
      updated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

/**
 * Respaldo con la app cerrada: si el push no llegó, el sistema despierta al
 * service worker de vez en cuando y aquí se busca una alarma pendiente.
 */
async function revisarAsaltoPendiente() {
  const cfg = await leerJsonCache(CONFIG_CACHE, CONFIG_URL);
  if (!cfg?.supabaseUrl || !cfg?.supabaseKey) return;
  const desde = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const url = `${cfg.supabaseUrl}/rest/v1/contabilidad_notificaciones`
    + `?tipo=eq.asalto_en_proceso&estado=eq.pendiente&created_at=gte.${encodeURIComponent(desde)}`
    + '&order=created_at.desc&limit=1&select=id,titulo,mensaje,sucursal_id,created_at';
  let row = null;
  try {
    const res = await fetch(url, {
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
    });
    if (!res.ok) return;
    const rows = await res.json();
    row = Array.isArray(rows) ? rows[0] : null;
  } catch {
    return;
  }
  if (!row?.id) return;
  const ultimo = await leerJsonCache(CONFIG_CACHE, ULTIMO_ASALTO_URL);
  if (ultimo && String(ultimo.id) === String(row.id)) return;
  await guardarJsonCache(CONFIG_CACHE, ULTIMO_ASALTO_URL, { id: String(row.id), at: Date.now() });
  const payload = {
    id: row.id,
    titulo: row.titulo || 'ASALTO EN PROCESO',
    mensaje: row.mensaje || '',
    tipo: 'asalto_en_proceso',
    sucursal_id: row.sucursal_id || null,
    at: row.created_at || new Date().toISOString(),
  };
  await guardarAsaltoEnCache(payload);
  await self.registration.showNotification(payload.titulo, {
    body: payload.mensaje,
    tag: `pos3b-asalto-${row.id}`,
    icon: '/logo-3b.png',
    badge: '/icons/icon-192.png',
    requireInteraction: true,
    renotify: true,
    silent: false,
    vibrate: [400, 200, 400, 200, 600],
    data: { ...payload, asalto: true, url: '/?alerta=asalto' },
  });
}

async function registrarRevisionPeriodica() {
  try {
    if (!self.registration.periodicSync) return;
    await self.registration.periodicSync.register('pos3b-alarma-cerrada', {
      minInterval: 15 * 60 * 1000,
    });
  } catch {
    /* el navegador no dio permiso; el push sigue siendo la vía principal */
  }
}

// La app pide el pendiente, o deja la config para renovar el push con la app cerrada.
self.addEventListener('message', (event) => {
  const msg = event?.data;
  if (!msg) return;
  if (msg.type === 'pos3b-push-config') {
    event.waitUntil(
      (async () => {
        await guardarJsonCache(CONFIG_CACHE, CONFIG_URL, {
          supabaseUrl: msg.supabaseUrl || '',
          supabaseKey: msg.supabaseKey || '',
          vapidPublic: msg.vapidPublic || '',
          usuarioNombre: msg.usuarioNombre || null,
          usuarioId: msg.usuarioId || null,
          rol: msg.rol || null,
          dispositivoId: msg.dispositivoId || null,
        });
        await registrarRevisionPeriodica();
      })(),
    );
    return;
  }
  if (msg.type !== 'pos3b-asalto-leer-pendiente') return;
  event.waitUntil(
    (async () => {
      const payload = await leerJsonCache('pos3b-asalto-v1', '/__pos3b_asalto_pendiente__');
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'pos3b-asalto-pendiente-cache', payload });
      }
    })(),
  );
});

// Chrome rota la suscripción con la app cerrada. Sin esto el siguiente asalto no llega.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const cfg = await leerJsonCache(CONFIG_CACHE, CONFIG_URL);
      if (!cfg) return;
      let sub = event.newSubscription || null;
      if (!sub) {
        try {
          const key = cfg.vapidPublic ? claveAplicacion(cfg.vapidPublic) : undefined;
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        } catch {
          return;
        }
      }
      await guardarSuscripcionEnSupabase(cfg, sub);
    })(),
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'pos3b-alarma-cerrada') return;
  event.waitUntil(revisarAsaltoPendiente());
});

// Evitar warning unused — clave documentada por si migramos a IDB.
void ASALTO_PENDING_KEY;
