import React, { useCallback, useEffect, useRef, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_ALERTA_EXTENSION_TURNO,
  etiquetaTipoNotificacion,
  listarNotificacionesPendientes,
} from '../lib/contabilidadNotificaciones.js';
import {
  HORAS_EXTENSION_OPCIONES,
  aprobarExtensionTurnoConPin,
  obtenerSolicitudExtension,
  rechazarExtensionTurnoConPin,
} from '../lib/solicitudExtensionTurno.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from './InputPin.jsx';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Overlay admin/gerente (también en celular): aprueba más tiempo con PIN
 * y elige 2 / 4 / 6 / 8 / 12 horas.
 */
export default function AlertaExtensionTurnoOverlay({ supabase, user }) {
  const [alertas, setAlertas] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [pin, setPin] = useState('');
  const [horas, setHoras] = useState(8);
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
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
      tipos: TIPOS_ALERTA_EXTENSION_TURNO,
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
      const s = await obtenerSolicitudExtension(supabase, refId);
      setSolicitud(s.data || null);
    }
  }, [supabase, puedeVer]);

  useEffect(() => {
    void cargar();
    if (!puedeVer) return undefined;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargar();
    }, 20_000);
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
      setErrorMsg('Ingresa tu PIN de administrador o gerente.');
      return;
    }
    setErrorMsg('');
    setProcesando(true);
    try {
      const r = await aprobarExtensionTurnoConPin(supabase, {
        solicitudId: actual.ref_id,
        pin,
        horas,
      });
      setProcesando(false);
      if (!r.ok) {
        setErrorMsg(r.error || 'No se pudo aprobar.');
        return;
      }
      alert(
        `Autorizado: ${r.usuarioNombre || 'empleado'} · ${r.horas} h `
        + `en ${etiquetaTienda(r.sucursal)}.\n`
        + `Por ${r.admin}. El empleado ya puede entrar con su PIN.`,
      );
      setPin('');
      setErrorMsg('');
      setHoras(8);
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
      const r = await rechazarExtensionTurnoConPin(supabase, {
        solicitudId: actual.ref_id,
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
        aria-labelledby="alerta-ext-turno-titulo"
        style={{ zIndex: 12025 }}
      >
        <div
          className="card"
          style={{
            maxWidth: 480,
            width: '100%',
            borderTop: '5px solid #b45309',
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
          <p
            className="muted"
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: 0.4,
              paddingRight: 36,
            }}
          >
            {etiquetaTipoNotificacion(actual.tipo)}
            {' · '}
            {etiquetaTienda(actual.sucursal_id || solicitud?.sucursal_id)}
            {restantes > 0 ? ` · +${restantes} más` : ''}
          </p>
          <h2
            id="alerta-ext-turno-titulo"
            style={{ margin: '0.35rem 0 0.5rem', color: '#b45309', fontSize: '1.15rem' }}
          >
            {actual.titulo || 'Solicitud de más tiempo'}
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
                background: 'rgba(180,83,9,0.08)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <strong>{solicitud.usuario_nombre || 'Empleado'}</strong>
                {solicitud.usuario_rol ? ` · ${solicitud.usuario_rol}` : ''}
              </div>
              <div className="muted">
                {etiquetaTienda(solicitud.sucursal_id)}
                {solicitud.origen ? ` · origen: ${solicitud.origen}` : ''}
              </div>
            </div>
          )}

          <p style={{ margin: '0.9rem 0 0.4rem', fontSize: '0.85rem', fontWeight: 700 }}>
            ¿Cuántas horas autorizas?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {HORAS_EXTENSION_OPCIONES.map((h) => {
              const activo = horas === h;
              return (
                <button
                  key={h}
                  type="button"
                  className={activo ? 'btn btn-gold' : 'btn btn-ghost'}
                  disabled={procesando}
                  onClick={() => setHoras(h)}
                  style={{
                    flex: '1 1 56px',
                    minWidth: 56,
                    fontWeight: 800,
                    ...(activo
                      ? {}
                      : { border: '1px solid rgba(180,83,9,0.35)' }),
                  }}
                >
                  {h} h
                </button>
              );
            })}
          </div>

          <label style={{ display: 'block', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            PIN de administrador / gerente
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
              style={{
                flex: '1 1 160px',
                background: '#b45309',
                borderColor: '#b45309',
              }}
            >
              {procesando ? 'Procesando…' : `Aprobar ${horas} h`}
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
            Puedes aprobar desde el celular. Al autorizar, el empleado vuelve a poner su PIN en la caja y entra.
          </p>
        </div>
      </div>
    </PortalFlotante>
  );
}
