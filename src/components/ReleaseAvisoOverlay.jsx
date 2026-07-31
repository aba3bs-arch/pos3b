import React, { useState } from 'react';
import {
  RELEASE_AVISO_ACTUAL,
  debeMostrarReleaseAviso,
  marcarReleaseAvisoVisto,
} from '../lib/releaseAviso.js';
import { aplicarActualizacionApp } from '../lib/appActualizacion.js';

/**
 * Aviso de cambios para todos los usuarios + botón Actualizar (limpia caché y recarga).
 */
export default function ReleaseAvisoOverlay({ user }) {
  const [visible, setVisible] = useState(() => Boolean(user) && debeMostrarReleaseAviso());
  const [aplicando, setAplicando] = useState(false);

  if (!user || !visible) return null;

  const aviso = RELEASE_AVISO_ACTUAL;
  const cambios = Array.isArray(aviso.cambios) ? aviso.cambios.filter(Boolean) : [];

  const actualizar = async () => {
    setAplicando(true);
    marcarReleaseAvisoVisto(aviso.id);
    try {
      await aplicarActualizacionApp({ buildId: aviso.id });
    } catch {
      setAplicando(false);
      window.location.reload();
    }
  };

  const masTarde = () => {
    marcarReleaseAvisoVisto(aviso.id);
    setVisible(false);
  };

  return (
    <div className="anuncio-pos-backdrop app-update-backdrop" role="dialog" aria-modal="true" aria-labelledby="release-aviso-titulo">
      <div className="anuncio-pos-modal card app-update-modal" style={{ maxWidth: 'min(94vw, 560px)' }}>
        <div className="app-update-badge">Nueva versión</div>
        <h2 id="release-aviso-titulo" style={{ margin: '0.5rem 0 0', color: 'var(--brand-blue)' }}>
          {aviso.titulo}
        </h2>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          {aviso.resumen}
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
          <button type="button" className="btn btn-primary" onClick={actualizar} disabled={aplicando}>
            {aplicando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={masTarde} disabled={aplicando}>
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
