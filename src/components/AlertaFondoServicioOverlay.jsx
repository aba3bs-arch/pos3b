import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda, equivalentesCodigoTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_ALERTA_FONDO_CAJERO,
  TIPOS_NOTIF,
  etiquetaTipoNotificacion,
  listarNotificacionesPendientes,
} from '../lib/contabilidadNotificaciones.js';
import {
  aprobarCobroServicioConPin,
  etiquetaModuloCorteFondo,
  listarSolicitudesFondoPendientes,
  obtenerSolicitudFondo,
  rechazarCobroServicio,
} from '../lib/rutaFondoServicios.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from './InputPin.jsx';
import PortalFlotante from './PortalFlotante.jsx';

function notifDeSolicitud(sol) {
  if (!sol?.id) return null;
  return {
    id: `sol:${sol.id}`,
    tipo: TIPOS_NOTIF.FONDO_SERVICIO_PIN,
    ref_tabla: 'ruta_fondo_solicitudes',
    ref_id: sol.id,
    sucursal_id: sol.sucursal_id,
    titulo: `Cobro ${sol.servicio_nombre} · ${fmtMonto(sol.monto)}`,
    mensaje:
      `${sol.repartidor_nombre || sol.solicitado_por || 'Recolector'} solicita cobrar ${sol.servicio_nombre} `
      + `en ${etiquetaTienda(sol.sucursal_id)} · corte ${etiquetaModuloCorteFondo(sol.modulo_corte)}.\n`
      + 'Aprueba con tu PIN de cajero para cargar el gasto y registrar el Fondo.',
    estado: 'pendiente',
    _solicitud: sol,
  };
}

/**
 * Overlay en caja: cobro de servicio (Fondo) pendiente de PIN del cajero.
 * Usa Realtime propio (los cajeros no entran al monitor admin de App.jsx)
 * + poll + solicitudes pendientes como respaldo si falló la fila de notificación.
 */
export default function AlertaFondoServicioOverlay({ supabase, user, sucursal }) {
  const [alertas, setAlertas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);

  const rol = normalizarRol(user?.rol);
  const puedeVer = Boolean(
    user
    && !user.esCtMovil
    && (rol === 'Cajero' || rol === 'Administrador' || rol === 'Gerente' || rol === 'Supervisor'),
  );
  const sucNorm = normalizarCodigoTienda(sucursal) || String(sucursal || '').trim();

  const cargar = useCallback(async () => {
    if (!supabase || !puedeVer || !sucNorm) {
      setAlertas([]);
      setSolicitud(null);
      return;
    }
    const eqs = equivalentesCodigoTienda(sucNorm);
    const [resNotif, resSol] = await Promise.all([
      listarNotificacionesPendientes(supabase, {
        // listar filtra con eq; pedimos todasTiendas y filtramos por equivalentes aquí
        tipos: TIPOS_ALERTA_FONDO_CAJERO,
        limit: 40,
        todasTiendas: true,
      }),
      listarSolicitudesFondoPendientes(supabase, { sucursalId: sucNorm, limit: 20 }),
    ]);

    const eqSet = new Set(eqs.map((c) => String(c)));
    const notifs = (resNotif.data || []).filter((n) => {
      const sid = String(n.sucursal_id || '');
      return eqSet.has(sid) || normalizarCodigoTienda(sid) === sucNorm;
    });

    const porRef = new Map();
    for (const n of notifs) {
      if (n.ref_id) porRef.set(String(n.ref_id), n);
    }
    // Respaldo: solicitudes pendientes sin fila de notificación (Realtime/insert fallido).
    for (const sol of resSol.data || []) {
      const key = String(sol.id);
      if (!porRef.has(key)) {
        const synth = notifDeSolicitud(sol);
        if (synth) porRef.set(key, synth);
      }
    }

    const lista = [...porRef.values()].sort((a, b) => {
      const ta = String(a.created_at || a._solicitud?.created_at || '');
      const tb = String(b.created_at || b._solicitud?.created_at || '');
      return tb.localeCompare(ta);
    });

    setAlertas(lista);
    if (!lista.length) {
      setSolicitud(null);
      return;
    }
    const first = lista[0];
    if (first._solicitud) {
      setSolicitud(first._solicitud);
      return;
    }
    const refId = first.ref_id;
    if (refId) {
      const s = await obtenerSolicitudFondo(supabase, refId);
      setSolicitud(s.data || null);
    }
  }, [supabase, puedeVer, sucNorm]);

  useEffect(() => {
    void cargar();
    if (!puedeVer || !supabase) return undefined;

    const t = setInterval(() => void cargar(), 5000);
    const onEvt = () => void cargar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);

    // Realtime propio: App.jsx solo suscribe admin/gerente a notificaciones.
    const channel = supabase
      .channel(`pos-fondo-servicio-${sucNorm || 'caja'}-${user?.id || user?.nombre || 'x'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contabilidad_notificaciones' },
        (payload) => {
          const row = payload.new;
          if (!row || row.estado !== 'pendiente') return;
          if (row.tipo !== TIPOS_NOTIF.FONDO_SERVICIO_PIN) return;
          const sid = normalizarCodigoTienda(row.sucursal_id) || String(row.sucursal_id || '');
          if (sid && sid !== sucNorm && !equivalentesCodigoTienda(sucNorm).includes(String(row.sucursal_id))) {
            return;
          }
          void cargar();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ruta_fondo_solicitudes' },
        (payload) => {
          const row = payload.new;
          if (!row || row.estado !== 'pendiente') return;
          const sid = normalizarCodigoTienda(row.sucursal_id) || String(row.sucursal_id || '');
          if (sid && sid !== sucNorm && !equivalentesCodigoTienda(sucNorm).includes(String(row.sucursal_id))) {
            return;
          }
          void cargar();
        },
      )
      .subscribe();

    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [cargar, puedeVer, supabase, sucNorm, user?.id, user?.nombre]);

  if (!puedeVer || !alertas.length) return null;

  const actual = alertas[0];
  const restantes = alertas.length - 1;
  const solicitudId = actual.ref_id || solicitud?.id;

  const aprobar = async () => {
    if (procesando) return;
    if (!pin || String(pin).length < 4) return alert('Ingresa tu PIN de cajero.');
    if (!solicitudId) return alert('Solicitud no encontrada.');
    setProcesando(true);
    try {
      const r = await aprobarCobroServicioConPin(supabase, {
        solicitudId,
        pin,
        sucursal: sucNorm,
      });
      if (!r.ok) return alert(r.error || 'No se pudo aprobar.');
      setPin('');
      await cargar();
    } finally {
      setProcesando(false);
    }
  };

  const rechazar = async () => {
    if (procesando) return;
    if (!pin || String(pin).length < 4) return alert('Ingresa tu PIN para rechazar.');
    if (!solicitudId) return alert('Solicitud no encontrada.');
    const motivo = window.prompt('Motivo del rechazo (opcional):') || '';
    setProcesando(true);
    try {
      const r = await rechazarCobroServicio(supabase, {
        solicitudId,
        pin,
        sucursal: sucNorm,
        motivo,
      });
      if (!r.ok) return alert(r.error || 'No se pudo rechazar.');
      setPin('');
      await cargar();
    } finally {
      setProcesando(false);
    }
  };

  return (
    <PortalFlotante>
      <div
        className="anuncio-pos-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerta-fondo-titulo"
        style={{ zIndex: 12010 }}
      >
        <div
          className="card"
          style={{
            maxWidth: 460,
            width: '100%',
            borderTop: '5px solid #0f766e',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}
        >
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.4 }}>
            {etiquetaTipoNotificacion(actual.tipo)} · {etiquetaTienda(actual.sucursal_id || sucNorm)}
            {restantes > 0 ? ` · +${restantes} más` : ''}
          </p>
          <h2 id="alerta-fondo-titulo" style={{ margin: '0.35rem 0 0.5rem', color: '#0f766e', fontSize: '1.2rem' }}>
            {actual.titulo || 'Cobro de servicio'}
          </h2>
          <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {actual.mensaje}
          </p>
          {solicitud && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.65rem 0.75rem',
                borderRadius: 10,
                background: 'rgba(15,118,110,0.08)',
                fontSize: '0.85rem',
              }}
            >
              <div><strong>{solicitud.servicio_nombre}</strong> · {fmtMonto(solicitud.monto)}</div>
              <div className="muted">
                Corte: {etiquetaModuloCorteFondo(solicitud.modulo_corte)} ·{' '}
                {solicitud.repartidor_nombre || 'Recolector'}
              </div>
            </div>
          )}
          <label style={{ display: 'block', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            PIN del cajero
            <InputPin
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              style={{ marginTop: '0.35rem' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void aprobar();
              }}
            />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={procesando}
              onClick={() => void aprobar()}
              style={{ flex: '1 1 140px' }}
            >
              {procesando ? 'Procesando…' : 'Aprobar con PIN'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={procesando}
              onClick={() => void rechazar()}
              style={{ flex: '1 1 120px' }}
            >
              Rechazar
            </button>
          </div>
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.75rem' }}>
            Al aprobar se carga el gasto al corte y el dinero entra al Fondo (RC/VentaRuta → RC Servicios).
          </p>
        </div>
      </div>
    </PortalFlotante>
  );
}
