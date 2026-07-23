import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CampoCorte from '../../components/corteContabilidad/CampoCorte.jsx';
import {
  aplicarInyeccionMonedaVirtual,
  calcularVirtual,
  prepararTrasCierreVirtual,
  prepararTrasRecoleccionVirtual,
  round2,
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
  const prepararTrasCierre = useCallback((estado, calc) => {
    return prepararTrasCierreVirtual(estado, calc);
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
  const puedeMonedaFinal = puedeEditarCorteCampo(perm, 'moneda_final') || perm.editarTodo;
  const puedeCaja = Boolean(perm.caja_anterior || perm.editarTodo || perm.recoleccion);
  const puedeFondo = Boolean(perm.editarTodo || perm.recoleccion);
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const puedeRec = Boolean(perm.recoleccion);
  const puedeMonedaOperacion = Boolean(perm.editarTodo || perm.recoleccion);
  const puedeInyectarMi = Boolean(perm.editarTodo);
  const miCorte = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
  const monedaOperacion = round2(estado.moneda_inicial);
  const montoRec = round2(estado.recoleccion ?? estado.recoleccion_turno);
  const miInyectada = Boolean(calc.monedaInyectada);

  const confirmarCierre = () => {
    if (!perm.guardar) return alert('Sin permiso para cerrar corte.');
    if (!confirm(
      `¿Cerrar corte virtual?\n\n` +
        `Moneda operación (ref): ${fmtCorte(monedaOperacion)}\n` +
        `Moneda inicial (corte): ${fmtCorte(miCorte)}\n` +
        `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
        `Venta: ${fmtCorte(calc.venta)}\n` +
        `Gastos: ${fmtCorte(calc.gastosTotal)}\n` +
        `Subtotal: ${fmtCorte(calc.subtotal)}\n` +
        `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n\n` +
        `Siguiente corte: MI = MF · caja chica = actual.\n` +
        `Este cierre no va a IE. Gastos quedan en cero para el siguiente corte.`,
    )) return;
    cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    if (!puedeRec) return alert('Solo admin/recolector puede recolectar.');
    if (!(montoRec > 0)) return alert('Indique el monto a recolectar.');

    const miSiguiente = round2(estado.moneda_final_editada || round2(estado.moneda_final) > 0
      ? estado.moneda_final
      : miCorte);

    if (!confirm(
      `¿Registrar recolección?\n\n` +
        `Monto: ${fmtCorte(montoRec)} → IE VIRTUAL\n` +
        `Caja chica quedará en ${fmtCorte(0)}\n` +
        `Próxima moneda inicial = moneda final: ${fmtCorte(miSiguiente)}\n` +
        `Tope de operación (referencia): ${fmtCorte(monedaOperacion)}\n\n` +
        `No se inyecta moneda automáticamente. Si hace falta, el admin la inyecta en Moneda inicial.`,
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
        `Caja chica en $0.00.\n` +
        `Moneda inicial del próximo corte: ${fmtCorte(res.miSiguiente ?? miSiguiente)}.`,
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
            <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: ACCENT, letterSpacing: '0.02em' }}>
                Moneda tope de la operación
              </span>
              {puedeMonedaOperacion && puedeEditar ? (
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={estado.moneda_inicial ?? ''}
                  onChange={(e) => {
                    const v = moneyNum(e.target.value);
                    const patch = { moneda_inicial: v };
                    if (!estado._mi_turno_inicializado) {
                      patch.moneda_inicial_turno = v;
                      patch.moneda_turno_base = v;
                      patch._mi_turno_inicializado = true;
                    }
                    patchEstado(patch);
                  }}
                  style={{
                    width: 140,
                    fontWeight: 800,
                    color: ACCENT,
                    borderColor: ACCENT,
                    fontSize: '1.05rem',
                  }}
                />
              ) : (
                <strong style={{ color: ACCENT, fontSize: '1.25rem', letterSpacing: '0.01em' }}>
                  {fmtCorte(monedaOperacion)}
                </strong>
              )}
            </div>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.72rem' }}>
              Solo referencia · entre turnos la MI del corte es la MF anterior · no se autoinyecta
            </p>
            {miInyectada && (
              <p className="moneda-virtual-aviso-inyeccion">
                Se inyectó moneda virtual al portal
                {calc.monedaInyectadaMonto
                  ? ` (${fmtCorte(calc.monedaInyectadaMonto)})`
                  : ''}
              </p>
            )}
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
          <h4 style={{ margin: '0 0 0.85rem', color: ACCENT }}>Corte</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <CampoCorte
              label="Fondo fijo"
              value={estado.fondo ?? 0}
              editable={puedeFondo && puedeEditar}
              hint="Se arrastra · no interviene en la venta"
              onChange={(v) => patchEstado({ fondo: moneyNum(v) })}
            />
            <CampoCorte
              label="Caja chica (anterior)"
              value={estado.caja_anterior ?? 0}
              editable={puedeCaja && puedeEditar}
              hint="Del corte anterior · en recolección queda en $0"
              onChange={(v) => patchEstado({ caja_anterior: moneyNum(v) })}
            />
            <CampoCorte
              label="Moneda inicial"
              value={estado.moneda_inicial_turno ?? estado.moneda_inicial ?? ''}
              editable={puedeInyectarMi && puedeEditar}
              hint={
                puedeInyectarMi
                  ? 'Bloqueada para cajero · solo admin inyecta aquí'
                  : 'Moneda final del corte anterior (bloqueada)'
              }
              color={miInyectada ? '#15803d' : '#1d4ed8'}
              inputClassName={miInyectada ? 'moneda-virtual-mi-inyectada' : 'moneda-virtual-mi-normal'}
              onChange={(v) => patchEstado(aplicarInyeccionMonedaVirtual(estado, moneyNum(v)))}
            />
            <CampoCorte
              label="Moneda final"
              value={estado.moneda_final ?? ''}
              editable={puedeMonedaFinal && puedeEditar}
              onChange={(v) => patchEstado({ moneda_final: moneyNum(v), moneda_final_editada: true })}
            />
            <CampoCorte
              label="Venta efectivo"
              value={calc.venta}
              editable={false}
              hint="Moneda inicial − moneda final"
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
              hint="Venta efectivo − gastos"
            />
            <CampoCorte
              label="Caja chica actual"
              value={calc.cajaActual}
              editable={false}
              hint="Caja chica anterior + subtotal"
              color={ACCENT}
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
                hint={puedeRec ? 'Solo va a IE · no inyecta moneda al tope' : 'Solo recolector/admin'}
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
            Nómina: consumo, recargas, anticipos y faltante (con empleado). Si el descuento supera el sueldo, el saldo se arrastra a siguientes pagos.
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
            notaNomina="Nómina: CONSUMO, RECARGAS, ANTICIPOS y FALTANTE (puede descontarse en varios pagos)."
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
