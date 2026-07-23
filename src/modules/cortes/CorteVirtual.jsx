import React, { useCallback, useMemo, useState } from 'react';
import CorteGastosPanel from '../../components/corteContabilidad/CorteGastosPanel.jsx';
import CorteInversionesPanel from '../../components/corteContabilidad/CorteInversionesPanel.jsx';
import CorteSucursalAviso from '../../components/corteContabilidad/CorteSucursalAviso.jsx';
import CampoCorte from '../../components/corteContabilidad/CampoCorte.jsx';
import {
  calcularVirtual,
  cajaVirtualEnNegativo,
  monedaInicialTurnoEfectiva,
  monedaRecolectorRef,
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

function esCierreTurno(h) {
  const t = h?.detalle?.tipo_cierre;
  return t !== 'recoleccion' && t !== 'actualizacion';
}

function FilaExcel({ label, value, highlight, bold }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.4rem 0.55rem',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: highlight ? '#111' : bold ? 'rgba(225,153,41,0.12)' : 'transparent',
        color: highlight ? '#fff' : 'inherit',
        fontWeight: highlight || bold ? 800 : 500,
      }}
    >
      <span style={{ fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontSize: highlight ? '1.05rem' : '0.95rem' }}>{value}</span>
    </div>
  );
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
      corte_reabierto_id: null,
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
    recargar,
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
  const [montoRecOverride, setMontoRecOverride] = useState('');

  const cortesAnteriores = useMemo(() => (historial || []).filter(esCierreTurno), [historial]);
  const monedaReferencia = monedaRecolectorRef(estado);
  const monedaInicioCorte = monedaInicialTurnoEfectiva(estado);
  const cajaNegativa = cajaVirtualEnNegativo(estado, calc);
  const recCalc = recoleccionVirtualExcel(estado, calc);
  const recMostrada = montoRecOverride !== '' ? round2(montoRecOverride) : recCalc;

  const abrirCorteAnterior = () => {
    if (!corteAnteriorId) return alert('Selecciona un corte del historial.');
    const h = cortesAnteriores.find((x) => String(x.id) === String(corteAnteriorId));
    if (!h) return;
    const d = h.detalle || {};
    const mfPrev = round2(d.moneda_final);
    if (!(mfPrev > 0) && !d.moneda_final_editada) {
      return alert('Ese corte no tiene moneda final capturada.');
    }
    if (!confirm(
      `¿Abrir segundo corte del turno a partir de ${h.folio}?\n\n` +
        `Moneda inicial del nuevo corte = moneda final del anterior (${fmtCorte(mfPrev)}).\n` +
        `Los gastos del periodo se conservan hasta la recolección.`,
    )) return;
    patchEstado({
      moneda_inicial_turno: mfPrev,
      moneda_final: 0,
      moneda_final_editada: false,
      caja_anterior: round2(d.caja_anterior ?? estado.caja_anterior),
      fondo: d.fondo != null ? d.fondo : estado.fondo,
      corte_reabierto_id: h.id,
      comentarios: '',
      _mi_turno_inicializado: true,
    });
    alert(`Corte anterior ${h.folio} abierto. Puede cerrar un segundo corte del mismo turno.`);
  };

  const confirmarCierre = () => {
    if (!estado.moneda_final_editada && perm.moneda_final) {
      if (!confirm('No capturó moneda final. La venta del turno quedará en $0.00.\n\n¿Continuar?')) return;
    }
    const msg =
      `¿Cerrar corte virtual?\n\n` +
      `Tienda: ${etiquetaTienda(sucursal)}\n` +
      `Moneda inicial: ${fmtCorte(monedaInicioCorte)}\n` +
      `Moneda final: ${fmtCorte(estado.moneda_final)}\n` +
      `Venta efectivo: ${fmtCorte(calc.venta)}\n` +
      `Gastos: ${fmtCorte(calc.gastosTotal)}\n\n` +
      `Este cierre NO va a IE. Solo la recolección entra a contabilidad.\n` +
      `Puede abrir otro corte del mismo turno desde el historial.`;
    if (confirm(msg)) cerrarCorte();
  };

  const confirmarRecoleccion = async () => {
    const monto = recMostrada;
    const msg =
      `¿Registrar recolección?\n\n` +
      `Fórmula: Moneda inicial − Moneda final − Gastos\n` +
      `${fmtCorte(monedaInicioCorte)} − ${fmtCorte(estado.moneda_final)} − ${fmtCorte(calc.gastosTotal)}\n` +
      `= ${fmtCorte(monto)}\n\n` +
      `Solo este monto va a IE VIRTUAL.\n` +
      `Se imprimirá el ticket de recolección (gastos por cajero).`;
    if (!confirm(msg)) return;
    const res = await registrarRecoleccion({ montoRecoleccion: monto });
    if (!res?.ok) {
      if (res?.error) alert(res.error);
      return;
    }
    setMontoRecOverride('');
    setCorteAnteriorId('');
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
    alert(`Recolección ${fmtCorte(res.recoleccion)} registrada e impresa.\nIngreso único en IE VIRTUAL.`);
  };

  const irPrestamoArea = () => {
    if (!onNavigate) return alert('Abra Vales y Préstamos → Préstamos área para solicitar fondos.');
    onNavigate('Vales y Préstamos', { pestana: 'prestamos', retorno: 'Corte Virtual' });
  };

  const aplicarReferenciaMoneda = () => {
    if (!perm.recoleccion && !perm.editarTodo) return alert('Solo el administrador o recolector puede ajustar la moneda de referencia.');
    const ref = round2(estado.moneda_inicial);
    if (!confirm(`¿Usar ${fmtCorte(ref)} como moneda de referencia e inicio de turno?`)) return;
    patchEstado({
      moneda_inicial: ref,
      moneda_inicial_turno: ref,
      _mi_turno_inicializado: true,
    });
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
              Modelo Excel · Folio {folio} · {turno}
              {estado.corte_reabierto_id ? ' · 2.º corte del turno' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {puedeCerrarCorteTienda && (
              <button type="button" className="btn btn-primary" onClick={confirmarCierre} disabled={cargando}>
                Cerrar corte · {etiquetaTienda(sucursal)}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={imprimirBorrador} disabled={cargando}>
              Imprimir corte
            </button>
          </div>
        </div>
        {aviso && <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-gold)' }}>{aviso}</p>}
        <CorteSucursalAviso sucursal={sucursal} user={user} />
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
          Los cierres de cajero <strong>no</strong> van a IE. Solo la <strong>recolección</strong> entra a contabilidad.
        </p>
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
            <div style={{ fontWeight: 800, color: 'var(--danger)' }}>Caja / moneda en negativo</div>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Revise moneda final o gastos, o solicite préstamo de área.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={irPrestamoArea} disabled={!onNavigate}>
            Solicitud de préstamo
          </button>
        </div>
      )}

      <div className="card" style={{ border: `2px solid rgba(142,68,173,0.35)` }}>
        <h4 style={{ margin: '0 0 0.5rem', color: COLOR, textAlign: 'center' }}>MONEDA VIRTUAL</h4>
        <FilaExcel label="Fondo" value={fmtCorte(estado.fondo)} />
        <FilaExcel label="Caja chica" value={fmtCorte(estado.caja_anterior)} />
        <FilaExcel label="Moneda inicial" value={fmtCorte(monedaInicioCorte)} bold />
        <FilaExcel label="Moneda final" value={fmtCorte(estado.moneda_final)} bold />
        <FilaExcel label="Venta-Efvo" value={fmtCorte(calc.venta)} bold />
        <FilaExcel label="Gastos" value={fmtCorte(calc.gastosTotal)} bold />
        <FilaExcel label="Faltante" value={fmtCorte(estado.faltante)} />
        <FilaExcel label="RECOLECCIÓN" value={fmtCorte(recMostrada)} highlight />
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', textAlign: 'center' }}>
          Recolección = Moneda inicial − Moneda final − Gastos
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem' }}>Captura</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <CampoCorte
              label="Fondo fijo"
              value={estado.fondo ?? 0}
              editable={Boolean(perm.editarTodo)}
              hint="Cambio / premios chicos · no es ingreso IE"
              onChange={(v) => patchEstado({ fondo: v })}
            />
            <CampoCorte
              label="Caja chica"
              value={estado.caja_anterior ?? 0}
              editable={Boolean(perm.caja_anterior || perm.editarTodo)}
              onChange={(v) => patchEstado({ caja_anterior: v })}
            />
            <CampoCorte
              label="Moneda inicial (referencia)"
              value={monedaReferencia}
              editable={false}
              hint="Fijada por recolector · no cambia al cerrar turno"
            />
            {perm.recoleccion && (
              <>
                <CampoCorte
                  label="Ajustar moneda de referencia"
                  value={estado.moneda_inicial ?? ''}
                  editable
                  onChange={(v) => patchEstado({ moneda_inicial: v })}
                />
                <button type="button" className="btn btn-ghost" onClick={aplicarReferenciaMoneda} disabled={cargando}>
                  Aplicar referencia al turno
                </button>
              </>
            )}
            <CampoCorte
              label="Moneda inicial del corte"
              value={monedaInicioCorte}
              editable={false}
              hint="Del recolector o del corte anterior reabierto"
            />
            <CampoCorte
              label="Moneda final"
              value={estado.moneda_final ?? ''}
              editable={puedeMonedaFinal}
              hint="Efectivo al cierre"
              onChange={(v) => patchEstado({ moneda_final: v, moneda_final_editada: true })}
            />
            <CampoCorte
              label="Faltante"
              value={estado.faltante ?? 0}
              editable={puedeMonedaFinal || perm.editarTodo}
              onChange={(v) => patchEstado({ faltante: v })}
            />
          </div>

          {(perm.guardar || perm.recoleccion) && cortesAnteriores.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: 8,
                border: '1px dashed rgba(142,68,173,0.45)',
                background: 'rgba(142,68,173,0.05)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem', color: COLOR }}>
                Abrir corte del turno anterior (2 cortes / turno)
              </div>
              <select
                className="select"
                value={corteAnteriorId}
                onChange={(e) => setCorteAnteriorId(e.target.value)}
                style={{ width: '100%', marginBottom: '0.5rem' }}
              >
                <option value="">— Seleccionar corte —</option>
                {cortesAnteriores.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.folio} · {h.usuario_nombre || '—'} · MF {fmtCorte(h.detalle?.moneda_final)} · venta {fmtCorte(h.ventas)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={abrirCorteAnterior} disabled={cargando}>
                Abrir como 2.º corte
              </button>
            </div>
          )}

          {perm.recoleccion && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: 8,
                border: '2px solid #111',
                background: 'rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Recolectar</div>
              <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
                Calculada: {fmtCorte(recCalc)}. Puede ajustar el monto retirado si hace falta.
              </p>
              <CampoCorte
                label="Monto recolección (IE)"
                value={montoRecOverride !== '' ? montoRecOverride : recCalc}
                editable
                onChange={(v) => setMontoRecOverride(v)}
              />
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%', marginTop: '0.5rem' }}
                onClick={confirmarRecoleccion}
                disabled={cargando || !estado.moneda_final_editada}
              >
                Registrar recolección e imprimir ticket
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CorteInversionesPanel
            modulo="virtual"
            supabase={supabase}
            sucursal={sucursal}
            user={user}
            habilitado={puedeEditarCorteCampo(perm, 'gastos') || perm.editarTodo}
            onCobrado={() => recargar()}
          />
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
            notaNomina="Gastos del periodo (se conservan entre cierres hasta la recolección). Consumos con empleado van a nómina."
          />
          <textarea
            className="input"
            placeholder="Comentarios"
            style={{ minHeight: 72 }}
            value={estado.comentarios || ''}
            readOnly={!puedeComentarios}
            onChange={(e) => patchEstado({ comentarios: e.target.value })}
          />
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>Caja chica actual</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: cajaNegativa ? 'var(--danger)' : '#2980b9' }}>
              {fmtCorte(calc.cajaActual)}
            </div>
          </div>
        </div>
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
