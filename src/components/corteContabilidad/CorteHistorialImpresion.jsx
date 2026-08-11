import React, { useState } from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { datosImpresionDesdeHistorial, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { etiquetaTipoCierre } from '../../lib/corteContabilidad/permisos.js';

/**
 * Historial de cierres con imprimir, editar (admin/gerente) y borrar.
 */
export default function CorteHistorialImpresion({
  historial,
  modulo,
  columnasExtra = [],
  puedeEliminar = false,
  puedeEditar = false,
  onEliminar,
  onGuardarEdicion,
}) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ ventas: '', caja_actual: '', comentarios: '', folio: '' });
  const [guardando, setGuardando] = useState(false);

  const imprimirHistorial = (h) => {
    imprimirCorteContabilidad(datosImpresionDesdeHistorial(h, modulo));
  };

  const abrirEditar = (h) => {
    setEditando(h);
    setForm({
      ventas: h.ventas != null ? String(h.ventas) : '',
      caja_actual: h.caja_actual != null ? String(h.caja_actual) : '',
      comentarios: String(h.detalle?.comentarios || h.comentarios || ''),
      folio: String(h.folio || ''),
    });
  };

  const guardar = async () => {
    if (!editando || !onGuardarEdicion) return;
    setGuardando(true);
    const r = await onGuardarEdicion(editando.id, {
      ventas: Number(form.ventas) || 0,
      caja_actual: Number(form.caja_actual) || 0,
      folio: String(form.folio || '').trim() || editando.folio,
      comentarios: String(form.comentarios || '').trim(),
    });
    setGuardando(false);
    if (r && r.ok === false) return alert(r.error || 'No se pudo guardar.');
    setEditando(null);
  };

  if (!historial?.length) return null;

  return (
    <div className="card">
      <h4 style={{ margin: '0 0 0.5rem' }}>Últimos cierres</h4>
      {(puedeEliminar || puedeEditar) && (
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
          {puedeEditar ? 'Puede editar montos de un cierre guardado. ' : ''}
          {puedeEliminar ? 'Puede eliminar cortes de prueba (solo administrador).' : ''}
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
                  {puedeEditar && onGuardarEdicion && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', marginLeft: '0.25rem' }}
                      onClick={() => abrirEditar(h)}
                    >
                      Editar
                    </button>
                  )}
                  {puedeEliminar && onEliminar && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', color: 'var(--danger)', marginLeft: '0.25rem' }}
                      onClick={() => onEliminar(h.id, { folio: h.folio })}
                      title="Eliminar cierre de prueba"
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

      {editando && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => !guardando && setEditando(null)}
          role="presentation"
        >
          <div
            className="card"
            style={{ maxWidth: 420, width: '100%', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Editar cierre"
          >
            <h4 style={{ marginTop: 0 }}>Editar cierre {editando.folio || ''}</h4>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Tipo: {etiquetaTipoCierre(editando.detalle)} · {editando.created_at ? new Date(editando.created_at).toLocaleString() : '—'}
            </p>
            <label className="muted" style={{ display: 'block', marginBottom: '0.65rem' }}>
              Folio
              <input className="input" style={{ marginTop: '0.35rem' }} value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
            </label>
            <label className="muted" style={{ display: 'block', marginBottom: '0.65rem' }}>
              Ventas
              <input
                className="input"
                type="number"
                step="0.01"
                style={{ marginTop: '0.35rem' }}
                value={form.ventas}
                onChange={(e) => setForm({ ...form, ventas: e.target.value })}
              />
            </label>
            <label className="muted" style={{ display: 'block', marginBottom: '0.65rem' }}>
              Caja
              <input
                className="input"
                type="number"
                step="0.01"
                style={{ marginTop: '0.35rem' }}
                value={form.caja_actual}
                onChange={(e) => setForm({ ...form, caja_actual: e.target.value })}
              />
            </label>
            <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
              Comentarios
              <textarea
                className="input"
                rows={3}
                style={{ marginTop: '0.35rem', resize: 'vertical' }}
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" disabled={guardando} onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
