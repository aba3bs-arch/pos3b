import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import { imprimirReporte } from '../lib/impresion.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  PRESETS_REPORTE_INVENTARIO,
  cargarFilasReporteInventarioAsync,
  columnasCsvInventario,
  columnasImprimirProductoInventario,
  fmtMxnReporte,
  fmtPctReporte,
  tiendasParaFiltroInventario,
  totalesLineasProducto,
} from '../lib/reporteInventario.js';

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => esc(c.value(row))).join(','));
  return [header, ...lines].join('\n');
}

function downloadCsv(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDiferencia(n) {
  const d = Number(n);
  if (!Number.isFinite(d)) return '—';
  if (d === 0) return '0';
  return d > 0 ? `+${d}` : String(d);
}

/**
 * Reporte de conteos aplicados: detalle por artículo con teórico, contado, diferencia y % merma.
 */
export default function ReporteInventario({ supabase, inventario, sucursal, sucursalesLista }) {
  const [abierto, setAbierto] = useState(false);
  const [preset, setPreset] = useState('mes');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [tienda, setTienda] = useState('');
  const [filtroDif, setFiltroDif] = useState('todos');
  const [lineasProducto, setLineasProducto] = useState([]);
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);

  const tiendas = useMemo(() => {
    const base = tiendasParaFiltroInventario(sucursal, sucursalesLista);
    const set = new Set(base);
    for (const f of lineasProducto) {
      if (f.sucursal && f.sucursal !== '—') set.add(f.sucursal);
    }
    return [...set].sort((a, b) => {
      if (a === 'MAIN') return 1;
      if (b === 'MAIN') return -1;
      return a.localeCompare(b, 'es', { numeric: true });
    });
  }, [sucursal, sucursalesLista, lineasProducto]);

  useEffect(() => {
    if (!abierto) return undefined;
    let cancel = false;
    setLoading(true);
    cargarFilasReporteInventarioAsync({
      supabase,
      inventario,
      preset,
      desde,
      hasta,
      sucursal: tienda,
    })
      .then((r) => {
        if (cancel) return;
        setLineasProducto(r.lineasProducto || []);
        setRango(r.rango || { desde: '', hasta: '' });
        setAviso(r.aviso || '');
      })
      .catch((e) => {
        if (cancel) return;
        setLineasProducto([]);
        setAviso(e?.message || String(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [abierto, supabase, inventario, preset, desde, hasta, tienda]);

  const lineasVisibles = useMemo(() => {
    if (filtroDif === 'negativos') {
      return lineasProducto.filter((l) => Number(l.diferencia) < 0);
    }
    if (filtroDif === 'positivos') {
      return lineasProducto.filter((l) => Number(l.diferencia) > 0);
    }
    return lineasProducto;
  }, [lineasProducto, filtroDif]);

  const totales = useMemo(() => totalesLineasProducto(lineasVisibles), [lineasVisibles]);

  const exportCsv = () => {
    downloadCsv(
      `reporte_inventario_${rango.desde}_${rango.hasta}.csv`,
      toCsv(lineasVisibles, columnasCsvInventario()),
    );
  };

  const imprimirLineas = async (rows, subtitulo) => {
    await imprimirReporte({
      sucursal: tienda || sucursal,
      titulo: 'REPORTE DE INVENTARIO',
      rango: `${rango.desde} — ${rango.hasta}${subtitulo ? ` · ${subtitulo}` : ''}`,
      secciones: [
        {
          titulo: 'Resumen',
          lineas: [
            `Artículos con diferencia: ${totalesLineasProducto(rows).articulos}`,
            `Faltante (negativo): ${fmtMxnReporte(totalesLineasProducto(rows).valorFaltante)}`,
            `Sobrante (positivo): ${fmtMxnReporte(totalesLineasProducto(rows).valorSobrante)}`,
            `% merma (sobre inv. teórico): ${fmtPctReporte(totalesLineasProducto(rows).pctMerma)}`,
          ],
        },
      ],
      tabla: {
        cols: columnasImprimirProductoInventario(),
        rows,
      },
    });
  };

  const imprimirNegativos = () =>
    imprimirLineas(
      lineasProducto.filter((l) => Number(l.diferencia) < 0),
      'Solo diferencias negativas',
    );

  const imprimirPositivos = () =>
    imprimirLineas(
      lineasProducto.filter((l) => Number(l.diferencia) > 0),
      'Solo diferencias positivas',
    );

  const imprimirTodos = () => imprimirLineas(lineasVisibles, null);

  if (!abierto) {
    return (
      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Inventario (auditoría)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Detalle por artículo de conteos aplicados: inv. teórico, contado, diferencia y % merma. Imprimible por
          negativos o positivos.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setAbierto(true)}>
          <BtnLabel icon="chart">Reporte de inventario</BtnLabel>
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Reporte de inventario</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Artículos con diferencia en conteos aplicados (ajuste libre / por departamento). Valores a precio de venta.
            {loading ? ' Cargando…' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAbierto(false)}>
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
        <label className="muted" style={{ display: 'block', flex: '1 1 160px', minWidth: 140 }}>
          Tienda
          <select className="select" style={{ marginTop: '0.35rem' }} value={tienda} onChange={(e) => setTienda(e.target.value)}>
            <option value="">Todas</option>
            {tiendas.map((s) => (
              <option key={s} value={s}>
                {etiquetaTienda(s)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.8rem', width: '100%' }}>
            Ver diferencias
          </span>
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'negativos', label: 'Solo negativas' },
            { id: 'positivos', label: 'Solo positivas' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={filtroDif === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
              onClick={() => setFiltroDif(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <button type="button" className="btn btn-gold" onClick={exportCsv} disabled={!lineasVisibles.length || loading}>
          <BtnLabel icon="download">CSV</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirNegativos} disabled={!totales.negativos || loading}>
          <BtnLabel icon="print">Imprimir negativos</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirPositivos} disabled={!totales.positivos || loading}>
          <BtnLabel icon="print">Imprimir positivos</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirTodos} disabled={!lineasVisibles.length || loading}>
          <BtnLabel icon="print">Imprimir vista actual</BtnLabel>
        </button>
      </div>

      {aviso ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--brand-red, #b45309)' }}>
          {aviso}
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {[
          { label: 'Artículos', value: String(totales.articulos) },
          { label: 'Inv. teórico', value: fmtMxnReporte(totales.valorTeorico) },
          { label: 'Faltante', value: fmtMxnReporte(totales.valorFaltante), color: 'var(--brand-red, #c0392b)' },
          { label: 'Sobrante', value: fmtMxnReporte(totales.valorSobrante), color: 'var(--brand-gold-dark)' },
          { label: '% merma', value: fmtPctReporte(totales.pctMerma) },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border, rgba(0,0,0,0.08))',
            }}
          >
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {k.label}
            </div>
            <strong style={{ fontSize: '1.05rem', color: k.color || 'var(--brand-blue)' }}>{k.value}</strong>
          </div>
        ))}
      </div>

      {!lineasVisibles.length && !loading ? (
        <p className="muted">
          No hay artículos con diferencia en este periodo. Se generan al <strong>Aplicar ajuste</strong> en conteo por
          departamento o ajuste libre.
        </p>
      ) : (
        <div className="table-wrap table-wrap-sticky-head">
          <table className="data" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th style={{ textAlign: 'right' }}>Inv. teórico</th>
                <th style={{ textAlign: 'right' }}>Contado</th>
                <th style={{ textAlign: 'right' }}>Diferencia</th>
                <th style={{ textAlign: 'right' }}>% merma</th>
                {!tienda ? (
                  <>
                    <th>Tienda</th>
                    <th>Folio</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lineasVisibles.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}>{f.codigo}</td>
                  <td>{f.nombre}</td>
                  <td style={{ textAlign: 'right' }}>{f.teorico}</td>
                  <td style={{ textAlign: 'right' }}>{f.contado ?? '—'}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 600,
                      color:
                        Number(f.diferencia) < 0
                          ? 'var(--brand-red, #c0392b)'
                          : Number(f.diferencia) > 0
                            ? 'var(--brand-gold-dark)'
                            : undefined,
                    }}
                  >
                    {fmtDiferencia(f.diferencia)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {Number(f.diferencia) < 0 ? fmtPctReporte(f.pctMerma) : '—'}
                  </td>
                  {!tienda ? (
                    <>
                      <td className="muted">{f.tienda}</td>
                      <td className="muted" style={{ fontSize: '0.75rem' }}>
                        {f.folio}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
