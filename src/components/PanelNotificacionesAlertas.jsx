import React, { useCallback, useEffect, useState } from 'react';
import {
  detectarIos,
  detectarMobile,
  enviarNotificacionPrueba,
  esPwaInstalada,
  notificacionesDispositivoDisponibles,
  permisoNotificacionesDispositivo,
  registrarServiceWorkerNotificaciones,
  solicitarPermisoNotificacionesDispositivo,
} from '../lib/notificacionesDispositivo.js';

function etiquetaPermiso(p) {
  if (p === 'granted') return { txt: 'Activadas', color: 'var(--brand-green)' };
  if (p === 'denied') return { txt: 'Bloqueadas por el navegador', color: 'var(--brand-red)' };
  if (p === 'unsupported') return { txt: 'No soportadas en este navegador', color: 'var(--muted)' };
  return { txt: 'Sin activar', color: 'var(--brand-gold-dark)' };
}

export default function PanelNotificacionesAlertas() {
  const [permiso, setPermiso] = useState(() => permisoNotificacionesDispositivo());
  const [swOk, setSwOk] = useState(false);
  const esIos = detectarIos();
  const esMobile = detectarMobile();
  const pwa = esPwaInstalada();

  const refrescar = useCallback(() => {
    setPermiso(permisoNotificacionesDispositivo());
  }, []);

  useEffect(() => {
    refrescar();
    void registrarServiceWorkerNotificaciones().then((r) => setSwOk(Boolean(r)));
    const iv = setInterval(refrescar, 4_000);
    return () => clearInterval(iv);
  }, [refrescar]);

  if (!notificacionesDispositivoDisponibles()) {
    return (
      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Alertas del dispositivo</h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Este navegador no soporta notificaciones. Use Chrome en Android o Safari en iPhone (app instalada en pantalla de inicio).
        </p>
      </div>
    );
  }

  const estado = etiquetaPermiso(permiso);

  const activar = async () => {
    const r = await solicitarPermisoNotificacionesDispositivo();
    setPermiso(r);
    if (r === 'granted') {
      await enviarNotificacionPrueba();
      alert('Alertas activadas. Debería haber aparecido una notificación de prueba.');
    } else if (r === 'denied') {
      alert(
        'El navegador bloqueó las alertas.\n\nAndroid (Chrome): ⋮ → Configuración del sitio → Notificaciones → Permitir.\n\niPhone: Ajustes → Safari → Sitios web → Notificaciones, o instale la app en pantalla de inicio y actívelas desde ahí.',
      );
    }
  };

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Alertas del dispositivo</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Reciba en el celular avisos de vales, préstamos, consumos e incidencias pendientes. Solo <strong>Administrador</strong> y <strong>Gerente</strong>.
        Esto <strong>no</strong> es la configuración del módulo Configuración del menú en general: aquí se activa el permiso del navegador.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span className="badge" style={{ fontWeight: 700, color: estado.color }}>
          Estado: {estado.txt}
        </span>
        {swOk && <span className="muted" style={{ fontSize: '0.78rem' }}>Service worker OK</span>}
        {pwa && <span className="badge" style={{ background: 'rgba(46,125,50,0.12)', color: 'var(--brand-green)' }}>App instalada</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {permiso !== 'granted' && (
          <button type="button" className="btn btn-gold" onClick={activar}>
            🔔 Activar alertas en este dispositivo
          </button>
        )}
        {permiso === 'granted' && (
          <button type="button" className="btn btn-ghost" onClick={() => void enviarNotificacionPrueba()}>
            Probar notificación
          </button>
        )}
      </div>

      {esMobile && (
        <div style={{ padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)', fontSize: '0.82rem' }}>
          <strong>Importante en celular</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
            <li>La pestaña del POS debe estar abierta (o la app instalada en segundo plano). Si cierra por completo el navegador, dejan de llegar hasta volver a entrar.</li>
            {esIos && !pwa && (
              <li>
                <strong>iPhone:</strong> en Safari toque <strong>Compartir → Añadir a pantalla de inicio</strong>, abra el POS desde ese icono y luego active las alertas aquí.
              </li>
            )}
            {esIos && pwa && permiso !== 'granted' && (
              <li>Abrió la app instalada: pulse <strong>Activar alertas</strong> y acepte el permiso del sistema.</li>
            )}
            {!esIos && permiso === 'denied' && (
              <li>Chrome → menú ⋮ → <strong>Configuración del sitio</strong> → Notificaciones → <strong>Permitir</strong>, luego recargue.</li>
            )}
          </ul>
        </div>
      )}

      <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.78rem' }}>
        También puede usar el botón 🔔 en la barra superior al iniciar sesión. En Supabase ejecute <code>fix_notificaciones_realtime.sql</code> para alertas instantáneas (sin eso hay revisión cada ~8 s).
      </p>
    </div>
  );
}
