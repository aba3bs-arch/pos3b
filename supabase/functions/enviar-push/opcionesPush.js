/**
 * Opciones del Web Push de la alarma.
 * iPhone (Apple) usa Topic para reemplazar un aviso que sigue en cola.
 * Android (FCM) no entrega el push de asalto si va ese header; el resto de
 * avisos no lo manda y sí llegan.
 */

export function esEndpointAndroid(endpoint) {
  const e = String(endpoint || '').toLowerCase();
  return (
    e.includes('fcm.googleapis.com')
    || e.includes('android.googleapis.com')
    || e.includes('mtalk.google.com')
  );
}

export function opcionesEnvioPush(endpoint, esAsalto) {
  if (!esAsalto) return { TTL: 60 * 60 * 12, urgency: 'high' };
  const base = { TTL: 60 * 60 * 6, urgency: 'high' };
  if (esEndpointAndroid(endpoint)) return base;
  return { ...base, topic: 'asalto3b' };
}
