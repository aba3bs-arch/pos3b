import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_NOTIF,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
} from '../lib/contabilidadNotificaciones.js';
import { obtenerIdDispositivoLocal } from '../lib/dispositivoUsuario.js';
import { detectarMobile, mostrarNotificacionDispositivo } from '../lib/notificacionesDispositivo.js';
import { iniciarSirenaAsalto, detenerSirenaAsalto, prepararAudioPos } from '../lib/sonidosPos.js';
import PortalFlotante from './PortalFlotante.jsx';

function pollMsActual() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return POLL_MS_BACKGROUND;
  }
  return detectarMobile() ? POLL_MS_MOBILE : POLL_MS_FOREGROUND;
}

async function pedirWakeLockAsalto() {
  try {
    if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return null;
    if (document.visibilityState !== 'visible') return null;
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

const POLL_MS_FOREGROUND = 1500;
const POLL_MS_BACKGROUND = 4000;
const POLL_MS_MOBILE = 1200;

/**
 * Pantalla de alarma audible «ASALTO EN PROCESO» en dispositivos REMOTOS
 * (Admin / Gerente / indirectos MAIN). La caja origen no muestra nada.
 */
export default function AlertaAsaltoOverlay({ supabase, user }) {
  const [alerta, setAlerta] = useState(null);
  const [silenciando, setSilenciando] = useState(false);
  const puedeVer = usuarioRecibeAlertaAsalto(user);
  const idsMostrados = useRef(new Set());
  const alertaActivaId = useRef(null);

  const aplicarAlerta = useCallback((detail) => {
    if (!detail) return;
    if (detail.id && esOrigenAlertaAsalto(detail.id)) return;
    const idKey = detail.id != null ? String(detail.id) : `tmp-${detail.at || ''}`;
    // Ya visible o ya silenciada en este dispositivo.
    if (alertaActivaId.current === idKey) return;
    if (idsMostrados.current.has(idKey)) return;
    idsMostrados.current.add(idKey);
    alertaActivaId.current = idKey;
    setAlerta(detail);
    prepararAudioPos();
    iniciarSirenaAsalto();
    // Banner del sistema (útil en móvil si el audio está bloqueado).
    void mostrarNotificacionDispositivo({
      id: detail.id || `asalto-${detail.at || Date.now()}`,
      titulo: detail.titulo || TEXTO_ALERTA_ASALTO,
      mensaje: detail.mensaje || TEXTO_ALERTA_ASALTO_SUB,
    });
  }, []);

  const cargarPendiente = useCallback(async () => {
    if (!supabase || !puedeVer) return null;
    try {
      const res = await listarNotificacionesPendientes(supabase, {
        tipos: [TIPOS_NOTIF.ASALTO],
        limit: 8,
        todasTiendas: true,
      });
      const row = (res.data || []).find((r) => {
        if (!r?.id) return false;
        if (esOrigenAlertaAsalto(r.id)) return false;
        if (idsMostrados.current.has(String(r.id))) return false;
        return true;
      }) || null;
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
      return row;
    } catch {
      return null;
    }
  }, [supabase, puedeVer, aplicarAlerta]);

  useEffect(() => {
    if (!user || user.esCtMovil || !puedeVer) return undefined;

    // iOS: el audio solo arranca tras un gesto; desbloquear al tocar.
    const unlockAudio = () => {
      prepararAudioPos();
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });

    const onStop = () => {
      detenerSirenaAsalto();
      alertaActivaId.current = null;
      setAlerta(null);
    };
    window.addEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);

    void cargarPendiente();

    const onNotif = (e) => {
      const d = e.detail;
      if (d?.id && esOrigenAlertaAsalto(d.id)) return;
      if (d?.tipo && d.tipo !== TIPOS_NOTIF.ASALTO) {
        // Otro tipo: igual revisar pendientes por si el refresh viene agrupado.
        void cargarPendiente();
        return;
      }
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
      if (!msg || msg.type !== 'pos3b-asalto-push') return;
      const d = msg.payload || {};
      if (d.id && esOrigenAlertaAsalto(d.id)) return;
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
        .channel(`pos-asalto-pg-${user?.id || user?.nombre || 'staff'}-${Date.now()}`)
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

    let iv = setInterval(() => void cargarPendiente(), pollMsActual());
    let wakeLock = null;

    const syncPollRate = () => {
      clearInterval(iv);
      iv = setInterval(() => void cargarPendiente(), pollMsActual());
    };

    const onWake = () => {
      void cargarPendiente();
      syncPollRate();
      prepararAudioPos();
      void pedirWakeLockAsalto().then((wl) => {
        wakeLock = wl;
      });
    };

    void pedirWakeLockAsalto().then((wl) => {
      wakeLock = wl;
    });

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    window.addEventListener('online', onWake);

    return () => {
      clearInterval(iv);
      try {
        wakeLock?.release?.();
      } catch {
        /* ignore */
      }
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onNotif);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onNotif);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      window.removeEventListener('online', onWake);
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      quitBroadcast?.();
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [user, puedeVer, supabase, aplicarAlerta, cargarPendiente]);

  if (!puedeVer || !alerta) return null;

  const silenciar = async () => {
    if (silenciando) return;
    setSilenciando(true);
    try {
      detenerSirenaAsalto();
      if (alerta?.id && supabase) {
        await marcarNotificacionAtendidaPorId(
          supabase,
          alerta.id,
          user?.nombre || user?.id || 'alerta',
        );
      }
      emitirDetenerAlertaAsalto();
      alertaActivaId.current = null;
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
