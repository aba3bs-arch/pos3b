import React, { useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import {
  AREAS_ESTADISTICA,
  FECHA_INICIO_ESTADISTICAS,
  GRANULARIDAD_OPTS,
  agruparGastosPorCategoria,
  agruparGastosPorTienda,
  agruparPorTurno,
  agruparVentasPorPeriodo,
  cargarDatosEstadisticasArea,
  combinarSeriesComparacion,
  construirInsightCambio,
  desgloseGastosPorSubcategoria,
  estiloPastel,
  filasDeSemana,
  hoyYmdEstadisticas,
  paretoDesdePeriodo,
  pastelDesdePareto,
  pctCambio,
  periodoAnterior,
  rangoDesdePreset,
  sumaGastos,
  sumaVentas,
  ticketPromedio,
  tiendasEstadisticas,
} from '../lib/estadisticasData.js';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function Kpi({ title, value, sub, accent, delta }) {
  return (
    <div className="card" style={{ margin: 0, borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <h4 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)', fontSize: '0.88rem' }}>{title}</h4>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--brand-gold-dark)' }}>{value}</div>
      {sub && <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>{sub}</p>}
      {delta != null && (
        <div style={{ marginTop: '0.35rem', fontWeight: 700, fontSize: '0.9rem', color: delta >= 0 ? '#27ae60' : '#c0392b' }}>
          {fmtPct(delta)} vs periodo anterior
        </div>
      )}
    </div>
  );
}

function ParetoChart({ items, empty = 'Sin datos', onSelect, selectedId, hint }) {
  if (!items?.length) return <p className="muted">{empty}</p>;
  const clickable = typeof onSelect === 'function';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {hint ? <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.75rem' }}>{hint}</p> : null}
      {items.map((p) => {
        const activo = selectedId != null && String(selectedId) === String(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={clickable ? () => onSelect(activo ? null : p) : undefined}
            disabled={!clickable}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: activo ? '1px solid var(--brand-blue)' : '1px solid transparent',
              borderRadius: 8,
              padding: '0.35rem 0.4rem',
              background: activo ? 'rgba(59,105,181,0.08)' : 'transparent',
              cursor: clickable ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.15rem', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ textAlign: 'right' }}>
                {fmt(p.total)}{' '}
                <span className="muted">({p.pct.toFixed(1)}% · acum {p.acumPct.toFixed(0)}%)</span>
              </span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', background: p.color }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PastelChart({ items, empty = 'Sin datos' }) {
  if (!items?.length) return <p className="muted">{empty}</p>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
      <div style={{ width: 140, height: 140, borderRadius: '50%', flexShrink: 0, ...estiloPastel(items) }} />
      <div style={{ flex: 1, minWidth: 160 }}>
        {items.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.82rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{p.label}</span>
            <strong>{fmt(p.total)}</strong>
            <span className="muted">({p.pct.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dashboard de un área: abarrotes | virtual | garage.
 */
export default function EstadisticasArea({ supabase, area = 'abarrotes', inventario = [] }) {
  const meta = AREAS_ESTADISTICA[area] || AREAS_ESTADISTICA.abarrotes;
  const [filtroTienda, setFiltroTienda] = useState('');
  const [presetFecha, setPresetFecha] = useState('mes');
  const [desde, setDesde] = useState(FECHA_INICIO_ESTADISTICAS);
  const [hasta, setHasta] = useState(hoyYmdEstadisticas());
  const [granularidad, setGranularidad] = useState('semana');
  const [cargando, setCargando] = useState(false);
  const [pack, setPack] = useState(null);
  const [packAnt, setPackAnt] = useState(null);
  const [semanaSel, setSemanaSel] = useState(null);
  const [categoriaSel, setCategoriaSel] = useState(null);

  const rango = useMemo(() => {
    if (presetFecha === 'rango') {
      return {
        desde: desde || FECHA_INICIO_ESTADISTICAS,
        hasta: hasta || hoyYmdEstadisticas(),
      };
    }
    if (presetFecha === 'operativo') {
      return { desde: FECHA_INICIO_ESTADISTICAS, hasta: hoyYmdEstadisticas() };
    }
    return rangoDesdePreset(presetFecha) || { desde: FECHA_INICIO_ESTADISTICAS, hasta: hoyYmdEstadisticas() };
  }, [presetFecha, desde, hasta]);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (!supabase || !rango?.desde || !rango?.hasta) return;
      setCargando(true);
      const ant = periodoAnterior(rango.desde, rango.hasta);
      const [act, prev] = await Promise.all([
        cargarDatosEstadisticasArea(supabase, {
          area,
          desde: rango.desde,
          hasta: rango.hasta,
          sucursal: filtroTienda || null,
          inventario,
        }),
        cargarDatosEstadisticasArea(supabase, {
          area,
          desde: ant.desde,
          hasta: ant.hasta,
          sucursal: filtroTienda || null,
          inventario,
        }),
      ]);
      if (!ok) return;
      setPack(act);
      setPackAnt(prev);
      setSemanaSel(null);
      setCategoriaSel(null);
      setCargando(false);
    })();
    return () => {
      ok = false;
    };
  }, [supabase, area, rango, filtroTienda, inventario]);

  const ventas = pack?.ventas || [];
  const ventasAnt = packAnt?.ventas || [];
  const gastos = pack?.gastos || [];
  const gastosAnt = packAnt?.gastos || [];

  const totalVentas = useMemo(() => sumaVentas(ventas), [ventas]);
  const totalVentasAnt = useMemo(() => sumaVentas(ventasAnt), [ventasAnt]);
  const cambioVentas = useMemo(() => pctCambio(totalVentas, totalVentasAnt), [totalVentas, totalVentasAnt]);
  const insight = useMemo(() => construirInsightCambio(cambioVentas), [cambioVentas]);

  const totalGastos = useMemo(() => sumaGastos(gastos), [gastos]);
  const totalGastosAnt = useMemo(() => sumaGastos(gastosAnt), [gastosAnt]);
  const cambioGastos = useMemo(() => pctCambio(totalGastos, totalGastosAnt), [totalGastos, totalGastosAnt]);
  const utilidad = totalVentas - totalGastos;
  const utilidadAnt = totalVentasAnt - totalGastosAnt;
  const cambioUtilidad = pctCambio(utilidad, utilidadAnt);

  const serie = useMemo(() => {
    const act = agruparVentasPorPeriodo(ventas, granularidad);
    const ant = agruparVentasPorPeriodo(ventasAnt, granularidad);
    return combinarSeriesComparacion(act, ant);
  }, [ventas, ventasAnt, granularidad]);

  const alzas = useMemo(() => serie.filter((s) => s.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5), [serie]);
  const bajas = useMemo(() => serie.filter((s) => s.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5), [serie]);

  const paretoVentasSemana = useMemo(() => paretoDesdePeriodo(ventas, 'semana'), [ventas]);
  const paretoVentasDiaSemana = useMemo(() => {
    if (!semanaSel?.id) return [];
    return paretoDesdePeriodo(filasDeSemana(ventas, semanaSel.id), 'dia');
  }, [ventas, semanaSel]);

  const pastelGastosTienda = useMemo(() => agruparGastosPorTienda(gastos), [gastos]);
  const paretoGastosCat = useMemo(() => agruparGastosPorCategoria(gastos), [gastos]);
  const pastelGastosCat = useMemo(() => pastelDesdePareto(paretoGastosCat.slice(0, 8)), [paretoGastosCat]);
  /** Con tienda seleccionada: el pastel muestra gastos de esa tienda por categoría. */
  const pastelGastosPanel = useMemo(() => {
    if (filtroTienda) return pastelGastosCat;
    return pastelGastosTienda.length ? pastelGastosTienda : pastelGastosCat;
  }, [filtroTienda, pastelGastosCat, pastelGastosTienda]);
  const tituloPastelGastos = filtroTienda
    ? `Gastos de ${etiquetaTienda(filtroTienda)} por categoría (pastel)`
    : 'Gastos por tienda (pastel)';

  const desgloseCat = useMemo(() => {
    if (!categoriaSel?.id) return null;
    return desgloseGastosPorSubcategoria(gastos, categoriaSel.id);
  }, [gastos, categoriaSel]);

  const pastelTurno = useMemo(() => agruparPorTurno(ventas), [ventas]);
  const merma = pack?.merma || [];
  const inv = pack?.inventario || [];
  const totalMerma = merma.reduce((a, m) => a + (Number(m.valor) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `3px solid ${meta.color}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, color: meta.color }}>{meta.label}</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>{meta.desc}</p>
          </div>
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '0.45rem 0.75rem',
              borderRadius: 8,
              background: 'var(--surface)',
              border: `1px solid ${insight.color}`,
              color: insight.color,
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            {insight.texto}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.85rem' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 150 }}
              value={filtroTienda}
              onChange={(e) => setFiltroTienda(e.target.value)}
            >
              <option value="">Todas las tiendas</option>
              {tiendasEstadisticas().map((t) => (
                <option key={t} value={t}>{etiquetaTienda(t)}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Periodo rápido
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }}
              value={presetFecha}
              onChange={(e) => setPresetFecha(e.target.value)}
            >
              <option value="operativo">Desde 25-jul (arranque)</option>
              <option value="hoy">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="semana">Esta semana (sáb–vie)</option>
              <option value="mes">Este mes</option>
              <option value="mes_ant">Mes anterior</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="rango">Rango personalizado</option>
            </select>
          </label>
          {presetFecha === 'rango' && (
            <FiltroPeriodo
              labelPeriodo="Rango"
              preset="rango"
              onPresetChange={() => {}}
              desde={desde}
              hasta={hasta}
              onDesdeChange={setDesde}
              onHastaChange={setHasta}
              className="cal-picker-wrap--inline"
            />
          )}
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Agrupar
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 130 }}
              value={granularidad}
              onChange={(e) => setGranularidad(e.target.value)}
            >
              {GRANULARIDAD_OPTS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.78rem' }}>
          {rango.desde} → {rango.hasta}
          {cargando ? ' · Cargando…' : ''}
          {(pack?.avisos || []).length ? ` · ${(pack.avisos || []).join(' · ')}` : ''}
          {pack?.error ? ` · ${pack.error}` : ''}
        </p>
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
          Gastos depurados: se omiten montos de $10,000 y textos test/prueba.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <Kpi
          title="Ventas"
          value={fmt(totalVentas)}
          sub={`${ventas.length} cierres con venta (cortes)`}
          accent={meta.color}
          delta={cambioVentas}
        />
        <Kpi
          title="Gastos"
          value={fmt(totalGastos)}
          sub={`${gastos.length} movimientos reales`}
          accent="#c0392b"
          delta={cambioGastos}
        />
        <Kpi
          title="Utilidad bruta"
          value={fmt(utilidad)}
          sub="Ventas − gastos del área"
          accent="#27ae60"
          delta={cambioUtilidad}
        />
        <Kpi
          title="Venta promedio / cierre"
          value={fmt(ticketPromedio(ventas))}
          sub="Por cierre de corte"
          accent="#2980b9"
        />
        {area === 'abarrotes' && (
          <Kpi
            title="Merma estimada"
            value={fmt(totalMerma)}
            sub="Retiros / faltantes valorizados"
            accent="#8e44ad"
          />
        )}
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
          Ventas {GRANULARIDAD_OPTS.find((g) => g.id === granularidad)?.label?.toLowerCase()} — comparación
        </h4>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: meta.color, borderRadius: 2, marginRight: 4 }} />
            Periodo actual
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#bdc3c7', borderRadius: 2, marginRight: 4 }} />
            Periodo anterior
          </span>
        </div>
        {serie.length === 0 ? (
          <p className="muted">Sin ventas en el rango.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {serie.map((s) => (
              <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 110px', gap: '0.4rem', alignItems: 'center', fontSize: '0.82rem' }}>
                <span className="muted">{s.label}</span>
                <div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ width: `${s.pctActual}%`, height: '100%', background: meta.color }} />
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
                    <div style={{ width: `${s.pctAnterior}%`, height: '100%', background: '#bdc3c7' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
                  <strong>{fmt(s.actual)}</strong>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: s.delta >= 0 ? '#27ae60' : '#c0392b' }}>
                    {fmtPct(s.pctCambio)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem', color: '#27ae60' }}>Mayores alzas</h4>
          {alzas.length === 0 ? (
            <p className="muted">Sin incrementos en este corte.</p>
          ) : (
            alzas.map((s) => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span>{s.label}</span>
                <strong style={{ color: '#27ae60' }}>+{fmt(s.delta)} ({fmtPct(s.pctCambio)})</strong>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem', color: '#c0392b' }}>Mayores descensos</h4>
          {bajas.length === 0 ? (
            <p className="muted">Sin caídas en este corte.</p>
          ) : (
            bajas.map((s) => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <span>{s.label}</span>
                <strong style={{ color: '#c0392b' }}>{fmt(s.delta)} ({fmtPct(s.pctCambio)})</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Ventas por semana (Pareto)</h4>
          <ParetoChart
            items={paretoVentasSemana}
            empty="Sin ventas por semana en el rango."
            hint="Haz clic en una semana para ver el desglose por día."
            selectedId={semanaSel?.id}
            onSelect={(item) => setSemanaSel(item)}
          />
          {semanaSel && (
            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h5 style={{ margin: 0, color: 'var(--brand-blue-dark)', fontSize: '0.9rem' }}>
                  Desglose diario · {semanaSel.label}
                </h5>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }} onClick={() => setSemanaSel(null)}>
                  Cerrar
                </button>
              </div>
              <ParetoChart items={paretoVentasDiaSemana} empty="Sin ventas diarias en esa semana." />
            </div>
          )}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Ventas por turno (pastel)</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.78rem' }}>
            Solo Diurno (07–19) y Nocturno (19–07) · turnos 12×12
          </p>
          <PastelChart items={pastelTurno} empty="Sin ventas para repartir por turno." />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Gastos por categoría (Pareto)</h4>
          <ParetoChart
            items={paretoGastosCat.slice(0, 10)}
            empty="Sin gastos reales en el rango."
            hint="Haz clic en una categoría para ver subcategorías y detalle."
            selectedId={categoriaSel?.id}
            onSelect={(item) => setCategoriaSel(item)}
          />
          {categoriaSel && desgloseCat && (
            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h5 style={{ margin: 0, color: 'var(--brand-blue-dark)', fontSize: '0.9rem' }}>
                  Desglose · {categoriaSel.label}
                </h5>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }} onClick={() => setCategoriaSel(null)}>
                  Cerrar
                </button>
              </div>
              <ParetoChart items={desgloseCat.items} empty="Sin subcategorías en esta categoría." />
              {desgloseCat.detalle.length > 0 && (
                <div className="table-wrap" style={{ marginTop: '0.65rem' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Subcategoría</th>
                        <th>Comentario</th>
                        <th>Tienda</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desgloseCat.detalle.slice(0, 40).map((g) => (
                        <tr key={g.id}>
                          <td>{g.fecha || '—'}</td>
                          <td>{g.subcategoria}</td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.comentario || '—'}
                          </td>
                          <td>{g.tienda}</td>
                          <td>{fmt(g.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {desgloseCat.detalle.length > 40 && (
                    <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem' }}>
                      Mostrando 40 de {desgloseCat.detalle.length} movimientos.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>{tituloPastelGastos}</h4>
          {filtroTienda ? (
            <p className="muted" style={{ marginTop: 0, fontSize: '0.78rem' }}>
              Tienda filtrada: el pastel desglosa los gastos por categoría.
            </p>
          ) : null}
          <PastelChart
            items={pastelGastosPanel}
            empty={filtroTienda ? 'Sin gastos de esta tienda en el rango.' : 'Sin gastos por tienda en el rango.'}
          />
        </div>
      </div>

      {area === 'abarrotes' && (
        <div className="grid-2">
          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Inventario valorizado (costo)</h4>
            <ParetoChart
              items={inv.map((x, i, arr) => {
                const sum = arr.reduce((a, y) => a + y.total, 0) || 1;
                let acum = 0;
                for (let j = 0; j <= i; j++) acum += arr[j].total;
                return { ...x, pct: (x.total / sum) * 100, acumPct: (acum / sum) * 100 };
              })}
              empty="Sin inventario cargado en esta sesión."
            />
          </div>
          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Merma por tienda (pastel)</h4>
            <PastelChart items={merma} empty="Sin mermas/retiros en el rango." />
          </div>
        </div>
      )}

      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Cierres de corte en el periodo</h4>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          {(pack?.cierres || []).length} cierre(s) · las ventas de {meta.label} salen de cortes_contabilidad_cierres (todas las sucursales).
        </p>
      </div>
    </div>
  );
}
