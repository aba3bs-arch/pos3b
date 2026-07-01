/* Service worker mínimo para alertas nativas (requerido en iPhone al instalar la PWA). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
