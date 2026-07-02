import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizarRol } from '../lib/roles.js';
import {
  agruparEnTransitoPorDia,
  agruparEnTransitoPorTiendaYDia,
  fmtFechaClave,
  fmtFechaHora,
  fmtMonto,
  hoyClaveNogales,
  inicializarSeleccionLiquidacion,
  liquidarMovimientos,
  listarAlertasRecoleccion,
  listarEnTransitoPorRepartidor,
  listarRepartidores,
  marcarAlertaVista,
  reporteRecoleccionTiendaFecha,
  resumenTotalesPorTipo,
} from '../lib/controlEfectivo.js';

function etiquetaTipo(m) {
  if (m.tipo_movimiento === 'Cobro Servicio') return 'Servicio';
  if (m.tipo_movimiento === 'Entrega Crédito') return 'Crédito';
  return 'Recolección';
}

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
  const [vistaDetalle, setVistaDetalle] = useState('dia');

  const fechaLiquidacion = useMemo(() => fmtFechaClave(hoyClaveNogales()), []);
  const repNombre = useMemo(() => repartidores.find((r) => r.id === repLiq)?.nombre || '', [repartidores, repLiq]);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const reps = await listarRepartidores(supabase);
      setRepartidores(reps);
      const repId = repLiq || reps[0]?.id || '';
      if (!repLiq && repId) setRepLiq(repId);
      if (!repId) return;
      const [movs, alr] = await Promise.all([
        listarEnTransitoPorRepartidor(supabase, repId),
        listarAlertasRecoleccion(supabase),
      ]);
      setEnTransito(movs);
      setAlertas(alr);
      setSelIds(inicializarSeleccionLiquidacion(movs));
    } catch (e) {
      setError(e.message?.includes('repartidores') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
    }
  }, [supabase, repLiq]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const reporte = useMemo(() => reporteRecoleccionTiendaFecha(enTransito), [enTransito]);
  const agrupadoTienda = useMemo(() => agruparEnTransitoPorTiendaYDia(enTransito), [enTransito]);
  const agrupadoDia = useMemo(() => agruparEnTransitoPorDia(enTransito), [enTransito]);

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
      <p class="muted">Recolector: ${rep} · Fecha reporte: ${fechaLiquidacion} · Total: ${fmtMonto(reporte.granTotal)}</p>
      <table><thead><tr><th>Tienda</th>${headDias}<th>Total tienda</th></tr></thead>
      <tbody>${filasHtml}<tr style="background:#f9f9f9"><td><strong>Total por día</strong></td>${totDia}<td><strong>${fmtMonto(reporte.granTotal)}</strong></td></tr></tbody></table>
      <p class="muted" style="margin-top:1rem">Días seleccionados para liquidar: ${diasSeleccionados.map((d) => d.etiqueta).join(', ') || 'Ninguno'} · Monto a liquidar: ${fmtMonto(totalSeleccionado)}</p>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  };

  const confirmarLiquidacion = async () => {
    const ids = seleccionados.map((m) => m.id);
    if (!ids.length) return alert('Selecciona al menos un día o movimiento para liquidar.');
    const diasTxt = diasSeleccionados.map((d) => d.etiqueta).join(', ');
    if (
      !window.confirm(
        `¿Sellar liquidación del ${fechaLiquidacion}?\n\nDías: ${diasTxt || '—'}\nMonto: ${fmtMonto(totalSeleccionado)} (${ids.length} movimiento(s))`,
      )
    )
      return;
    setGuardando(true);
    const res = await liquidarMovimientos(supabase, {
      ids,
      adminNombre: user?.nombre || rol,
      repartidorNombre: repNombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liquidación sellada (${res.count} registros).`);
    cargar();
  };

  const multiplesDias = reporte.resumenDias.length > 1;

  const inner = (
    <>
      {!embedded && (
        <>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidación de recolecciones</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Reporte por tienda y fecha. Si hay varios días pendientes, marca los días que entregas hoy para liquidarlos juntos.
          </p>
        </>
      )}

      {error && <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p>}

      {alertas.length > 0 && (
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
        <label className="muted" style={{ display: 'block' }}>
          Fecha de liquidación
          <input className="input" style={{ marginTop: '0.35rem' }} value={fechaLiquidacion} readOnly />
        </label>
      </div>

      {!enTransito.length ? (
        <p className="muted" style={{ marginTop: '1rem' }}>Sin movimientos en tránsito para este recolector.</p>
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
              Total en tránsito: <strong>{fmtMonto(reporte.granTotal)}</strong> · {enTransito.length} movimiento(s) · {reporte.resumenDias.length} día(s)
            </p>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    {reporte.dias.map((dia) => (
                      <th key={dia} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtFechaClave(dia)}
                        {dia !== reporte.hoy && (
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.7rem', color: 'var(--brand-gold)' }}>pendiente</span>
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

          {/* Total seleccionado */}
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

          {/* Detalle expandible */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className={vistaDetalle === 'dia' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => setVistaDetalle('dia')}>
              Detalle por día
            </button>
            <button type="button" className={vistaDetalle === 'tienda' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => setVistaDetalle('tienda')}>
              Detalle por tienda
            </button>
          </div>

          {vistaDetalle === 'dia' &&
            agrupadoDia.map((bloque) => {
              const estado = estadoSeleccion(bloque.items, selIds);
              return (
                <div key={bloque.dia} className="card" style={{ marginTop: '0.75rem', padding: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                    <CheckIndeterminado checked={estado === 'all'} indeterminate={estado === 'partial'} onChange={(e) => toggleDiaGlobal(bloque.items, e.target.checked)} />
                    <strong style={{ color: 'var(--brand-blue)' }}>
                      {bloque.etiqueta}
                      {!bloque.esHoy && <span style={{ color: 'var(--brand-gold)', marginLeft: '0.35rem', fontSize: '0.85rem' }}>(pendiente)</span>}
                    </strong>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
                      {fmtMonto(bloque.total)}
                    </span>
                  </label>
                  {bloque.tiendas.map(({ tienda, items, total }) => (
                    <div key={tienda} style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem' }}>
                        <span>{tienda}</span>
                        <span>{fmtMonto(total)}</span>
                      </div>
                      {items.map((m) => (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.35rem 0',
                            borderTop: '1px solid var(--border)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          <input type="checkbox" checked={Boolean(selIds[m.id])} onChange={(e) => setSelIds((p) => ({ ...p, [m.id]: e.target.checked }))} />
                          <span style={{ flex: 1 }}>
                            {m.num_traspaso} · {etiquetaTipo(m)} · {fmtFechaHora(m.fecha_hora)}
                          </span>
                          <strong>{fmtMonto(m.monto)}</strong>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}

          {vistaDetalle === 'tienda' &&
            agrupadoTienda.map(({ tienda, dias, totalTienda }) => {
              const itemsTienda = dias.flatMap((d) => d.items);
              const estadoTienda = estadoSeleccion(itemsTienda, selIds);
              return (
                <div key={tienda} className="card" style={{ marginTop: '0.75rem', padding: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <CheckIndeterminado checked={estadoTienda === 'all'} indeterminate={estadoTienda === 'partial'} onChange={(e) => toggleIds(itemsTienda, e.target.checked)} />
                    <h4 style={{ margin: 0, color: 'var(--brand-blue)', flex: 1 }}>
                      {tienda} · {fmtMonto(totalTienda)}
                    </h4>
                  </label>
                  {dias.map(({ dia, items, total, etiqueta }) => {
                    const estado = estadoSeleccion(items, selIds);
                    return (
                      <div key={dia} style={{ marginTop: '0.65rem', marginLeft: '1.25rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                          <CheckIndeterminado checked={estado === 'all'} indeterminate={estado === 'partial'} onChange={(e) => toggleIds(items, e.target.checked)} />
                          <span>
                            {etiqueta}
                            {dia !== reporte.hoy && <span style={{ color: 'var(--brand-gold)', marginLeft: '0.35rem', fontSize: '0.8rem' }}>(pendiente)</span>}
                          </span>
                          <span className="muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>{fmtMonto(total)}</span>
                        </label>
                        {items.map((m) => (
                          <label
                            key={m.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.35rem 0 0.35rem 1.25rem',
                              borderTop: '1px solid var(--border)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                            }}
                          >
                            <input type="checkbox" checked={Boolean(selIds[m.id])} onChange={(e) => setSelIds((p) => ({ ...p, [m.id]: e.target.checked }))} />
                            <span style={{ flex: 1 }}>
                              {m.num_traspaso} · {etiquetaTipo(m)}
                              {m.cajero_nombre && <span className="muted"> · {m.cajero_nombre}</span>}
                            </span>
                            <strong>{fmtMonto(m.monto)}</strong>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

          <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} disabled={guardando || totalSeleccionado <= 0} onClick={confirmarLiquidacion}>
            {guardando ? 'Sellando…' : `Sellar liquidación · ${fmtMonto(totalSeleccionado)}`}
          </button>
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
