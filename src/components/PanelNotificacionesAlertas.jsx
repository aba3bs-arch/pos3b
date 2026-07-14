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
import { suscribirWebPush, vapidPublicKey, webPushDisponible } from '../lib/webPush.js';

function etiquetaPermiso(p) {
  if (p === 'granted') return { txt: 'Activadas', color: 'var(--brand-green)' };
  if (p === 'denied') return { txt: 'Bloqueadas por el navegador', color: 'var(--brand-red)' };
  if (p === 'unsupported') return { txt: 'No soportadas en este navegador', color: 'var(--muted)' };
  return { txt: 'Sin activar', color: 'var(--brand-gold-dark)' };
}

export default function PanelNotificacionesAlertas({ supabase, user }) {
  const [permiso, setPermiso] = useState(() => permisoNotificacionesDispositivo());
  const [swOk, setSwOk] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const esIos = detectarIos();
  const esMobile = detectarMobile();
  const pwa = esPwaInstalada();
  const vapidOk = Boolean(vapidPublicKey());

  const refrescar = useCallback(() => {
    setPermiso(permisoNotificacionesDispositivo());
  }, []);

  useEffect(() => {
    refrescar();
    void registrarServiceWorkerNotificaciones().then((r) => setSwOk(Boolean(r)));
    const iv = setInterval(refrescar, 4_000);
    return () => clearInterval(iv);
  }, [refrescar]);

  useEffect(() => {
    if (!supabase || !user || permiso !== 'granted' || !vapidOk) return undefined;
    void suscribirWebPush(supabase, {
      usuarioNombre: user?.nombre,
      usuarioId: user?.id,
      rol: user?.rol,
    }).then((r) => {
      if (r.sinTabla) setPushMsg(r.error);
      else if (r.ok) setPushMsg('Web Push registrado en este dispositivo.');
      else if (r.error && !r.skipped) setPushMsg(r.error);
    });
    return undefined;
  }, [supabase, user, permiso, vapidOk]);

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
      const sub = await suscribirWebPush(supabase, {
        usuarioNombre: user?.nombre,
        usuarioId: user?.id,
        rol: user?.rol,
      });
      await enviarNotificacionPrueba(supabase);
      if (sub.sinTabla) setPushMsg(sub.error);
      else if (sub.ok) setPushMsg('Web Push registrado. Puede cerrar la app y seguir recibiendo avisos.');
      alert(
        sub.ok || !vapidOk
          ? 'Alertas activadas. Debería haber aparecido una notificación de prueba.'
          : `Alertas locales OK.\nPush remoto: ${sub.error || 'no configurado'}`,
      );
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
        Reciba en el celular avisos de vales, préstamos, consumos, incidencias y cobros post-liquidación. Solo{' '}
        <strong>Administrador</strong> y <strong>Gerente</strong>.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span className="badge" style={{ fontWeight: 700, color: estado.color }}>
          Estado: {estado.txt}
        </span>
        {swOk && <span className="muted" style={{ fontSize: '0.78rem' }}>Service worker OK</span>}
        {pwa && <span className="badge" style={{ background: 'rgba(46,125,50,0.12)', color: 'var(--brand-green)' }}>App instalada</span>}
        {webPushDisponible() ? (
          <span className="badge" style={{ background: 'rgba(41,128,185,0.12)', color: 'var(--brand-blue)' }}>
            Web Push listo
          </span>
        ) : (
          <span className="badge" style={{ background: 'rgba(225,153,41,0.15)' }}>
            Sin VAPID (solo app abierta)
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {permiso !== 'granted' && (
          <button type="button" className="btn btn-gold" onClick={activar}>
            🔔 Activar alertas en este dispositivo
          </button>
        )}
        {permiso === 'granted' && (
          <button type="button" className="btn btn-ghost" onClick={() => void enviarNotificacionPrueba(supabase)}>
            Probar notificación
          </button>
        )}
      </div>

      {pushMsg && (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
          {pushMsg}
        </p>
      )}

      {esMobile && (
        <div style={{ padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)', fontSize: '0.82rem' }}>
          <strong>Importante en celular</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
            <li>
              Con <strong>Web Push</strong> configurado, los avisos llegan aunque la app esté cerrada (tras Activar alertas en este equipo).
            </li>
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

      <div style={{ marginTop: '1rem', padding: '0.85rem', borderRadius: '10px', background: 'rgba(41,128,185,0.08)', border: '1px solid rgba(41,128,185,0.2)', fontSize: '0.82rem' }}>
        <strong style={{ color: 'var(--brand-blue)' }}>Configuración Web Push</strong>
        <p className="muted" style={{ margin: '0.4rem 0 0' }}>
          Guía paso a paso: <code>supabase/web_push_setup.md</code>
        </p>
        <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.15rem' }} className="muted">
          <li>SQL: <code>fix_push_subscriptions.sql</code></li>
          <li>
            Variable <code>VITE_VAPID_PUBLIC_KEY</code> {vapidOk ? '✓ en este build' : '← falta en .env / Netlify'}
          </li>
          <li>Secrets VAPID en Supabase + deploy de la función <code>enviar-push</code></li>
          <li>Activar alertas en el celular del admin</li>
        </ol>
      </div>
    </div>
  );
}
