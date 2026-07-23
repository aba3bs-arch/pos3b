import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CampoCorte from '../../components/corteContabilidad/CampoCorte.jsx';
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
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : '';
}

export default function CorteVirtual({ supabase, sucursal, user }) {
  const prepararTrasCierre = useCallback((estado) => {
    const turnoSiguiente = siguienteMonedaInicialTurnoVirtual(estado);
    return {
      ...estado,
      // Fondo y caja chica se arrastran sin cambios
      fondo: round2(estado.fondo),
      caja_anterior: round2(estado.caja_anterior),
      moneda_final: 0,
      moneda_final_editada: false,
      moneda_inicial: estado.moneda_inicial,
      moneda_inicial_turno: turnoSiguiente,
      recoleccion_turno: 0,
      recoleccion: 0,
      faltante: 0,
      comentarios: '',
      venta_manual: '',
      subtotal_manual: '',
      caja_actual_manual: '',
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

  const puedeEditar = !perm.soloLectura;
  const puedeMoneda = puedeEditarCorteCampo(perm, 'moneda_final') || perm.editarTodo || perm.recoleccion;
  const puedeCaja = Boolean(perm.caja_anterior || perm.editarTodo || perm.recoleccion);
  const puedeFondo = Boolean(perm.editarTodo || perm.recoleccion);
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const puedeRec = Boolean(perm.recoleccion);
  const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
  const montoRec = round2(estado.recoleccion ?? estado.recoleccion_turno);

  const confirmarCierre = () => {
    if (!perm.guardar) return alert('Sin permiso para cerrar corte.');
    if (!confirm(
      `¿Cerrar corte virtual?\n\n` +
        `Moneda inicial: ${fmtCorte(mi)}\n` +
        `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
        `Venta: ${fmtCorte(calc.venta)}\n` +
        `Faltante: ${fmtCorte(calc.faltante)}\n` +
        `Gastos: ${fmtCorte(calc.gastosTotal)}\n\n` +
        `Fondo y caja chica se arrastran. Este cierre no va a IE.`,
    )) return;
    cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    if (!puedeRec) return alert('Solo admin/recolector puede recolectar.');
    if (!(montoRec > 0)) return alert('Indique el monto a recolectar.');

    const iny = calc.monedaInyectar;
    if (!confirm(
      `¿Registrar recolección?\n\n` +
        `Monto: ${fmtCorte(montoRec)} → IE VIRTUAL\n` +
        `Inyectar moneda al próximo corte: ${fmtCorte(iny)}\n` +
        `Caja chica quedará en ${fmtCorte(0)}\n` +
        `Fondo se conserva: ${fmtCorte(estado.fondo)}`,
    )) return;

    const res = await registrarRecoleccion({ montoRecoleccion: montoRec });
    if (!res?.ok) {
      if (res?.error) alert(res.error);
      return;
    }
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
    alert(
      `Recolección ${fmtCorte(res.recoleccion)} registrada.\n` +
        `Moneda inyectada: ${fmtCorte(res.monedaInyectar || iny)}\n` +
        `Caja chica en $0.00.`,
    );
  };

  const imprimirBorrador = () => {
    imprimirCorteContabilidad(
      datosImpresionCorteActual({ modulo: 'virtual', sucursal, folio, turno, user, estado, gastos, calc }),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-corte-form="virtual">
      <div className="card" style={{ borderTop: `3px solid ${ACCENT}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: ACCENT }}>Corte Virtual</h3>
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
              Imprimir corte
            </button>
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.85rem', color: ACCENT }}>Moneda</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <CampoCorte
              label="Fondo fijo"
              value={estado.fondo ?? 0}
              editable={puedeFondo && puedeEditar}
              hint="Se arrastra entre cortes · no interviene en la venta"
              onChange={(v) => patchEstado({ fondo: moneyNum(v) })}
            />
            <CampoCorte
              label="Caja chica"
              value={estado.caja_anterior ?? 0}
              editable={puedeCaja && puedeEditar}
              hint="Se arrastra entre cortes · en recolección queda en $0"
              onChange={(v) => patchEstado({ caja_anterior: moneyNum(v) })}
            />
            <CampoCorte
              label="Moneda inicial"
              value={estado.moneda_inicial_turno ?? estado.moneda_inicial ?? ''}
              editable={puedeMoneda && puedeEditar}
              onChange={(v) =>
                patchEstado({
                  moneda_inicial: moneyNum(v),
                  moneda_inicial_turno: moneyNum(v),
                  moneda_inicial_editada: true,
                  _mi_turno_inicializado: true,
                })
              }
            />
            <CampoCorte
              label="Moneda final"
              value={estado.moneda_final ?? ''}
              editable={puedeMoneda && puedeEditar}
              onChange={(v) => patchEstado({ moneda_final: moneyNum(v), moneda_final_editada: true })}
            />
            <CampoCorte
              label="Venta efectivo"
              value={calc.venta}
              editable={false}
              hint="Moneda inicial − moneda final"
            />
            <CampoCorte
              label="Faltante (−)"
              value={estado.faltante ?? 0}
              editable={puedeMoneda && puedeEditar}
              hint="Se resta de la venta. Para nómina regístrelo también en Gastos → FALTANTE con empleado."
              color="var(--danger)"
              onChange={(v) => patchEstado({ faltante: moneyNum(v) })}
            />
            <CampoCorte
              label="Gastos del turno"
              value={calc.gastosTotal}
              editable={false}
            />
            <CampoCorte
              label="Subtotal"
              value={calc.subtotal}
              editable={false}
              hint="Venta − faltante − gastos"
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '0.5rem',
                alignItems: 'end',
                marginTop: '0.35rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border, #e5e7eb)',
              }}
            >
              <CampoCorte
                label="Recolección"
                value={estado.recoleccion ?? estado.recoleccion_turno ?? ''}
                editable={puedeRec && puedeEditar}
                hint={
                  puedeRec
                    ? `Al confirmar se inyectan ${fmtCorte(calc.monedaInyectar)} al próximo corte`
                    : 'Solo recolector/admin'
                }
                onChange={(v) => patchEstado({ recoleccion: moneyNum(v), recoleccion_turno: moneyNum(v) })}
              />
              {puedeRec && (
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ height: 42, whiteSpace: 'nowrap', marginBottom: 2 }}
                  disabled={cargando || !(montoRec > 0)}
                  onClick={confirmarRecoleccion}
                >
                  Recolectar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.35rem', color: ACCENT }}>Gastos</h4>
          <p className="muted" style={{ fontSize: '0.76rem', margin: '0 0 0.75rem' }}>
            Nómina solo: consumo, recargas, anticipos y faltante (con empleado).
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
            notaNomina="Nómina: CONSUMO, RECARGAS, ANTICIPOS y FALTANTE."
          />
        </div>
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: ACCENT }}>Comentarios</h4>
        <textarea
          className="input"
          value={estado.comentarios || ''}
          readOnly={!puedeComentarios}
          onChange={(e) => patchEstado({ comentarios: e.target.value })}
          placeholder="Notas del turno…"
          style={{ minHeight: 72, width: '100%', resize: 'vertical' }}
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
