import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { datosImpresionDesdeHistorial, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';

export default function CorteHistorialImpresion({
  historial,
  historialEliminados = [],
  modulo,
  columnasExtra = [],
  puedeEliminar = false,
  onEliminar,
  onRestaurar,
}) {
  const imprimirHistorial = (h) => {
    imprimirCorteContabilidad(datosImpresionDesdeHistorial(h, modulo));
  };

  const vacioActivos = !historial?.length;
  const vacioPapelera = !historialEliminados?.length;
  if (vacioActivos && (!puedeEliminar || vacioPapelera)) return null;

  return (
    <>
      {!vacioActivos && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem' }}>Últimos cierres</h4>
          {puedeEliminar && (
            <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
              Al borrar, el cierre pasa a la papelera y se puede recuperar (solo administrador).
            </p>
          )}
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                        onClick={() => imprimirHistorial(h)}
                      >
                        {h?.detalle?.tipo_cierre === 'recoleccion' || h?.detalle?.tipo_cierre === 'recoleccion_temporal'
                          ? 'Reimprimir'
                          : 'Imprimir'}
                      </button>
                      {puedeEliminar && onEliminar && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', color: 'var(--danger)', marginLeft: '0.25rem' }}
                          onClick={() => onEliminar(h.id, { folio: h.folio })}
                          title="Mover a papelera"
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {puedeEliminar && !vacioPapelera && (
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Cortes eliminados</h4>
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
            Papelera con rastro de quién borró cada cierre. Puedes restaurarlo.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Borrado</th>
                  <th>Borrado por</th>
                  <th>Fecha original</th>
                  <th>Folio</th>
                  <th>Ventas</th>
                  <th>Caja</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historialEliminados.map((h) => (
                  <tr key={h.id}>
                    <td>{h.deleted_at ? new Date(h.deleted_at).toLocaleString() : '—'}</td>
                    <td title={h.deleted_by || ''}>{h.deleted_by || '—'}</td>
                    <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                    <td>{h.folio}</td>
                    <td>{fmtCorte(h.ventas)}</td>
                    <td>{fmtCorte(h.caja_actual)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {onRestaurar && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', color: 'var(--brand-blue)' }}
                          onClick={() => onRestaurar(h.id, { folio: h.folio })}
                          title="Restaurar cierre al historial"
                        >
                          Restaurar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
