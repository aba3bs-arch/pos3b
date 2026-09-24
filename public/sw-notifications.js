/* Service worker: alertas locales + Web Push (app cerrada). */
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
  const titulo = data.titulo || 'POS 3B';
  const options = {
    body: data.mensaje || '',
    tag: data.tag || (data.id ? `pos3b-${data.id}` : `pos3b-${Date.now()}`),
    icon: '/logo.svg',
    badge: '/logo.svg',
    requireInteraction: data.requireInteraction !== false,
    silent: Boolean(data.silent),
    data: {
      id: data.id,
      tipo: data.tipo,
      url: '/',
      asalto: esAsalto,
    },
  };

  event.waitUntil(
    (async () => {
      // Avisar pestañas abiertas (sirena / overlay en MAIN) sin depender solo del OS.
      if (esAsalto) {
        try {
          const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of clientsList) {
            client.postMessage({
              type: 'pos3b-asalto-push',
              payload: {
                id: data.id,
                titulo,
                mensaje: data.mensaje,
                tipo: data.tipo || 'asalto_en_proceso',
              },
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
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'pos3b-notification-click',
            payload: event.notification.data || {},
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
