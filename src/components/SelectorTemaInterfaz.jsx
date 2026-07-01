import React, { useEffect, useState } from 'react';
import {
  EVENTO_TEMA_INTERFAZ,
  TEMAS_INTERFAZ,
  guardarTemaInterfaz,
  leerTemaInterfaz,
  temaPorId,
} from '../lib/temasInterfaz.js';

export default function SelectorTemaInterfaz({ compact = false }) {
  const [temaId, setTemaId] = useState(() => leerTemaInterfaz());

  useEffect(() => {
    const sync = (e) => setTemaId(e.detail || leerTemaInterfaz());
    window.addEventListener(EVENTO_TEMA_INTERFAZ, sync);
    return () => window.removeEventListener(EVENTO_TEMA_INTERFAZ, sync);
  }, []);

  const elegir = (id) => {
    guardarTemaInterfaz(id);
    setTemaId(id);
  };

  if (compact) {
    return (
      <label className="muted" style={{ display: 'block' }}>
        Carátula / interfaz
        <select className="select" style={{ marginTop: '0.35rem' }} value={temaId} onChange={(e) => elegir(e.target.value)}>
          {TEMAS_INTERFAZ.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="temas-grid">
      {TEMAS_INTERFAZ.map((t) => {
        const activo = temaId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={`tema-card${activo ? ' tema-card--activo' : ''}`}
            onClick={() => elegir(t.id)}
            title={t.desc}
          >
            <span className="tema-card-preview" data-preview={t.id} aria-hidden />
            <span className="tema-card-label">{t.label}</span>
            <span className="tema-card-desc muted">{t.desc}</span>
            {activo && <span className="tema-card-badge">Activa</span>}
          </button>
        );
      })}
    </div>
  );
}

export function etiquetaTemaActual() {
  return temaPorId(leerTemaInterfaz()).label;
}
