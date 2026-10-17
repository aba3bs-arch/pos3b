import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_ALERTA_CANCELACION_RUTA,
  etiquetaTipoNotificacion,
  listarNotificacionesPendientes,
} from '../lib/contabilidadNotificaciones.js';
import {
  aprobarCancelacionVentaConPin,
  obtenerCancelacionRuta,
  rechazarCancelacionVentaConPin,
} from '../lib/rutaCancelaciones.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from './InputPin.jsx';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Overlay para admin/gerente: aprueba o rechaza cancelación de venta en ruta con PIN.
 */
export default function AlertaCancelacionRutaOverlay({ supabase, user }) {
  const [alertas, setAlertas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  /** refs cerradas en esta sesión (siguen pendientes en BD; no reaparecen al recargar lista). */
  const pospuestasRef = useRef(new Set());

  const rol = normalizarRol(user?.rol);
  const puedeVer = Boolean(
    user
    && !user.esCtMovil
    && (rol === 'Administrador' || rol === 'Gerente'),
  );

  const cargar = useCallback(async () => {
    if (!supabase || !puedeVer) {
      setAlertas([]);
      setSolicitud(null);
      return;
    }
    const res = await listarNotificacionesPendientes(supabase, {
      tipos: TIPOS_ALERTA_CANCELACION_RUTA,
      todasTiendas: true,
      limit: 20,
    });
    const lista = (res.data || []).filter(
      (n) => !pospuestasRef.current.has(String(n.ref_id || n.id || '')),
    );
    setAlertas(lista);
    if (!lista.length) {
      setSolicitud(null);
      return;
    }
    const refId = lista[0].ref_id;
    if (refId) {
      const s = await obtenerCancelacionRuta(supabase, refId);
      setSolicitud(s.data || null);
    }
  }, [supabase, puedeVer]);

  useEffect(() => {
    void cargar();
    if (!puedeVer) return undefined;
    const t = setInterval(() => void cargar(), 10000);
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
    if (!pin || String(pin).length < 4) {
      setErrorMsg('Ingresa el PIN de administrador.');
      return;
    }
    setErrorMsg('');
    setProcesando(true);
    try {
      const r = await aprobarCancelacionVentaConPin(supabase, {
        cancelacionId: actual.ref_id,
        pin,
      });
      // Liberar UI antes de cualquier alert() bloqueante (si no, queda «Procesando…»).
      setProcesando(false);
      if (!r.ok) {
        setErrorMsg(r.error || 'No se pudo aprobar.');
        return;
      }
      const res = r.resultado || {};
      const partes = [];
      if (res.camion?.length) partes.push(`camión ${res.camion.length} línea(s)`);
      if (res.inventarioTienda?.aplicados) partes.push(`tienda −${res.inventarioTienda.aplicados} prod.`);
      if (res.creditos?.eliminados) partes.push(`crédito ×${res.creditos.eliminados}`);
      if (res.gastoCorte?.anulados) partes.push(`gasto corte ×${res.gastoCorte.anulados}`);
      if (res.transito?.eliminado || res.transitoExtra?.eliminado) partes.push('efectivo RC quitado');
      if (res.compra?.eliminada || res.compra?.cancelada) partes.push('compra eliminada');
      if (res.venta?.eliminada || res.venta?.ok) partes.push('venta eliminada');
      if (!partes.length) {
        alert(
          `Cancelación sin reversiones detectadas · ${res.folio || ''}\n`
          + 'Revisa inventario, créditos y RC/VentaRuta.\n'
          + `${r.admin || 'admin'}`,
        );
      } else {
        alert(
          `Cancelación aplicada · ${res.folio || ''}\n`
          + `${partes.join(' · ')}\n${r.admin || 'admin'}`,
        );
      }
      setPin('');
      setErrorMsg('');
      await cargar();
    } catch (err) {
      setProcesando(false);
      setErrorMsg(err?.message || 'Error al aprobar.');
    } finally {
      setProcesando(false);
    }
  };

  const rechazar = async () => {
    if (procesando) return;
    if (!pin || String(pin).length < 4) {
      setErrorMsg('Ingresa el PIN para rechazar.');
      return;
    }
    const motivo = window.prompt('Motivo del rechazo (opcional):') || '';
    setErrorMsg('');
    setProcesando(true);
    try {
      const r = await rechazarCancelacionVentaConPin(supabase, {
        cancelacionId: actual.ref_id,
        pin,
        motivo,
      });
      setProcesando(false);
      if (!r.ok) {
        setErrorMsg(r.error || 'No se pudo rechazar.');
        return;
      }
      setPin('');
      setErrorMsg('');
      await cargar();
    } catch (err) {
      setProcesando(false);
      setErrorMsg(err?.message || 'Error al rechazar.');
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
        aria-labelledby="alerta-cancel-ruta-titulo"
        style={{ zIndex: 12020 }}
      >
        <div
          className="card"
          style={{
            maxWidth: 480,
            width: '100%',
            borderTop: '5px solid #b91c1c',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            position: 'relative',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Cerrar"
            onClick={() => {
              const key = String(actual.ref_id || actual.id || '');
              if (key) pospuestasRef.current.add(key);
              setProcesando(false);
              setErrorMsg('');
              setPin('');
              setSolicitud(null);
              setAlertas((prev) => prev.filter(
                (n) => String(n.ref_id || n.id || '') !== key,
              ));
            }}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              minWidth: 36,
              padding: '0.25rem 0.5rem',
              fontSize: '1.1rem',
              lineHeight: 1,
            }}
            title="Cerrar (la solicitud queda pendiente)"
          >
            ×
          </button>
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.4, paddingRight: 36 }}>
            {etiquetaTipoNotificacion(actual.tipo)}
            {restantes > 0 ? ` · +${restantes} más` : ''}
          </p>
          <h2 id="alerta-cancel-ruta-titulo" style={{ margin: '0.35rem 0 0.5rem', color: '#b91c1c', fontSize: '1.15rem' }}>
            {actual.titulo || 'Cancelar venta en ruta'}
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
                background: 'rgba(185,28,28,0.08)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <strong>{solicitud.folio_venta}</strong> · {fmtMonto(solicitud.total)} · {solicitud.metodo_pago || '—'}
              </div>
              <div className="muted">
                {solicitud.cliente_nombre || solicitud.cliente_id || '—'}
                {solicitud.vendedor_nombre ? ` · ${solicitud.vendedor_nombre}` : ''}
              </div>
              {solicitud.motivo ? (
                <div className="muted" style={{ marginTop: 4 }}>Motivo: {solicitud.motivo}</div>
              ) : null}
            </div>
          )}
          <label style={{ display: 'block', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            PIN de administrador
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
          {errorMsg ? (
            <p
              role="alert"
              style={{
                margin: '0.65rem 0 0',
                padding: '0.5rem 0.65rem',
                borderRadius: 8,
                background: 'rgba(185,28,28,0.12)',
                color: '#991b1b',
                fontSize: '0.85rem',
                lineHeight: 1.4,
              }}
            >
              {errorMsg}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={procesando}
              onClick={() => void aprobar()}
              style={{ flex: '1 1 140px', background: '#b91c1c', borderColor: '#b91c1c' }}
            >
              {procesando ? 'Procesando…' : 'Aprobar cancelación'}
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
            Al aprobar: 1) devuelve inventario al camión 2) descuenta piso de tienda si ya se recibió
            3) elimina crédito y/o efectivo (mixto = ambos) 4) borra venta, compra y RC/VentaRuta.
          </p>
        </div>
      </div>
    </PortalFlotante>
  );
}
