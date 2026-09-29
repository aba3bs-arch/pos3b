import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import {
  esSucursalNoVenta,
  etiquetaTienda,
  listarSucursalesOperativas,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';
import {
  PRESETS_REPORTE_INVENTARIO,
  fmtMxnReporte,
  fmtPctReporte,
  rangoReporteInventario,
} from '../lib/reporteInventario.js';
import {
  desgloseCapturasManualesPorSucursal,
  listarResultadosInventario,
  paretoDesdeCapturasManuales,
} from '../lib/resultadoInventario.js';
import { buildIdActual } from '../lib/appActualizacion.js';

/** Pareto en columnas verticales (barras hacia arriba). */
function ParetoColumnas({ items, empty = 'Sin datos.', mostrarCero = false, valorExtra }) {
  const visibles = mostrarCero ? (items || []) : (items || []).filter((x) => (Number(x.total) || 0) > 0);
  if (!visibles.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  const max = Math.max(...visibles.map((x) => Number(x.total) || 0), 0.01);
  const h = 150;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.45rem',
          minHeight: h + 72,
          paddingBottom: '0.25rem',
        }}
      >
        {visibles.map((p) => {
          const total = Number(p.total) || 0;
          const barH = total > 0 ? Math.max(4, (total / max) * h) : 2;
          const extra = typeof valorExtra === 'function' ? valorExtra(p) : null;
          return (
            <div
              key={p.id}
              style={{
                flex: '0 0 auto',
                width: 62,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
              title={`${p.label}: faltante ${fmtMxnReporte(total)}${extra ? ` · ${extra}` : ''}`}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>
                {fmtMxnReporte(total)}
              </div>
              {extra ? (
                <div className="muted" style={{ fontSize: '0.62rem', textAlign: 'center' }}>{extra}</div>
              ) : null}
              <div
                style={{
                  width: '100%',
                  height: barH,
                  borderRadius: '6px 6px 2px 2px',
                  background: total > 0 ? (p.color || 'var(--brand-blue)') : '#d0d5dd',
                  opacity: total > 0 ? 0.9 : 0.45,
                }}
              />
              <div
                className="muted"
                style={{
                  fontSize: '0.65rem',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: 62,
                  wordBreak: 'break-word',
                  fontWeight: 600,
                }}
              >
                {p.label}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                {total > 0 ? `${(Number(p.pct) || 0).toFixed(0)}%` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Gráficas solo con capturas manuales del auditor (total + faltante del bono).
 * No usa conteos / diferencias del sistema.
 */
export default function GraficasInventarioReporte({
  supabase,
  sucursalesLista,
  onCerrar,
}) {
  const [preset, setPreset] = useState('anio');
  const [desde, setDesde] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');
  const [registros, setRegistros] = useState([]);

  const rango = useMemo(
    () => rangoReporteInventario(preset, desde, hasta),
    [preset, desde, hasta],
  );

  const tiendasCatalogo = useMemo(() => {
    const set = new Set(listarSucursalesOperativas());
    for (const s of sucursalesLista || []) {
      const n = normalizarCodigoTienda(s);
      if (n && !esSucursalNoVenta(n)) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [sucursalesLista]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const lista = await listarResultadosInventario(supabase, {
          desde: rango.desde,
          hasta: rango.hasta,
          limit: 500,
        });
        if (cancel) return;
        setRegistros(lista.registros || []);
        setAviso(lista.aviso || '');
      } catch (e) {
        if (!cancel) {
          setRegistros([]);
          setAviso(e?.message || String(e));
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [supabase, rango.desde, rango.hasta]);

  const paretoTodas = useMemo(
    () => paretoDesdeCapturasManuales(registros, tiendasCatalogo),
    [registros, tiendasCatalogo],
  );

  const porSucursal = useMemo(
    () => desgloseCapturasManualesPorSucursal(registros, tiendasCatalogo),
    [registros, tiendasCatalogo],
  );

  const conFaltante = paretoTodas.filter((p) => p.total > 0).length;
  const conCaptura = paretoTodas.filter((p) => p.capturas > 0).length;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gráficas de inventario · Pareto</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Solo datos que el <strong>auditor / admin captura a mano</strong> (total + faltante del bono).
            No usa conteos ni faltantes del sistema. Todas las tiendas, sin selector.
            {loading ? ' Cargando…' : ''}
          </p>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.72rem' }}>
            Build {buildIdActual() || 'sin-id'}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div
        style={{
          background: 'rgba(59,105,181,0.08)',
          border: '1px solid rgba(59,105,181,0.25)',
          borderRadius: 8,
          padding: '0.55rem 0.75rem',
          fontSize: '0.8rem',
        }}
      >
        <strong style={{ color: 'var(--brand-blue)' }}>Fuente:</strong>{' '}
        Reportes → Inventario → «Resultado de inventario (para bono)» guardado por tienda.
        Barras = <strong>faltante</strong> (campo 2). Debajo de cada barra se muestra el % merma
        (faltante neto ÷ total capturado).
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
          {rango.desde} → {rango.hasta}
          {` · ${paretoTodas.length} tiendas`}
          {` · ${conCaptura} con captura`}
          {` · ${conFaltante} con faltante`}
          {aviso ? ` · ${aviso}` : ''}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {tiendasCatalogo.map((s) => (
          <span
            key={s}
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--brand-blue)',
            }}
          >
            {etiquetaTienda(s)}
          </span>
        ))}
      </div>

      <div className="card" style={{ margin: 0, borderTop: '3px solid var(--brand-blue)' }}>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          1 · Pareto de faltante entre sucursales (manual)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Suma del faltante capturado a mano en el periodo. Gris = sin captura o $0.
        </p>
        <ParetoColumnas
          items={paretoTodas}
          mostrarCero
          empty="Sin sucursales en el catálogo."
          valorExtra={(p) => (p.capturas > 0 ? `merma ${fmtPctReporte(p.pctMerma)}` : 'sin captura')}
        />
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          2 · Capturas por sucursal (una debajo de otra)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.78rem' }}>
          Cada columna es un periodo guardado por el auditor (faltante $). No hay desglose por departamento
          porque la captura manual es a nivel tienda.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {porSucursal.map((g) => (
            <div
              key={g.sucursal}
              className="card"
              style={{ margin: 0, borderTop: '3px solid #8e44ad' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <div>
                  <h5 style={{ margin: 0, color: 'var(--brand-blue)' }}>{g.tienda}</h5>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.72rem' }}>
                    {g.items.length
                      ? `${g.items.length} captura(s) · total inv. ${fmtMxnReporte(g.totalInventario)}`
                      : 'Sin captura manual en este periodo'}
                  </p>
                </div>
                <strong style={{ color: g.totalFaltante > 0 ? '#8e44ad' : 'var(--muted, #7f8c8d)' }}>
                  {fmtMxnReporte(g.totalFaltante)}
                </strong>
              </div>
              <ParetoColumnas
                items={g.items}
                empty="Sin capturas manuales guardadas para esta tienda."
                valorExtra={(p) => (p.pctMerma != null ? `merma ${fmtPctReporte(p.pctMerma)}` : null)}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          <BtnLabel icon="chart">Volver</BtnLabel>
        </button>
      </div>
    </div>
  );
}
