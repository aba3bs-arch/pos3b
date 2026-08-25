import React, { useCallback, useEffect } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteInversionesPanel from '../../components/corteContabilidad/CorteInversionesPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CorteNegativoRecuperacion from '../../components/corteContabilidad/CorteNegativoRecuperacion.jsx';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import CorteConTeclado from '../../components/corteContabilidad/CorteConTeclado.jsx';
import { calcularAbarrotes } from '../../lib/corteContabilidad/calc.js';
import { datosImpresionCorteActual, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { procesarRifsVencidos } from '../../lib/rifs.js';

const COLOR = '#b5a642';

const CAMPOS = [
  { key: 'fondo_fijo', label: 'Fondo fijo (ref)', perm: true },
  { key: 'caja_anterior', label: 'Caja chica anterior (+)' },
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
    subtotal_manual: '',
    caja_actual_manual: '',
  }), []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, editarGasto, calc, folio, turno, perm, aviso, cargando, historial, historialEliminados, empleados, cerrarCorte, eliminarCierreHistorial, editarCierreHistorial, restaurarCierreHistorial, recargar } =
    useCorteContabilidad({
      supabase,
      sucursal,
      modulo: 'abarrotes',
      user,
      calcFn: calcularAbarrotes,
      prepararTrasCierre,
    });

  useEffect(() => {
    if (!supabase) return undefined;
    let cancel = false;
    (async () => {
      const r = await procesarRifsVencidos(supabase, { usuarioNombre: user?.nombre || 'sistema' });
      if (!cancel && r.procesados > 0) recargar();
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, sucursal, user?.nombre, recargar]);

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

  const imprimirBorrador = () => {
    imprimirCorteContabilidad(
      datosImpresionCorteActual({
        modulo: 'abarrotes',
        sucursal,
        folio: estado.folio || folio,
        turno,
        user,
        estado,
        gastos,
        calc,
      }),
    );
  };

  return (
    <CorteConTeclado accent={COLOR}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <CorteNegativoRecuperacion cajaActual={calc.cajaActual} etiqueta="Abarrotes" />
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
              inputMode="text"
              onChange={(e) => patchEstado({ folio: e.target.value })}
              placeholder="Folio"
            />
            {perm.guardar && (
              <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
                Cerrar corte
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
              Imprimir corte
            </button>
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Movimientos</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {CAMPOS.map(({ key, label, danger }) => {
              const editable = !(perm.soloLectura || (key === 'recoleccion' && !perm.recoleccion));
              return (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--muted)' }}>{label}</span>
                <input
                  className={`input${editable ? ' corte-campo-editable' : ''}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={estado[key] ?? 0}
                  readOnly={!editable}
                  onFocus={editable ? (e) => e.target.select() : undefined}
                  onChange={(e) => patchEstado({ [key]: e.target.value })}
                  style={{ fontWeight: 700, textAlign: 'center' }}
                />
              </label>
              );
            })}
            {perm.editarTodo && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem', fontWeight: 700 }}>Ajuste manual (admin)</div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                  <span className="muted">Subtotal turno</span>
                  <input className="input corte-campo-editable" type="text" inputMode="decimal" autoComplete="off" value={estado.subtotal_manual ?? ''} placeholder="Automático" onFocus={(e) => e.target.select()} onChange={(e) => patchEstado({ subtotal_manual: e.target.value })} style={{ fontWeight: 700, textAlign: 'center' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem' }}>
                  <span className="muted">Caja final</span>
                  <input className="input corte-campo-editable" type="text" inputMode="decimal" autoComplete="off" value={estado.caja_actual_manual ?? ''} placeholder="Automático" onFocus={(e) => e.target.select()} onChange={(e) => patchEstado({ caja_actual_manual: e.target.value })} style={{ fontWeight: 700, textAlign: 'center' }} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#2c3e50', color: '#fff', padding: '1rem', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem' }}>Subtotal turno</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1c40f' }}>{fmtCorte(calc.subtotal)}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Venta − egresos − tarjeta − faltante</div>
          </div>
          <CorteInversionesPanel
            modulo="abarrotes"
            supabase={supabase}
            sucursal={sucursal}
            user={user}
            habilitado={perm.gastos || perm.editarTodo}
            onCobrado={() => recargar()}
          />
          <CorteGastosPanel
            modulo="abarrotes"
            supabase={supabase}
            sucursal={sucursal}
            user={user}
            empleados={empleados}
            gastos={gastos}
            onAgregar={agregarGasto}
            onEliminar={quitarGasto}
            onEditar={editarGasto}
            habilitado={perm.gastos}
            puedeCatalogo={perm.editarTodo}
            puedeEditarGastos={perm.editarTodo}
            notaNomina="Gastos sin aprobación. Categorías IE Abarrotes + PROVEEDORES. CUBRE TURNO → IE Abarrotes (nómina). Consumo/recargas/anticipos/faltante descuentan al empleado."
          />
          <textarea
            className="input"
            placeholder="Observaciones"
            style={{ minHeight: 72 }}
            value={estado.comentarios || ''}
            readOnly={!perm.comentarios}
            inputMode="text"
            onChange={(e) => patchEstado({ comentarios: e.target.value })}
          />
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 1rem' }}>Caja chica</h4>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Caja chica anterior</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)' }}>
            {fmtCorte(estado.caja_anterior)}
          </div>
          <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.85rem' }}>Caja chica actual</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#27ae60' }}>
            {fmtCorte(calc.cajaActual)}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Anterior + subtotal − recolección
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
            Gastos turno: {fmtCorte(calc.gastosTotal)}
          </div>
        </div>
      </div>

      <CorteHistorialImpresion
        historial={historial}
        historialEliminados={historialEliminados}
        modulo="abarrotes"
        puedeEliminar={perm.editarTodo}
        puedeEditar={perm.editarTodo || perm.guardar}
        onEliminar={eliminarCierreHistorial}
        onGuardarEdicion={editarCierreHistorial}
        onRestaurar={restaurarCierreHistorial}
      />
    </div>
    </CorteConTeclado>
  );
}
