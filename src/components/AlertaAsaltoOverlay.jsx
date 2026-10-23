import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_ALERTA_ASALTO_DETENER,
  TEXTO_ALERTA_ASALTO,
  TEXTO_ALERTA_ASALTO_SUB,
  emitirDetenerAlertaAsalto,
  esOrigenAlertaAsalto,
  suscribirAlertaAsaltoBroadcast,
  usuarioRecibeAlertaAsalto,
} from '../lib/alertaAsalto.js';
import {
  EVENTO_ASALTO_PENDIENTE,
  guardarAsaltoPendiente,
  limpiarAsaltoPendiente,
  limpiarQueryAlertaAsalto,
  leerAsaltoPendiente,
  urlPideAlertaAsalto,
} from '../lib/asaltoPendiente.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_NOTIF,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
} from '../lib/contabilidadNotificaciones.js';
import { obtenerIdDispositivoLocal } from '../lib/dispositivoUsuario.js';
import { iniciarSirenaAsalto, detenerSirenaAsalto, prepararAudioPos } from '../lib/sonidosPos.js';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Pantalla de alarma audible «ASALTO EN PROCESO» en dispositivos REMOTOS
 * (Admin / Gerente / indirectos MAIN).
 * También se muestra al abrir una push persistente (app cerrada / sin sesión),
 * usando el payload guardado en localStorage / Cache del SW.
 */
export default function AlertaAsaltoOverlay({ supabase, user }) {
  const [alerta, setAlerta] = useState(null);
  const [silenciando, setSilenciando] = useState(false);
  const puedeVerRemoto = usuarioRecibeAlertaAsalto(user);

  const aplicarAlerta = useCallback((detail) => {
    if (!detail) return;
    if (detail.id && esOrigenAlertaAsalto(detail.id)) return;
    const payload = {
      id: detail.id || null,
      titulo: detail.titulo || TEXTO_ALERTA_ASALTO,
      mensaje: detail.mensaje || TEXTO_ALERTA_ASALTO_SUB,
      sucursal_id: detail.sucursal_id || null,
      at: detail.at || new Date().toISOString(),
      tipo: detail.tipo || TIPOS_NOTIF.ASALTO,
      local: Boolean(detail.local),
    };
    guardarAsaltoPendiente(payload);
    setAlerta(payload);
    prepararAudioPos();
    iniciarSirenaAsalto();
  }, []);

  const cargarPendiente = useCallback(async () => {
    if (!supabase || !puedeVerRemoto) return;
    const res = await listarNotificacionesPendientes(supabase, {
      tipos: [TIPOS_NOTIF.ASALTO],
      limit: 5,
      todasTiendas: true,
    });
    const row = (res.data || []).find((r) => r?.id && !esOrigenAlertaAsalto(r.id)) || null;
    if (row) {
      aplicarAlerta({
        id: row.id,
        titulo: row.titulo || TEXTO_ALERTA_ASALTO,
        mensaje: row.mensaje || TEXTO_ALERTA_ASALTO_SUB,
        sucursal_id: row.sucursal_id,
        at: row.created_at,
        local: false,
      });
    }
  }, [supabase, puedeVerRemoto, aplicarAlerta]);

  // Arranque: URL ?alerta=asalto, LS, o Cache del SW (app estaba cerrada).
  useEffect(() => {
    const local = leerAsaltoPendiente();
    if (local && !(local.id && esOrigenAlertaAsalto(local.id))) {
      aplicarAlerta(local);
    }
    if (urlPideAlertaAsalto()) {
      if (!local) {
        aplicarAlerta({
          titulo: TEXTO_ALERTA_ASALTO,
          mensaje: TEXTO_ALERTA_ASALTO_SUB,
          at: new Date().toISOString(),
        });
      }
      limpiarQueryAlertaAsalto();
    }

    const pedirCacheSw = () => {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
      navigator.serviceWorker.controller.postMessage({ type: 'pos3b-asalto-leer-pendiente' });
    };
    pedirCacheSw();
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(() => pedirCacheSw()).catch(() => {});
    }

    const onPendiente = (e) => {
      if (e?.detail) aplicarAlerta(e.detail);
    };
    window.addEventListener(EVENTO_ASALTO_PENDIENTE, onPendiente);
    return () => window.removeEventListener(EVENTO_ASALTO_PENDIENTE, onPendiente);
  }, [aplicarAlerta]);

  useEffect(() => {
    // Suscripciones remotas solo con usuario elegible; el arranque por push ya aplicó alerta.
    if (!user || user.esCtMovil || !puedeVerRemoto) return undefined;

    const onStop = () => {
      detenerSirenaAsalto();
      limpiarAsaltoPendiente();
      setAlerta(null);
    };
    window.addEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);

    void cargarPendiente();

    const onNotif = (e) => {
      const d = e.detail;
      if (d?.id && esOrigenAlertaAsalto(d.id)) return;
      if (d?.tipo && d.tipo !== TIPOS_NOTIF.ASALTO) return;
      if (d?.tipo === TIPOS_NOTIF.ASALTO || d?.titulo?.toUpperCase?.().includes('ASALTO')) {
        aplicarAlerta({
          id: d.id,
          titulo: d.titulo || TEXTO_ALERTA_ASALTO,
          mensaje: d.mensaje || TEXTO_ALERTA_ASALTO_SUB,
          sucursal_id: d.sucursal_id,
          local: false,
        });
        return;
      }
      void cargarPendiente();
    };

    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onNotif);
    window.addEventListener(EVENTO_NOTIFICACIONES, onNotif);

    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg) return;
      if (msg.type === 'pos3b-asalto-push' || msg.type === 'pos3b-asalto-pendiente-cache') {
        const d = msg.payload || {};
        if (!d || (d.id && esOrigenAlertaAsalto(d.id))) return;
        if (msg.type === 'pos3b-asalto-pendiente-cache' && !d.id && !d.titulo && !d.mensaje) return;
        aplicarAlerta({
          id: d.id || null,
          titulo: d.titulo || TEXTO_ALERTA_ASALTO,
          mensaje: d.mensaje || TEXTO_ALERTA_ASALTO_SUB,
          sucursal_id: d.sucursal_id,
          local: false,
        });
      }
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    const quitBroadcast = suscribirAlertaAsaltoBroadcast(supabase, {
      dispositivoLocal: obtenerIdDispositivoLocal(),
      onAlarma: (payload) => {
        aplicarAlerta({
          id: payload.id || null,
          titulo: payload.titulo || TEXTO_ALERTA_ASALTO,
          mensaje: payload.mensaje || TEXTO_ALERTA_ASALTO_SUB,
          sucursal_id: payload.sucursal_id,
          at: payload.at,
          local: false,
        });
      },
    });

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel(`pos-asalto-pg-${user?.id || user?.nombre || 'staff'}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'contabilidad_notificaciones' },
          (payload) => {
            const row = payload.new;
            if (!row || row.tipo !== TIPOS_NOTIF.ASALTO) return;
            if (esOrigenAlertaAsalto(row.id)) return;
            aplicarAlerta({
              id: row.id,
              titulo: row.titulo || TEXTO_ALERTA_ASALTO,
              mensaje: row.mensaje || TEXTO_ALERTA_ASALTO_SUB,
              sucursal_id: row.sucursal_id,
              at: row.created_at,
              local: false,
            });
          },
        )
        .subscribe();
    }

    // También con la app en segundo plano (pantalla bloqueada o en otra app): el intervalo
    // sigue hasta que el sistema congele la página. El push cubre cuando ya está cerrada.
    const pollMs = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)')?.matches
      ? 8_000
      : 20_000;
    const iv = setInterval(() => {
      void cargarPendiente();
    }, pollMs);

    const onVisible = () => {
      void cargarPendiente();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onNotif);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onNotif);
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      quitBroadcast?.();
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [user, puedeVerRemoto, supabase, aplicarAlerta, cargarPendiente]);

  // SW messages también sin sesión (app abierta en login / fría).
  useEffect(() => {
    if (user && puedeVerRemoto) return undefined;
    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg) return;
      if (msg.type !== 'pos3b-asalto-push' && msg.type !== 'pos3b-asalto-pendiente-cache') return;
      const d = msg.payload || {};
      if (!d || (d.id && esOrigenAlertaAsalto(d.id))) return;
      if (msg.type === 'pos3b-asalto-pendiente-cache' && !d.titulo && !d.mensaje && !d.id) return;
      aplicarAlerta({
        id: d.id || null,
        titulo: d.titulo || TEXTO_ALERTA_ASALTO,
        mensaje: d.mensaje || TEXTO_ALERTA_ASALTO_SUB,
        sucursal_id: d.sucursal_id,
        local: false,
      });
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
    return undefined;
  }, [user, puedeVerRemoto, aplicarAlerta]);

  if (!alerta) return null;
  if (user?.esCtMovil) return null;
  // Con sesión: solo admin/gerente/MAIN. Sin sesión: pantalla de emergencia por push.
  if (user && !puedeVerRemoto) return null;

  const silenciar = async () => {
    if (silenciando) return;
    setSilenciando(true);
    try {
      detenerSirenaAsalto();
      if (alerta?.id && supabase && user) {
        await marcarNotificacionAtendidaPorId(
          supabase,
          alerta.id,
          user?.nombre || user?.id || 'alerta',
        );
      }
      limpiarAsaltoPendiente();
      emitirDetenerAlertaAsalto();
      setAlerta(null);
    } finally {
      setSilenciando(false);
    }
  };

  const tienda = alerta?.sucursal_id
    ? (etiquetaTienda(alerta.sucursal_id) || alerta.sucursal_id)
    : null;

  return (
    <PortalFlotante>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={TEXTO_ALERTA_ASALTO}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10050,
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          background: 'rgba(120, 0, 0, 0.88)',
          animation: 'asalto-pulse 0.9s ease-in-out infinite',
        }}
      >
        <style>{`
          @keyframes asalto-pulse {
            0%, 100% { background: rgba(120, 0, 0, 0.88); }
            50% { background: rgba(180, 0, 0, 0.94); }
          }
        `}</style>
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            color: '#fff',
            padding: '1.5rem 1.25rem',
            borderRadius: 12,
            border: '3px solid #fff',
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '0.85rem', letterSpacing: '0.12em', fontWeight: 700, marginBottom: '0.5rem' }}>
            EMERGENCIA
          </div>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'clamp(1.5rem, 5vw, 2.1rem)', lineHeight: 1.15 }}>
            {alerta.titulo || TEXTO_ALERTA_ASALTO}
          </h2>
          <p style={{ margin: '0 0 0.5rem', fontSize: '1rem', opacity: 0.95 }}>
            {alerta.mensaje || TEXTO_ALERTA_ASALTO_SUB}
          </p>
          {tienda && (
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', fontWeight: 700 }}>
              Tienda: {tienda}
            </p>
          )}
          {!tienda && <div style={{ height: '1rem' }} />}
          {!user && (
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', opacity: 0.9 }}>
              Abre sesión de admin/gerente para silenciar en todos los dispositivos.
            </p>
          )}
          <button
            type="button"
            className="btn btn-gold"
            style={{ minWidth: 180, fontWeight: 700 }}
            disabled={silenciando}
            onClick={() => void silenciar()}
          >
            {silenciando ? 'Cerrando…' : 'Entendido — silenciar'}
          </button>
        </div>
      </div>
    </PortalFlotante>
  );
}
