import React from 'react';

/** Regresa al hub de Estadísticas. */
export default function VolverEstadisticas({ onClick }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      style={{ marginBottom: '0.75rem', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
    >
      ← Estadísticas
    </button>
  );
}
