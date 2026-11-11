import React, { useCallback, useEffect, useRef, useState } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import { createSubmitLock } from '../../lib/submitLock.js';
import CorteInversionesPanel from '../../components/corteContabilidad/CorteInversionesPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CorteHistorialImpresion from '../../components/corteContabilidad/CorteHistorialImpresion.jsx';
import CorteConTeclado from '../../components/corteContabilidad/CorteConTeclado.jsx';
import CandadoRecargasMp from '../../components/CandadoRecargasMp.jsx';
import { calcularAbarrotes, round2 } from '../../lib/corteContabilidad/calc.js';
import { datosImpresionCorteActual, imprimirCorteContabilidad } from '../../lib/impresionCorteContabilidad.js';
import { fmtCorte, useCorteContabilidad } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { puedeEditarCorteCampo } from '../../lib/corteContabilidad/permisos.js';
import AlertaPagareAbierto from '../../components/corteContabilidad/AlertaPagareAbierto.jsx';
import { usePagaresAbiertosCorte } from '../../lib/corteContabilidad/usePagaresAbiertosCorte.js';
import { procesarRifsVencidos } from '../../lib/rifs.js';
import { fechaCorteSugerida } from '../../lib/corteCaja.js';
import { cargarDiaCaja } from '../../lib/movimientosCaja.js';
import {
  ACCION_REGISTRAR_VENTA,
  registrarVentaRecargaMpAjuste,
  totalRecargasPos,
} from '../../lib/corteCajaRecargasMp.js';
import { aplicarAjusteRecargaMpEnVentaAbarrotes } from '../../lib/corteCajaSyncAbarrotes.js';
import { turnoActual } from '../../lib/turnos.js';

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
    venta_pos_por_corte: {},
    tarjeta: 0,
    faltante: 0,
    recoleccion: 0,
    comentarios: '',
    fondo_fijo: Number(estado.fondo_fijo) || 0,
    subtotal_manual: '',
    caja_actual_manual: '',
  }), []);

  const { estado, patchEstado, gastos, agregarGasto, quitarGasto, editarGasto, calc, folio, turno, perm, aviso, cargando, historial, historialEliminados, empleados, cerrarCorte, registrarRecoleccion, eliminarCierreHistorial, editarCierreHistorial, restaurarCierreHistorial, recargar } =
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

  const uiLock = useRef(createSubmitLock()).current;
  const [candadoRecargas, setCandadoRecargas] = useState(false);
  const [recargasPosTotal, setRecargasPosTotal] = useState(0);
  const [cargandoCandado, setCargandoCandado] = useState(false);

  const abrirCandadoCierre = async () => {
    const f = estado.folio || folio;
    if (!f?.trim()) return alert('Capture el folio de abarrotes.');
    setCargandoCandado(true);
    try {
      const turnoSesion = estado.turno_sesion || turnoActual();
      const fecha = fechaCorteSugerida(turnoSesion);
      const dia = await cargarDiaCaja(supabase, {
        sucursal,
        fecha,
        turno: turnoSesion,
      });
      setRecargasPosTotal(totalRecargasPos(dia?.ventas || [], dia?.cancelaciones || []));
    } catch {
      setRecargasPosTotal(0);
    } finally {
      setCargandoCandado(false);
    }
    setCandadoRecargas(true);
  };

  const confirmarCierreTrasCandado = async (candado) => {
    setCandadoRecargas(false);
    if (!uiLock.tryBegin()) return;
    try {
      const f = estado.folio || folio;
      let recargasMp = candado?.recargas_mp || null;
      let gastosPreview = gastos;
      let estadoCierre = { ...estado };
      const registroVentaMp = candado?.accion === ACCION_REGISTRAR_VENTA && candado?.montoVenta > 0.009;

      if (registroVentaMp) {
        const turnoSesion = estado.turno_sesion || turnoActual();
        const resVenta = await registrarVentaRecargaMpAjuste(supabase, {
          monto: candado.montoVenta,
          sucursal,
          user,
          turno: turnoSesion,
        });
        if (!resVenta?.ok) {
          alert(resVenta?.error || 'No se pudo registrar la venta de recarga en el POS.');
          return;
        }
        // También subir Venta del corte abarrotes (cierre + ticket) ya;
        // no esperar al Corte de caja (el cajero no puede editar ese campo).
        estadoCierre = aplicarAjusteRecargaMpEnVentaAbarrotes(estadoCierre, candado.montoVenta, {
          fecha: fechaCorteSugerida(turnoSesion),
          turnoId: turnoSesion?.id,
        });
        if (recargasMp) {
          recargasMp = {
            ...recargasMp,
            venta_id: resVenta.id || null,
            venta_offline: !!resVenta.offline,
            venta_corte_antes: round2(estado.venta),
            venta_corte_despues: round2(estadoCierre.venta),
            pos_despues: round2((Number(recargasMp.pos) || 0) + Number(candado.montoVenta)),
          };
        }
      } else if (candado?.faltante > 0.009) {
        if (!user?.id) {
          alert('No se pudo identificar al cajero/CT para cargar el faltante. Inicia sesión de nuevo.');
          return;
        }
        const resGasto = await agregarGasto({
          categoria: 'EMPLEADO',
          subcategoria: 'FALTANTE',
          monto: candado.faltante,
          comentario:
            `Recargas MP · terminal $${Number(candado.recargas_mp?.terminal).toFixed(2)}`
            + ` − POS $${Number(candado.recargas_mp?.pos).toFixed(2)}`
            + ` · cierre abarrotes folio ${f}`,
          usuario_id: user.id,
          usuario_nombre: user.nombre || null,
        });
        if (resGasto && resGasto.ok === false && !resGasto.cancelado) {
          return;
        }
        if (resGasto?.ok !== false) {
          gastosPreview = [
            ...(gastos || []),
            {
              categoria: 'EMPLEADO',
              subcategoria: 'FALTANTE',
              monto: candado.faltante,
            },
          ];
        }
      }

      const prevComentarios = String(estado.comentarios || '').trim();
      const comentariosCierre = candado?.notaExtra && !prevComentarios.includes(candado.notaExtra)
        ? (prevComentarios ? `${prevComentarios}\n${candado.notaExtra}` : candado.notaExtra)
        : prevComentarios;
      estadoCierre = { ...estadoCierre, comentarios: comentariosCierre };

      const calcCierre = calcularAbarrotes(estadoCierre, gastosPreview);

      const msg =
        `¿Cerrar corte abarrotes?\n\n` +
        `Folio: ${f}\n` +
        `Venta: ${fmtCorte(calcCierre.venta)}\n` +
        `Subtotal: ${fmtCorte(calcCierre.subtotal)}\n` +
        `Caja actual: ${fmtCorte(calcCierre.cajaActual)}\n` +
        `Recargas MP: terminal $${Number(candado?.recargas_mp?.terminal || 0).toFixed(2)}` +
        ` · POS $${Number(candado?.recargas_mp?.pos || 0).toFixed(2)}` +
        (registroVentaMp
          ? `\nVenta del corte +$${Number(candado.montoVenta).toFixed(2)} (recarga MP registrada en POS)`
          : '') +
        (candado?.faltante > 0.009
          ? `\nFaltante recargas a cargo: $${Number(candado.faltante).toFixed(2)}`
          : '');
      if (!confirm(msg)) return;
      const res = await cerrarCorte({
        recargas_mp: recargasMp,
        comentarios: comentariosCierre,
        ...(registroVentaMp
          ? {
            venta: estadoCierre.venta,
            venta_pos_por_corte: estadoCierre.venta_pos_por_corte,
          }
          : {}),
      });
      if (res?.ok) {
        imprimirCorteContabilidad(
          datosImpresionCorteActual({
            modulo: 'abarrotes',
            sucursal,
            folio: res.folio || f,
            turno: res.turno || turno,
            user,
            estado: res.estadoImpresion || estadoCierre,
            gastos: res.gastosImpresion || gastosPreview,
            calc: res.calcImpresion || calcCierre,
          }),
        );
      }
    } finally {
      uiLock.end();
    }
  };

  const montoRec = Number(estado.recoleccion) || 0;
  const confirmarRecoleccion = async () => {
    if (!uiLock.tryBegin()) return;
    try {
    if (!perm.recoleccion) return alert('Solo admin/recolector puede recolectar.');
    if (!(montoRec > 0)) return alert('Indique el monto a recolectar en el campo Recolección.');
    if (!confirm(
      `¿Registrar recolección de abarrotes?\n\n`
      + `Efectivo: ${fmtCorte(montoRec)}\n`
      + `Caja chica quedará en ${fmtCorte(calc.cajaActual)}\n\n`
      + `La recolección irá a RC Abarrotes → FJBB → IE ABARROTES (CEDIS).`,
    )) return;
    const res = await registrarRecoleccion({ montoRecoleccion: montoRec });
    if (!res?.ok) {
      if (res?.error) alert(res.error);
      return;
    }
    imprimirCorteContabilidad(
      datosImpresionCorteActual({
        modulo: 'abarrotes',
        sucursal,
        folio: res.folio,
        turno: 'RECOLECCION',
        user,
        estado: res.estadoImpresion || estado,
        gastos: res.gastosImpresion || gastos,
        calc: res.calcImpresion || calc,
      }),
    );
    alert(
      `Recolección ${fmtCorte(res.recoleccion)} registrada`
      + (res.pendienteIe
        ? '.\n⚠️ Pendiente en RC Abarrotes hasta que FJBB la reciba (IE ABARROTES / CEDIS).'
        : '.\nAprobada → IE ABARROTES.'),
    );
    } finally {
      uiLock.end();
    }
  };

  const { pagares: pagaresAbiertos, recargar: recargarPagares } = usePagaresAbiertosCorte(supabase, sucursal, 'abarrotes');
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
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Corte Abarrotes</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Venta = efectivo neto del Corte de caja (+ ajuste candado MP) · {turno}
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={abrirCandadoCierre}
                disabled={cargando || cargandoCandado}
                title="Antes de cerrar se pide el total de recargas de la terminal Mercado Pago"
              >
                {cargandoCandado ? 'Preparando…' : 'Cerrar corte'}
              </button>
            )}
            {perm.recoleccion && (
              <button
                type="button"
                className="btn btn-gold"
                onClick={confirmarRecoleccion}
                disabled={cargando || !(montoRec > 0)}
                title="Envía el efectivo a RC Abarrotes → FJBB → IE ABARROTES"
              >
                Recolectar
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
              const editable = key === 'venta'
                ? puedeEditarCorteCampo(perm, 'venta')
                : !(perm.soloLectura || (key === 'recoleccion' && !perm.recoleccion));
              return (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--muted)' }}>
                  {label}
                  {key === 'venta' && !editable ? ' (desde Corte de caja)' : ''}
                </span>
                <input
                  className={`input${editable ? ' corte-campo-editable' : ''}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={estado[key] ?? 0}
                  readOnly={!editable}
                  title={key === 'venta' && !editable
                    ? 'Se llena al guardar o corregir el Corte de caja (efectivo neto)'
                    : undefined}
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
          <AlertaPagareAbierto
            pagares={pagaresAbiertos}
            area="abarrotes"
            supabase={supabase}
            user={user}
            onCambio={recargarPagares}
          />
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
        columnasExtra={[
          { key: 'cajero', label: 'Cajero', render: (h) => h.usuario_nombre || h.detalle?.usuario_nombre || h.detalle?.cajero || '—' },
        ]}
      />

      <CandadoRecargasMp
        abierto={candadoRecargas}
        posTotal={recargasPosTotal}
        usuarioNombre={user?.nombre || '—'}
        usuarioId={user?.id || null}
        onCancelar={() => setCandadoRecargas(false)}
        onConfirmar={confirmarCierreTrasCandado}
      />
    </div>
    </CorteConTeclado>
  );
}
