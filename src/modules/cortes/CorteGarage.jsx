import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteInversionesPanel from '../../components/corteContabilidad/CorteInversionesPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CorteNegativoRecuperacion from '../../components/corteContabilidad/CorteNegativoRecuperacion.jsx';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import CampoCorte, { InputCorteInline } from '../../components/corteContabilidad/CampoCorte.jsx';
import CorteConTeclado from '../../components/corteContabilidad/CorteConTeclado.jsx';
import ResumenOperacionCorte from '../../components/corteContabilidad/ResumenOperacionCorte.jsx';
import {
  calcularGarage,
  CLAVES_LECTURA_GARAGE,
  maquinasGarageDefault,
  prepararTrasCierreGarage,
  prepararTrasRecoleccionGarage,
  round2,
} from '../../lib/corteContabilidad/calc.js';
import { etiquetaTipoCierre } from '../../lib/corteContabilidad/permisos.js';
import {
  datosImpresionCorteActual,
  datosImpresionRecoleccionGarage,
  imprimirCorteContabilidad,
  imprimirRecoleccionGarage,
} from '../../lib/impresionCorteContabilidad.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { actualizarDetalleCierre } from '../../lib/corteContabilidad/store.js';
import {
  calcularPagoClienteRecoleccion,
  esSucursalClienteMaquinas,
  patchDetalleIeSoloGanancia60,
  registrarPagoClienteRecoleccionIe,
  slugDesdeSucursalCliente,
} from '../../lib/clientesMaquinas.js';

const COLOR = '#7f8c8d';

export default function CorteGarage({ supabase, sucursal, user, sinAlertas = false, etiquetaCliente = '' }) {
  const prepararTrasCierre = useCallback((estado, calc, detalleExtra) => {
    return prepararTrasCierreGarage(estado, calc, detalleExtra);
  }, []);

  const prepararTrasRecoleccion = useCallback((estado, calc, opts) => {
    return prepararTrasRecoleccionGarage(estado, calc, opts);
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
    historialEliminados,
    empleados,
    cerrarCorte,
    registrarRecoleccion,
    eliminarCierreHistorial,
    editarCierreHistorial,
    restaurarCierreHistorial,
    recargar,
    vistaRecuperacion,
    puedeAbonarLiquidarPrestamo,
    puedeGenerarPagareCorte,
    abonarPrestamoDesdeCorte,
    liquidarPrestamoDesdeCorte,
    generarPagareDesdeCorte,
  } = useCorteContabilidad({
    supabase,
    sucursal,
    modulo: 'garage',
    user,
    calcFn: calcularGarage,
    prepararTrasCierre,
    prepararTrasRecoleccion,
  });

  const maquinasBase = maquinasGarageDefault();
  const maquinas = { ...maquinasBase, ...(estado.maquinas || {}) };
  const puedeEditar = !perm.soloLectura;
  const montoRec = round2(estado.recoleccion);
  const montoAnt = round2(estado.recoleccion_anterior);

  const setMaquina = (key, val) => {
    const next = { ...maquinasBase };
    for (const k of CLAVES_LECTURA_GARAGE) next[k] = maquinas[k] ?? 0;
    next[key] = val;
    patchEstado({ maquinas: next });
  };

  const confirmarCierre = () => {
    if (
      !confirm(
        `¿Cerrar corte garage?\n\n` +
          `Folio: ${folio}\n` +
          `Venta actual: ${fmtCorte(calc.venta)}\n` +
          `Gastos: ${fmtCorte(calc.gastosTotal)}\n` +
          `Venta neta: ${fmtCorte(calc.ventaNeta)}\n` +
          `Recolección: ${fmtCorte(calc.recoleccion)}\n` +
          `Recolección anterior: ${fmtCorte(calc.recoleccionAnterior)}\n` +
          `Saldo en caja: ${fmtCorte(calc.cajaActual)}\n\n` +
          `Gastos y faltantes se conservan para el siguiente turno.\n` +
          `Solo van a IE (y quedan en cero) al generar recolección con máquinas en cero.`,
      )
    ) {
      return;
    }
    cerrarCorte();
  };

  const generarRecoleccion = async () => {
    if (!perm.recoleccion) {
      return alert('Solo administrador o recolector autorizado puede generar la recolección.');
    }
    if (!(montoRec > 0) && !(montoAnt > 0)) {
      return alert('Indica un monto en Recolección o debe existir recolección anterior.');
    }

    const totalSiCeros = round2(montoRec + montoAnt);
    const maquinasEnCero = confirm(
      `¿Las máquinas y la dispensadora de chamoy y salsa quedaron en cero?\n\n` +
        `Recolección actual: ${fmtCorte(montoRec)}\n` +
        `Recolección anterior: ${fmtCorte(montoAnt)}\n` +
        (montoAnt > 0
          ? `Total a liquidar si aceptas (actual + anterior): ${fmtCorte(totalSiCeros)}\n`
          : '') +
        `Gastos/faltantes acumulados: ${fmtCorte(calc.gastosTotal)}\n\n` +
        `• Aceptar = SÍ → definitiva: se suma la anterior al monto actual, desglose 60/40, gastos en cero y escala a Contabilidad/IE.\n` +
        `• Cancelar = NO → temporal: el monto actual pasa a recolección anterior; gastos siguen; NO va a IE.`,
    );

    if (!maquinasEnCero && !(montoRec > 0)) {
      return alert('Para recolección temporal indica un monto en el campo Recolección.');
    }

    const res = await registrarRecoleccion({
      montoRecoleccion: montoRec,
      maquinasEnCero,
    });
    if (!res?.ok) {
      if (res?.error) alert(res.error);
      return;
    }

    let pagoCliente = null;
    // Solo recolección definitiva: a IE Virtual solo la ganancia 60%.
    if (!res.temporal && esSucursalClienteMaquinas(sucursal)) {
      pagoCliente = calcularPagoClienteRecoleccion({
        modulo: 'garage',
        venta: res.calcImpresion?.venta ?? calc?.venta,
        recoleccion: res.recoleccionActual ?? montoRec,
        recoleccionAnterior: res.recoleccionAnteriorIncluida ?? 0,
      });
      const etiqueta = etiquetaCliente || slugDesdeSucursalCliente(sucursal);
      if (res.cierreId) {
        try {
          await actualizarDetalleCierre(
            supabase,
            res.cierreId,
            {
              pago_cliente: pagoCliente,
              etiqueta_cliente: etiqueta,
              ticket_socio_3b_guardado_at: new Date().toISOString(),
              ...patchDetalleIeSoloGanancia60(pagoCliente),
            },
            sucursal,
            'garage',
          );
          if (res.estadoImpresion && typeof res.estadoImpresion === 'object') {
            res.estadoImpresion.pago_cliente = pagoCliente;
            res.estadoImpresion.etiqueta_cliente = etiqueta;
            Object.assign(res.estadoImpresion, patchDetalleIeSoloGanancia60(pagoCliente));
          }
          await recargar?.();
        } catch (errDetalle) {
          console.warn('No se pudo guardar el desglose Socio 3B en el cierre:', errDetalle);
        }
      }
      await registrarPagoClienteRecoleccionIe(supabase, {
        clienteNombre: etiqueta,
        clienteSlug: slugDesdeSucursalCliente(sucursal),
        sucursalId: sucursal,
        pago: pagoCliente,
        folio: res.folio,
        user,
        modulo: 'garage',
      });
    }

    imprimirRecoleccionGarage(
      datosImpresionRecoleccionGarage({
        sucursal,
        folio: res.folio,
        user,
        estado: res.estadoImpresion,
        gastos: res.gastosImpresion,
        calc: res.calcImpresion,
        recoleccion: res.recoleccion,
        temporal: res.temporal,
        pago_cliente: pagoCliente,
        etiqueta_cliente: etiquetaCliente || null,
      }),
    );

    alert(
      res.temporal
        ? `Recolección temporal ${res.folio}: ${fmtCorte(res.recoleccionActual ?? res.recoleccion)}.\n` +
            `Queda en recolección anterior: ${fmtCorte(res.recoleccionAnteriorTras)}.\n` +
            `Lecturas en cero. Gastos/faltantes siguen abiertos. No va a IE.`
        : `Recolección ${res.folio}: ${fmtCorte(res.recoleccion)}` +
            (res.recoleccionAnteriorIncluida > 0
              ? ` (actual ${fmtCorte(res.recoleccionActual)} + anterior ${fmtCorte(res.recoleccionAnteriorIncluida)})`
              : '') +
            `.\n` +
            `Máquinas y dispensadora en ceros. Gastos/faltantes en cero.\n` +
            (pagoCliente?.ganancia_empresa
              ? `IE Virtual solo ganancia 60%: ${fmtCorte(pagoCliente.ganancia_empresa)}\n(Socio 40% ${fmtCorte(pagoCliente.pago_cliente)} no se registra en IE)\n`
              : '') +
            (res.pendienteIe
              ? 'Transferencia a IE pendiente de aprobación (ABB/FJBB/JLBB).'
              : 'Recolección registrada en Contabilidad/IE.'),
    );
  };

  const cajaNegativa = calc.cajaActual < -0.001;

  const imprimirBorrador = () => {
    imprimirCorteContabilidad(
      datosImpresionCorteActual({ modulo: 'garage', sucursal, folio, turno, user, estado, gastos, calc }),
    );
  };

  return (
    <CorteConTeclado accent={COLOR}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!sinAlertas ? (
      <CorteNegativoRecuperacion
        etiqueta="Garage"
        negativo={vistaRecuperacion?.negativo}
        recuperado={vistaRecuperacion?.recuperado}
        deuda={vistaRecuperacion?.deuda}
        cajaActual={vistaRecuperacion?.cajaActual ?? calc.cajaActual}
        visible={vistaRecuperacion?.visible}
        cubiertoPorVenta={vistaRecuperacion?.cubiertoPorVenta}
        pendienteCajaRecuperada={vistaRecuperacion?.pendienteCajaRecuperada}
        avisoEntregarTurno={vistaRecuperacion?.avisoEntregarTurno}
        esCubreTurno={vistaRecuperacion?.esCubreTurno}
        puedeAbonarLiquidar={puedeAbonarLiquidarPrestamo}
        puedeGenerarPagare={puedeGenerarPagareCorte}
        onAbonar={abonarPrestamoDesdeCorte}
        onLiquidar={liquidarPrestamoDesdeCorte}
        onGenerarPagare={generarPagareDesdeCorte}
      />
      ) : null}
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Garage{etiquetaCliente ? ` · ${etiquetaCliente}` : ''}</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {etiquetaCliente ? `Socio 3B · ${etiquetaCliente}` : 'Lectura de máquinas'} · Folio {folio} · {turno}
              {sinAlertas ? ' · Sin alertas' : ''}
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
          user={user}
          empleados={empleados}
          gastos={gastos}
          onAgregar={agregarGasto}
          onEliminar={quitarGasto}
          onEditar={editarGasto}
          habilitado={perm.gastos}
          puedeCatalogo={perm.editarTodo}
          puedeEditarGastos={perm.editarTodo}
          notaNomina="Gastos y faltantes se acumulan entre turnos hasta la recolección con máquinas en cero (entonces van a IE). CUBRE TURNO → nómina. Vales y préstamos requieren admin."
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
              label="Recolección anterior"
              value={estado.recoleccion_anterior ?? ''}
              editable={perm.recoleccion || perm.editarTodo}
              hint="Se conserva al cerrar corte. Solo se limpia con una recolección definitiva (máquinas en ceros)."
              onChange={(v) => patchEstado({ recoleccion_anterior: v })}
            />
            <div>
              <CampoCorte
                label="Recolección"
                value={estado.recoleccion ?? ''}
                editable={perm.recoleccion}
                hint={perm.recoleccion ? 'Efectivo retirado · usa el botón para generar el archivo' : 'Solo administrador o usuarios autorizados'}
                onChange={(v) => patchEstado({ recoleccion: v })}
              />
              {perm.recoleccion && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '0.45rem', width: '100%' }}
                  disabled={cargando || !(montoRec > 0)}
                  onClick={generarRecoleccion}
                >
                  Generar recolección
                </button>
              )}
            </div>
            {montoAnt > 0 && (
              <p className="muted" style={{ fontSize: '0.75rem', margin: 0 }}>
                Hay {fmtCorte(montoAnt)} en recolección anterior (pendiente de cuadre hasta máquinas en ceros).
              </p>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <div style={{ fontWeight: 700 }}>Saldo en caja</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.cajaActual)}</div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              Venta neta − recolección − recolección anterior
              {calc.recoleccionTotal > 0 ? ` (${fmtCorte(calc.recoleccionTotal)})` : ''}
            </p>
          </div>

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Comentarios</h4>
            <textarea
              className="input"
              placeholder="Notas del turno…"
              style={{ minHeight: 96, width: '100%', boxSizing: 'border-box' }}
              value={estado.comentarios || ''}
              readOnly={!perm.comentarios}
              inputMode="text"
              onChange={(e) => patchEstado({ comentarios: e.target.value })}
            />
          </div>
        </div>
      </div>

      <CorteHistorialImpresion
        historial={historial}
        historialEliminados={historialEliminados}
        modulo="garage"
        puedeEliminar={perm.editarTodo}
        puedeEditar={perm.editarTodo || perm.guardar}
        onEliminar={eliminarCierreHistorial}
        onGuardarEdicion={editarCierreHistorial}
        onRestaurar={restaurarCierreHistorial}
        columnasExtra={[
          {
            key: 'tipo',
            label: 'Tipo',
            render: (h) => etiquetaTipoCierre(h?.detalle),
          },
        ]}
      />
    </div>
    </CorteConTeclado>
  );
}
