import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import { calcularAbarrotes } from '../../lib/corteContabilidad/calc.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';

const COLOR = '#b5a642';

const CAMPOS = [
  { key: 'fondo_fijo', label: 'Fondo fijo (ref)', perm: true },
  { key: 'caja_anterior', label: 'Caja anterior (+)' },
  { key: 'venta', label: 'Venta total (+)' },
  { key: 'tarjeta', label: 'Pago tarjeta (−)' },
  { key: 'faltante', label: 'Faltante (−)', danger: true },
  { key: 'recoleccion', label: 'Recolección (−)' },
];

export default function CorteAbarrotes({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado, calc) => ({
    ...estado,
    caja_anterior: calc.cajaActual,
    venta: 0,
    tarjeta: 0,
    faltante: 0,
    recoleccion: 0,
    comentarios: '',
    fondo_fijo: Number(estado.fondo_fijo) || 0,
  }), []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, calc, folio, turno, perm, aviso, cargando, historial, empleados, cerrarCorte } =
    useCorteContabilidad({
      supabase,
      sucursal,
      modulo: 'abarrotes',
      user,
      calcFn: calcularAbarrotes,
      prepararTrasCierre,
    });

  const confirmarCierre = () => {
    const f = estado.folio || folio;
    if (!f?.trim()) return alert('Capture el folio de abarrotes.');
    const msg =
      `¿Cerrar corte abarrotes?\n\n` +
      `Folio: ${f}\n` +
      `Venta: ${fmtCorte(calc.venta)}\n` +
      `Subtotal: ${fmtCorte(calc.subtotal)}\n` +
      `Caja actual: ${fmtCorte(calc.cajaActual)}`;
    if (confirm(msg)) cerrarCorte();
  };

  const cajaNegativa = calc.cajaActual < -0.001;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Abarrotes</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Independiente del corte de caja POS · {turno}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              className="input"
              style={{ width: 110, fontWeight: 700 }}
              value={estado.folio ?? folio}
              readOnly={!perm.folio}
              onChange={(e) => patchEstado({ folio: e.target.value })}
              placeholder="Folio"
            />
            {perm.guardar && (
              <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
                Cerrar corte
              </button>
            )}
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        {cajaNegativa && (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--danger)', color: '#fff', borderRadius: 6, fontWeight: 700, textAlign: 'center' }}>
            ALERTA: CAJA EN NEGATIVO
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Movimientos</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {CAMPOS.map(({ key, label, danger }) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--muted)' }}>{label}</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={estado[key] ?? 0}
                  readOnly={perm.soloLectura || (key === 'recoleccion' && !perm.recoleccion)}
                  onChange={(e) => patchEstado({ [key]: e.target.value })}
                  style={{ fontWeight: 700, textAlign: 'center' }}
                />
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#2c3e50', color: '#fff', padding: '1rem', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem' }}>Subtotal turno</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1c40f' }}>{fmtCorte(calc.subtotal)}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Venta − egresos − tarjeta − faltante</div>
          </div>
          <CorteGastosPanel
            modulo="abarrotes"
            supabase={supabase}
            sucursal={sucursal}
            empleados={empleados}
            gastos={gastos}
            onAgregar={agregarGasto}
            onEliminar={quitarGasto}
            habilitado={perm.gastos}
            puedeCatalogo={perm.guardar}
          />
          <textarea
            className="input"
            placeholder="Observaciones"
            style={{ minHeight: 72 }}
            value={estado.comentarios || ''}
            readOnly={!perm.comentarios}
            onChange={(e) => patchEstado({ comentarios: e.target.value })}
          />
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 1rem' }}>Caja final</h4>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Efectivo en caja</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#27ae60' }}>{fmtCorte(calc.cajaActual)}</div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Gastos turno: {fmtCorte(calc.gastosTotal)}</div>
        </div>
      </div>

      {historial.length > 0 && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem' }}>Últimos cierres</h4>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Folio</th>
                  <th>Venta</th>
                  <th>Caja</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                    <td>{h.folio}</td>
                    <td>{fmtCorte(h.ventas)}</td>
                    <td>{fmtCorte(h.caja_actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
