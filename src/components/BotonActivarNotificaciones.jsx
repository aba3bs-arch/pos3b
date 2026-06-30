import React, { useCallback, useEffect, useState } from 'react';
import {
  notificacionesDispositivoDisponibles,
  permisoNotificacionesDispositivo,
  solicitarPermisoNotificacionesDispositivo,
} from '../lib/notificacionesDispositivo.js';

export default function BotonActivarNotificaciones() {
  const [permiso, setPermiso] = useState(() => permisoNotificacionesDispositivo());

  const refrescar = useCallback(() => {
    setPermiso(permisoNotificacionesDispositivo());
  }, []);

  useEffect(() => {
    refrescar();
    const iv = setInterval(refrescar, 5_000);
    return () => clearInterval(iv);
  }, [refrescar]);

  if (!notificacionesDispositivoDisponibles()) return null;
  if (permiso === 'granted') return null;

  const activar = async () => {
    const r = await solicitarPermisoNotificacionesDispositivo();
    setPermiso(r);
    if (r === 'granted') {
      alert('Alertas activadas. Recibirás notificaciones en este dispositivo cuando haya vales, préstamos o consumos pendientes.');
    } else if (r === 'denied') {
      alert(
        'El navegador bloqueó las notificaciones.\n\nEn Android/iPhone: Configuración del sitio → Notificaciones → Permitir.\nLuego recarga la página.',
      );
    }
  };

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
