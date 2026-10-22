import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizarRol } from '../lib/roles.js';
import { createSubmitLock } from '../lib/submitLock.js';
import {
  fmtFechaClave,
  fmtMonto,
  filtrarMovimientosPorFecha,
  hoyClaveNogales,
  liquidarMovimientos,
  listarMercanciaEnTransitoPorRepartidor,
  listarGastosActivosParaLiquidacion,
  listarLiquidacionesRepartidor,
  listarRepartidores,
  reporteRecoleccionTiendaFecha,
  resumenMercanciaEnTransitoPorRepartidor,
  calcularNetosLiquidacion,
  armarAcreditacionesLiquidacion,
  movimientosMercancia,
} from '../lib/controlEfectivo.js';
import {
  CUENTAS_RT_LIQUIDACION,
  cuentaRtMercanciaPorDefecto,
  etiquetaCuentaRt,
} from '../lib/rtCuentas.js';
import { separarCreditosYEfectivo } from '../lib/recoleccionTipos.js';
import { repararTransitosCancelacionesAprobadas } from '../lib/rutaCancelaciones.js';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import SelectorCalendario from './SelectorCalendario.jsx';
import DetalleTiendasLiquidacion from './DetalleTiendasLiquidacion.jsx';
import PanelFondoServicios from './PanelFondoServicios.jsx';
import PanelTesoreriaRuta from './PanelTesoreriaRuta.jsx';
import PendientesRecolectorTiendas from './PendientesRecolectorTiendas.jsx';

const PRESETS_PENDIENTE = [
  { id: 'todos', label: 'Todos los pendientes' },
  ...PRESETS_FECHA_PRODUCTO,
];

const PRESETS_HISTORIAL = PRESETS_FECHA_PRODUCTO;

/** Liquidación en oficina — administrador / gerente. */
export default function PanelLiquidacionRecolecciones({ supabase, user, embedded = false }) {
  const rol = normalizarRol(user?.rol);
  const [repartidores, setRepartidores] = useState([]);
  const [repLiq, setRepLiq] = useState('');
  const [resumenReps, setResumenReps] = useState([]);
  const [enTransito, setEnTransito] = useState([]);
  const [gastosActivos, setGastosActivos] = useState([]);
  const [selIds, setSelIds] = useState({});
  const [vista, setVista] = useState('recolectores');
  const [tiendaAbierta, setTiendaAbierta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const submitLock = useRef(createSubmitLock()).current;
  const [error, setError] = useState(null);
  const [modoConsulta, setModoConsulta] = useState('pendiente');
  const [presetFecha, setPresetFecha] = useState('todos');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [fechaSellado, setFechaSellado] = useState(() => hoyClaveNogales());
  const [cuentaRtMercancia, setCuentaRtMercancia] = useState(() => cuentaRtMercanciaPorDefecto(user?.nombre));

  const esHistorial = modoConsulta === 'historial';
  const esFondo = modoConsulta === 'fondo';
  const esTesoreria = modoConsulta === 'tesoreria';
  const esSoloPanel = esFondo || esTesoreria;
  const diaDe = esHistorial ? 'liquidacion' : 'recoleccion';
  const fechaLiquidacion = useMemo(() => fmtFechaClave(fechaSellado), [fechaSellado]);
  const repNombre = useMemo(() => repartidores.find((r) => r.id === repLiq)?.nombre || '', [repartidores, repLiq]);

  const cambiarPresetFecha = (preset) => {
    setPresetFecha(preset);
    if (preset === 'todos') {
      setFiltroDesde('');
      setFiltroHasta('');
      return;
    }
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setFiltroDesde(r.desde);
        setFiltroHasta(r.hasta);
      }
    }
  };

  const cambiarModoConsulta = (modo) => {
    setModoConsulta(modo);
    if (modo === 'pendiente') {
      setVista('recolectores');
      setTiendaAbierta(null);
    }
    if (modo === 'historial') {
      cambiarPresetFecha('mes');
    } else {
      cambiarPresetFecha('todos');
    }
  };

  useEffect(() => {
    setCuentaRtMercancia(cuentaRtMercanciaPorDefecto(user?.nombre));
  }, [user?.nombre]);

  const cargaMovs = esHistorial || vista !== 'recolectores';

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    setCargando(true);
    try {
      const reps = await listarRepartidores(supabase);
      setRepartidores(reps);
      const repId = repLiq || reps[0]?.id || '';
      if (!repLiq && repId) setRepLiq(repId);
      if (!repId) {
        setResumenReps([]);
        return;
      }

      const desde = presetFecha === 'todos' ? '' : filtroDesde;
      const hasta = presetFecha === 'todos' ? '' : filtroHasta;

      // Cancelaciones aprobadas que dejaron efectivo en Pendientes → limpiar por folio VR.
      if (!esHistorial && cargaMovs) {
        try {
          await repararTransitosCancelacionesAprobadas(supabase, { limit: 80 });
        } catch {
          /* no bloquear liquidación si falla la reparación */
        }
      }

      const [movs, gastos, resumen] = await Promise.all([
        !cargaMovs
          ? Promise.resolve([])
          : esHistorial
            ? listarLiquidacionesRepartidor(supabase, repId, { desde, hasta }).then((rows) =>
                // Historial: se muestran merchandise + créditos; servicios van en RC Servicios.
                movimientosMercancia(rows),
              )
            : listarMercanciaEnTransitoPorRepartidor(supabase, repId).then((rows) =>
                filtrarMovimientosPorFecha(rows, { desde, hasta, diaDe: 'recoleccion' }),
              ),
        esHistorial || !cargaMovs ? Promise.resolve([]) : listarGastosActivosParaLiquidacion(supabase, repId),
        // Casillas siempre: totales por recolector (Pendientes mercancía).
        resumenMercanciaEnTransitoPorRepartidor(supabase),
      ]);
      setEnTransito(movs);
      setGastosActivos(gastos);
      setResumenReps(resumen);
      setSelIds(
        esHistorial
          ? {}
          : Object.fromEntries(movs.map((m) => [m.id, true])),
      );
    } catch (e) {
      setError(e.message?.includes('repartidores') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
    } finally {
      setCargando(false);
    }
  }, [supabase, repLiq, esHistorial, cargaMovs, presetFecha, filtroDesde, filtroHasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const reporte = useMemo(() => reporteRecoleccionTiendaFecha(enTransito, { diaDe }), [enTransito, diaDe]);

  const seleccionados = useMemo(() => enTransito.filter((m) => selIds[m.id]), [enTransito, selIds]);
  const totalGastosActivos = useMemo(
    () => gastosActivos.reduce((a, m) => a + Number(m.monto || 0), 0),
    [gastosActivos],
  );
  const desglosePendiente = useMemo(() => separarCreditosYEfectivo(enTransito), [enTransito]);

  const imprimirReporte = () => {
    const rep = repNombre || 'Recolector';
    const filasHtml = reporte.filas
      .map(
        (f) =>
          `<tr><td><strong>${f.tienda}</strong></td>${reporte.dias
            .map((dia) => {
              const c = f.porDia[dia];
              return `<td style="text-align:right">${c?.count ? fmtMonto(c.total) : '—'}</td>`;
            })
            .join('')}<td style="text-align:right"><strong>${fmtMonto(f.totalTienda)}</strong></td></tr>`,
      )
      .join('');
    const headDias = reporte.dias.map((d) => `<th>${fmtFechaClave(d)}</th>`).join('');
    const totDia = reporte.dias
      .map((d) => `<td style="text-align:right"><strong>${fmtMonto(reporte.totalesPorDia[d])}</strong></td>`)
      .join('');

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return alert('Permite ventanas emergentes para imprimir.');
    win.document.write(`<!DOCTYPE html><html><head><title>Reporte recolección</title>
      <style>body,body *{font-family:Arial,Helvetica,sans-serif;padding:0;color:#000!important;font-weight:800!important;font-size:13px;line-height:1.35}
      body{padding:1.5rem} table{border-collapse:collapse;width:100%;margin-top:1rem}
      th,td{border:1.5px solid #000;padding:6px 8px} th{background:#eee;font-weight:900}
      h1{font-size:1.2rem;margin:0;font-weight:900} .muted{color:#000;font-size:12px;font-weight:800}</style></head><body>
      <h1>Reporte de recolección en tránsito</h1>
      <p class="muted">Recolector: ${rep} · ${esHistorial ? 'Liquidaciones' : 'Fecha sellado'}: ${fechaLiquidacion} · Total: ${fmtMonto(reporte.granTotal)}</p>
      <table><thead><tr><th>Tienda</th>${headDias}<th>Total tienda</th></tr></thead>
      <tbody>${filasHtml}<tr style="background:#f9f9f9"><td><strong>Total por día</strong></td>${totDia}<td><strong>${fmtMonto(reporte.granTotal)}</strong></td></tr></tbody></table>
      <p class="muted" style="margin-top:1rem">Créditos cobrados: ${fmtMonto(desglosePendiente.totalCreditos)} · Efectivo por mercancía vendida: ${fmtMonto(desglosePendiente.totalEfectivo)} · Gastos: −${fmtMonto(totalGastosActivos)}</p>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  };

  const confirmarLiquidacion = async (items = seleccionados, alcance = '') => {
    if (!submitLock.tryBegin()) return;
    setGuardando(true);
    try {
      const ids = items.map((m) => m.id);
      if (!ids.length) return alert('Selecciona al menos un movimiento para liquidar.');
      const netos = calcularNetosLiquidacion(items, totalGastosActivos);
      if (!cuentaRtMercancia && netos.netoMercancia > 0) {
        return alert('Selecciona la cuenta RT para mercancía.');
      }
      const { acreditaciones } = armarAcreditacionesLiquidacion({
        seleccionados: items,
        totalGastos: totalGastosActivos,
        cuentaRtMercancia,
        cuentaRtServicios: null,
        repartidorNombre: repNombre,
      });
      // Solo mercancía aquí; cobros de servicio se liquidan en RC Servicios.
      const acredMerc = acreditaciones.filter((a) => a.tipoPartida === 'mercancia');
      if (!acredMerc.length) return alert('No hay monto neto de mercancía para acreditar. Los servicios van en RC Servicios.');
      const { totalCreditos, totalEfectivo } = separarCreditosYEfectivo(items);
      const lineasCuentas = acredMerc
        .map((a) => `${etiquetaCuentaRt(a.cuentaRtId)}: ${fmtMonto(a.monto)}`)
        .join('\n');
      if (
        !window.confirm(
          `¿Sellar liquidación ${alcance ? `de ${alcance} ` : ''}del ${fechaLiquidacion}?\n\n` +
            `Créditos cobrados: ${fmtMonto(totalCreditos)}\n` +
            `Efectivo por mercancía vendida: ${fmtMonto(totalEfectivo)}\n` +
            `Gastos aceptados: −${fmtMonto(totalGastosActivos)}\n\n` +
            `Acreditar:\n${lineasCuentas}\n\n` +
            `Total neto: ${fmtMonto(netos.netoMercancia)} (${ids.length} movimiento(s))\n\n` +
            'Los cobros de servicio (CFE) se liquidan en la pestaña RC Servicios.',
        )
      )
        return;
      const res = await liquidarMovimientos(supabase, {
        ids,
        adminNombre: user?.nombre || rol,
        repartidorNombre: repNombre,
        acreditaciones: acredMerc,
        montoLiquidacion: netos.netoMercancia,
      });
      if (!res.ok) return alert(res.error);
      alert(
        `✅ Liquidación sellada (${res.count} registros) · ${fmtMonto(res.montoTotal || netos.netoMercancia)} acreditados` +
          (acreditaciones.length > 1
            ? ` (${acreditaciones.map((a) => `${etiquetaCuentaRt(a.cuentaRtId)} ${fmtMonto(a.monto)}`).join(' · ')})`
            : ` a ${etiquetaCuentaRt(acreditaciones[0]?.cuentaRtId)}`) +
          (totalGastosActivos > 0 ? `. Gastos descontados de mercancía: ${fmtMonto(totalGastosActivos)}.` : '.'),
      );
      setTiendaAbierta(null);
      cargar();
    } finally {
      submitLock.end();
      setGuardando(false);
    }
  };

  const esFlujoPendiente = !esHistorial && !esSoloPanel;
  const enRecolectores = esFlujoPendiente && vista === 'recolectores';
  const enTiendas = esFlujoPendiente && vista !== 'recolectores';

  const abrirRecolector = (id) => {
    setRepLiq(id);
    setTiendaAbierta(null);
    setVista('tiendas');
  };

  const volverARecolectores = () => {
    setTiendaAbierta(null);
    setVista('recolectores');
  };

  const bloqueGastos = gastosActivos.length > 0 && (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem',
        borderRadius: '10px',
        background: 'rgba(220,38,38,0.06)',
        border: '1px solid rgba(220,38,38,0.28)',
      }}
    >
      <strong style={{ color: 'var(--brand-red)' }}>Gastos (descontar al recolectar)</strong>
      <p className="muted" style={{ margin: '0.35rem 0 0.5rem', fontSize: '0.8rem' }}>
        Panel RT (aceptados) o registrados en Venta en Ruta → Gastos con foto. Se restan del efectivo en tránsito.
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
        {gastosActivos.map((g) => {
          const evid = g.evidencia_url && String(g.evidencia_url).startsWith('data:image')
            ? g.evidencia_url
            : null;
          return (
            <li key={g.id} style={{ marginBottom: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {evid ? (
                <a href={evid} target="_blank" rel="noreferrer" title="Ver evidencia">
                  <img
                    src={evid}
                    alt=""
                    style={{
                      width: 36,
                      height: 36,
                      objectFit: 'cover',
                      borderRadius: 6,
                      display: 'block',
                      border: '1px solid rgba(0,0,0,0.12)',
                    }}
                  />
                </a>
              ) : null}
              <span>
                {g.descripcion_gasto || g.num_traspaso || 'Gasto'} · {g.sucursal_origen || '—'} ·{' '}
                <strong style={{ color: 'var(--brand-red)' }}>−{fmtMonto(g.monto)}</strong>
              </span>
            </li>
          );
        })}
      </ul>
      <p style={{ margin: '0.5rem 0 0', fontWeight: 700, color: 'var(--brand-red)' }}>
        Total gastos: −{fmtMonto(totalGastosActivos)}
      </p>
    </div>
  );

  const selectorCuentaRt = (
    <label className="muted" style={{ display: 'block' }}>
      Cuenta RT — Mercancía (traspasos, crédito cobrado)
      <select className="select" style={{ marginTop: '0.35rem', maxWidth: 360 }} value={cuentaRtMercancia} onChange={(e) => setCuentaRtMercancia(e.target.value)}>
        {CUENTAS_RT_LIQUIDACION.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <span style={{ display: 'block', fontSize: '0.78rem', marginTop: '0.25rem' }}>
        Solo mercancía / créditos. Los cobros de servicio (CFE) se liquidan en la pestaña <strong>RC Servicios</strong>.
      </span>
    </label>
  );

  const inner = (
    <>
      {!embedded && (
        <>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidación de recolecciones</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Elige un recolector, abre una tienda y liquida por tienda o todo el efectivo en tránsito.
          </p>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={`btn ${modoConsulta === 'pendiente' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => cambiarModoConsulta('pendiente')}
        >
          Pendientes por liquidar
        </button>
        <button
          type="button"
          className={`btn ${esHistorial ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => cambiarModoConsulta('historial')}
        >
          Liquidaciones pasadas
        </button>
        <button
          type="button"
          className={`btn ${esFondo ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => cambiarModoConsulta('fondo')}
        >
          RC Servicios
        </button>
        <button
          type="button"
          className={`btn ${esTesoreria ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => cambiarModoConsulta('tesoreria')}
        >
          Tesorería
        </button>
      </div>

      {esFondo && <PanelFondoServicios supabase={supabase} user={user} />}
      {esTesoreria && <PanelTesoreriaRuta supabase={supabase} user={user} />}

      {error && !esSoloPanel && <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p>}

      {enRecolectores && (
        <div style={{ marginBottom: '0.85rem' }}>
          <p className="muted" style={{ margin: '0 0 0.45rem', fontSize: '0.8rem' }}>
            Efectivo en tránsito por recolector (toca una casilla para liquidar)
          </p>
          {!resumenReps.length ? (
            <p className="muted" style={{ margin: 0 }}>{cargando ? 'Cargando recolectores…' : 'Sin recolectores activos.'}</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.55rem',
              }}
            >
              {resumenReps.map((r) => {
                const conMonto = Number(r.total) > 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => abrirRecolector(r.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.7rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(15, 23, 42, 0.12)',
                      background: conMonto ? 'rgba(225, 153, 41, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-blue)' }}>
                      {r.nombre}
                    </div>
                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: conMonto ? 'var(--brand-gold-dark, #b45309)' : 'var(--muted)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtMonto(r.total)}
                    </div>
                    <div className="muted" style={{ marginTop: '0.15rem', fontSize: '0.72rem' }}>
                      {conMonto ? `${r.count} mov. en tránsito` : 'Sin tránsito'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {enTiendas && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={volverARecolectores}>
              ← Recolectores
            </button>
            <strong style={{ color: 'var(--brand-blue)' }}>{repNombre || 'Recolector'}</strong>
          </div>

          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div>
              <SelectorCalendario
                label="Fecha de sellado"
                value={fechaSellado}
                onChange={setFechaSellado}
                max={hoyClaveNogales()}
              />
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                Día en que recibes el efectivo del recolector.
              </p>
            </div>
            {selectorCuentaRt}
          </div>

          <FiltroPeriodo
            presets={PRESETS_PENDIENTE}
            preset={presetFecha}
            onPresetChange={cambiarPresetFecha}
            desde={filtroDesde}
            hasta={filtroHasta}
            onDesdeChange={setFiltroDesde}
            onHastaChange={setFiltroHasta}
            labelPeriodo="Filtrar por fecha de recolección"
            style={{ marginTop: '0.75rem' }}
            mostrarResumen={presetFecha !== 'todos'}
          />

          {cargando && !enTransito.length ? (
            <p className="muted" style={{ marginTop: '1rem' }}>Cargando efectivo en tránsito…</p>
          ) : !enTransito.length ? (
            <p className="muted" style={{ marginTop: '1rem' }}>
              Sin movimientos en tránsito para este recolector en el filtro actual.
            </p>
          ) : (
            <>
              <PendientesRecolectorTiendas
                movimientos={enTransito}
                selIds={selIds}
                setSelIds={setSelIds}
                tiendaAbierta={tiendaAbierta}
                setTiendaAbierta={setTiendaAbierta}
                totalGastos={totalGastosActivos}
                cuentaRtLabel={etiquetaCuentaRt(cuentaRtMercancia)}
                guardando={guardando}
                onLiquidar={confirmarLiquidacion}
                onImprimir={imprimirReporte}
                bloqueGastos={bloqueGastos}
              />
            </>
          )}
        </>
      )}

      {esHistorial && (
        <>
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <label className="muted" style={{ display: 'block' }}>
              Recolector
              <select className="select" style={{ marginTop: '0.35rem' }} value={repLiq} onChange={(e) => setRepLiq(e.target.value)}>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
              <span className="badge" style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}>
                Solo consulta · liquidaciones selladas
              </span>
            </div>
          </div>

          <FiltroPeriodo
            presets={PRESETS_HISTORIAL}
            preset={presetFecha}
            onPresetChange={cambiarPresetFecha}
            desde={filtroDesde}
            hasta={filtroHasta}
            onDesdeChange={setFiltroDesde}
            onHastaChange={setFiltroHasta}
            labelPeriodo="Periodo de liquidación"
            style={{ marginTop: '0.75rem' }}
            mostrarResumen={presetFecha !== 'todos'}
          />

          {!enTransito.length ? (
            <p className="muted" style={{ marginTop: '1rem' }}>
              Sin liquidaciones selladas en el periodo seleccionado.
            </p>
          ) : (
            <>
              <div className="card" style={{ marginTop: '1rem', padding: '0.85rem' }} id="reporte-recoleccion-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Reporte por tienda y fecha</h4>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={imprimirReporte}>
                    Imprimir reporte
                  </button>
                </div>
                <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
                  Total liquidado: <strong>{fmtMonto(reporte.granTotal)}</strong> · {enTransito.length} movimiento(s) · {reporte.resumenDias.length} día(s)
                  {' · '}Créditos cobrados {fmtMonto(desglosePendiente.totalCreditos)} · Efectivo mercancía {fmtMonto(desglosePendiente.totalEfectivo)}
                </p>
                <div className="table-wrap">
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Tienda</th>
                        {reporte.dias.map((dia) => (
                          <th key={dia} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {fmtFechaClave(dia)}
                            <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--muted)' }}>liquidado</span>
                          </th>
                        ))}
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporte.filas.map((f) => (
                        <tr key={f.tienda}>
                          <td><strong>{f.tienda}</strong></td>
                          {reporte.dias.map((dia) => {
                            const c = f.porDia[dia];
                            if (!c?.count) {
                              return (
                                <td key={dia} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={dia} style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {fmtMonto(c.total)}
                                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>{c.count} mov.</span>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'right' }}><strong>{fmtMonto(f.totalTienda)}</strong></td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td><strong>Total por día</strong></td>
                        {reporte.dias.map((dia) => (
                          <td key={dia} style={{ textAlign: 'right' }}>
                            <strong>{fmtMonto(reporte.totalesPorDia[dia])}</strong>
                          </td>
                        ))}
                        <td style={{ textAlign: 'right' }}><strong>{fmtMonto(reporte.granTotal)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <DetalleTiendasLiquidacion
                movimientos={enTransito}
                esHistorial
                diaDe={diaDe}
                selIds={selIds}
                setSelIds={setSelIds}
              />
            </>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="card">{inner}</div>;
  }

  return (
    <div className="card" id="liquidacion-recolecciones" style={{ borderTop: '4px solid #0d9488' }}>
      {inner}
    </div>
  );
}
