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

const COLOR_BONIF = '#c9a227';

/**
 * Barras apiladas: abajo faltante neto (cobra merma), arriba bonificación (dorado).
 * Altura total = neto + bonificación (= faltante bruto).
 */
function ParetoColumnas({ items, empty = 'Sin datos.', mostrarCero = false }) {
  const visibles = mostrarCero
    ? (items || [])
    : (items || []).filter((x) => (Number(x.faltanteNeto ?? x.total) || 0) > 0 || (Number(x.bonificacion) || 0) > 0);
  if (!visibles.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;

  const max = Math.max(
    ...visibles.map((x) => {
      const neto = Number(x.faltanteNeto ?? x.total) || 0;
      const bon = Number(x.bonificacion) || 0;
      return neto + bon;
    }),
    0.01,
  );
  const h = 150;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.45rem',
          minHeight: h + 88,
          paddingBottom: '0.25rem',
        }}
      >
        {visibles.map((p) => {
          const neto = Number(p.faltanteNeto ?? p.total) || 0;
          const bon = Number(p.bonificacion) || 0;
          const stack = neto + bon;
          const stackH = stack > 0 ? Math.max(6, (stack / max) * h) : 2;
          const bonH = stack > 0 && bon > 0 ? Math.max(3, (bon / stack) * stackH) : 0;
          const netoH = Math.max(stack > 0 ? 3 : 2, stackH - bonH);
          return (
            <div
              key={p.id}
              style={{
                flex: '0 0 auto',
                width: 68,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}
              title={`${p.label}: neto ${fmtMxnReporte(neto)} · bonif. ${fmtMxnReporte(bon)} · bruto ${fmtMxnReporte(stack)}`}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.15, color: 'var(--brand-gold-dark, #8a7020)' }}>
                {fmtMxnReporte(neto)}
              </div>
              {bon > 0 ? (
                <div style={{ fontSize: '0.6rem', fontWeight: 700, textAlign: 'center', color: COLOR_BONIF }}>
                  +{fmtMxnReporte(bon)} bonif.
                </div>
              ) : (
                <div className="muted" style={{ fontSize: '0.6rem', textAlign: 'center' }}>
                  {p.capturas === 0 ? 'sin captura' : 'sin bonif.'}
                </div>
              )}
              <div
                style={{
                  width: '100%',
                  height: stackH,
                  borderRadius: '6px 6px 2px 2px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  background: stack > 0 ? 'transparent' : '#d0d5dd',
                  opacity: stack > 0 ? 1 : 0.45,
                }}
              >
                {bonH > 0 ? (
                  <div
                    style={{
                      width: '100%',
                      height: bonH,
                      background: COLOR_BONIF,
                      flexShrink: 0,
                    }}
                    title={`Bonificación ${fmtMxnReporte(bon)}`}
                  />
                ) : null}
                <div
                  style={{
                    width: '100%',
                    height: netoH,
                    background: stack > 0 ? (p.color || 'var(--brand-blue)') : '#d0d5dd',
                    flexShrink: 0,
                    borderRadius: bonH > 0 ? 0 : '6px 6px 2px 2px',
                  }}
                  title={`Faltante neto ${fmtMxnReporte(neto)}`}
                />
              </div>
              <div
                className="muted"
                style={{
                  fontSize: '0.65rem',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: 68,
                  wordBreak: 'break-word',
                  fontWeight: 600,
                }}
              >
                {p.label}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                {neto > 0 ? `${(Number(p.pct) || 0).toFixed(0)}%` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeyendaBarras() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', fontSize: '0.75rem', marginBottom: '0.55rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--brand-blue)' }} />
        Faltante neto (faltante − bonificación)
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: 2, background: COLOR_BONIF }} />
        Bonificación (dentro de la barra)
      </span>
    </div>
  );
}

/**
 * Gráficas solo con capturas manuales: faltante neto + bonificación apilada.
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

  const conNeto = paretoTodas.filter((p) => p.total > 0).length;
  const conBonif = paretoTodas.filter((p) => (Number(p.bonificacion) || 0) > 0).length;
  const conCaptura = paretoTodas.filter((p) => p.capturas > 0).length;
  const totalBonif = paretoTodas.reduce((a, p) => a + (Number(p.bonificacion) || 0), 0);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gráficas de inventario · Pareto</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Solo captura manual del auditor. Compara <strong>faltante neto</strong> (faltante − bonificación)
            y muestra la bonificación <strong>dentro de cada barra</strong> (dorado).
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
        <strong style={{ color: 'var(--brand-blue)' }}>Cómo leerlo:</strong>{' '}
        número grande = faltante neto (lo que afecta el bono).
        Texto dorado = bonificación de esa tienda. La barra apila neto (color) + bonif. (dorado).
        {totalBonif > 0 ? ` · Bonificado en el periodo: ${fmtMxnReporte(totalBonif)}` : ''}
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
          {` · ${conNeto} con neto`}
          {` · ${conBonif} con bonif.`}
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
          1 · Pareto entre sucursales (neto + bonificación)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.45rem', fontSize: '0.78rem' }}>
          Ordenado por faltante neto. % = participación del neto entre tiendas.
        </p>
        <LeyendaBarras />
        <ParetoColumnas
          items={paretoTodas}
          mostrarCero
          empty="Sin sucursales en el catálogo."
        />
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          2 · Capturas por sucursal (una debajo de otra)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.45rem', fontSize: '0.78rem' }}>
          Cada columna es un periodo guardado. Misma lectura: neto + bonif. dentro de la barra.
        </p>
        <LeyendaBarras />
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
                      ? `${g.items.length} captura(s) · inv. ${fmtMxnReporte(g.totalInventario)} · bonif. ${fmtMxnReporte(g.totalBonificacion || 0)}`
                      : 'Sin captura manual en este periodo'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ color: g.totalFaltanteNeto > 0 ? '#8e44ad' : 'var(--muted, #7f8c8d)' }}>
                    neto {fmtMxnReporte(g.totalFaltanteNeto || 0)}
                  </strong>
                  {(g.totalBonificacion || 0) > 0 ? (
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: COLOR_BONIF }}>
                      bonif. {fmtMxnReporte(g.totalBonificacion)}
                    </div>
                  ) : null}
                </div>
              </div>
              <ParetoColumnas
                items={g.items}
                empty="Sin capturas manuales guardadas para esta tienda."
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
