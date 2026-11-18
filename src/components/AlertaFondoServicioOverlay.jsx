import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_ALERTA_FONDO_CAJERO,
  etiquetaTipoNotificacion,
  listarNotificacionesPendientes,
} from '../lib/contabilidadNotificaciones.js';
import { listarSolicitudesCt } from '../lib/cubreSolicitudes.js';
import {
  aprobarCobroServicioConPin,
  etiquetaModuloCorteFondo,
  obtenerSolicitudFondo,
  puedeVerSolicitudPagoServicio,
  rechazarCobroServicio,
  sucursalesParaAlertaServicio,
} from '../lib/rutaFondoServicios.js';
import { fmtMonto } from '../lib/consultasUi.js';
import InputPin from './InputPin.jsx';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Overlay en la sucursal: cobro de servicio pendiente de PIN.
 * Lo ven el cajero, el supervisor y el CT que cubre esa tienda.
 * No se muestra en la sesión del administrador.
 */
export default function AlertaFondoServicioOverlay({ supabase, user, sucursal }) {
  const [alertas, setAlertas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);

  const puedeVer = puedeVerSolicitudPagoServicio(user);
  const esCtMovil = Boolean(user?.esCtMovil);
  const ctRhId = user?.ctRhId || null;
  const sucursalCt = user?.esCubreTurno ? user?.sucursal_id : null;

  const cargar = useCallback(async () => {
    if (!supabase || !puedeVer) {
      setAlertas([]);
      setSolicitud(null);
      return;
    }
    let coberturas = [];
    if (esCtMovil) {
      if (!ctRhId) {
        setAlertas([]);
        setSolicitud(null);
        return;
      }
      const sol = await listarSolicitudesCt(supabase, {
        ctRhId,
        estados: ['aceptada', 'cumplida'],
        limit: 40,
      });
      coberturas = sol.data || [];
    }
    const tiendas = sucursalesParaAlertaServicio(
      { ...user, esCtMovil, ctRhId, sucursal_id: sucursalCt || user?.sucursal_id },
      sucursal,
      coberturas,
    );
    if (!tiendas.length) {
      setAlertas([]);
      setSolicitud(null);
      return;
    }
    const lotes = await Promise.all(tiendas.map((tienda) => listarNotificacionesPendientes(supabase, {
      sucursal: tienda,
      tipos: TIPOS_ALERTA_FONDO_CAJERO,
      limit: 20,
    })));
    const lista = lotes
      .flatMap((r) => r.data || [])
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    setAlertas(lista);
    if (!lista.length) {
      setSolicitud(null);
      return;
    }
    const refId = lista[0].ref_id;
    if (refId) {
      const s = await obtenerSolicitudFondo(supabase, refId);
      setSolicitud(s.data || null);
    }
  }, [supabase, puedeVer, sucursal, esCtMovil, ctRhId, sucursalCt, user]);

  useEffect(() => {
    void cargar();
    if (!puedeVer) return undefined;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargar();
    }, 25_000);
    const onEvt = () => void cargar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);
    };
  }, [cargar, puedeVer]);

  if (!puedeVer || !alertas.length) return null;

  const actual = alertas[0];
  const restantes = alertas.length - 1;

  const aprobar = async () => {
    if (procesando) return;
    if (!pin || String(pin).length < 4) return alert('Ingresa el PIN del cajero o el PIN temporal del CT.');
    setProcesando(true);
    try {
      const r = await aprobarCobroServicioConPin(supabase, {
        solicitudId: actual.ref_id,
        pin,
        sucursal: actual.sucursal_id || sucursal,
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
    if (!pin || String(pin).length < 4) return alert('Ingresa el PIN del cajero o el PIN temporal del CT para rechazar.');
    const motivo = window.prompt('Motivo del rechazo (opcional):') || '';
    setProcesando(true);
    try {
      const r = await rechazarCobroServicio(supabase, {
        solicitudId: actual.ref_id,
        pin,
        sucursal: actual.sucursal_id || sucursal,
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
            {etiquetaTipoNotificacion(actual.tipo)} · {etiquetaTienda(actual.sucursal_id || sucursal)}
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
            PIN del cajero (o PIN temporal CT)
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
            Al aprobar se carga el gasto al corte y el dinero entra al Fondo (RC/VentaRuta).
            El CT con PIN temporal de esta tienda también puede aprobar.
          </p>
        </div>
      </div>
    </PortalFlotante>
  );
}
