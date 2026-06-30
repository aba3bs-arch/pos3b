import React, { useCallback } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CampoCorte from '../../components/corteContabilidad/CampoCorte.jsx';
import ResumenOperacionCorte from '../../components/corteContabilidad/ResumenOperacionCorte.jsx';
import {
  calcularVirtual,
  cajaVirtualEnNegativo,
  monedaInicialTurnoEfectiva,
  recoleccionTotalVirtual,
  round2,
  siguienteMonedaInicialTurnoVirtual,
} from '../../lib/corteContabilidad/calc.js';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import { datosImpresionCorteActual, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { etiquetaTipoCierre, puedeEditarCorteCampo } from '../../lib/corteContabilidad/permisos.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { etiquetaTienda } from '../../constants/sucursales.js';

const COLOR = '#8e44ad';

function AjustesAdmin({ perm, estado, patchEstado }) {
  if (!perm.editarTodo) return null;
  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)' }} data-corte-form="virtual-admin">
      <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 700 }}>Ajuste manual (administrador)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <CampoCorte label="Venta efectivo" value={estado.venta_manual ?? ''} hint="Vacío = moneda inicial − moneda final" onChange={(v) => patchEstado({ venta_manual: v })} />
        <CampoCorte label="Subtotal del turno" value={estado.subtotal_manual ?? ''} hint="Vacío = venta − gastos (incl. tarjeta, faltante, premios)" onChange={(v) => patchEstado({ subtotal_manual: v })} />
        <CampoCorte label="Caja chica actual" value={estado.caja_actual_manual ?? ''} hint="Vacío = caja anterior + subtotal" onChange={(v) => patchEstado({ caja_actual_manual: v })} />
      </div>
    </div>
  );
}

export default function CorteVirtual({ supabase, sucursal, user, onNavigate }) {
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
      const nuevaMoneda = estado.moneda_final_editada
        ? round2(estado.moneda_final)
        : round2(estado.moneda_inicial);
      return {
        ...estado,
        ...baseReset,
        caja_anterior: 0,
        moneda_inicial: nuevaMoneda,
        moneda_inicial_turno: nuevaMoneda,
        _mi_turno_inicializado: true,
      };
    }

    const turnoSiguiente = siguienteMonedaInicialTurnoVirtual(estado);
    return {
      ...estado,
      ...baseReset,
      moneda_inicial: turnoSiguiente,
      moneda_inicial_turno: turnoSiguiente,
      _mi_turno_inicializado: true,
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

  const monedaInicioCorte = monedaInicialTurnoEfectiva(estado);
  const cajaNegativa = cajaVirtualEnNegativo(estado, calc);
  const monedaSobreInicial =
    estado.moneda_final_editada && round2(estado.moneda_final) > monedaInicioCorte + 0.001;

  const confirmarCierre = () => {
    if (!estado.moneda_final_editada && perm.moneda_final) {
      if (!confirm('No capturó moneda final. Las ventas del turno se registrarán en $0.00.\n\n¿Continuar?')) return;
    }
    const msg =
      `¿Cerrar corte virtual?\n\n` +
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Moneda inicial: ${fmtCorte(monedaInicioCorte)}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta efectivo: ${fmtCorte(calc.venta)}\n` +
      `Gastos del turno: ${fmtCorte(calc.gastosTotal)}\n` +
      `Subtotal del turno: ${fmtCorte(calc.subtotal)}\n` +
      `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n\n` +
      `La moneda final (${fmtCorte(estado.moneda_final)}) pasará a ser la moneda inicial del siguiente turno.`;
    if (confirm(msg)) cerrarCorte({ tipo_cierre: 'cierre' });
  };

  const actualizarMonedaInicial = () => {
    if (!perm.recoleccion) return alert('Solo el administrador o recolector con privilegio puede actualizar la moneda inicial.');
    if (!estado.moneda_final_editada) {
      return alert('Capture la moneda final (conteo actual en caja) antes de actualizar la moneda inicial.');
    }
    if (cajaNegativa) {
      return alert(
        'No se puede recolectar: la caja chica está en negativo.\n\n' +
          `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n\n` +
          'Solicite un préstamo de área en Vales y Préstamos si pagó premios sin fondos.',
      );
    }
    const totalRec = recoleccionTotalVirtual(estado, calc);
    const mf = round2(estado.moneda_final);
    const msg =
      `¿Recolectar todo el efectivo y actualizar moneda inicial?\n\n` +
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Nueva moneda inicial: ${fmtCorte(mf)}\n` +
      `Venta efectivo del turno: ${fmtCorte(calc.venta)}\n` +
      `Caja chica actual: ${fmtCorte(calc.cajaActual)}\n` +
      `Recolección total: ${fmtCorte(totalRec)}\n\n` +
      `Se retira todo el dinero recolectado.\n` +
      `La caja chica quedará en $0.00.\n` +
      `La moneda inicial quedará en ${fmtCorte(mf)} hasta el próximo cierre de turno.`;
    if (confirm(msg)) {
      cerrarCorte({
        tipo_cierre: 'actualizacion',
        recoleccion: totalRec,
        recoleccion_turno: totalRec,
        caja_actual_cierre: 0,
      });
    }
  };

  const irPrestamoArea = () => {
    if (!onNavigate) return alert('Abra Vales y Préstamos → Préstamos área para solicitar fondos.');
    onNavigate('Vales y Préstamos', { pestana: 'prestamos', retorno: 'Corte Virtual' });
  };

  const recoleccionCalculada = recoleccionTotalVirtual(estado, calc);
  const puedeMonedaFinal = puedeEditarCorteCampo(perm, 'moneda_final');
  const puedeMonedaInicial = perm.moneda_inicial || perm.editarTodo;
  const puedeComentarios = puedeEditarCorteCampo(perm, 'comentarios');
  const puedeCerrarCorteTienda = perm.guardar && !perm.recoleccion;

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
          {perm.recoleccion && (
            <button type="button" className="btn btn-gold" onClick={actualizarMonedaInicial} disabled={cargando || cajaNegativa}>
              Actualizar moneda · {etiquetaTienda(sucursal)}
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
                ? 'La moneda final supera la moneda inicial (p. ej. premio pagado sin fondos). Solicite un préstamo de área.'
                : 'El subtotal dejó la caja por debajo de cero. Revise gastos o solicite un préstamo de área.'}
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
          Moneda inicial del turno
        </div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: COLOR, margin: '0.25rem 0' }}>{fmtCorte(monedaInicioCorte)}</div>
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
          Se actualiza en recolección (admin/recolector). Al cerrar turno, la moneda final pasa al siguiente turno.
        </p>
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
              hint="Referencia fijada por el administrador · no afecta la venta"
              onChange={(v) => patchEstado({ fondo: v })}
            />
            <CampoCorte
              label="Caja chica anterior (+)"
              value={estado.caja_anterior ?? 0}
              editable={Boolean(perm.caja_anterior || perm.editarTodo)}
              hint="Se arrastra entre turnos · admin o recolector"
              onChange={(v) => patchEstado({ caja_anterior: v })}
            />
            {puedeMonedaInicial && (
              <CampoCorte
                label="Moneda inicial (ajuste recolector)"
                value={estado.moneda_inicial ?? ''}
                editable
                hint="Corrección manual tras recolección; al cerrar turno usa la moneda final"
                onChange={(v) =>
                  patchEstado({
                    moneda_inicial: v,
                    moneda_inicial_turno: v,
                    _mi_turno_inicializado: true,
                  })
                }
              />
            )}
            <CampoCorte
              label="Moneda final"
              value={estado.moneda_final ?? ''}
              editable={puedeMonedaFinal}
              hint="Efectivo al cierre · al cerrar turno pasa a ser la moneda inicial del siguiente turno"
              onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
            />
            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(22,160,133,0.1)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>VENTA EFECTIVO</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: calc.venta < 0 ? 'var(--danger)' : '#16a085' }}>{fmtCorte(calc.venta)}</div>
              <div className="muted" style={{ fontSize: '0.7rem' }}>Moneda inicial − moneda final</div>
            </div>
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
            notaNomina="Registre aquí consumos, tarjeta, faltantes y premios. Los consumos de empleados se descontarán en nómina."
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
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Venta efectivo − gastos (tarjeta, faltante, premios, etc.)</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Caja chica actual</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#2980b9' }}>{fmtCorte(calc.cajaActual)}</div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
              Caja chica anterior + subtotal · lo que se entrega al siguiente turno
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
