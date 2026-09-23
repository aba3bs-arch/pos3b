import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_ALERTA_ASALTO,
  EVENTO_ALERTA_ASALTO_DETENER,
  TEXTO_ALERTA_ASALTO,
  TEXTO_ALERTA_ASALTO_SUB,
  emitirDetenerAlertaAsalto,
  usuarioRecibeAlertaAsalto,
} from '../lib/alertaAsalto.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_NOTIF,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
} from '../lib/contabilidadNotificaciones.js';
import { iniciarSirenaAsalto, detenerSirenaAsalto, prepararAudioPos } from '../lib/sonidosPos.js';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Pantalla de alarma audible «ASALTO EN PROCESO» para admins / indirectos MAIN
 * (y quien la activó en la tienda).
 */
export default function AlertaAsaltoOverlay({ supabase, user }) {
  const [alerta, setAlerta] = useState(null);
  const [silenciando, setSilenciando] = useState(false);
  const puedeVer = usuarioRecibeAlertaAsalto(user);

  const aplicarAlerta = useCallback((detail) => {
    if (!detail) return;
    setAlerta(detail);
    prepararAudioPos();
    iniciarSirenaAsalto();
  }, []);

  const cargarPendiente = useCallback(async () => {
    if (!supabase || !puedeVer) return;
    const res = await listarNotificacionesPendientes(supabase, {
      tipos: [TIPOS_NOTIF.ASALTO],
      limit: 5,
      todasTiendas: true,
    });
    const row = (res.data || [])[0];
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
  }, [supabase, puedeVer, aplicarAlerta]);

  useEffect(() => {
    if (!puedeVer) return undefined;
    void cargarPendiente();

    const onLocal = (e) => {
      const d = e.detail;
      if (!d) return;
      aplicarAlerta({
        id: d.id || null,
        titulo: d.titulo || TEXTO_ALERTA_ASALTO,
        mensaje: d.mensaje || TEXTO_ALERTA_ASALTO_SUB,
        sucursal_id: d.sucursal_id,
        at: d.at,
        local: Boolean(d.local),
      });
    };
    const onNotif = (e) => {
      if (!puedeVer) return;
      const d = e.detail;
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
    const onStop = () => {
      detenerSirenaAsalto();
      setAlerta(null);
    };

    window.addEventListener(EVENTO_ALERTA_ASALTO, onLocal);
    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onNotif);
    window.addEventListener(EVENTO_NOTIFICACIONES, onNotif);
    window.addEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel(`pos-asalto-${user?.id || user?.nombre || 'staff'}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'contabilidad_notificaciones' },
          (payload) => {
            const row = payload.new;
            if (!row || row.tipo !== TIPOS_NOTIF.ASALTO) return;
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

    const iv = setInterval(() => void cargarPendiente(), 15000);

    return () => {
      clearInterval(iv);
      window.removeEventListener(EVENTO_ALERTA_ASALTO, onLocal);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onNotif);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onNotif);
      window.removeEventListener(EVENTO_ALERTA_ASALTO_DETENER, onStop);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [puedeVer, supabase, user, aplicarAlerta, cargarPendiente]);

  // Activador en tienda (local) o destinatario admin/indirecto.
  const visible = Boolean(alerta) && (puedeVer || alerta?.local);
  if (!visible) return null;

  const silenciar = async () => {
    if (silenciando) return;
    setSilenciando(true);
    try {
      detenerSirenaAsalto();
      if (alerta?.id && supabase && puedeVer) {
        await marcarNotificacionAtendidaPorId(
          supabase,
          alerta.id,
          user?.nombre || user?.id || 'alerta',
        );
      }
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
