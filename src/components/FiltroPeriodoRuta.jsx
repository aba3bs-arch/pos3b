import React from 'react';
import { MODOS_PERIODO } from '../lib/rutaIngresosCxc.js';

/**
 * Filtro de periodo para los análisis de venta en ruta:
 * Hoy · Semana actual · Mes actual · Desde última liquidación · Rango de fechas.
 */
export default function FiltroPeriodoRuta({ modo, onModo, rango, onRango }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: '0.78rem' }}>Periodo:</span>
      {MODOS_PERIODO.map((m) => (
        <button
          key={m.id}
          type="button"
          className={modo === m.id ? 'btn' : 'btn btn-ghost'}
          style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
          onClick={() => onModo(m.id)}
        >
          {m.etiqueta}
        </button>
      ))}
      {modo === 'rango' && (
        <>
          <input type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => onRango({ ...rango, desde: e.target.value })} />
          <span className="muted">a</span>
          <input type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => onRango({ ...rango, hasta: e.target.value })} />
        </>
      )}
    </div>
  );
}
