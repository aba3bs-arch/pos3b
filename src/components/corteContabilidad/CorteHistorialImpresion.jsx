import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { datosImpresionDesdeHistorial, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';

export default function CorteHistorialImpresion({ historial, modulo, columnasExtra = [] }) {
  const imprimirHistorial = (h) => {
    imprimirCorteContabilidad(datosImpresionDesdeHistorial(h, modulo));
  };

  if (!historial?.length) return null;

  return (
    <div className="card">
      <h4 style={{ margin: '0 0 0.5rem' }}>Últimos cierres</h4>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Fecha</th>
              {columnasExtra.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Folio</th>
              <th>Ventas</th>
              <th>Caja</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id}>
                <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                {columnasExtra.map((c) => (
                  <td key={c.key}>{c.render ? c.render(h) : h[c.key]}</td>
                ))}
                <td>{h.folio}</td>
                <td>{fmtCorte(h.ventas)}</td>
                <td>{fmtCorte(h.caja_actual)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => imprimirHistorial(h)}
                  >
                    Imprimir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
