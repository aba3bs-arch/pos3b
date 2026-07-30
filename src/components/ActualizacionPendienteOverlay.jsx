import React, { useCallback, useEffect, useState } from 'react';
import {
  EVENTO_APP_UPDATE,
  aplicarActualizacionApp,
  checarActualizacionApp,
  marcarBuildAceptado,
  posponerActualizacion,
} from '../lib/appActualizacion.js';

/**
 * Aviso cuando hay un build nuevo en el servidor (Netlify / deploy).
 * Muestra los cambios del version.json y pide aceptar para recargar.
 */
export default function ActualizacionPendienteOverlay() {
  const [info, setInfo] = useState(null);
  const [aplicando, setAplicando] = useState(false);

  const refrescar = useCallback(async () => {
    const r = await checarActualizacionApp();
    if (r.pendiente && r.remota) setInfo(r);
    else setInfo(null);
  }, []);

  useEffect(() => {
    refrescar();
    const t = window.setInterval(refrescar, 3 * 60_000);
    const onFocus = () => refrescar();
    const onEvt = () => refrescar();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refrescar();
    });
    window.addEventListener(EVENTO_APP_UPDATE, onEvt);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(EVENTO_APP_UPDATE, onEvt);
    };
  }, [refrescar]);

  if (!info?.remota) return null;

  const remota = info.remota;
  const cambios = Array.isArray(remota.changes) ? remota.changes.filter(Boolean) : [];

  const aceptar = async () => {
    // Ya corre el build nuevo: solo confirmar el aviso de cambios.
    if (info.motivo === 'changelog_pendiente' && info.actual && info.actual === remota.buildId) {
      marcarBuildAceptado(remota.buildId);
      setInfo(null);
      return;
    }
    setAplicando(true);
    try {
      await aplicarActualizacionApp(remota);
    } catch {
      setAplicando(false);
      window.location.reload();
    }
  };

  const masTarde = () => {
    posponerActualizacion(60);
    setInfo(null);
  };

  return (
    <div className="anuncio-pos-backdrop app-update-backdrop" role="dialog" aria-modal="true" aria-labelledby="app-update-titulo">
      <div className="anuncio-pos-modal card app-update-modal" style={{ maxWidth: 'min(94vw, 560px)' }}>
        <div className="app-update-badge">Actualización · solo administrador</div>
        <h2 id="app-update-titulo" style={{ margin: '0.5rem 0 0', color: 'var(--brand-blue)' }}>
          {remota.title || 'Hay una nueva versión del POS'}
        </h2>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          {remota.summary || 'Como administrador puedes aprobar actualizar esta caja ahora, o posponer el aviso.'}
        </p>
        <p className="muted" style={{ margin: '0.45rem 0 0', fontSize: '0.78rem' }}>
          Versión {remota.version || '—'}
          {remota.buildId ? ` · build ${remota.buildId}` : ''}
          {info.actual && info.actual !== remota.buildId ? ` · esta caja: ${info.actual}` : ''}
        </p>

        {cambios.length > 0 ? (
          <div className="app-update-changes">
            <div className="app-update-changes-title">Qué cambió</div>
            <ul>
              {cambios.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.15rem' }}>
          <button type="button" className="btn btn-primary" onClick={aceptar} disabled={aplicando}>
            {aplicando
              ? 'Actualizando…'
              : info.motivo === 'changelog_pendiente' && info.actual === remota.buildId
                ? 'Entendido'
                : 'Aprobar y actualizar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={masTarde} disabled={aplicando}>
            No enviar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
