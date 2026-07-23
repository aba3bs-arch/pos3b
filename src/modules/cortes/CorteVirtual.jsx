import React, { useCallback, useState } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import {
  calcularVirtual,
  prepararTrasRecoleccionVirtual,
  recoleccionVirtualExcel,
  round2,
  siguienteMonedaInicialTurnoVirtual,
} from '../../lib/corteContabilidad/calc.js';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import {
  datosImpresionCorteActual,
  datosImpresionRecoleccionVirtual,
  imprimirCorteContabilidad,
  imprimirRecoleccionVirtual,
} from '../../lib/impresionCorteContabilidad.js';
import { etiquetaTipoCierre, puedeEditarCorteCampo } from '../../lib/corteContabilidad/permisos.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { etiquetaTienda } from '../../constants/sucursales.js';

const COLOR = '#8e44ad';

const cell = {
  border: '1px solid #333',
  padding: '0.35rem 0.5rem',
  fontSize: '0.9rem',
};

const inputCell = {
  ...cell,
  width: '100%',
  textAlign: 'right',
  fontWeight: 700,
  border: 'none',
  background: 'transparent',
  outline: 'none',
};

function moneyNum(v) {
  if (v === '' || v == null) return '';
  return Number(v);
}

/** Fila Excel: etiqueta | valor (editable o solo lectura). */
function Fila({
  label,
  value,
  editable,
  onChange,
  tone, // peach | yellow | black | green | none
  readOnlyDisplay,
}) {
  const bg =
    tone === 'peach'
      ? '#f8cbad'
      : tone === 'yellow'
        ? '#fff59d'
        : tone === 'black'
          ? '#111'
          : tone === 'green'
            ? '#c6efce'
            : '#fff';
  const color = tone === 'black' ? '#fff' : '#111';
  return (
    <tr>
      <td style={{ ...cell, background: bg, color, fontWeight: tone === 'black' || tone === 'green' ? 800 : 600 }}>
        {label}
      </td>
      <td style={{ ...cell, background: bg, color, textAlign: 'right', minWidth: 120 }}>
        {editable ? (
          <input
            type="number"
            step="0.01"
            value={value === '' || value == null ? '' : value}
            onChange={(e) => onChange?.(e.target.value)}
            style={{ ...inputCell, color }}
          />
        ) : (
          <strong style={{ fontWeight: 800 }}>{readOnlyDisplay ?? fmtCorte(value)}</strong>
        )}
      </td>
    </tr>
  );
}

export default function CorteVirtual({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado, calc) => {
    const turnoSiguiente = siguienteMonedaInicialTurnoVirtual(estado);
    return {
      ...estado,
      moneda_final: 0,
      moneda_final_editada: false,
      caja_anterior: round2(calc.cajaChica ?? estado.caja_anterior),
      recoleccion_turno: 0,
      recoleccion: 0,
      faltante: 0,
      comentarios: '',
      venta_manual: '',
      subtotal_manual: '',
      caja_actual_manual: '',
      moneda_inicial: turnoSiguiente,
      moneda_inicial_turno: turnoSiguiente,
      _mi_turno_inicializado: true,
    };
  }, []);

  const prepararTrasRecoleccion = useCallback((estado, calc, opts) => {
    return prepararTrasRecoleccionVirtual(estado, calc, opts);
  }, []);

  const {
    estado,
    patchEstado,
    gastos,
    agregarGasto,
    quitarGasto,
    editarGasto,
    calc,
    folio,
    turno,
    perm,
    aviso,
    cargando,
    historial,
    empleados,
    cerrarCorte,
    registrarRecoleccion,
    eliminarCierreHistorial,
  } = useCorteContabilidad({
    supabase,
    sucursal,
    modulo: 'virtual',
    user,
    calcFn: calcularVirtual,
    prepararTrasCierre,
    prepararTrasRecoleccion,
  });

  const [nuevaCajaChica, setNuevaCajaChica] = useState('');

  const puedeEditar = !perm.soloLectura;
  const puedeMoneda = puedeEditarCorteCampo(perm, 'moneda_final') || perm.editarTodo || perm.recoleccion;
  const puedeCaja = Boolean(perm.caja_anterior || perm.editarTodo || perm.recoleccion);
  const puedeFondo = Boolean(perm.editarTodo || perm.recoleccion);
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
  const recCalc = recoleccionVirtualExcel(estado, calc);

  const setMi = (v) => {
    const n = moneyNum(v);
    patchEstado({
      moneda_inicial: n,
      moneda_inicial_turno: n,
      moneda_inicial_editada: true,
      _mi_turno_inicializado: true,
    });
  };

  const setMf = (v) => {
    patchEstado({ moneda_final: moneyNum(v), moneda_final_editada: true });
  };

  const confirmarCierre = () => {
    if (!perm.guardar) return alert('Sin permiso para cerrar corte.');
    const msg =
      `¿Cerrar corte virtual?\n\n` +
      `Moneda inicial: ${fmtCorte(mi)}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta-Efvo: ${fmtCorte(calc.venta)}\n` +
      `Gastos: ${fmtCorte(calc.gastosTotal)}\n\n` +
      `Este cierre no va a IE. Solo la recolección entra a contabilidad.`;
    if (confirm(msg)) cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    if (!perm.recoleccion) return alert('Solo admin/recolector puede recolectar.');
    const monto = recCalc;
    const rawCaja =
      nuevaCajaChica !== ''
        ? nuevaCajaChica
        : window.prompt(
            `Recolección ${fmtCorte(monto)} (Caja chica + Venta − Gastos).\n\n¿Nueva Caja chica después de recolectar?`,
            String(estado.caja_anterior || 0),
          );
    if (rawCaja == null) return;
    const cajaNueva = round2(rawCaja);
    if (!confirm(
      `¿Registrar recolección?\n\n` +
        `Caja chica ${fmtCorte(estado.caja_anterior)} + Venta ${fmtCorte(calc.venta)} − Gastos ${fmtCorte(calc.gastosTotal)}\n` +
        `= ${fmtCorte(monto)} → IE VIRTUAL\n\n` +
        `Después quedará como la plantilla: MI/MF/venta/gastos/rec = 0 · Caja chica = ${fmtCorte(cajaNueva)}`,
    )) return;

    const res = await registrarRecoleccion({
      montoRecoleccion: monto,
      nuevaCajaChica: cajaNueva,
    });
    if (!res?.ok) {
      if (res?.error) alert(res.error);
      return;
    }
    setNuevaCajaChica('');
    imprimirRecoleccionVirtual(
      datosImpresionRecoleccionVirtual({
        sucursal,
        folio: res.folio,
        user,
        estado: res.estadoImpresion,
        gastos: res.gastosImpresion,
        calc: res.calcImpresion,
        recoleccion: res.recoleccion,
      }),
    );
    alert(`Recolección ${fmtCorte(res.recoleccion)} registrada. Ticket impreso.`);
  };

  const imprimirBorrador = () => {
    imprimirCorteContabilidad(
      datosImpresionCorteActual({ modulo: 'virtual', sucursal, folio, turno, user, estado, gastos, calc }),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Virtual</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Plantilla Excel · Folio {folio} · {turno} · {etiquetaTienda(sucursal)}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {perm.guardar && (
              <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
                Cerrar corte
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
              Imprimir corte
            </button>
            {perm.recoleccion && (
              <button type="button" className="btn btn-gold" onClick={confirmarRecoleccion} disabled={cargando}>
                Recolectar e imprimir
              </button>
            )}
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
          Captura en la plantilla. El <strong>faltante</strong> va en Gastos → FALTANTE (nómina). Solo recolección a IE.
          Nómina: consumo, recargas, anticipos y faltante — no CubreTurno/Taxi/operativos.
        </p>
      </div>

      {/* Plantilla Excel: MONEDA VIRTUAL | GASTOS X TURNO */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1.2fr)',
          gap: '0.75rem',
          alignItems: 'start',
        }}
      >
        <div style={{ border: '2px solid #333', background: '#fff', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <Fila label="MONEDA VIRTUAL" value="" tone="green" editable={false} readOnlyDisplay=" " />
              <Fila
                label="Fondo"
                value={estado.fondo ?? ''}
                editable={puedeFondo && puedeEditar}
                tone="peach"
                onChange={(v) => patchEstado({ fondo: moneyNum(v) })}
              />
              <Fila
                label="Caja chica"
                value={estado.caja_anterior ?? ''}
                editable={puedeCaja && puedeEditar}
                tone="peach"
                onChange={(v) => patchEstado({ caja_anterior: moneyNum(v) })}
              />
              <Fila
                label="Moneda Inicial"
                value={estado.moneda_inicial_turno ?? estado.moneda_inicial ?? ''}
                editable={puedeMoneda && puedeEditar}
                onChange={setMi}
              />
              <Fila
                label="Moneda Final"
                value={estado.moneda_final ?? ''}
                editable={puedeMoneda && puedeEditar}
                onChange={setMf}
              />
              <Fila label="Venta-Efvo" value={calc.venta} tone="yellow" editable={false} />
              <Fila label="Gastos" value={calc.gastosTotal} tone="yellow" editable={false} />
              <Fila label="RECOLECCION" value={recCalc} tone="black" editable={false} />
              <Fila label="Total" value={calc.total} tone="yellow" editable={false} />
            </tbody>
          </table>
          <div style={{ height: 8, background: '#5b9bd5' }} />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <Fila label="Caja Chica Actual" value={calc.cajaActual} tone="yellow" editable={false} />
            </tbody>
          </table>
          {perm.recoleccion && (
            <div style={{ padding: '0.5rem', borderTop: '1px solid #333', fontSize: '0.8rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="muted">Nueva caja chica al recolectar (como tras actualizar a 10,000)</span>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder={String(estado.caja_anterior || 0)}
                  value={nuevaCajaChica}
                  onChange={(e) => setNuevaCajaChica(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <div style={{ border: '2px solid #333', background: '#fff', minHeight: 320 }}>
          <div
            style={{
              ...cell,
              background: '#c6efce',
              textAlign: 'center',
              fontWeight: 800,
              borderBottom: '2px solid #333',
            }}
          >
            GASTOS X TURNO
          </div>
          <div style={{ padding: '0.5rem' }}>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              Incluye CubreTurno, Taxi, Limp. Baño, etc. (afectan el corte, <strong>no</strong> nómina).
              Solo <strong>CONSUMO, RECARGAS, ANTICIPOS y FALTANTE</strong> descuentan nómina (elige empleado).
            </p>
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
              notaNomina="Nómina solo: CONSUMO, RECARGAS, ANTICIPOS y FALTANTE (con empleado). CubreTurno, Taxi y operativos no van a nómina."
            />
            <div
              style={{
                marginTop: '0.65rem',
                padding: '0.45rem 0.55rem',
                background: '#fff59d',
                border: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 800,
                color: '#c0392b',
                fontStyle: 'italic',
              }}
            >
              <span>GASTOS X TURNO</span>
              <span>{fmtCorte(calc.gastosTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ border: '2px solid #333', background: '#fff' }}>
        <div style={{ ...cell, background: '#c6efce', fontWeight: 800, borderBottom: '1px solid #333' }}>COMENTARIOS</div>
        <textarea
          value={estado.comentarios || ''}
          readOnly={!puedeComentarios}
          onChange={(e) => patchEstado({ comentarios: e.target.value })}
          placeholder="Ej. recolecté y actualicé a 10,000…"
          style={{
            width: '100%',
            minHeight: 72,
            border: 'none',
            padding: '0.65rem',
            resize: 'vertical',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ height: 6, background: '#70ad47' }} />
      </div>

      <CorteHistorialImpresion
        historial={historial}
        modulo="virtual"
        puedeEliminar={perm.editarTodo}
        onEliminar={eliminarCierreHistorial}
        columnasExtra={[
          { key: 'tipo', label: 'Tipo', render: (h) => etiquetaTipoCierre(h.detalle) },
          { key: 'usuario', label: 'Usuario', render: (h) => h.usuario_nombre || '—' },
        ]}
      />
    </div>
  );
}
