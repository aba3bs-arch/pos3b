import React, { useCallback, useEffect, useState } from 'react';
import {
  enviarNotificacionPrueba,
  notificacionesDispositivoDisponibles,
  permisoNotificacionesDispositivo,
  registrarServiceWorkerNotificaciones,
  solicitarPermisoNotificacionesDispositivo,
} from '../lib/notificacionesDispositivo.js';

export default function BotonActivarNotificaciones() {
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

  if (!notificacionesDispositivoDisponibles()) return null;

  const activar = async () => {
    const r = await solicitarPermisoNotificacionesDispositivo();
    setPermiso(r);
    if (r === 'granted') {
      await enviarNotificacionPrueba();
      alert('Alertas activadas. Revise la bandeja de notificaciones del celular.');
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
        onClick={() => void enviarNotificacionPrueba()}
        title="Probar alerta del dispositivo"
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
