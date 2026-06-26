import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import { calcularVirtual } from '../../lib/corteContabilidad/calc.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';

const COLOR = '#8e44ad';

function Campo({ label, value, onChange, readOnly, hint, color }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
      <span style={{ fontWeight: 700, color: color || 'var(--muted)' }}>{label}</span>
      <input
        className="input"
        type="number"
        step="0.01"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ fontWeight: 700, textAlign: 'center' }}
      />
      {hint && <span className="muted" style={{ fontSize: '0.7rem' }}>{hint}</span>}
    </label>
  );
}

function AjustesAdmin({ perm, estado, patchEstado }) {
  if (!perm.editarTodo) return null;
  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)' }}>
      <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 700 }}>Ajuste manual (administrador)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Campo label="Venta efectivo" value={estado.venta_manual ?? ''} hint="Vacío = automático" onChange={(v) => patchEstado({ venta_manual: v })} />
        <Campo label="Subtotal turno" value={estado.subtotal_manual ?? ''} hint="Vacío = automático" onChange={(v) => patchEstado({ subtotal_manual: v })} />
        <Campo label="Caja actual" value={estado.caja_actual_manual ?? ''} hint="Vacío = automático" onChange={(v) => patchEstado({ caja_actual_manual: v })} />
      </div>
    </div>
  );
}

export default function CorteVirtual({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado, calc) => {
    const mf = Number(estado.moneda_final) || 0;
    const siguienteMi = mf > 0 ? mf : Number(estado.moneda_inicial) || 0;
    return {
      ...estado,
      moneda_inicial: siguienteMi,
      moneda_inicial_turno: siguienteMi,
      moneda_final: 0,
      moneda_final_editada: false,
      caja_anterior: calc.cajaActual,
      recoleccion_turno: 0,
      recoleccion: 0,
      faltante: 0,
      comentarios: '',
      venta_manual: '',
      subtotal_manual: '',
      caja_actual_manual: '',
    };
  }, []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, editarGasto, calc, folio, turno, perm, aviso, cargando, historial, empleados, cerrarCorte } =
    useCorteContabilidad({
      supabase,
      sucursal,
      modulo: 'virtual',
      user,
      calcFn: calcularVirtual,
      prepararTrasCierre,
    });

  const confirmarCierre = () => {
    if (!estado.moneda_final_editada && perm.moneda_final) {
      if (!confirm('No capturó moneda final. Las ventas del turno se registrarán en $0.00.\n\n¿Continuar?')) return;
    }
    const msg =
      `¿Cerrar corte virtual?\n\n` +
      `Moneda inicial: ${fmtCorte(estado.moneda_inicial)}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta efectivo: ${fmtCorte(calc.venta)}\n` +
      `Gastos: ${fmtCorte(calc.gastosTotal)}\n` +
      `Recolección: ${fmtCorte(estado.recoleccion ?? estado.recoleccion_turno)}\n` +
      `Caja actual: ${fmtCorte(calc.cajaActual)}`;
    if (confirm(msg)) cerrarCorte();
  };

  const recoleccionYCierre = () => {
    if (!perm.recoleccion) return alert('Solo el administrador o usuarios con privilegio de recolección pueden hacer esto.');
    if (!estado.moneda_final_editada) {
      return alert('Capture la moneda final (conteo actual) antes de la recolección y cierre.');
    }
    const rec = Number(estado.recoleccion ?? estado.recoleccion_turno) || 0;
    const msg =
      `¿Recolección y cierre de turno?\n\n` +
      `Moneda final en corte: ${fmtCorte(estado.moneda_final)}\n` +
      `Recolección (retiro): ${fmtCorte(rec)}\n` +
      `Caja chica resultante: ${fmtCorte(calc.cajaActual)}\n\n` +
      `Se guardará el corte y la tienda iniciará operación con moneda inicial actualizada.`;
    if (confirm(msg)) cerrarCorte({ tipo_cierre: 'recoleccion' });
  };

  const cajaNegativa = calc.cajaActual < -0.001;
  const ro = perm.soloLectura;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Virtual</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Módulo contable independiente del POS · Folio {folio} · {turno}
            </p>
          </div>
          {perm.guardar && (
            <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
              Cerrar corte
            </button>
          )}
          {perm.recoleccion && (
            <button type="button" className="btn btn-gold" onClick={recoleccionYCierre} disabled={cargando}>
              Recolección y cierre
            </button>
          )}
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Moneda y venta</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <Campo label="Fondo fijo (ref)" value={estado.fondo ?? 0} readOnly={ro} hint="Referencia; no afecta la venta" onChange={(v) => patchEstado({ fondo: v })} />
            <Campo label="Caja anterior (+)" value={estado.caja_anterior ?? 0} readOnly={ro} onChange={(v) => patchEstado({ caja_anterior: v })} />
            <Campo
              label="Moneda inicial"
              value={estado.moneda_inicial ?? 0}
              readOnly={!perm.moneda_inicial}
              onChange={(v) => patchEstado({ moneda_inicial: v, moneda_inicial_turno: v })}
            />
            <Campo
              label="Moneda final"
              value={estado.moneda_final ?? 0}
              readOnly={!perm.moneda_final}
              onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
            />
            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(22,160,133,0.1)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Venta efectivo</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: calc.venta < 0 ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.venta)}</div>
              <div className="muted" style={{ fontSize: '0.7rem' }}>Moneda inicial − moneda final</div>
            </div>
            <Campo label="Faltante (−)" value={estado.faltante ?? 0} readOnly={ro} color="var(--danger)" onChange={(v) => patchEstado({ faltante: v })} />
            <Campo
              label="Recolección (−)"
              value={estado.recoleccion ?? estado.recoleccion_turno ?? 0}
              readOnly={!perm.recoleccion}
              hint={perm.recoleccion ? 'Administrador o autorizados' : 'Sin permiso de recolección'}
              onChange={(v) => patchEstado({ recoleccion: v, recoleccion_turno: v })}
            />
            <AjustesAdmin perm={perm} estado={estado} patchEstado={patchEstado} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CorteGastosPanel
            modulo="virtual"
            supabase={supabase}
            sucursal={sucursal}
            empleados={empleados}
            gastos={gastos}
            onAgregar={agregarGasto}
            onEliminar={quitarGasto}
            onEditar={editarGasto}
            habilitado={perm.gastos}
            puedeCatalogo={perm.editarTodo}
            puedeEditarGastos={perm.editarTodo}
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
          <h4 style={{ margin: '0 0 0.75rem' }}>Caja chica</h4>
          <div style={{ background: '#2c3e50', color: '#fff', padding: '0.75rem', borderRadius: 8, textAlign: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem' }}>Subtotal turno</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1c40f' }}>{fmtCorte(calc.subtotal)}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Venta − gastos − faltante</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Caja chica actual</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#2980b9' }}>{fmtCorte(calc.cajaActual)}</div>
            {cajaNegativa && <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem' }}>CAJA EN NEGATIVO</div>}
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
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                    <td>{h.folio}</td>
                    <td>{fmtCorte(h.ventas)}</td>
                    <td>{fmtCorte(h.caja_actual)}</td>
                    <td className="muted">{h.usuario_nombre || '—'}</td>
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
