/* Service worker: alertas locales + Web Push (app cerrada). */
const ASALTO_PENDING_KEY = 'pos3b_asalto_pendiente_v1';

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

// La app pide el pendiente guardado en Cache (app cerrada → abrir por push).
self.addEventListener('message', (event) => {
  const msg = event?.data;
  if (!msg || msg.type !== 'pos3b-asalto-leer-pendiente') return;
  event.waitUntil(
    (async () => {
      let payload = null;
      try {
        const cache = await caches.open('pos3b-asalto-v1');
        const res = await cache.match('/__pos3b_asalto_pendiente__');
        if (res) payload = await res.json();
      } catch {
        /* ignore */
      }
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'pos3b-asalto-pendiente-cache', payload });
      }
    })(),
  );
});

// Evitar warning unused — clave documentada por si migramos a IDB.
void ASALTO_PENDING_KEY;
