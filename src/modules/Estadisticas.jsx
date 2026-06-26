import React, { useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import {
  GRANULARIDAD_OPTS,
  PRESETS_FECHA_PRODUCTO,
  agruparGastosPorTienda,
  agruparVentasPorPeriodo,
  agruparVentasPorTienda,
  cargarDatosEstadisticas,
  combinarSeriesComparacion,
  estiloPastel,
  pctCambio,
  periodoAnterior,
  rangoDesdePreset,
  sumaGastos,
  sumaVentas,
} from '../lib/estadisticasData.js';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Estadisticas({ supabase }) {
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [filtroTienda, setFiltroTienda] = useState('');
  const [presetFecha, setPresetFecha] = useState('7d');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [granularidad, setGranularidad] = useState('dia');
  const [cargando, setCargando] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [ventasAnt, setVentasAnt] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const rango = useMemo(() => {
    if (presetFecha === 'rango') return { desde: desde || null, hasta: hasta || null };
    return rangoDesdePreset(presetFecha);
  }, [presetFecha, desde, hasta]);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (!supabase || !rango?.desde || !rango?.hasta) return;
      setCargando(true);
      setError('');
      const ant = periodoAnterior(rango.desde, rango.hasta);
      const [act, prev] = await Promise.all([
        cargarDatosEstadisticas(supabase, { ...rango, sucursal: filtroTienda || null }),
        cargarDatosEstadisticas(supabase, { desde: ant.desde, hasta: ant.hasta, sucursal: filtroTienda || null }),
      ]);
      if (!ok) return;
      setVentas(act.ventas);
      setVentasAnt(prev.ventas);
      setGastos(act.gastos);
      setAviso(act.aviso || '');
      setError(act.error || prev.error || '');
      setCargando(false);
    })();
    return () => {
      ok = false;
    };
  }, [supabase, rango, filtroTienda]);

  const totalActual = useMemo(() => sumaVentas(ventas), [ventas]);
  const totalAnterior = useMemo(() => sumaVentas(ventasAnt), [ventasAnt]);
  const cambio = useMemo(() => pctCambio(totalActual, totalAnterior), [totalActual, totalAnterior]);

  const serie = useMemo(() => {
    const act = agruparVentasPorPeriodo(ventas, granularidad);
    const ant = agruparVentasPorPeriodo(ventasAnt, granularidad);
    return combinarSeriesComparacion(act, ant);
  }, [ventas, ventasAnt, granularidad]);

  const pareto = useMemo(() => agruparVentasPorTienda(ventas), [ventas]);
  const pastel = useMemo(() => agruparGastosPorTienda(gastos), [gastos]);
  const totalGastos = useMemo(() => sumaGastos(gastos), [gastos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Filtros</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 150 }} value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTienda(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Rango
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={presetFecha} onChange={(e) => setPresetFecha(e.target.value)}>
              {PRESETS_FECHA_PRODUCTO.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {presetFecha === 'rango' && (
            <>
              <label className="muted" style={{ fontSize: '0.8rem' }}>
                Desde
                <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem' }} value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label className="muted" style={{ fontSize: '0.8rem' }}>
                Hasta
                <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem' }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </>
          )}
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Agrupar ventas
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 130 }} value={granularidad} onChange={(e) => setGranularidad(e.target.value)}>
              {GRANULARIDAD_OPTS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {aviso && <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{aviso}</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{error}</p>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>Ventas del periodo</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.8rem' }}>
            {rango?.desde} — {rango?.hasta} · {ventas.length} tickets
          </p>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-gold-dark)' }}>{fmt(totalActual)}</div>
          {cargando && <span className="muted">Cargando…</span>}
        </div>
        <div className="card">
          <h4 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>vs periodo anterior</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.8rem' }}>
            Misma duración inmediatamente antes
          </p>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmt(totalAnterior)}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: cambio >= 0 ? '#27ae60' : 'var(--danger)' }}>
            {cambio >= 0 ? '+' : ''}
            {cambio.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
          Ventas {GRANULARIDAD_OPTS.find((g) => g.id === granularidad)?.label?.toLowerCase()} — comparación
        </h4>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          <span>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--brand-blue)', borderRadius: 2, marginRight: 4 }} />
            Periodo actual
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#bdc3c7', borderRadius: 2, marginRight: 4 }} />
            Periodo anterior
          </span>
        </div>
        {serie.length === 0 ? (
          <p className="muted">Sin ventas en el rango seleccionado.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {serie.map((s) => (
              <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 88px', gap: '0.4rem', alignItems: 'center', fontSize: '0.82rem' }}>
                <span className="muted">{s.label}</span>
                <div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ width: `${s.pctActual}%`, height: '100%', background: 'var(--brand-blue)' }} />
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
                    <div style={{ width: `${s.pctAnterior}%`, height: '100%', background: '#bdc3c7' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
                  <strong>{fmt(s.actual)}</strong>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>{fmt(s.anterior)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Ventas por tienda (Pareto)</h4>
          {pareto.length === 0 ? (
            <p className="muted">Sin datos.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {pareto.map((p) => (
                <div key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span>
                      {fmt(p.total)} <span className="muted">({p.pct.toFixed(1)}% · acum {p.acumPct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Gastos de cortes por tienda</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.8rem' }}>
            Total: {fmt(totalGastos)} · {gastos.length} movimientos
          </p>
          {pastel.length === 0 ? (
            <p className="muted">Sin gastos en el rango (o tabla cortes_contabilidad_gastos no disponible).</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  flexShrink: 0,
                  ...estiloPastel(pastel),
                }}
              />
              <div style={{ flex: 1, minWidth: 160 }}>
                {pastel.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.82rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{p.label}</span>
                    <strong>{fmt(p.total)}</strong>
                    <span className="muted">({p.pct.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
