import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  ESTADOS,
  cargarConsolidacionComprasInventario,
  columnasCsvConsolidacionCompras,
  fmtMonto,
  tiendasFiltroConsolidacionCompras,
} from '../lib/consolidacionComprasInventario.js';

const COLOR = '#0369a1';

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'tienda', label: 'Por tienda' },
  { id: 'discrepancias', label: 'Discrepancias' },
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

function Kpi({ label, value, accent, sub }) {
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
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent || COLOR, marginTop: '0.2rem' }}>{value}</div>
      {sub ? (
        <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function BadgeEstado({ estado }) {
  const color = COLOR_ESTADO[estado] || '#64748b';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.45rem',
        borderRadius: 4,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: `${color}18`,
        color,
        border: `1px solid ${color}44`,
        whiteSpace: 'nowrap',
      }}
    >
      {ETIQUETA_ESTADO[estado] || estado}
    </span>
  );
}

function TablaFilas({ filas, vacio = 'Sin datos en el periodo.' }) {
  if (!filas.length) return <p className="muted">{vacio}</p>;
  return (
    <div className="table-wrap table-wrap-sticky-head">
      <table className="data" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tienda</th>
            <th>Tipo</th>
            <th>Folio</th>
            <th>Proveedor</th>
            <th style={{ textAlign: 'right' }}>Ticket</th>
            <th style={{ textAlign: 'right' }}>Inventario</th>
            <th style={{ textAlign: 'right' }}>Gasto</th>
            <th>Estado</th>
            <th>Faltantes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {f.fecha_ymd || '—'}
              </td>
              <td>{f.tienda}</td>
              <td className="muted">{f.tipo}</td>
              <td>
                <code style={{ fontSize: '0.75rem' }}>{f.folio || '—'}</code>
              </td>
              <td className="muted">{f.proveedor || '—'}</td>
              <td style={{ textAlign: 'right' }}>{fmtMonto(f.monto_ticket)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMonto(f.monto_inventario)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMonto(f.monto_gasto)}</td>
              <td>
                <BadgeEstado estado={f.estado} />
              </td>
              <td className="muted" style={{ maxWidth: 220 }}>
                {(f.productos_faltantes || []).length
                  ? (f.productos_faltantes || [])
                      .slice(0, 3)
                      .map((p) => `${p.nombre} (−${p.qty_faltante})`)
                      .join(', ') + ((f.productos_faltantes || []).length > 3 ? '…' : '')
                  : f.n_gastos > 1
                    ? `${f.n_gastos} gastos`
                    : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelTienda({ grupo }) {
  const disc = (grupo.filas || []).filter((f) => f.estado !== ESTADOS.OK);
  return (
    <div className="card" style={{ padding: '0.85rem', borderTop: `3px solid ${grupo.n_discrepancias ? '#b91c1c' : COLOR}` }}>
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
          <strong style={{ color: COLOR }}>{grupo.label}</strong>
          <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>
            {grupo.n_eventos} evento(s) · {grupo.n_ok} OK · {grupo.n_discrepancias} discrepancia(s)
          </span>
        </div>
        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
          Ticket {fmtMonto(grupo.monto_ticket)} · Inv {fmtMonto(grupo.monto_inventario)} · Gasto {fmtMonto(grupo.monto_gasto)}
        </span>
      </div>
      {grupo.n_productos_faltantes > 0 ? (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: COLOR_ESTADO[ESTADOS.PRODUCTOS_FALTANTES] }}>
          {grupo.n_productos_faltantes} producto(s) del ticket no ingresados (o con menor cantidad).
        </p>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.65rem' }}>
        {Object.entries(grupo.por_estado || {})
          .filter(([, n]) => n > 0)
          .map(([est, n]) => (
            <span key={est} className="muted" style={{ fontSize: '0.75rem' }}>
              <BadgeEstado estado={est} /> ×{n}
            </span>
          ))}
      </div>
      <TablaFilas filas={disc.length ? disc : grupo.filas} vacio="Sin eventos en esta tienda." />
    </div>
  );
}

export default function PanelConsolidacionComprasInventario({ supabase }) {
  const tiendas = useMemo(() => tiendasFiltroConsolidacionCompras(), []);
  const [preset, setPreset] = useState('7d');
  const [desde, setDesde] = useState(() => rangoDesdePreset('7d').desde);
  const [hasta, setHasta] = useState(() => rangoDesdePreset('7d').hasta);
  const [tienda, setTienda] = useState('');
  const [vista, setVista] = useState('resumen');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [meta, setMeta] = useState(null);

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
    const res = await cargarConsolidacionComprasInventario(supabase, {
      desde,
      hasta,
      sucursal: tienda,
    });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setFilas(res.filas || []);
    setResumen(res.resumen || null);
    setMeta(res.meta || null);
  }, [supabase, desde, hasta, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filasVista = useMemo(() => {
    let list = filas;
    if (vista === 'discrepancias') list = list.filter((f) => f.estado !== ESTADOS.OK);
    if (filtroEstado) list = list.filter((f) => f.estado === filtroEstado);
    return list;
  }, [filas, vista, filtroEstado]);

  const exportar = () => {
    if (!filas.length) return alert('No hay datos para exportar.');
    const csv = toCsv(filas, columnasCsvConsolidacionCompras());
    downloadCsv(`compras-vs-inventario-${desde}_${hasta}.csv`, csv);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
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

          <label className="muted" style={{ display: 'block', minWidth: 160 }}>
            Estado
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Todos</option>
              {Object.values(ESTADOS).map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
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
          Cruza <strong>compras/tickets</strong> (CMP), <strong>ingresos de inventario</strong> (ING) y{' '}
          <strong>traspasos</strong> (trp) con los <strong>gastos PROVEEDORES</strong> del corte Abarrotes. Sirve para ver
          mercancía no ingresada, gastos faltantes o duplicados, y montos que no cuadran.
        </p>
        {meta ? (
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
            Fuente: {meta.n_compras} compra(s) · {meta.n_movimientos} mov. inventario · {meta.n_traspasos} traspaso(s) ·{' '}
            {meta.n_gastos} gasto(s)
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <p style={{ margin: 0, color: '#b91c1c' }}>{error}</p>
        </div>
      ) : null}
      {aviso ? (
        <div className="card" style={{ borderColor: 'rgba(180,83,9,0.35)', background: '#fffbeb' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.85rem' }}>{aviso}</p>
        </div>
      ) : null}

      {resumen ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '0.65rem',
          }}
        >
          <Kpi label="Eventos" value={resumen.n_eventos} accent={COLOR} />
          <Kpi label="Cuadrados" value={resumen.n_ok} accent={COLOR_ESTADO[ESTADOS.OK]} />
          <Kpi
            label="Discrepancias"
            value={resumen.n_discrepancias}
            accent={resumen.n_discrepancias ? COLOR_ESTADO[ESTADOS.GASTO_DUPLICADO] : COLOR_ESTADO[ESTADOS.OK]}
          />
          <Kpi label="Ticket" value={fmtMonto(resumen.monto_ticket)} accent="#0f766e" />
          <Kpi label="Inventario $" value={fmtMonto(resumen.monto_inventario)} accent="#0369a1" />
          <Kpi
            label="Gasto"
            value={fmtMonto(resumen.monto_gasto)}
            accent="#7c3aed"
            sub={
              Math.abs(resumen.diferencia_ticket_gasto) > 0.5
                ? `Δ ticket−gasto ${fmtMonto(resumen.diferencia_ticket_gasto)}`
                : 'Cuadra vs ticket'
            }
          />
          <Kpi
            label="Prod. faltantes"
            value={resumen.n_productos_faltantes}
            accent={
              resumen.n_productos_faltantes
                ? COLOR_ESTADO[ESTADOS.PRODUCTOS_FALTANTES]
                : COLOR_ESTADO[ESTADOS.OK]
            }
          />
        </div>
      ) : null}

      {resumen && resumen.n_discrepancias > 0 ? (
        <div className="card" style={{ padding: '0.75rem 0.9rem' }}>
          <strong style={{ color: COLOR }}>Panorama de discrepancias</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '0.55rem' }}>
            {Object.entries(resumen.por_estado || {})
              .filter(([est, n]) => est !== ESTADOS.OK && n > 0)
              .map(([est, n]) => (
                <button
                  key={est}
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderColor: COLOR_ESTADO[est],
                    color: COLOR_ESTADO[est],
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                  onClick={() => {
                    setVista('discrepancias');
                    setFiltroEstado(est);
                  }}
                >
                  {ETIQUETA_ESTADO[est]}: {n}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={vista === v.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
            onClick={() => setVista(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vista === 'resumen' && resumen ? (
        <div className="card" style={{ padding: '0.9rem' }}>
          <p style={{ margin: '0 0 0.65rem' }}>
            En el periodo hay <strong>{resumen.n_eventos}</strong> eventos de compra/ingreso/traspaso/gasto.
            {resumen.n_discrepancias === 0 ? (
              <> Todo cuadra: tickets, inventario y gastos alineados.</>
            ) : (
              <>
                {' '}
                Hay <strong style={{ color: '#b91c1c' }}>{resumen.n_discrepancias}</strong> con discrepancia
                {resumen.n_productos_faltantes
                  ? ` (${resumen.n_productos_faltantes} productos del ticket sin ingreso completo)`
                  : ''}
                .
              </>
            )}
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
            <li>
              Sin gasto: <strong>{resumen.por_estado[ESTADOS.SIN_GASTO] || 0}</strong> — mercancía ingresada sin gasto
              capturado en corte.
            </li>
            <li>
              Gasto duplicado: <strong>{resumen.por_estado[ESTADOS.GASTO_DUPLICADO] || 0}</strong> — más de un gasto ligado
              al mismo folio.
            </li>
            <li>
              Gasto sin ingreso: <strong>{resumen.por_estado[ESTADOS.GASTO_SIN_INGRESO] || 0}</strong> — gasto sin ticket /
              inventario / traspaso.
            </li>
            <li>
              Sin inventario / productos faltantes:{' '}
              <strong>
                {(resumen.por_estado[ESTADOS.SIN_INVENTARIO] || 0) +
                  (resumen.por_estado[ESTADOS.PRODUCTOS_FALTANTES] || 0)}
              </strong>
              .
            </li>
            <li>
              Monto descuadrado: <strong>{resumen.por_estado[ESTADOS.MONTO_DESCUADRADO] || 0}</strong>.
            </li>
          </ul>
          {(resumen.por_tienda || []).length ? (
            <div style={{ marginTop: '0.85rem' }}>
              <strong className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase' }}>
                Por tienda (alerta primero)
              </strong>
              <div className="table-wrap" style={{ marginTop: '0.4rem' }}>
                <table className="data" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Tienda</th>
                      <th style={{ textAlign: 'right' }}>Eventos</th>
                      <th style={{ textAlign: 'right' }}>OK</th>
                      <th style={{ textAlign: 'right' }}>Disc.</th>
                      <th style={{ textAlign: 'right' }}>Ticket</th>
                      <th style={{ textAlign: 'right' }}>Gasto</th>
                      <th style={{ textAlign: 'right' }}>Faltantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.por_tienda.map((t) => (
                      <tr key={t.id}>
                        <td>{t.label}</td>
                        <td style={{ textAlign: 'right' }}>{t.n_eventos}</td>
                        <td style={{ textAlign: 'right', color: COLOR_ESTADO[ESTADOS.OK] }}>{t.n_ok}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: t.n_discrepancias ? '#b91c1c' : undefined,
                          }}
                        >
                          {t.n_discrepancias}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtMonto(t.monto_ticket)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMonto(t.monto_gasto)}</td>
                        <td style={{ textAlign: 'right' }}>{t.n_productos_faltantes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {vista === 'tienda' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {(resumen?.por_tienda || []).length ? (
            resumen.por_tienda.map((g) => <PanelTienda key={g.id} grupo={g} />)
          ) : (
            <p className="muted">Sin datos por tienda.</p>
          )}
        </div>
      ) : null}

      {(vista === 'discrepancias' || vista === 'detalle') && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <TablaFilas
            filas={filasVista}
            vacio={vista === 'discrepancias' ? 'Sin discrepancias en el periodo.' : 'Sin eventos en el periodo.'}
          />
        </div>
      )}
    </div>
  );
}
