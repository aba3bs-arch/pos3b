import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import {
  PRESETS_REPORTE_INVENTARIO,
  cargarFilasReporteInventarioAsync,
  construirCartaXRInventario,
  filaDesdeAjuste,
  fmtMxnReporte,
  fmtPctReporte,
  paretoMermaPorDepartamentoPorSucursal,
} from '../lib/reporteInventario.js';

function CartaXR({ carta }) {
  const puntos = carta?.puntos || [];
  if (!puntos.length) {
    return <p className="muted">Sin conteos por semana para armar la carta X̄–R. Amplía el periodo o aplica inventarios.</p>;
  }

  const maxX = Math.max(
    ...puntos.map((p) => p.xbar),
    carta.uclX || 0,
    carta.xBarBar || 0,
    0.01,
  );
  const maxR = Math.max(
    ...puntos.map((p) => p.r),
    carta.uclR || 0,
    carta.rBar || 0,
    0.01,
  );

  const plotH = 160;
  const gap = 8;
  const barW = Math.max(18, Math.min(42, Math.floor(520 / puntos.length) - gap));

  const yX = (v) => plotH - (Math.max(0, Number(v) || 0) / maxX) * (plotH - 8);
  const yR = (v) => plotH - (Math.max(0, Number(v) || 0) / maxR) * (plotH - 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.45rem' }}>
        {[
          { label: 'X̄̄ (media)', value: fmtPctReporte(carta.xBarBar) },
          { label: 'UCL X̄', value: fmtPctReporte(carta.uclX) },
          { label: 'LCL X̄', value: fmtPctReporte(carta.lclX) },
          { label: 'R̄ (rango)', value: fmtPctReporte(carta.rBar) },
          { label: 'UCL R', value: fmtPctReporte(carta.uclR) },
          { label: 'n prom. tiendas', value: String(carta.nPromedio || 0) },
        ].map((it) => (
          <div key={it.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '0.45rem 0.55rem' }}>
            <div className="muted" style={{ fontSize: '0.7rem' }}>{it.label}</div>
            <strong style={{ fontSize: '0.95rem' }}>{it.value}</strong>
          </div>
        ))}
      </div>

      <div>
        <h5 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Carta X̄ · % merma promedio (todas las sucursales)</h5>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.75rem' }}>
          Cada punto es el promedio de % merma de las tiendas con conteo esa semana. Líneas: LCL / media / UCL.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={Math.max(320, puntos.length * (barW + gap) + 40)}
            height={plotH + 48}
            role="img"
            aria-label="Carta X barra de merma"
          >
            <line x1={0} y1={yX(carta.uclX)} x2="100%" y2={yX(carta.uclX)} stroke="#c0392b" strokeDasharray="4 3" strokeWidth={1.5} />
            <line x1={0} y1={yX(carta.xBarBar)} x2="100%" y2={yX(carta.xBarBar)} stroke="#27ae60" strokeWidth={1.5} />
            <line x1={0} y1={yX(carta.lclX)} x2="100%" y2={yX(carta.lclX)} stroke="#c0392b" strokeDasharray="4 3" strokeWidth={1.5} />
            {puntos.map((p, i) => {
              const x = 20 + i * (barW + gap);
              const cy = yX(p.xbar);
              return (
                <g key={p.key}>
                  <circle
                    cx={x + barW / 2}
                    cy={cy}
                    r={5}
                    fill={p.fueraX ? '#c0392b' : 'var(--brand-blue)'}
                  />
                  {i > 0 && (
                    <line
                      x1={20 + (i - 1) * (barW + gap) + barW / 2}
                      y1={yX(puntos[i - 1].xbar)}
                      x2={x + barW / 2}
                      y2={cy}
                      stroke="var(--brand-blue)"
                      strokeWidth={1.5}
                      opacity={0.7}
                    />
                  )}
                  <text
                    x={x + barW / 2}
                    y={plotH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    opacity={0.7}
                  >
                    {p.label.length > 10 ? p.label.slice(5) : p.label}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={Math.max(12, cy - 8)}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={p.fueraX ? '#c0392b' : 'currentColor'}
                  >
                    {p.xbar.toFixed(1)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div>
        <h5 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Carta R · rango entre sucursales</h5>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.75rem' }}>
          Rango = max − min del % merma entre tiendas de esa semana (dispersión entre sucursales).
        </p>
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={Math.max(320, puntos.length * (barW + gap) + 40)}
            height={plotH + 48}
            role="img"
            aria-label="Carta R de merma"
          >
            <line x1={0} y1={yR(carta.uclR)} x2="100%" y2={yR(carta.uclR)} stroke="#c0392b" strokeDasharray="4 3" strokeWidth={1.5} />
            <line x1={0} y1={yR(carta.rBar)} x2="100%" y2={yR(carta.rBar)} stroke="#27ae60" strokeWidth={1.5} />
            {carta.lclR > 0 && (
              <line x1={0} y1={yR(carta.lclR)} x2="100%" y2={yR(carta.lclR)} stroke="#c0392b" strokeDasharray="4 3" strokeWidth={1.5} />
            )}
            {puntos.map((p, i) => {
              const x = 20 + i * (barW + gap);
              const h = Math.max(2, (p.r / maxR) * (plotH - 8));
              return (
                <g key={`r-${p.key}`}>
                  <rect
                    x={x}
                    y={plotH - h}
                    width={barW}
                    height={h}
                    rx={3}
                    fill={p.fueraR ? '#c0392b' : '#8e44ad'}
                    opacity={0.85}
                  />
                  <text
                    x={x + barW / 2}
                    y={plotH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    opacity={0.7}
                  >
                    {p.label.length > 10 ? p.label.slice(5) : p.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Pareto en columnas verticales (barras hacia arriba). */
function ParetoColumnas({ items, empty = 'Sin faltantes por departamento.' }) {
  if (!items?.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  const max = Math.max(...items.map((x) => Number(x.total) || 0), 0.01);
  const h = 140;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.45rem',
          minHeight: h + 56,
          paddingBottom: '0.25rem',
        }}
      >
        {items.map((p) => {
          const barH = Math.max(4, ((Number(p.total) || 0) / max) * h);
          return (
            <div
              key={p.id}
              style={{
                flex: '0 0 auto',
                width: 56,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
              title={`${p.label}: ${fmtMxnReporte(p.total)} (${p.pct.toFixed(1)}% · acum ${p.acumPct.toFixed(0)}%)`}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>
                {fmtMxnReporte(p.total)}
              </div>
              <div
                style={{
                  width: '100%',
                  height: barH,
                  borderRadius: '6px 6px 2px 2px',
                  background: p.color || 'var(--brand-blue)',
                }}
              />
              <div
                className="muted"
                style={{
                  fontSize: '0.65rem',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: 56,
                  wordBreak: 'break-word',
                }}
              >
                {p.label}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>{p.pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Vista de gráficas del reporte de inventario: carta X̄–R global + Pareto vertical por sucursal.
 */
export default function GraficasInventarioReporte({
  supabase,
  inventario,
  inventarioCompleto,
  onCerrar,
}) {
  const [preset, setPreset] = useState('mes');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [ajustes, setAjustes] = useState([]);
  const [lineasProducto, setLineasProducto] = useState([]);

  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cargarFilasReporteInventarioAsync({
      supabase,
      inventario,
      inventarioCompleto: catalogo,
      preset,
      desde,
      hasta,
      sucursal: '',
      departamento: '',
    }).then((res) => {
      if (cancel) return;
      setAjustes(res.ajustes || []);
      setLineasProducto(res.lineasProducto || []);
      setRango(res.rango || { desde: '', hasta: '' });
      setAviso(res.aviso || '');
      setLoading(false);
    }).catch((e) => {
      if (cancel) return;
      setAviso(e?.message || String(e));
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [supabase, inventario, catalogo, preset, desde, hasta]);

  const filasAjuste = useMemo(
    () => (ajustes || []).map((a) => filaDesdeAjuste(a)).filter((f) => f.sucursal && f.sucursal !== '—'),
    [ajustes],
  );

  const cartaXR = useMemo(() => construirCartaXRInventario(filasAjuste), [filasAjuste]);
  const paretosSucursal = useMemo(
    () => paretoMermaPorDepartamentoPorSucursal(lineasProducto),
    [lineasProducto],
  );

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gráficas de inventario</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Carta X̄–R de % merma (todas las sucursales) y Pareto de faltante por departamento en cada tienda
            (columnas verticales).
            {loading ? ' Cargando…' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        <FiltroPeriodo
          preset={preset}
          onPresetChange={setPreset}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
          presets={PRESETS_REPORTE_INVENTARIO}
          labelPeriodo="Periodo"
          style={{ flex: '1 1 200px', minWidth: 180 }}
        />
        <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
          {rango.desde && rango.hasta ? `${rango.desde} → ${rango.hasta}` : ''}
          {aviso ? ` · ${aviso}` : ''}
        </p>
      </div>

      <div className="card" style={{ margin: 0, borderTop: '3px solid var(--brand-blue)' }}>
        <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>
          Carta X̄–R · todas las sucursales
        </h4>
        <CartaXR carta={cartaXR} />
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          Pareto por sucursal (columnas verticales)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.78rem' }}>
          Una gráfica debajo de otra. Barras = faltante valorizado por departamento (mayor → menor).
        </p>
        {paretosSucursal.length === 0 ? (
          <p className="muted">Sin faltantes por departamento en el periodo.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {paretosSucursal.map((g) => (
              <div
                key={g.sucursal}
                className="card"
                style={{ margin: 0, borderTop: '3px solid #8e44ad' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <h5 style={{ margin: 0, color: 'var(--brand-blue)' }}>{g.tienda}</h5>
                  <strong style={{ color: '#8e44ad' }}>{fmtMxnReporte(g.totalFaltante)}</strong>
                </div>
                <ParetoColumnas items={g.items} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          <BtnLabel icon="chart">Volver</BtnLabel>
        </button>
      </div>
    </div>
  );
}
