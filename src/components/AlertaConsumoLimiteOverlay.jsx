import React, { useCallback, useEffect, useState } from 'react';
import {
  EVENTO_CONSUMO_LIMITE,
  TIPO_NOTIF_CONSUMO_LIMITE,
  notificacionConsumoLimiteParaUsuario,
} from '../lib/candadoCancelarConsumo.js';
import {
  EVENTO_NOTIFICACIONES,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
} from '../lib/contabilidadNotificaciones.js';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Aviso en la pantalla abierta cuando un consumo no se aprueba
 * porque excedió el límite del día.
 */
export default function AlertaConsumoLimiteOverlay({ supabase, user }) {
  const [locales, setLocales] = useState([]);
  const [remotas, setRemotas] = useState([]);
  const [atendiendoId, setAtendiendoId] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase || !user) {
      setRemotas([]);
      return;
    }
    const res = await listarNotificacionesPendientes(supabase, {
      todasTiendas: true,
      tipos: [TIPO_NOTIF_CONSUMO_LIMITE],
      limit: 20,
    });
    setRemotas((res.data || []).filter((n) => notificacionConsumoLimiteParaUsuario(n, user)));
  }, [supabase, user]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargar();
    }, 20_000);
    const onRefresh = () => void cargar();
    const onLocal = (e) => {
      const d = e.detail;
      if (!d?.mensaje && !d?.titulo) return;
      setLocales((prev) => {
        const ya = prev.some((x) => (
          (d.ref_id && x.ref_id && String(x.ref_id) === String(d.ref_id))
          || x.mensaje === d.mensaje
        ));
        if (ya) return prev;
        return [{ ...d, id: d.id || `local-${Date.now()}` }, ...prev];
      });
    };
    window.addEventListener(EVENTO_NOTIFICACIONES, onRefresh);
    window.addEventListener(EVENTO_CONSUMO_LIMITE, onLocal);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onRefresh);
      window.removeEventListener(EVENTO_CONSUMO_LIMITE, onLocal);
    };
  }, [cargar]);

  const alertas = [...remotas];
  for (const loc of locales) {
    const cubierto = remotas.some((r) => (
      (loc.ref_id && r.ref_id && String(r.ref_id) === String(loc.ref_id))
      || r.mensaje === loc.mensaje
    ));
    if (!cubierto) alertas.push(loc);
  }

  if (!user || !alertas.length) return null;

  const actual = alertas[0];
  const esLocal = String(actual.id || '').startsWith('local-');
  const restantes = alertas.length - 1;

  const atender = async () => {
    if (atendiendoId) return;
    setAtendiendoId(actual.id || 'x');
    const esParaMi = notificacionConsumoLimiteParaUsuario(actual, user);
    if (esParaMi && actual.id && !esLocal) {
      const res = await marcarNotificacionAtendidaPorId(
        supabase,
        actual.id,
        user?.nombre || user?.id || 'caja',
      );
      if (!res.ok) {
        setAtendiendoId('');
        alert(res.error || 'No se pudo marcar como atendida.');
        return;
      }
    }
    setLocales((prev) => prev.filter((a) => a.mensaje !== actual.mensaje && String(a.ref_id || '') !== String(actual.ref_id || '—')));
    setRemotas((prev) => prev.filter((a) => a.id !== actual.id));
    setAtendiendoId('');
  };

  return (
    <PortalFlotante>
      <div
        className="anuncio-pos-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerta-consumo-limite-titulo"
        style={{ zIndex: 12000 }}
      >
        <div
          className="card"
          style={{
            maxWidth: 460,
            width: '100%',
            borderTop: '5px solid var(--danger, #c62828)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}
        >
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.4 }}>
            CONSUMO
            {restantes > 0 ? ` · +${restantes} más` : ''}
          </p>
          <h2
            id="alerta-consumo-limite-titulo"
            style={{ margin: '0.35rem 0 0.5rem', color: 'var(--danger, #c62828)', fontSize: '1.25rem' }}
          >
            {actual.titulo || 'Consumo no aprobado'}
          </h2>
          <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {actual.mensaje || 'No tiene consumo aprobado. Su consumo excedió el límite.'}
          </p>
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8rem' }}>
            Este aviso queda en la pantalla abierta hasta que lo atiendas.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(atendiendoId)}
              onClick={() => void atender()}
            >
              {atendiendoId ? 'Guardando…' : 'Entendido'}
            </button>
          </div>
        </div>
      </div>
    </PortalFlotante>
  );
}
