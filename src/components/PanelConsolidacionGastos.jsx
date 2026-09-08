import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import {
  AREAS_CONSOLIDACION,
  ETIQUETA_AREA_CONSOLIDACION,
  cargarConsolidacionGastosTurno,
  agruparPorTurnoConsolidacion,
  agruparPorCierre,
  agruparPorTiendaConsolidacion,
  totalMontoFilas,
  fmtMonto,
  tiendasFiltroConsolidacion,
  columnasCsvConsolidacion,
} from '../lib/consolidacionGastosTurno.js';

const COLOR = '#0f766e';
const COLOR_AREA = {
  virtual: '#8e44ad',
  abarrotes: '#b5a642',
  garage: '#7f8c8d',
};

const VISTAS = [
  { id: 'turno', label: 'Por turno' },
  { id: 'cierre', label: 'Por cierre' },
  { id: 'tienda', label: 'Por tienda' },
  { id: 'detalle', label: 'Detalle' },
];

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

function Kpi({ label, value, accent }) {
  return (
    <div
      className="card"
      style={{
        padding: '0.75rem 0.85rem',
        borderTop: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent || 'var(--brand-blue)', marginTop: '0.2rem' }}>
        {value}
      </div>
    </div>
  );
}

function TablaDetalle({ filas }) {
  if (!filas.length) return <p className="muted">Sin gastos en el periodo para esta área.</p>;
  return (
    <div className="table-wrap table-wrap-sticky-head">
      <table className="data" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tienda</th>
            <th>Turno</th>
            <th>Folio</th>
            <th>Empleado</th>
            <th>Concepto</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {f.fecha_negocio || f.fecha_corta}
              </td>
              <td>{f.tienda}</td>
              <td>{f.turno_label}</td>
              <td className="muted">{f.folio}</td>
              <td>{f.empleado}</td>
              <td className="muted">{f.concepto}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMonto(f.monto)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>
              Total ({filas.length} gastos)
            </td>
            <td style={{ textAlign: 'right', fontWeight: 800, color: COLOR }}>{fmtMonto(totalMontoFilas(filas))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CardsGrupos({ grupos, tituloGrupo }) {
  if (!grupos.length) return <p className="muted">Sin gastos en el periodo para esta área.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {grupos.map((g) => (
        <div key={g.id} className="card" style={{ padding: '0.85rem', borderTop: `3px solid ${COLOR}` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.55rem',
            }}
          >
            <div>
              <strong style={{ color: COLOR }}>
                {tituloGrupo}: {g.label || g.folio}
              </strong>
              {g.tienda ? (
                <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>
                  {g.tienda}
                  {g.fecha_negocio ? ` · ${g.fecha_negocio}` : ''}
                  {g.turno_raw && g.turno_raw !== '—' ? ` · ${g.turno_raw}` : ''}
                </span>
              ) : null}
              {g.n_cierres != null ? (
                <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                  {g.n_cierres} cierre(s) · {g.n_tiendas} tienda(s)
                </span>
              ) : null}
            </div>
            <span style={{ fontWeight: 800 }}>
              {g.filas.length} gastos · {fmtMonto(g.total)}
            </span>
          </div>
          <div className="table-wrap">
            <table className="data" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="muted">{f.fecha_negocio || f.fecha_corta}</td>
                    <td>{f.empleado}</td>
                    <td className="muted">{f.concepto}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PanelConsolidacionGastos({ supabase }) {
  const tiendas = useMemo(() => tiendasFiltroConsolidacion(), []);
  const [area, setArea] = useState('virtual');
  const [preset, setPreset] = useState('7d');
  const [desde, setDesde] = useState(() => rangoDesdePreset('7d').desde);
  const [hasta, setHasta] = useState(() => rangoDesdePreset('7d').hasta);
  const [tienda, setTienda] = useState('');
  const [vista, setVista] = useState('turno');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filas, setFilas] = useState([]);
  const [nCierres, setNCierres] = useState(0);

  const aplicarPreset = (id) => {
    setPreset(id);
    if (id === 'rango') return;
    const r = rangoDesdePreset(id);
    if (r?.desde && r?.hasta) {
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  };

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    setAviso('');
    const res = await cargarConsolidacionGastosTurno(supabase, {
      area,
      desde,
      hasta,
      sucursal: tienda,
    });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setFilas(res.filas || []);
    setNCierres((res.cierres || []).length);
  }, [supabase, area, desde, hasta, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const total = useMemo(() => totalMontoFilas(filas), [filas]);
  const porTurno = useMemo(() => agruparPorTurnoConsolidacion(filas), [filas]);
  const porCierre = useMemo(() => agruparPorCierre(filas), [filas]);
  const porTienda = useMemo(() => agruparPorTiendaConsolidacion(filas), [filas]);
  const accent = COLOR_AREA[area] || COLOR;

  const exportar = () => {
    if (!filas.length) return alert('No hay datos para exportar.');
    const csv = toCsv(filas, columnasCsvConsolidacion());
    downloadCsv(`consolidacion-gastos-${area}-${desde}_${hasta}.csv`, csv);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ display: 'block', minWidth: 160 }}>
            Área (independiente)
            <select
              className="select"
              style={{ marginTop: '0.35rem', fontWeight: 700, borderColor: accent }}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              {AREAS_CONSOLIDACION.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_AREA_CONSOLIDACION[a] || a}
                </option>
              ))}
            </select>
          </label>

          <FiltroPeriodo
            preset={preset}
            onPresetChange={aplicarPreset}
            desde={desde}
            hasta={hasta}
            onDesdeChange={(v) => {
              setPreset('rango');
              setDesde(v);
            }}
            onHastaChange={(v) => {
              setPreset('rango');
              setHasta(v);
            }}
            presets={PRESETS_FECHA_PRODUCTO}
          />

          <label className="muted" style={{ display: 'block', minWidth: 160 }}>
            Tienda
            <select className="select" style={{ marginTop: '0.35rem' }} value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t.id || 'all'} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-primary" onClick={cargar} disabled={cargando}>
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportar} disabled={!filas.length}>
            Exportar CSV
          </button>
        </div>
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem' }}>
          Consolidás solo el área seleccionada (<strong>{ETIQUETA_AREA_CONSOLIDACION[area]}</strong>). Virtual, Garage y
          Abarrotes no se mezclan. Los montos salen de los <strong>cierres de turno</strong> (gastos del corte).
        </p>
      </div>

      {error ? (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <strong style={{ color: 'var(--brand-red)' }}>{error}</strong>
        </div>
      ) : null}
      {aviso ? <p className="muted">{aviso}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <Kpi label="Área" value={ETIQUETA_AREA_CONSOLIDACION[area]} accent={accent} />
        <Kpi label="Total gastos" value={fmtMonto(total)} accent={COLOR} />
        <Kpi label="Gastos" value={String(filas.length)} />
        <Kpi label="Cierres en periodo" value={String(nCierres)} />
        <Kpi label="Turno diurno" value={fmtMonto(porTurno.find((t) => t.id === 'Diurno')?.total || 0)} />
        <Kpi label="Turno nocturno" value={fmtMonto(porTurno.find((t) => t.id === 'Nocturno')?.total || 0)} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={vista === v.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: '0.82rem' }}
            onClick={() => setVista(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vista === 'turno' ? <CardsGrupos grupos={porTurno} tituloGrupo="Turno" /> : null}
      {vista === 'cierre' ? <CardsGrupos grupos={porCierre} tituloGrupo="Cierre" /> : null}
      {vista === 'tienda' ? <CardsGrupos grupos={porTienda} tituloGrupo="Tienda" /> : null}
      {vista === 'detalle' ? (
        <div className="card" style={{ padding: '0.85rem' }}>
          <TablaDetalle filas={filas} />
        </div>
      ) : null}
    </div>
  );
}
