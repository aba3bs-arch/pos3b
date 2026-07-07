import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizarRol } from '../lib/roles.js';
import {
  fmtFechaClave,
  fmtMonto,
  filtrarMovimientosPorFecha,
  hoyClaveNogales,
  inicializarSeleccionLiquidacion,
  liquidarMovimientos,
  listarAlertasRecoleccion,
  listarEnTransitoPorRepartidor,
  listarLiquidacionesRepartidor,
  listarRepartidores,
  marcarAlertaVista,
  reporteRecoleccionTiendaFecha,
  resumenTotalesPorTipo,
} from '../lib/controlEfectivo.js';
import {
  CUENTAS_RT,
  etiquetaCuentaRt,
  resolverCuentaRtPorNombre,
} from '../lib/rtCuentas.js';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import SelectorCalendario from './SelectorCalendario.jsx';
import DetalleTiendasLiquidacion from './DetalleTiendasLiquidacion.jsx';

function CheckIndeterminado({ checked, indeterminate, onChange, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} {...rest} />;
}

function estadoSeleccion(items, selIds) {
  const sel = items.filter((m) => selIds[m.id]).length;
  if (sel === 0) return 'none';
  if (sel === items.length) return 'all';
  return 'partial';
}

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
  const [enTransito, setEnTransito] = useState([]);
  const [selIds, setSelIds] = useState({});
  const [alertas, setAlertas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [modoConsulta, setModoConsulta] = useState('pendiente');
  const [presetFecha, setPresetFecha] = useState('todos');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [fechaSellado, setFechaSellado] = useState(() => hoyClaveNogales());
  const [cuentaRt, setCuentaRt] = useState(() => resolverCuentaRtPorNombre(user?.nombre) || CUENTAS_RT[0]?.id || '');

  const esHistorial = modoConsulta === 'historial';
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
    if (modo === 'historial') {
      cambiarPresetFecha('mes');
    } else {
      cambiarPresetFecha('todos');
    }
  };

  useEffect(() => {
    const detectada = resolverCuentaRtPorNombre(user?.nombre);
    if (detectada) setCuentaRt(detectada);
  }, [user?.nombre]);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const reps = await listarRepartidores(supabase);
      setRepartidores(reps);
      const repId = repLiq || reps[0]?.id || '';
      if (!repLiq && repId) setRepLiq(repId);
      if (!repId) return;

      const desde = presetFecha === 'todos' ? '' : filtroDesde;
      const hasta = presetFecha === 'todos' ? '' : filtroHasta;

      const [movs, alr] = await Promise.all([
        esHistorial
          ? listarLiquidacionesRepartidor(supabase, repId, { desde, hasta })
          : listarEnTransitoPorRepartidor(supabase, repId).then((rows) =>
              filtrarMovimientosPorFecha(rows, { desde, hasta, diaDe: 'recoleccion' }),
            ),
        esHistorial ? Promise.resolve([]) : listarAlertasRecoleccion(supabase),
      ]);
      setEnTransito(movs);
      setAlertas(alr);
      setSelIds(esHistorial ? {} : inicializarSeleccionLiquidacion(movs));
    } catch (e) {
      setError(e.message?.includes('repartidores') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
    }
  }, [supabase, repLiq, esHistorial, presetFecha, filtroDesde, filtroHasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const reporte = useMemo(() => reporteRecoleccionTiendaFecha(enTransito, { diaDe }), [enTransito, diaDe]);

  const seleccionados = useMemo(() => enTransito.filter((m) => selIds[m.id]), [enTransito, selIds]);
  const totalSeleccionado = useMemo(() => seleccionados.reduce((a, m) => a + Number(m.monto || 0), 0), [seleccionados]);
  const resumenSel = useMemo(() => resumenTotalesPorTipo(seleccionados), [seleccionados]);

  const diasSeleccionados = useMemo(
    () => reporte.resumenDias.filter((d) => d.items.some((m) => selIds[m.id])),
    [reporte.resumenDias, selIds],
  );

  const toggleIds = (items, val) => {
    setSelIds((prev) => {
      const next = { ...prev };
      items.forEach((m) => {
        next[m.id] = val;
      });
      return next;
    });
  };

  const toggleDiaGlobal = (items, val) => toggleIds(items, val);

  const toggleCelda = (items, val) => toggleIds(items, val);

  const celdaSeleccionada = (items) => estadoSeleccion(items, selIds);

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
      <style>body{font-family:system-ui,sans-serif;padding:1.5rem;font-size:13px}
      table{border-collapse:collapse;width:100%;margin-top:1rem} th,td{border:1px solid #ccc;padding:6px 8px}
      th{background:#f0f0f0} h1{font-size:1.1rem;margin:0} .muted{color:#666;font-size:12px}</style></head><body>
      <h1>Reporte de recolección en tránsito</h1>
      <p class="muted">Recolector: ${rep} · ${esHistorial ? 'Liquidaciones' : 'Fecha sellado'}: ${fechaLiquidacion} · Total: ${fmtMonto(reporte.granTotal)}</p>
      <table><thead><tr><th>Tienda</th>${headDias}<th>Total tienda</th></tr></thead>
      <tbody>${filasHtml}<tr style="background:#f9f9f9"><td><strong>Total por día</strong></td>${totDia}<td><strong>${fmtMonto(reporte.granTotal)}</strong></td></tr></tbody></table>
      <p class="muted" style="margin-top:1rem">Días seleccionados para liquidar: ${diasSeleccionados.map((d) => d.etiqueta).join(', ') || 'Ninguno'} · Monto a liquidar: ${fmtMonto(totalSeleccionado)}</p>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  };

  const confirmarLiquidacion = async () => {
    const ids = seleccionados.map((m) => m.id);
    if (!ids.length) return alert('Selecciona al menos un día o movimiento para liquidar.');
    if (!cuentaRt) return alert('Selecciona la cuenta RT (Francisco o Andrés) que recibe el efectivo.');
    const diasTxt = diasSeleccionados.map((d) => d.etiqueta).join(', ');
    if (
      !window.confirm(
        `¿Sellar liquidación del ${fechaLiquidacion}?\n\nCuenta: ${etiquetaCuentaRt(cuentaRt)}\nDías: ${diasTxt || '—'}\nMonto: ${fmtMonto(totalSeleccionado)} (${ids.length} movimiento(s))`,
      )
    )
      return;
    setGuardando(true);
    const res = await liquidarMovimientos(supabase, {
      ids,
      adminNombre: user?.nombre || rol,
      repartidorNombre: repNombre,
      cuentaRtId: cuentaRt,
      montoLiquidacion: totalSeleccionado,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liquidación sellada (${res.count} registros) · ${fmtMonto(res.montoTotal || totalSeleccionado)} acreditados a ${etiquetaCuentaRt(cuentaRt)}.`);
    cargar();
  };

  const multiplesDias = reporte.resumenDias.length > 1;

  const inner = (
    <>
      {!embedded && (
        <>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidación de recolecciones</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Reporte por tienda y fecha. Consulta pendientes por liquidar o revisa liquidaciones pasadas con el calendario.
          </p>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={`btn ${!esHistorial ? 'btn-primary' : 'btn-ghost'}`}
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
      </div>

      {error && <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p>}

      {alertas.length > 0 && !esHistorial && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '10px', background: 'rgba(225,153,41,0.12)', border: '1px solid rgba(225,153,41,0.35)' }}>
          <strong>Alertas de recolección ({alertas.length})</strong>
          {alertas.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem' }}>
                {a.sucursal_origen} · {a.num_traspaso} · {fmtMonto(a.monto)} · {a.repartidores?.nombre || 'Recolector'}
              </span>
              <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => marcarAlertaVista(supabase, a.id).then(cargar)}>
                Visto bueno
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ gap: '0.75rem' }}>
        <label className="muted" style={{ display: 'block' }}>
          Recolector a liquidar
          <select className="select" style={{ marginTop: '0.35rem' }} value={repLiq} onChange={(e) => setRepLiq(e.target.value)}>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        {!esHistorial ? (
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
        ) : (
          <div className="muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
            <span className="badge" style={{ background: 'rgba(13,148,136,0.12)', color: '#0d9488' }}>
              Solo consulta · liquidaciones selladas
            </span>
          </div>
        )}
        {!esHistorial && (
          <label className="muted" style={{ display: 'block', gridColumn: '1 / -1' }}>
            Cuenta RT que recibe el efectivo
            <select className="select" style={{ marginTop: '0.35rem' }} value={cuentaRt} onChange={(e) => setCuentaRt(e.target.value)}>
              {CUENTAS_RT.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span style={{ display: 'block', fontSize: '0.78rem', marginTop: '0.25rem' }}>
              El monto liquidado se acredita a esta cuenta (Francisco o Andrés).
            </span>
          </label>
        )}
      </div>

      <FiltroPeriodo
        presets={esHistorial ? PRESETS_HISTORIAL : PRESETS_PENDIENTE}
        preset={presetFecha}
        onPresetChange={cambiarPresetFecha}
        desde={filtroDesde}
        hasta={filtroHasta}
        onDesdeChange={setFiltroDesde}
        onHastaChange={setFiltroHasta}
        labelPeriodo={esHistorial ? 'Periodo de liquidación' : 'Filtrar por fecha de recolección'}
        style={{ marginTop: '0.75rem' }}
        mostrarResumen={presetFecha !== 'todos'}
      />

      {!enTransito.length ? (
        <p className="muted" style={{ marginTop: '1rem' }}>
          {esHistorial
            ? 'Sin liquidaciones selladas en el periodo seleccionado.'
            : 'Sin movimientos en tránsito para este recolector en el filtro actual.'}
        </p>
      ) : (
        <>
          {/* Reporte matriz tienda × fecha */}
          <div className="card" style={{ marginTop: '1rem', padding: '0.85rem' }} id="reporte-recoleccion-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Reporte por tienda y fecha</h4>
              <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={imprimirReporte}>
                Imprimir reporte
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
              {esHistorial ? (
                <>
                  Total liquidado: <strong>{fmtMonto(reporte.granTotal)}</strong> · {enTransito.length} movimiento(s) · {reporte.resumenDias.length} día(s)
                </>
              ) : (
                <>
                  Total en tránsito: <strong>{fmtMonto(reporte.granTotal)}</strong> · {enTransito.length} movimiento(s) · {reporte.resumenDias.length} día(s)
                </>
              )}
            </p>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    {reporte.dias.map((dia) => (
                      <th key={dia} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtFechaClave(dia)}
                        {!esHistorial && dia !== reporte.hoy && (
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--brand-gold)' }}>pendiente</span>
                        )}
                        {esHistorial && (
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--muted)' }}>liquidado</span>
                        )}
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
                        const estado = c?.items?.length ? celdaSeleccionada(c.items) : 'none';
                        if (!c?.count) {
                          return (
                            <td key={dia} style={{ textAlign: 'right', color: 'var(--muted)' }}>
                              —
                            </td>
                          );
                        }
                        if (esHistorial) {
                          return (
                            <td key={dia} style={{ textAlign: 'right', padding: '6px 8px' }}>
                              {fmtMonto(c.total)}
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>{c.count} mov.</span>
                            </td>
                          );
                        }
                        return (
                          <td key={dia} style={{ textAlign: 'right', padding: 0 }}>
                            <button
                              type="button"
                              title={`${c.count} mov. · Clic para ${estado === 'all' ? 'quitar' : 'seleccionar'}`}
                              onClick={() => toggleCelda(c.items, estado !== 'all')}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: 'none',
                                background: estado === 'all' ? 'rgba(13,148,136,0.15)' : estado === 'partial' ? 'rgba(225,153,41,0.12)' : 'transparent',
                                cursor: 'pointer',
                                textAlign: 'right',
                                font: 'inherit',
                              }}
                            >
                              {fmtMonto(c.total)}
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>{c.count} mov.</span>
                            </button>
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

          {/* Selector de días — liquidar varios juntos */}
          {!esHistorial && (
          <div className="card" style={{ marginTop: '1rem', padding: '0.85rem', borderLeft: multiplesDias ? '4px solid var(--brand-gold)' : '4px solid #0d9488' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                {multiplesDias ? 'Selecciona días a liquidar juntos' : 'Día a liquidar'}
              </h4>
              {multiplesDias && (
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleDiaGlobal(enTransito, true)}>
                    Todos los días
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleDiaGlobal(enTransito, false)}>
                    Ninguno
                  </button>
                </div>
              )}
            </div>
            {multiplesDias && (
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                Hay {reporte.resumenDias.length} días sin liquidar. Marca uno o varios para recibir el efectivo del recolector en una sola operación.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              {reporte.resumenDias.map((d) => {
                const estado = estadoSeleccion(d.items, selIds);
                const selCount = d.items.filter((m) => selIds[m.id]).length;
                return (
                  <label
                    key={d.dia}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '8px',
                      border: `1px solid ${estado === 'all' ? 'rgba(13,148,136,0.4)' : 'var(--border)'}`,
                      background: estado === 'all' ? 'rgba(13,148,136,0.06)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <CheckIndeterminado checked={estado === 'all'} indeterminate={estado === 'partial'} onChange={(e) => toggleDiaGlobal(d.items, e.target.checked)} />
                    <span style={{ flex: 1 }}>
                      <strong>{d.etiqueta}</strong>
                      {!d.esHoy && (
                        <span style={{ color: 'var(--brand-gold)', marginLeft: '0.35rem', fontSize: '0.8rem' }}>(día anterior sin liquidar)</span>
                      )}
                      <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                        {d.tiendas} tienda(s) · {d.count} mov. · Merc. {fmtMonto(d.resumen.mercancia)} · Serv. {fmtMonto(d.resumen.servicios)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <strong>{fmtMonto(d.total)}</strong>
                      {estado !== 'none' && (
                        <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                          sel. {fmtMonto(d.items.filter((m) => selIds[m.id]).reduce((a, m) => a + Number(m.monto || 0), 0))}
                        </span>
                      )}
                      {estado === 'partial' && (
                        <span className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>
                          {selCount}/{d.count}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          )}

          {/* Total seleccionado */}
          {!esHistorial && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem',
              borderRadius: '10px',
              background: 'rgba(13,148,136,0.08)',
              border: '1px solid rgba(13,148,136,0.25)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>Total a liquidar hoy: {fmtMonto(totalSeleccionado)}</p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {seleccionados.length} movimiento(s) · {diasSeleccionados.length} día(s) marcado(s) · Mercancía {fmtMonto(resumenSel.mercancia)} · Servicios{' '}
              {fmtMonto(resumenSel.servicios)}
            </p>
          </div>
          )}
          <DetalleTiendasLiquidacion
            movimientos={enTransito}
            esHistorial={esHistorial}
            diaDe={diaDe}
            selIds={selIds}
            setSelIds={setSelIds}
          />

          {!esHistorial && (
          <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} disabled={guardando || totalSeleccionado <= 0} onClick={confirmarLiquidacion}>
            {guardando ? 'Sellando…' : `Sellar liquidación · ${fmtMonto(totalSeleccionado)}`}
          </button>
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
