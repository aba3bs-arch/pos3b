import React from 'react';
import {
  UMBRAL_ACEPTACION_CT,
  colorNivelAceptacionCt,
  etiquetaNivelAceptacionCt,
} from '../lib/cubreAceptacionCt.js';

/** Badge clicable con % de aceptación del CT. */
export function IndicadorAceptacionCt({ resumen, onClick, compact = false }) {
  const pct = resumen?.pct;
  const color = colorNivelAceptacionCt(pct);
  const label = etiquetaNivelAceptacionCt(pct);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver desglose por tienda"
      style={{
        display: 'inline-flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'center' : 'flex-start',
        gap: compact ? '0.45rem' : '0.15rem',
        border: `2px solid ${color}`,
        background: `${color}14`,
        borderRadius: 10,
        padding: compact ? '0.35rem 0.65rem' : '0.55rem 0.85rem',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: compact ? undefined : 150,
      }}
    >
      <span style={{ fontSize: compact ? '0.95rem' : '1.45rem', fontWeight: 800, color, lineHeight: 1 }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
      <span style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
        Aceptación · {label}
        {!compact && (
          <span className="muted" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
            {resumen?.n
              ? `${resumen.n} calificación${resumen.n === 1 ? '' : 'es'} · clic por tienda`
              : 'Aún sin calificaciones · clic'}
          </span>
        )}
      </span>
    </button>
  );
}

/** Modal con % general y desglose por tienda. */
export function ModalDesgloseAceptacion({ resumen, nombre, onClose }) {
  if (!resumen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: '100%', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 style={{ margin: '0 0 0.35rem' }}>Aceptación · {nombre || 'CT'}</h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Promedio de calificaciones de planta (1–5 → %). General:{' '}
          <strong style={{ color: colorNivelAceptacionCt(resumen.pct) }}>
            {resumen.pct == null ? '—' : `${resumen.pct}%`}
          </strong>
          {' '}
          (mínimo {UMBRAL_ACEPTACION_CT}% para mantener la app).
        </p>
        {(resumen.porSucursal || []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay calificaciones por tienda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>Califs.</th>
                  <th>Prom.</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {resumen.porSucursal.map((r) => (
                  <tr key={r.sucursal_id}>
                    <td>{r.tienda}</td>
                    <td>{r.n}</td>
                    <td>{r.promedio}/5</td>
                    <td style={{ fontWeight: 700, color: colorNivelAceptacionCt(r.pct) }}>{r.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: '0.85rem', textAlign: 'right' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
