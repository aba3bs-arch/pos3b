import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';

export default function ResumenOperacionCorte({ venta, gastos, ventaNeta }) {
  const fila = (label, valor, color) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.35rem 0',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 800, fontSize: '1rem', color: color || 'var(--brand-blue)' }}>{fmtCorte(valor)}</span>
    </div>
  );

  return (
    <div
      style={{
        marginTop: '0.85rem',
        padding: '0.75rem 0.85rem',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.75)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
        Status de la operación
      </div>
      {fila('Venta actual', venta, '#16a085')}
      {fila('Gastos', gastos, 'var(--danger)')}
      {fila('Venta neta', ventaNeta, 'var(--brand-blue)')}
    </div>
  );
}
