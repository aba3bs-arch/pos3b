/* Service worker: alertas locales + Web Push (app cerrada). */
self.addEventListener('push', (event) => {
  let data = {
    titulo: 'POS 3B',
    mensaje: 'Tienes una notificación pendiente.',
    tag: `pos3b-${Date.now()}`,
    id: null,
    tipo: null,
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

  const titulo = data.titulo || 'POS 3B';
  const options = {
    body: data.mensaje || '',
    tag: data.tag || (data.id ? `pos3b-${data.id}` : `pos3b-${Date.now()}`),
    icon: '/logo.svg',
    badge: '/logo.svg',
    requireInteraction: true,
    data: {
      id: data.id,
      tipo: data.tipo,
      url: '/',
    },
  };

  event.waitUntil(self.registration.showNotification(titulo, options));
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
