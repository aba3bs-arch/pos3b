import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_NOTIFICACIONES,
  EVENTO_NOTIFICACION_DISPOSITIVO,
  TIPOS_ALERTA_CT_CAJERO,
  etiquetaTipoNotificacion,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
} from '../lib/contabilidadNotificaciones.js';
import { normalizarRol } from '../lib/roles.js';

/**
 * Alerta flotante persistente cuando un CT rechaza (o acepta) una cobertura.
 * Visible en cualquier módulo del POS del cajero/admin hasta que la atiendan.
 */
export default function AlertaCtOverlay({
  supabase,
  user,
  sucursal,
  onIrCubreTurnos,
}) {
  const [alertas, setAlertas] = useState([]);
  const [atendiendoId, setAtendiendoId] = useState('');

  const rol = normalizarRol(user?.rol);
  const puedeVer = Boolean(
    user
    && !user.esCtMovil
    && (rol === 'Cajero' || rol === 'Administrador' || rol === 'Gerente'),
  );

  const cargar = useCallback(async () => {
    if (!supabase || !puedeVer || !sucursal) {
      setAlertas([]);
      return;
    }
    const res = await listarNotificacionesPendientes(supabase, {
      sucursal,
      tipos: TIPOS_ALERTA_CT_CAJERO,
      limit: 20,
    });
    setAlertas(res.data || []);
  }, [supabase, puedeVer, sucursal]);

  useEffect(() => {
    void cargar();
    if (!puedeVer) return undefined;
    const t = setInterval(() => void cargar(), 12000);
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
  const esRechazo = String(actual.tipo) === 'ct_rechazada';
  const restantes = alertas.length - 1;

  const atender = async ({ irCubre = false } = {}) => {
    if (!actual?.id || atendiendoId) return;
    setAtendiendoId(actual.id);
    const res = await marcarNotificacionAtendidaPorId(
      supabase,
      actual.id,
      user?.nombre || user?.id || 'caja',
    );
    setAtendiendoId('');
    if (!res.ok) {
      alert(res.error || 'No se pudo marcar como atendida.');
      return;
    }
    setAlertas((prev) => prev.filter((a) => a.id !== actual.id));
    if (irCubre && typeof onIrCubreTurnos === 'function') onIrCubreTurnos();
  };

  return (
    <div
      className="anuncio-pos-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alerta-ct-titulo"
      style={{ zIndex: 12000 }}
    >
      <div
        className="card"
        style={{
          maxWidth: 460,
          width: '100%',
          borderTop: `5px solid ${esRechazo ? 'var(--danger, #c62828)' : '#2e7d32'}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.4 }}>
          {etiquetaTipoNotificacion(actual.tipo)} · {etiquetaTienda(actual.sucursal_id || sucursal)}
          {restantes > 0 ? ` · +${restantes} más` : ''}
        </p>
        <h2
          id="alerta-ct-titulo"
          style={{
            margin: '0.35rem 0 0.5rem',
            color: esRechazo ? 'var(--danger, #c62828)' : 'var(--brand-blue)',
            fontSize: '1.25rem',
          }}
        >
          {actual.titulo || (esRechazo ? 'El CT rechazó la cobertura' : 'Aviso CT')}
        </h2>
        <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {actual.mensaje || 'Revisa Cubre turnos para continuar.'}
        </p>
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8rem' }}>
          Esta alerta permanece en cualquier módulo hasta que la atiendas.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(atendiendoId)}
            onClick={() => void atender({ irCubre: true })}
          >
            {atendiendoId ? 'Guardando…' : 'Atender · ir a Cubre turnos'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={Boolean(atendiendoId)}
            onClick={() => void atender({ irCubre: false })}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
