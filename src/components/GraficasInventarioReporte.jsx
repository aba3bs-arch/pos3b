import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import {
  PRESETS_REPORTE_INVENTARIO,
  cargarFilasReporteInventarioAsync,
  fmtMxnReporte,
  paretoComparativoPorSucursal,
  paretoMermaPorDepartamentoPorSucursal,
  tiendasParaFiltroInventario,
} from '../lib/reporteInventario.js';
import { listarResultadosInventario } from '../lib/resultadoInventario.js';
import { esSucursalNoVenta } from '../constants/sucursales.js';

/** Pareto en columnas verticales (barras hacia arriba). */
function ParetoColumnas({ items, empty = 'Sin datos.', mostrarCero = false }) {
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
          minHeight: h + 64,
          paddingBottom: '0.25rem',
        }}
      >
        {visibles.map((p) => {
          const total = Number(p.total) || 0;
          const barH = total > 0 ? Math.max(4, (total / max) * h) : 2;
          return (
            <div
              key={p.id}
              style={{
                flex: '0 0 auto',
                width: 58,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
              title={`${p.label}: ${fmtMxnReporte(total)} (${(Number(p.pct) || 0).toFixed(1)}% · acum ${(Number(p.acumPct) || 0).toFixed(0)}%)`}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>
                {fmtMxnReporte(total)}
              </div>
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
                  maxWidth: 58,
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
 * Gráficas de inventario: Pareto comparativo entre sucursales + Pareto por depto en cada tienda.
 */
export default function GraficasInventarioReporte({
  supabase,
  inventario,
  inventarioCompleto,
  sucursal,
  sucursalesLista,
  onCerrar,
}) {
  const [preset, setPreset] = useState('anio');
  const [desde, setDesde] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [lineasProducto, setLineasProducto] = useState([]);
  const [extrasFaltante, setExtrasFaltante] = useState({});

  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;

  const tiendasCatalogo = useMemo(() => {
    const base = tiendasParaFiltroInventario(sucursal, sucursalesLista)
      .filter((s) => !esSucursalNoVenta(s));
    return base;
  }, [sucursal, sucursalesLista]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const res = await cargarFilasReporteInventarioAsync({
          supabase,
          inventario,
          inventarioCompleto: catalogo,
          preset,
          desde,
          hasta,
          sucursal: '',
          departamento: '',
        });
        if (cancel) return;
        setLineasProducto(res.lineasProducto || []);
        setRango(res.rango || { desde: '', hasta: '' });
        let avisos = res.aviso || '';

        const extras = {};
        if (supabase && res.rango?.desde && res.rango?.hasta) {
          const lista = await listarResultadosInventario(supabase, {
            desde: res.rango.desde,
            hasta: res.rango.hasta,
            limit: 500,
          });
          if (cancel) return;
          if (lista.aviso) {
            avisos = avisos ? `${avisos} · ${lista.aviso}` : lista.aviso;
          }
          for (const reg of lista.registros || []) {
            const suc = reg.sucursal_id;
            if (!suc || esSucursalNoVenta(suc)) continue;
            const fal = Number(reg.valor_faltante_neto ?? reg.valor_faltante) || 0;
            if (fal <= 0) continue;
            extras[suc] = Math.max(extras[suc] || 0, fal);
          }
        }
        setExtrasFaltante(extras);
        setAviso(avisos);
      } catch (e) {
        if (!cancel) setAviso(e?.message || String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [supabase, inventario, catalogo, preset, desde, hasta]);

  const paretoTodas = useMemo(
    () => paretoComparativoPorSucursal(lineasProducto, tiendasCatalogo, extrasFaltante),
    [lineasProducto, tiendasCatalogo, extrasFaltante],
  );

  const paretosSucursal = useMemo(
    () => paretoMermaPorDepartamentoPorSucursal(lineasProducto, tiendasCatalogo),
    [lineasProducto, tiendasCatalogo],
  );

  const conFaltante = paretoTodas.filter((p) => p.total > 0).length;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gráficas de inventario</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Compara el faltante entre todas las sucursales y el desglose por departamento en cada tienda
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
          {` · ${paretoTodas.length} tiendas`}
          {conFaltante ? ` · ${conFaltante} con faltante` : ''}
          {aviso ? ` · ${aviso}` : ''}
        </p>
      </div>

      <div className="card" style={{ margin: 0, borderTop: '3px solid var(--brand-blue)' }}>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          Pareto · faltante entre sucursales
        </h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Todas las tiendas operativas. Barras = faltante valorizado del periodo (conteos; si no hay, captura manual del bono).
        </p>
        <ParetoColumnas
          items={paretoTodas}
          mostrarCero
          empty="Sin sucursales en el catálogo."
        />
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          Pareto por sucursal (columnas verticales)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.78rem' }}>
          Una gráfica debajo de otra para cada tienda. Barras = faltante por departamento.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {paretosSucursal.map((g) => (
            <div
              key={g.sucursal}
              className="card"
              style={{ margin: 0, borderTop: '3px solid #8e44ad' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <h5 style={{ margin: 0, color: 'var(--brand-blue)' }}>{g.tienda}</h5>
                <strong style={{ color: g.totalFaltante > 0 ? '#8e44ad' : 'var(--muted, #7f8c8d)' }}>
                  {fmtMxnReporte(g.totalFaltante)}
                </strong>
              </div>
              <ParetoColumnas
                items={g.items}
                empty="Sin faltante por departamento en este periodo."
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
