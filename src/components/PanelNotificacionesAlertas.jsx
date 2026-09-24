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
import {
  TECLAS_MIN_ASALTO,
  ESC_TAPS_ASALTO,
  dispararAlertaAsalto,
  usuarioRecibeAlertaAsalto,
} from '../lib/alertaAsalto.js';
import { TIPOS_NOTIF, listarNotificacionesPendientes } from '../lib/contabilidadNotificaciones.js';
import { prepararAudioPos } from '../lib/sonidosPos.js';

function etiquetaPermiso(p) {
  if (p === 'granted') return { txt: 'Activadas', color: 'var(--brand-green)' };
  if (p === 'denied') return { txt: 'Bloqueadas por el navegador', color: 'var(--brand-red)' };
  if (p === 'unsupported') return { txt: 'No soportadas en este navegador', color: 'var(--muted)' };
  return { txt: 'Sin activar', color: 'var(--brand-gold-dark)' };
}

export default function PanelNotificacionesAlertas({ supabase, user, sucursal }) {
  const [permiso, setPermiso] = useState(() => permisoNotificacionesDispositivo());
  const [swOk, setSwOk] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [probandoAsalto, setProbandoAsalto] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [escuchaMsg, setEscuchaMsg] = useState('');
  const esIos = detectarIos();
  const esMobile = detectarMobile();
  const pwa = esPwaInstalada();
  const vapidOk = Boolean(vapidPublicKey());
  const puedeRecibirAsalto = usuarioRecibeAlertaAsalto(user);

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
      user,
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
        user,
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
        Reciba en el celular avisos de vales, préstamos, consumos, incidencias, cobros y{' '}
        <strong>alarma de asalto</strong>. Administrador, Gerente e indirectos MAIN.
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
        <button
          type="button"
          className="btn btn-ghost"
          style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}
          disabled={probandoAsalto}
          onClick={async () => {
            if (!confirm(
              '¿Probar alarma ASALTO EN PROCESO?\n\n'
              + 'Esta máquina NO mostrará nada (modo discreto).\n'
              + 'Otros dispositivos de admin/indirectos MAIN deben sonar.',
            )) return;
            setProbandoAsalto(true);
            try {
              const res = await dispararAlertaAsalto(supabase, {
                user,
                sucursal,
                forzar: true,
                modo: 'prueba',
              });
              if (!res.ok && !res.skipped) alert(res.error || 'No se pudo disparar.');
              else if (res.skipped) alert(res.error);
              else {
                const pushEnv = res.push?.data?.enviados;
                const pushTotal = res.push?.data?.total;
                const pushErr = res.push?.error || (res.push?.skipped ? 'Push no configurado (VAPID / función)' : null);
                const bc = res.broadcast?.ok ? 'OK' : (res.broadcast?.error || 'falló');
                alert(
                  'Alarma enviada en silencio desde esta máquina.\n\n'
                  + `Destinatarios en catálogo: ${res.destinatarios ?? '—'}\n`
                  + `Broadcast (app abierta): ${bc}\n`
                  + (pushErr
                    ? `Push: ${pushErr}`
                    : `Push enviados: ${pushEnv ?? '—'} / suscripciones: ${pushTotal ?? '—'}`)
                  + '\n\nEn MAIN/celulares con «Activar alertas» debe sonar la sirena.',
                );
              }
            } finally {
              setProbandoAsalto(false);
            }
          }}
        >
          {probandoAsalto ? 'Disparando…' : '🚨 Probar alarma ASALTO'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={verificando || !puedeRecibirAsalto}
          onClick={async () => {
            setVerificando(true);
            prepararAudioPos();
            try {
              const res = await listarNotificacionesPendientes(supabase, {
                tipos: [TIPOS_NOTIF.ASALTO],
                limit: 5,
                todasTiendas: true,
              });
              const n = (res.data || []).length;
              const err = res.error || res.aviso || null;
              setEscuchaMsg(
                err
                  ? `Error al consultar: ${err}`
                  : n > 0
                    ? `Hay ${n} alarma(s) de asalto pendiente(s). Debe verse la pantalla roja en unos segundos.`
                    : 'Escucha OK: no hay alarmas pendientes ahora. Dispare desde OTRA máquina (no desde este celular) y deje esta pantalla abierta.',
              );
              alert(
                (puedeRecibirAsalto ? 'Este usuario SÍ puede recibir asalto.\n' : 'Este usuario NO recibe asalto (solo admin/gerente/MAIN).\n')
                + (err ? `Error: ${err}` : `Pendientes en nube: ${n}`)
                + '\n\nImportante: si prueba desde ESTE celular, aquí no suena (modo discreto). Use otra caja para disparar.',
              );
            } finally {
              setVerificando(false);
            }
          }}
        >
          {verificando ? 'Verificando…' : 'Verificar recepción asalto'}
        </button>
      </div>

      {escuchaMsg && (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
          {escuchaMsg}
        </p>
      )}

      {!puedeRecibirAsalto && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--brand-red)' }}>
          Este usuario no recibe la alarma de asalto. Entre con Administrador, Gerente o personal MAIN/indirecto.
        </p>
      )}

      <div style={{ margin: '0 0 1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(192,57,43,0.08)', fontSize: '0.82rem' }}>
        <strong>Cómo activarla en caja (situación real):</strong>
        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
          <li>
            Con sesión abierta, aplaste <strong>cualesquiera {TECLAS_MIN_ASALTO} teclas a la vez</strong>
            {' '}— no hay combinación que memorizar; las que salgan al azar.
          </li>
          <li>
            Respaldo: pulse <strong>Escape {ESC_TAPS_ASALTO} veces</strong> seguidas (rápido).
          </li>
          <li>
            En la caja <strong>no aparece nada</strong> (discreto, para no provocar al asaltante).
            Suena y se ve en dispositivos de admin / indirectos MAIN.
          </li>
          <li>
            En el celular: deje la app <strong>abierta en pantalla</strong> (o con alertas activadas).
            Toque una vez la pantalla para permitir el sonido. Recargue la app si acaba de actualizarse el sistema.
          </li>
        </ul>
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
              Tras entrar con PIN (admin / gerente / MAIN), la <strong>sesión permanece abierta</strong> en este teléfono
              al reabrir la app, para poder recibir la alarma de asalto. Solo se cierra si pulsa «Cerrar sesión».
            </li>
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
