import React, { useCallback, useState } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import {
  calcularVirtual,
  prepararTrasRecoleccionVirtual,
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

const ACCENT = '#6c3483';

function moneyNum(v) {
  if (v === '' || v == null) return '';
  return Number(v);
}

function Campo({ label, hint, children, emphasize }) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.28rem',
        padding: emphasize ? '0.65rem 0.75rem' : '0.15rem 0',
        borderRadius: emphasize ? 10 : 0,
        background: emphasize ? 'rgba(108,52,131,0.06)' : 'transparent',
        border: emphasize ? '1px solid rgba(108,52,131,0.2)' : 'none',
      }}
    >
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: emphasize ? ACCENT : 'var(--text, #1f2937)' }}>
        {label}
      </span>
      {children}
      {hint ? <span className="muted" style={{ fontSize: '0.72rem' }}>{hint}</span> : null}
    </label>
  );
}

function InputMoney({ value, onChange, editable, placeholder }) {
  if (!editable) {
    return (
      <div
        style={{
          fontSize: '1.15rem',
          fontWeight: 800,
          textAlign: 'right',
          padding: '0.45rem 0.55rem',
          background: 'var(--surface, #f8fafc)',
          borderRadius: 8,
          border: '1px solid var(--border, #e5e7eb)',
        }}
      >
        {fmtCorte(value)}
      </div>
    );
  }
  return (
    <input
      className="input"
      type="number"
      step="0.01"
      placeholder={placeholder || '0.00'}
      value={value === '' || value == null ? '' : value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}
    />
  );
}

function ResumenPill({ label, value, muted }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 100 }}>
      <div className="muted" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: muted ? 'var(--muted)' : ACCENT }}>{fmtCorte(value)}</div>
    </div>
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
  const puedeRec = Boolean(perm.recoleccion);
  const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
  const montoRec = round2(estado.recoleccion ?? estado.recoleccion_turno);

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

  const setRecoleccion = (v) => {
    const n = moneyNum(v);
    patchEstado({ recoleccion: n, recoleccion_turno: n });
  };

  const confirmarCierre = () => {
    if (!perm.guardar) return alert('Sin permiso para cerrar corte.');
    if (!confirm(
      `¿Cerrar corte virtual?\n\n` +
        `Moneda inicial: ${fmtCorte(mi)}\n` +
        `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
        `Venta efectivo: ${fmtCorte(calc.venta)}\n` +
        `Gastos: ${fmtCorte(calc.gastosTotal)}\n\n` +
        `Las ventas del cierre no van a IE. Solo la recolección contabiliza.`,
    )) return;
    cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    if (!puedeRec) return alert('Solo admin/recolector puede registrar recolección.');
    if (!(montoRec > 0)) return alert('Capture el monto de recolección (dato manual).');

    let cajaNueva = nuevaCajaChica !== '' ? round2(nuevaCajaChica) : null;
    if (cajaNueva == null) {
      const raw = window.prompt('Nueva caja chica después de recolectar:', String(estado.caja_anterior || 0));
      if (raw == null) return;
      cajaNueva = round2(raw);
    }

    if (!confirm(
      `¿Registrar recolección?\n\n` +
        `Monto (manual): ${fmtCorte(montoRec)} → IE VIRTUAL\n` +
        `Caja chica nueva: ${fmtCorte(cajaNueva)}\n\n` +
        `Se reinicia moneda inicial/final y se limpia el periodo de gastos.`,
    )) return;

    const res = await registrarRecoleccion({
      montoRecoleccion: montoRec,
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
      <div className="card" style={{ borderTop: `3px solid ${ACCENT}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: ACCENT, letterSpacing: '-0.02em' }}>Corte Virtual</h3>
            <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.84rem' }}>
              {etiquetaTienda(sucursal)} · Folio {folio} · {turno}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {perm.guardar && (
              <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
                Cerrar corte
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
              Imprimir
            </button>
            {puedeRec && (
              <button type="button" className="btn btn-gold" onClick={confirmarRecoleccion} disabled={cargando || !(montoRec > 0)}>
                Registrar recolección
              </button>
            )}
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.25rem',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '1rem 1.25rem',
        }}
      >
        <ResumenPill label="Venta efectivo" value={calc.venta} />
        <ResumenPill label="Gastos" value={calc.gastosTotal} />
        <ResumenPill label="Recolección" value={calc.recoleccion} />
        <ResumenPill label="Caja chica actual" value={calc.cajaActual} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <div className="card">
          <h4 style={{ margin: '0 0 0.85rem', color: ACCENT }}>Moneda virtual</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Campo label="Fondo" hint="Cambio / premios chicos · no es ingreso IE">
              <InputMoney
                value={estado.fondo ?? ''}
                editable={puedeFondo && puedeEditar}
                onChange={(v) => patchEstado({ fondo: moneyNum(v) })}
              />
            </Campo>
            <Campo label="Caja chica">
              <InputMoney
                value={estado.caja_anterior ?? ''}
                editable={puedeCaja && puedeEditar}
                onChange={(v) => patchEstado({ caja_anterior: moneyNum(v) })}
              />
            </Campo>
            <Campo label="Moneda inicial" hint="Captura del turno">
              <InputMoney
                value={estado.moneda_inicial_turno ?? estado.moneda_inicial ?? ''}
                editable={puedeMoneda && puedeEditar}
                onChange={setMi}
              />
            </Campo>
            <Campo label="Moneda final">
              <InputMoney
                value={estado.moneda_final ?? ''}
                editable={puedeMoneda && puedeEditar}
                onChange={setMf}
              />
            </Campo>
            <Campo label="Venta efectivo" hint="Moneda inicial − moneda final">
              <InputMoney value={calc.venta} editable={false} />
            </Campo>
            <Campo label="Gastos del periodo" hint="Suma del panel de gastos">
              <InputMoney value={calc.gastosTotal} editable={false} />
            </Campo>

            <Campo
              label="Recolección"
              emphasize
              hint={
                puedeRec
                  ? `Captura manual (solo este monto va a IE). Referencia: ${fmtCorte(calc.recoleccionSugerida)}`
                  : 'Solo el recolector/admin captura este monto'
              }
            >
              <InputMoney
                value={estado.recoleccion ?? estado.recoleccion_turno ?? ''}
                editable={puedeRec && puedeEditar}
                onChange={setRecoleccion}
                placeholder="Monto a retirar"
              />
            </Campo>

            <Campo label="Total / caja chica actual" hint="Caja chica + venta − gastos − recolección">
              <InputMoney value={calc.cajaActual} editable={false} />
            </Campo>

            {puedeRec && (
              <Campo label="Nueva caja chica (después de recolectar)" hint="Ej. dejar 10,000 al reiniciar el periodo">
                <InputMoney value={nuevaCajaChica} editable onChange={setNuevaCajaChica} placeholder={String(estado.caja_anterior || 0)} />
              </Campo>
            )}
          </div>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.35rem', color: ACCENT }}>Gastos del turno</h4>
          <p className="muted" style={{ fontSize: '0.76rem', margin: '0 0 0.75rem' }}>
            CubreTurno, Taxi y operativos afectan el corte pero no nómina.
            Solo consumo, recargas, anticipos y faltante (con empleado) descuentan nómina.
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
            notaNomina="Nómina: CONSUMO, RECARGAS, ANTICIPOS y FALTANTE. El resto no descuenta nómina."
          />
          <div
            style={{
              marginTop: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              background: 'var(--surface, #f8fafc)',
              border: '1px solid var(--border, #e5e7eb)',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Total gastos</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{fmtCorte(calc.gastosTotal)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: ACCENT }}>Comentarios</h4>
        <textarea
          className="input"
          value={estado.comentarios || ''}
          readOnly={!puedeComentarios}
          onChange={(e) => patchEstado({ comentarios: e.target.value })}
          placeholder="Notas del turno o de la recolección…"
          style={{ minHeight: 80, width: '100%', resize: 'vertical' }}
        />
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
