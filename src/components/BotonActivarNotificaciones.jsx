import React, { useCallback, useEffect, useState } from 'react';
import {
  enviarNotificacionPrueba,
  notificacionesDispositivoDisponibles,
  permisoNotificacionesDispositivo,
  registrarServiceWorkerNotificaciones,
  solicitarPermisoNotificacionesDispositivo,
} from '../lib/notificacionesDispositivo.js';
import { suscribirWebPush, vapidPublicKey, webPushDisponible } from '../lib/webPush.js';

export default function BotonActivarNotificaciones({ supabase, user }) {
  const [permiso, setPermiso] = useState(() => permisoNotificacionesDispositivo());

  const refrescar = useCallback(() => {
    setPermiso(permisoNotificacionesDispositivo());
  }, []);

  useEffect(() => {
    void registrarServiceWorkerNotificaciones();
    refrescar();
    const iv = setInterval(refrescar, 5_000);
    return () => clearInterval(iv);
  }, [refrescar]);

  // Si ya tenía permiso, re-suscribir push al entrar (renueva endpoint).
  useEffect(() => {
    if (!supabase || !user || permiso !== 'granted') return undefined;
    void suscribirWebPush(supabase, {
      usuarioNombre: user?.nombre,
      usuarioId: user?.id,
      rol: user?.rol,
    });
    return undefined;
  }, [supabase, user, permiso]);

  if (!notificacionesDispositivoDisponibles()) return null;

  const activar = async () => {
    const r = await solicitarPermisoNotificacionesDispositivo();
    setPermiso(r);
    if (r === 'granted') {
      const sub = await suscribirWebPush(supabase, {
        usuarioNombre: user?.nombre,
        usuarioId: user?.id,
        rol: user?.rol,
      });
      await enviarNotificacionPrueba(supabase);
      if (sub.sinTabla) {
        alert(sub.error);
      } else if (sub.ok) {
        alert(
          vapidPublicKey()
            ? 'Alertas activadas (incluye Web Push con la app cerrada). Revise la bandeja del celular.'
            : 'Alertas activadas en este dispositivo. Para avisos con la app cerrada configure VITE_VAPID_PUBLIC_KEY (ver supabase/web_push_setup.md).',
        );
      } else {
        alert(
          `Alertas del navegador activadas.${sub.error ? `\n\nPush remoto: ${sub.error}` : ''}`,
        );
      }
    } else if (r === 'denied') {
      alert(
        'Bloqueadas. Android: menú ⋮ → Configuración del sitio → Notificaciones → Permitir.\niPhone: instale la app en pantalla de inicio (Safari → Compartir) y actívelas en Configuración del POS.',
      );
    }
  };

  if (permiso === 'granted') {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => void enviarNotificacionPrueba(supabase)}
        title={webPushDisponible() ? 'Probar alerta (local + push remoto)' : 'Probar alerta del dispositivo'}
        style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
      >
        🔔 OK
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-gold"
      onClick={activar}
      title="Recibir alertas en el centro de notificaciones del dispositivo"
      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', whiteSpace: 'nowrap' }}
    >
      🔔 Activar alertas
    </button>
  );
}
