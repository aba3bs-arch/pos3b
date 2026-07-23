import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteInversionesPanel from '../../components/corteContabilidad/CorteInversionesPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import CampoCorte, { InputCorteInline } from '../../components/corteContabilidad/CampoCorte.jsx';
import ResumenOperacionCorte from '../../components/corteContabilidad/ResumenOperacionCorte.jsx';
import { calcularGarage, CLAVES_LECTURA_GARAGE, maquinasGarageDefault } from '../../lib/corteContabilidad/calc.js';
import { datosImpresionCorteActual, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';

const COLOR = '#7f8c8d';

export default function CorteGarage({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado) => {
    return {
      ...estado,
      maquinas: maquinasGarageDefault(),
      pin1: 0,
      pin2: 0,
      dsch: 0,
      recoleccion: 0,
      comentarios: '',
    };
  }, []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, editarGasto, calc, folio, turno, perm, aviso, cargando, historial, empleados, cerrarCorte, eliminarCierreHistorial, recargar } =
    useCorteContabilidad({
      supabase,
      sucursal,
      modulo: 'garage',
      user,
      calcFn: calcularGarage,
      prepararTrasCierre,
    });

  const maquinasBase = maquinasGarageDefault();
  const maquinas = { ...maquinasBase, ...(estado.maquinas || {}) };
  const puedeEditar = !perm.soloLectura;

  const setMaquina = (key, val) => {
    const next = { ...maquinasBase };
    for (const k of CLAVES_LECTURA_GARAGE) next[k] = maquinas[k] ?? 0;
    next[key] = val;
    patchEstado({ maquinas: next });
  };

  const confirmarCierre = () => {
    const msg =
      `¿Cerrar corte garage?\n\n` +
      `Folio: ${folio}\n` +
      `Venta actual: ${fmtCorte(calc.venta)}\n` +
      `Gastos: ${fmtCorte(calc.gastosTotal)}\n` +
      `Venta neta: ${fmtCorte(calc.ventaNeta)}\n` +
      `Saldo en caja: ${fmtCorte(calc.cajaActual)}`;
    if (confirm(msg)) cerrarCorte();
  };

  const cajaNegativa = calc.cajaActual < -0.001;

  const imprimirBorrador = () => {
    imprimirCorteContabilidad(
      datosImpresionCorteActual({ modulo: 'garage', sucursal, folio, turno, user, estado, gastos, calc }),
    );
  };

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
          <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
            Imprimir corte
          </button>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Lectura máquinas</h4>
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.65rem' }}>
            Venta actual = M1…M7 + PIN1 + PIN2 + DSCH. Enter avanza al siguiente campo.
          </p>
          <div data-corte-form="garage-lectura">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              {CLAVES_LECTURA_GARAGE.map((k) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <span style={{ width: 28, fontWeight: 700 }}>{k}</span>
                  <InputCorteInline
                    style={{ flex: 1 }}
                    value={maquinas[k] ?? ''}
                    editable={puedeEditar}
                    onChange={(v) => setMaquina(k, v)}
                  />
                </label>
              ))}
            </div>
            <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>PIN / DSCH</h4>
            {['pin1', 'pin2', 'dsch'].map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                <span style={{ width: 48, fontWeight: 700 }}>{key.toUpperCase()}</span>
                <InputCorteInline
                  style={{ flex: 1 }}
                  value={estado[key] ?? ''}
                  editable={puedeEditar}
                  onChange={(v) => patchEstado({ [key]: v })}
                />
              </label>
            ))}
          </div>
        </div>

        <CorteInversionesPanel
          modulo="garage"
          supabase={supabase}
          sucursal={sucursal}
          user={user}
          habilitado={perm.gastos || perm.editarTodo}
          onCobrado={() => recargar()}
        />
        <CorteGastosPanel
          modulo="garage"
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

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Resumen</h4>

          <div
            style={{
              textAlign: 'center',
              padding: '0.65rem',
              marginBottom: '0.75rem',
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(127,140,141,0.15), rgba(127,140,141,0.05))',
              border: '1px solid rgba(127,140,141,0.3)',
            }}
          >
            <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
              Venta actual
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COLOR }}>{fmtCorte(calc.venta)}</div>
            <p className="muted" style={{ fontSize: '0.7rem', margin: '0.25rem 0 0' }}>
              M1…M7 + PIN1 + PIN2 + DSCH
            </p>
            <ResumenOperacionCorte venta={calc.venta} gastos={calc.gastosTotal} ventaNeta={calc.ventaNeta} />
          </div>

          <div data-corte-form="garage-resumen" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <CampoCorte
              label="Recolección"
              value={estado.recoleccion ?? ''}
              editable={perm.recoleccion}
              hint={perm.recoleccion ? 'Efectivo retirado del turno' : 'Solo administrador o usuarios autorizados'}
              onChange={(v) => patchEstado({ recoleccion: v })}
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 700 }}>Saldo en caja</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.cajaActual)}</div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              Venta neta − recolección
            </p>
            {cajaNegativa && <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem' }}>CAJA GARAGE EN NEGATIVO</div>}
          </div>

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Comentarios</h4>
            <textarea
              className="input"
              placeholder="Notas del turno…"
              style={{ minHeight: 96, width: '100%', boxSizing: 'border-box' }}
              value={estado.comentarios || ''}
              readOnly={!perm.comentarios}
              onChange={(e) => patchEstado({ comentarios: e.target.value })}
            />
          </div>
        </div>
      </div>

      <CorteHistorialImpresion
        historial={historial}
        modulo="garage"
        puedeEliminar={perm.editarTodo}
        onEliminar={eliminarCierreHistorial}
      />
    </div>
  );
}
