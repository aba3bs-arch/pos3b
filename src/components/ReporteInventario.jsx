import React, { useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import { imprimirReporte } from '../lib/impresion.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  PRESETS_REPORTE_INVENTARIO,
  cargarFilasReporteInventario,
  columnasCsvInventario,
  fmtMxnReporte,
  fmtPctReporte,
  paretoMermaPorSemana,
  tiendasParaFiltroInventario,
  totalesReporteInventario,
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

function maxMerma(serie) {
  return Math.max(1, ...serie.map((x) => Number(x.merma) || 0));
}

/**
 * Reporte de conteos/ajustes de inventario: tabla + Pareto semanal de merma.
 */
export default function ReporteInventario({ sucursal }) {
  const [abierto, setAbierto] = useState(false);
  const [preset, setPreset] = useState('mes');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [tienda, setTienda] = useState('');

  const tiendas = useMemo(() => tiendasParaFiltroInventario(sucursal), [sucursal, abierto]);

  const { filas, rango } = useMemo(
    () =>
      cargarFilasReporteInventario({
        preset,
        desde,
        hasta,
        sucursal: tienda,
      }),
    [preset, desde, hasta, tienda, abierto],
  );

  const totales = useMemo(() => totalesReporteInventario(filas), [filas]);
  const { pareto, cronologico } = useMemo(() => paretoMermaPorSemana(filas), [filas]);
  const tope = maxMerma(cronologico);

  const exportCsv = () => {
    downloadCsv(
      `reporte_inventario_${rango.desde}_${rango.hasta}.csv`,
      toCsv(filas, columnasCsvInventario()),
    );
  };

  const imprimir = async () => {
    await imprimirReporte({
      sucursal: tienda || sucursal,
      titulo: 'REPORTE DE INVENTARIO',
      rango: `${rango.desde} — ${rango.hasta}`,
      secciones: [
        {
          titulo: 'Resumen',
          lineas: [
            `Conteos: ${totales.conteos}`,
            `Inventario operativo: ${fmtMxnReporte(totales.inventarioOperativo)}`,
            `Merma: ${fmtMxnReporte(totales.merma)}`,
            `% merma: ${fmtPctReporte(totales.pctMerma)}`,
          ],
        },
      ],
      tabla: {
        cols: [
          { label: 'Tienda', key: 'tienda' },
          { label: 'Fecha', key: 'fecha' },
          { label: 'Hora', key: 'hora' },
          { label: 'Auditor', key: 'auditor' },
          {
            label: 'Inv. operativo',
            key: 'inventarioOperativo',
            align: 'right',
            fmt: (r) => fmtMxnReporte(r.inventarioOperativo),
          },
          { label: 'Merma', key: 'merma', align: 'right', fmt: (r) => fmtMxnReporte(r.merma) },
          { label: '% merma', key: 'pctMerma', align: 'right', fmt: (r) => fmtPctReporte(r.pctMerma) },
        ],
        rows: filas,
      },
    });
  };

  if (!abierto) {
    return (
      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Inventario (auditoría)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Conteos aplicados por tienda: merma, inventario operativo y comportamiento semanal.
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
            Datos de conteos aplicados en este equipo. Merma = faltante valorizado a costo.
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <button type="button" className="btn btn-gold" onClick={exportCsv} disabled={!filas.length}>
            <BtnLabel icon="download">CSV</BtnLabel>
          </button>
          <button type="button" className="btn btn-ghost" onClick={imprimir} disabled={!filas.length}>
            <BtnLabel icon="print">Imprimir</BtnLabel>
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {[
          { label: 'Conteos', value: String(totales.conteos) },
          { label: 'Inv. operativo', value: fmtMxnReporte(totales.inventarioOperativo) },
          { label: 'Merma', value: fmtMxnReporte(totales.merma) },
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
            <strong style={{ fontSize: '1.05rem', color: 'var(--brand-blue)' }}>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gap: '1rem' }}>
        <div>
          <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>Pareto de merma por semana</h4>
          {pareto.length === 0 ? (
            <p className="muted">Sin merma en el periodo.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {pareto.map((p) => (
                <div key={p.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span>
                      {fmtMxnReporte(p.merma)}{' '}
                      <span className="muted">
                        ({p.pct.toFixed(1)}% · acum {p.acumPct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>Comportamiento semanal (merma)</h4>
          {cronologico.length === 0 ? (
            <p className="muted">Sin datos.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.35rem', minHeight: 140, paddingTop: '0.5rem' }}>
              {cronologico.map((s) => {
                const h = Math.max(4, Math.round((s.merma / tope) * 120));
                return (
                  <div key={s.key} style={{ flex: 1, minWidth: 28, textAlign: 'center' }} title={`${s.label}: ${fmtMxnReporte(s.merma)}`}>
                    <div
                      style={{
                        height: h,
                        borderRadius: '6px 6px 2px 2px',
                        background: 'var(--brand-blue)',
                        opacity: 0.85,
                        margin: '0 auto',
                        maxWidth: 36,
                      }}
                    />
                    <div className="muted" style={{ fontSize: '0.65rem', marginTop: 4, lineHeight: 1.2 }}>
                      {s.label.replace(/^Sem /, '')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!filas.length ? (
        <p className="muted">
          No hay conteos aplicados en este periodo. Se generan al <strong>Aplicar ajuste</strong> en conteo por departamento o ajuste libre.
        </p>
      ) : (
        <div className="table-wrap table-wrap-sticky-head">
          <table className="data" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Auditor</th>
                <th>Depto.</th>
                <th style={{ textAlign: 'right' }}>Inv. operativo</th>
                <th style={{ textAlign: 'right' }}>Merma</th>
                <th style={{ textAlign: 'right' }}>% merma</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{f.tienda}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {f.fecha}
                  </td>
                  <td className="muted">{f.hora}</td>
                  <td>{f.auditor}</td>
                  <td className="muted">{f.departamento}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMxnReporte(f.inventarioOperativo)}</td>
                  <td style={{ textAlign: 'right', color: f.merma > 0 ? 'var(--brand-red, #c0392b)' : undefined }}>
                    {fmtMxnReporte(f.merma)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtPctReporte(f.pctMerma)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
