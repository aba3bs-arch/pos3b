import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import { calcularGarage, maquinasGarageDefault } from '../../lib/corteContabilidad/calc.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';

const COLOR = '#7f8c8d';

export default function CorteGarage({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado, calc) => ({
    ...estado,
    maquinas: maquinasGarageDefault(),
    pin1: 0,
    pin2: 0,
    dsch: 0,
    recoleccion: 0,
    caja_anterior: calc.cajaActual,
    comentarios: '',
  }), []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, calc, folio, turno, perm, aviso, cargando, historial, empleados, cerrarCorte } =
    useCorteContabilidad({
      supabase,
      sucursal,
      modulo: 'garage',
      user,
      calcFn: calcularGarage,
      prepararTrasCierre,
    });

  const maquinas = estado.maquinas || maquinasGarageDefault();

  const setMaquina = (key, val) => {
    patchEstado({ maquinas: { ...maquinas, [key]: val } });
  };

  const confirmarCierre = () => {
    const msg =
      `¿Cerrar corte garage?\n\n` +
      `Folio: ${folio}\n` +
      `Ventas turno: ${fmtCorte(calc.venta)}\n` +
      `Gastos: ${fmtCorte(calc.gastosTotal)}\n` +
      `Caja actual: ${fmtCorte(calc.cajaActual)}`;
    if (confirm(msg)) cerrarCorte();
  };

  const cajaNegativa = calc.cajaActual < -0.001;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Garage</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Lectura de máquinas · Folio {folio} · {turno}
            </p>
          </div>
          {perm.guardar && (
            <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
              Cerrar corte
            </button>
          )}
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Lectura máquinas</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            {Object.keys(maquinas).map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                <span style={{ width: 28, fontWeight: 700 }}>{k}</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  style={{ flex: 1, textAlign: 'center' }}
                  value={maquinas[k] ?? 0}
                  readOnly={perm.soloLectura}
                  onChange={(e) => setMaquina(k, e.target.value)}
                />
              </label>
            ))}
          </div>
          <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>PIN / DSCH</h4>
          {['pin1', 'pin2', 'dsch'].map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
              <span style={{ width: 48, fontWeight: 700 }}>{key.toUpperCase()}</span>
              <input
                className="input"
                type="number"
                step="0.01"
                style={{ flex: 1, textAlign: 'center' }}
                value={estado[key] ?? 0}
                readOnly={perm.soloLectura}
                onChange={(e) => patchEstado({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CorteGastosPanel
            modulo="garage"
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
            placeholder="Comentarios"
            style={{ minHeight: 72 }}
            value={estado.comentarios || ''}
            readOnly={!perm.comentarios}
            onChange={(e) => patchEstado({ comentarios: e.target.value })}
          />
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Resumen</h4>
          <p className="muted" style={{ fontSize: '0.85rem' }}>Caja chica anterior: {fmtCorte(estado.caja_anterior)}</p>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 700 }}>Recolección</span>
            <input
              className="input"
              type="number"
              step="0.01"
              style={{ marginTop: '0.25rem', textAlign: 'center', fontWeight: 700 }}
              value={estado.recoleccion ?? 0}
              readOnly={!perm.recoleccion}
              onChange={(e) => patchEstado({ recoleccion: e.target.value })}
            />
            {!perm.recoleccion && (
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0.25rem 0 0' }}>Recolección: solo administrador o usuarios autorizados.</p>
            )}
          </label>
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>Ventas turno</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{fmtCorte(calc.venta)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>Total caja</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.cajaActual)}</div>
            {cajaNegativa && <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem' }}>CAJA GARAGE EN NEGATIVO</div>}
          </div>
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
                  <th>Ventas</th>
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
