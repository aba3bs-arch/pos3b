import React, { useCallback, useMemo, useState } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CampoCorte from '../../components/corteContabilidad/CampoCorte.jsx';
import ResumenOperacionCorte from '../../components/corteContabilidad/ResumenOperacionCorte.jsx';
import {
  calcularVirtual,
  cajaChicaAcumulada,
  cajaVirtualEnNegativo,
  monedaInicialTurnoEfectiva,
  monedaRecolectorRef,
  prepararTrasRecoleccionVirtual,
  round2,
  siguienteMonedaInicialTurnoVirtual,
} from '../../lib/corteContabilidad/calc.js';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import { datosImpresionCorteActual, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { etiquetaTipoCierre, puedeEditarCorteCampo } from '../../lib/corteContabilidad/permisos.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { etiquetaTienda } from '../../constants/sucursales.js';

const COLOR = '#8e44ad';

function esCierreTurno(h) {
  const t = h?.detalle?.tipo_cierre;
  return t !== 'recoleccion' && t !== 'actualizacion';
}

export default function CorteVirtual({ supabase, sucursal, user, onNavigate }) {
  const prepararTrasCierre = useCallback((estado, calc) => {
    const turnoSiguiente = siguienteMonedaInicialTurnoVirtual(estado);
    return {
      ...estado,
      moneda_final: 0,
      moneda_final_editada: false,
      caja_anterior: round2(calc.cajaActual),
      recoleccion_turno: 0,
      recoleccion: 0,
      faltante: 0,
      comentarios: '',
      venta_manual: '',
      subtotal_manual: '',
      caja_actual_manual: '',
      moneda_inicial: estado.moneda_inicial,
      moneda_inicial_turno: turnoSiguiente,
      _mi_turno_inicializado: true,
    };
  }, []);

  const prepararTrasRecoleccion = useCallback((estado, calc, { nuevaMoneda }) => {
    return prepararTrasRecoleccionVirtual(estado, calc, { nuevaMoneda });
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
  } = useCorteContabilidad({
    supabase,
    sucursal,
    modulo: 'virtual',
    user,
    calcFn: calcularVirtual,
    prepararTrasCierre,
    prepararTrasRecoleccion,
  });

  const [corteAnteriorId, setCorteAnteriorId] = useState('');
  const [monedaFinalAnterior, setMonedaFinalAnterior] = useState('');

  const cortesAnteriores = useMemo(() => (historial || []).filter(esCierreTurno), [historial]);
  const monedaReferencia = monedaRecolectorRef(estado);
  const monedaInicioCorte = monedaInicialTurnoEfectiva(estado);
  const cajaAcumulada = cajaChicaAcumulada(estado, calc);
  const cajaNegativa = cajaVirtualEnNegativo(estado, calc);
  const monedaSobreInicial =
    estado.moneda_final_editada && round2(estado.moneda_final) > monedaInicioCorte + 0.001;

  const seleccionarCorteAnterior = (id) => {
    setCorteAnteriorId(id);
    const h = cortesAnteriores.find((x) => String(x.id) === String(id));
    setMonedaFinalAnterior(h?.detalle?.moneda_final ?? '');
  };

  const confirmarCierre = () => {
    if (!estado.moneda_final_editada && perm.moneda_final) {
      if (!confirm('No capturó moneda final. Las ventas del turno se registrarán en $0.00.\n\n¿Continuar?')) return;
    }
    const msg =
      `¿Cerrar corte virtual?\n\n` +
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Moneda inicial del corte: ${fmtCorte(monedaInicioCorte)}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta efectivo del turno: ${fmtCorte(calc.venta)}\n` +
      `Caja chica actual (acumulada): ${fmtCorte(calc.cajaActual)}\n\n` +
      `La moneda final pasará al siguiente turno.\n` +
      `La caja acumulada se arrastra al siguiente corte.`;
    if (confirm(msg)) cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    const montoRec = round2(estado.recoleccion ?? estado.recoleccion_turno);
    const msg =
      `¿Registrar recolección?\n\n` +
      `Recolector: ${user?.nombre || '—'}\n` +
      `Precolección (moneda contada): ${fmtCorte(estado.precoleccion)}\n` +
      `Recolección en efectivo: ${fmtCorte(montoRec)}\n` +
      `Caja chica del periodo: ${fmtCorte(cajaAcumulada)}\n\n` +
      `Se recoge el efectivo y el periodo reinicia en ${fmtCorte(0)}.\n` +
      `Moneda de referencia e inicio de operación: ${fmtCorte(estado.precoleccion)}.\n` +
      `Los gastos del periodo quedan registrados en historial y nómina.`;
    if (!confirm(msg)) return;
    const res = await registrarRecoleccion({
      corteAnteriorId: corteAnteriorId || null,
      monedaFinalAnterior: corteAnteriorId ? monedaFinalAnterior : null,
    });
    if (res?.ok) {
      setCorteAnteriorId('');
      setMonedaFinalAnterior('');
    }
  };

  const irPrestamoArea = () => {
    if (!onNavigate) return alert('Abra Vales y Préstamos → Préstamos área para solicitar fondos.');
    onNavigate('Vales y Préstamos', { pestana: 'prestamos', retorno: 'Corte Virtual' });
  };

  const aplicarReferenciaMoneda = () => {
    if (!perm.recoleccion && !perm.editarTodo) return alert('Solo el administrador o recolector puede ajustar la moneda de referencia.');
    const ref = round2(estado.moneda_inicial);
    if (!confirm(`¿Usar ${fmtCorte(ref)} como moneda de referencia (morado) e inicio de turno?\n\nNo retira efectivo; solo corrige la referencia.`)) return;
    patchEstado({
      moneda_inicial: ref,
      moneda_inicial_turno: ref,
      _mi_turno_inicializado: true,
    });
    alert('Moneda de referencia actualizada.');
  };

  const puedeMonedaFinal = puedeEditarCorteCampo(perm, 'moneda_final');
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const puedeCerrarCorteTienda = perm.guardar;

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
              Módulo contable independiente del POS · Folio {folio} · {turno}
            </p>
          </div>
          {puedeCerrarCorteTienda && (
            <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
              Cerrar corte · {etiquetaTienda(sucursal)}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
            Imprimir corte
          </button>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
      </div>

      {cajaNegativa && (
        <div
          className="card"
          style={{
            border: '2px solid var(--danger)',
            background: 'rgba(192,57,43,0.08)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, color: 'var(--danger)' }}>Caja chica en negativo</div>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              {monedaSobreInicial
                ? 'La moneda final supera la moneda inicial del corte (premio sin fondos). Solicite préstamo de área.'
                : 'Revise gastos o solicite préstamo de área.'}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={irPrestamoArea} disabled={!onNavigate}>
            Solicitud de préstamo
          </button>
        </div>
      )}

      <div
        className="card"
        style={{
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(142,68,173,0.12), rgba(142,68,173,0.04))',
          border: '2px solid rgba(142,68,173,0.35)',
        }}
      >
        <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Moneda inicial de referencia
        </div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: COLOR, margin: '0.25rem 0' }}>{fmtCorte(monedaReferencia)}</div>
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
          Fijada por el recolector en recolección · no cambia al cerrar turno
        </p>
        {perm.recoleccion && (
          <div style={{ maxWidth: 320, margin: '0.75rem auto 0', textAlign: 'left' }}>
            <CampoCorte
              label="Moneda de referencia (morado)"
              value={estado.moneda_inicial ?? ''}
              editable
              hint="Corrección manual de referencia"
              onChange={(v) => patchEstado({ moneda_inicial: v })}
            />
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.35rem', width: '100%' }} onClick={aplicarReferenciaMoneda} disabled={cargando}>
              Aplicar referencia al turno
            </button>
          </div>
        )}
        <ResumenOperacionCorte venta={calc.venta} gastos={calc.gastosTotal} ventaNeta={calc.ventaNeta} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Moneda y venta</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }} data-corte-form="virtual-moneda">
            <CampoCorte
              label="Fondo fijo"
              value={estado.fondo ?? 0}
              editable={Boolean(perm.editarTodo)}
              hint="Referencia del administrador · no afecta la venta"
              onChange={(v) => patchEstado({ fondo: v })}
            />
            <CampoCorte
              label="Caja chica anterior (+)"
              value={estado.caja_anterior ?? 0}
              editable={Boolean(perm.caja_anterior || perm.editarTodo)}
              hint="Ventas acumuladas de turnos anteriores (sin gastos del turno previo)"
              onChange={(v) => patchEstado({ caja_anterior: v })}
            />
            <CampoCorte
              label="Moneda inicial del corte"
              value={monedaInicioCorte}
              editable={false}
              hint="Arranca con referencia del recolector · cada cierre pasa la moneda final al siguiente turno"
            />
            {!perm.recoleccion && (
              <CampoCorte
                label="Moneda final"
                value={estado.moneda_final ?? ''}
                editable={puedeMonedaFinal}
                hint="Efectivo al cierre del turno · pasa a ser moneda inicial del siguiente turno"
                onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
              />
            )}
            {perm.guardar && perm.recoleccion && (
              <CampoCorte
                label="Moneda final (mi turno)"
                value={estado.moneda_final ?? ''}
                editable={puedeMonedaFinal}
                hint="Moneda al cerrar tu turno como cajero"
                onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
              />
            )}
            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(22,160,133,0.1)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>VENTA EFECTIVO (turno actual)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: calc.venta < 0 ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.venta)}</div>
              <div className="muted" style={{ fontSize: '0.7rem' }}>Moneda inicial del corte − moneda final</div>
            </div>

            {perm.recoleccion && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: 8,
                  border: '2px solid rgba(142,68,173,0.35)',
                  background: 'rgba(142,68,173,0.06)',
                }}
                data-corte-form="virtual-recoleccion"
              >
                <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: COLOR }}>
                  RECOLECCIÓN VIRTUAL
                </div>

                {cortesAnteriores.length > 0 && (
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>Corte anterior (para recolección)</span>
                    <select
                      className="select"
                      value={corteAnteriorId}
                      onChange={(e) => seleccionarCorteAnterior(e.target.value)}
                    >
                      <option value="">— Turno abierto / sin seleccionar —</option>
                      {cortesAnteriores.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.folio} · {h.usuario_nombre || '—'} · venta {fmtCorte(h.ventas)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {corteAnteriorId && (
                  <CampoCorte
                    label="Moneda final del corte anterior"
                    value={monedaFinalAnterior}
                    editable
                    hint="Actualice la moneda final tras retirar efectivo del periodo anterior"
                    onChange={(v) => setMonedaFinalAnterior(v)}
                  />
                )}

                <CampoCorte
                  label="Precolección (moneda contada ahora)"
                  value={estado.precoleccion ?? ''}
                  editable
                  hint="Moneda en caja tras retirar efectivo · actualiza referencia morada al registrar"
                  onChange={(v) => patchEstado({ precoleccion: v, _precoleccion_editada: true })}
                />
                <CampoCorte
                  label="Recolección ($)"
                  value={estado.recoleccion_turno ?? estado.recoleccion ?? ''}
                  editable
                  hint="Efectivo retirado que anota el recolector (ej. $9,000)"
                  onChange={(v) => patchEstado({ recoleccion_turno: v, recoleccion: v })}
                />
                <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(225,153,41,0.12)', borderRadius: 8, marginTop: '0.5rem' }}>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Caja chica acumulada</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-gold)' }}>{fmtCorte(cajaAcumulada)}</div>
                  <div className="muted" style={{ fontSize: '0.7rem' }}>
                    Al registrar: periodo en {fmtCorte(0)} · operación con moneda {fmtCorte(estado.precoleccion || 0)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ width: '100%', marginTop: '0.65rem' }}
                  onClick={confirmarRecoleccion}
                  disabled={cargando || cajaNegativa}
                >
                  Registrar recolección
                </button>
              </div>
            )}

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
            notaNomina="Todos los gastos requieren aprobación del administrador. Los consumos de empleados se descontarán en nómina."
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
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Venta efectivo − gastos aprobados</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Caja chica actual</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#2980b9' }}>{fmtCorte(calc.cajaActual)}</div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              Caja anterior + subtotal − recolección · suma de ventas entre recolecciones
            </p>
            {cajaNegativa && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem', color: 'var(--danger)' }} onClick={irPrestamoArea}>
                Préstamo de área
              </button>
            )}
          </div>
        </div>
      </div>

      <CorteHistorialImpresion
        historial={historial}
        modulo="virtual"
        columnasExtra={[
          { key: 'tipo', label: 'Tipo', render: (h) => etiquetaTipoCierre(h.detalle) },
          { key: 'usuario', label: 'Usuario', render: (h) => h.usuario_nombre || '—' },
        ]}
      />
    </div>
  );
}
