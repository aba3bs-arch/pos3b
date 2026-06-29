import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import { calcularVirtual, monedaInicialTurnoEfectiva, recoleccionTotalVirtual } from '../../lib/corteContabilidad/calc.js';
import { etiquetaTipoCierre, puedeEditarCorteCampo } from '../../lib/corteContabilidad/permisos.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { etiquetaTienda } from '../../constants/sucursales.js';

const COLOR = '#8e44ad';

function Campo({ label, value, onChange, editable = true, hint, color }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
      <span style={{ fontWeight: 700, color: color || 'var(--muted)' }}>{label}</span>
      <input
        className="input"
        type="number"
        step="0.01"
        inputMode="decimal"
        value={value ?? ''}
        {...(editable ? {} : { readOnly: true })}
        onChange={editable ? (e) => onChange?.(e.target.value) : undefined}
        style={{
          fontWeight: 700,
          textAlign: 'center',
          ...(editable ? {} : { opacity: 0.85, cursor: 'not-allowed', background: 'var(--surface)' }),
        }}
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
        <Campo label="Venta efectivo" value={estado.venta_manual ?? ''} hint="Vacío = moneda inicial actual − moneda final" onChange={(v) => patchEstado({ venta_manual: v })} />
        <Campo label="Subtotal del turno" value={estado.subtotal_manual ?? ''} hint="Vacío = venta − gastos − faltante" onChange={(v) => patchEstado({ subtotal_manual: v })} />
        <Campo label="Caja chica actual" value={estado.caja_actual_manual ?? ''} hint="Vacío = caja anterior + subtotal" onChange={(v) => patchEstado({ caja_actual_manual: v })} />
      </div>
    </div>
  );
}

export default function CorteVirtual({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado, calc, opts = {}) => {
    const { esActualizacion = false } = opts;
    const baseReset = {
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

    if (esActualizacion) {
      const mf = Number(estado.moneda_final) || 0;
      const refRecolector = mf > 0 ? mf : Number(estado.moneda_inicial) || 0;
      return {
        ...estado,
        ...baseReset,
        caja_anterior: 0,
        moneda_inicial: refRecolector,
        moneda_inicial_turno: refRecolector,
      };
    }

    const mf = Number(estado.moneda_final) || 0;
    const turnoSiguiente = mf > 0 ? mf : monedaInicialTurnoEfectiva(estado);
    return {
      ...estado,
      ...baseReset,
      moneda_inicial: estado.moneda_inicial,
      moneda_inicial_turno: turnoSiguiente,
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
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Moneda inicial actual: ${fmtCorte(monedaInicialTurnoEfectiva(estado))}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta efectivo: ${fmtCorte(calc.venta)}\n` +
      `Subtotal del turno: ${fmtCorte(calc.subtotal)}\n` +
      `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n\n` +
      `La moneda final será la moneda inicial actual del siguiente turno de cajero.`;
    if (confirm(msg)) cerrarCorte({ tipo_cierre: 'cierre' });
  };

  const actualizarMonedaInicial = () => {
    if (!perm.recoleccion) return alert('Solo el recolector (administrador o privilegio de recolección) puede actualizar la moneda inicial.');
    if (!estado.moneda_final_editada) {
      return alert('Capture la moneda final (conteo actual en caja) antes de actualizar la moneda inicial.');
    }
    const totalRec = recoleccionTotalVirtual(estado, calc);
    const mf = Number(estado.moneda_final) || 0;
    const msg =
      `¿Recolectar todo el efectivo y actualizar moneda inicial?\n\n` +
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Moneda final (nueva moneda inicial): ${fmtCorte(mf)}\n` +
      `Venta efectivo del turno: ${fmtCorte(calc.venta)}\n` +
      `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n` +
      `Recolección total: ${fmtCorte(totalRec)}\n\n` +
      `Se retira todo el dinero recolectado.\n` +
      `La caja chica quedará en $0.00 y la moneda inicial se actualizará a ${fmtCorte(mf)}.`;
    if (confirm(msg)) {
      cerrarCorte({
        tipo_cierre: 'actualizacion',
        recoleccion: totalRec,
        recoleccion_turno: totalRec,
        caja_actual_cierre: 0,
      });
    }
  };

  const cajaNegativa = calc.cajaActual < -0.001;
  const recoleccionCalculada = recoleccionTotalVirtual(estado, calc);
  const monedaTurnoActual = monedaInicialTurnoEfectiva(estado);
  const puedeMonedaFinal = puedeEditarCorteCampo(perm, 'moneda_final');
  const puedeMonedaInicialActual = Boolean(perm.moneda_inicial || perm.recoleccion || perm.editarTodo);
  const puedeFaltante = puedeEditarCorteCampo(perm, 'faltante');
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const puedeCerrarCorteTienda = perm.guardar && !perm.recoleccion;

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
          {puedeCerrarCorteTienda && (
            <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
              Cerrar corte · {etiquetaTienda(sucursal)}
            </button>
          )}
          {perm.recoleccion && (
            <button type="button" className="btn btn-gold" onClick={actualizarMonedaInicial} disabled={cargando}>
              Actualizar moneda · {etiquetaTienda(sucursal)}
            </button>
          )}
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div
        className="card"
        style={{
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(142,68,173,0.12), rgba(142,68,173,0.04))',
          border: '2px solid rgba(142,68,173,0.35)',
        }}
      >
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: COLOR, margin: '0.25rem 0' }}>{fmtCorte(monedaTurnoActual)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Moneda y venta</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <Campo
              label="Fondo fijo (ref)"
              value={estado.fondo ?? 0}
              editable={Boolean(perm.fondo || perm.editarTodo)}
              hint="Fijado por recolector · no afecta la venta"
              onChange={(v) => patchEstado({ fondo: v })}
            />
            <Campo
              label="Caja chica anterior (+)"
              value={estado.caja_anterior ?? 0}
              editable={Boolean(perm.caja_anterior || perm.editarTodo)}
              hint="Se arrastra entre cortes · solo recolector"
              onChange={(v) => patchEstado({ caja_anterior: v })}
            />
            <Campo
              label="Moneda inicial actual"
              value={monedaTurnoActual}
              editable={puedeMonedaInicialActual}
              hint={
                puedeMonedaInicialActual
                  ? 'La define el administrador o quien tenga privilegio de recolección'
                  : 'Fijada por administrador/recolector · al cerrar el corte anterior, era la moneda final'
              }
              onChange={(v) => patchEstado({ moneda_inicial_turno: v })}
            />
            <Campo
              label="Moneda final"
              value={estado.moneda_final ?? 0}
              editable={puedeMonedaFinal}
              hint="Efectivo al cierre del turno · será la moneda inicial actual del siguiente corte"
              onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
            />
            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(22,160,133,0.1)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>VENTA EFECTIVO</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: calc.venta < 0 ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.venta)}</div>
              <div className="muted" style={{ fontSize: '0.7rem' }}>Moneda inicial actual − moneda final</div>
            </div>
            <Campo
              label="Faltante (−)"
              value={estado.faltante ?? 0}
              editable={puedeFaltante}
              color="var(--danger)"
              onChange={(v) => patchEstado({ faltante: v })}
            />
            {perm.recoleccion && (
              <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(225,153,41,0.12)', borderRadius: 8 }}>
                <div className="muted" style={{ fontSize: '0.75rem' }}>Recolección total (al actualizar moneda)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-gold)' }}>{fmtCorte(recoleccionCalculada)}</div>
                <div className="muted" style={{ fontSize: '0.7rem' }}>
                  Venta efectivo + caja chica · la caja chica queda en $0.00
                </div>
              </div>
            )}
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
            habilitado={puedeEditarCorteCampo(perm, 'gastos')}
            puedeCatalogo={perm.editarTodo}
            puedeEditarGastos={perm.gastos || perm.editarTodo}
            notaNomina="Los consumos de empleados se descontarán en nómina."
          />
          <textarea
            className="input"
            placeholder="Comentarios"
            style={{ minHeight: 72 }}
            value={estado.comentarios || ''}
            readOnly={!puedeComentarios}
            onChange={(e) => patchEstado({ comentarios: e.target.value })}
          />
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Caja chica</h4>
          <div style={{ background: '#2c3e50', color: '#fff', padding: '0.75rem', borderRadius: 8, textAlign: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem' }}>Subtotal del turno</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1c40f' }}>{fmtCorte(calc.subtotal)}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Venta efectivo − gastos − faltante − consumos</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Caja chica actual</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#2980b9' }}>{fmtCorte(calc.cajaActual)}</div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              Caja chica anterior + subtotal del turno
            </p>
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
                  <th>Tipo</th>
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
                    <td>{etiquetaTipoCierre(h.detalle)}</td>
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
