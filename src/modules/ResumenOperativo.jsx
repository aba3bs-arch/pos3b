import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import {
  cargarResumenOperativo,
  estiloPastel,
  rangoDesdePreset,
  serieBarras,
} from '../lib/resumenOperativoData.js';
import { guardarMetaVentasMes, etiquetaMesClave } from '../lib/metaVentasMes.js';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ borderTop: accent ? `4px solid ${accent}` : undefined }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--brand-blue)', marginTop: '0.35rem' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function BarChart({ items, campo = 'total', labelKey = 'label', colorKey = 'color' }) {
  const barras = serieBarras(items, campo);
  if (!barras.length) return <p className="muted">Sin datos.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {barras.map((b) => (
        <div key={b.id || b.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.15rem' }}>
            <span style={{ fontWeight: 600 }}>{b[labelKey]}</span>
            <span>{fmt(b[campo])}</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ width: `${b.pctBar}%`, height: '100%', background: b[colorKey] || 'var(--brand-blue)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DualBar({ items, campoA, campoB, labelA, labelB, labelKey = 'label' }) {
  if (!items?.length) return <p className="muted">Sin datos.</p>;
  const max = Math.max(...items.map((x) => Math.max(Number(x[campoA]) || 0, Number(x[campoB]) || 0)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand-blue)', borderRadius: 2, marginRight: 4 }} />{labelA}</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--brand-gold)', borderRadius: 2, marginRight: 4 }} />{labelB}</span>
      </div>
      {items.map((row) => (
        <div key={row.id || row[labelKey]}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.2rem' }}>{row[labelKey]}</div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', marginBottom: 2 }}>
            <div style={{ width: `${((Number(row[campoA]) || 0) / max) * 100}%`, height: '100%', background: 'var(--brand-blue)' }} />
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ width: `${((Number(row[campoB]) || 0) / max) * 100}%`, height: '100%', background: 'var(--brand-gold)' }} />
          </div>
          <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.15rem' }}>
            {labelA}: {fmt(row[campoA])} · {labelB}: {fmt(row[campoB])}
            {row.pct != null ? ` · merma ${fmtPct(row.pct)}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ResumenOperativo({ supabase, inventarioCompleto = [] }) {
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [filtroTienda, setFiltroTienda] = useState('');
  const [presetFecha, setPresetFecha] = useState('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [metaInput, setMetaInput] = useState('');
  const [error, setError] = useState('');

  const rango = useMemo(() => {
    if (presetFecha === 'rango') return { desde: desde || null, hasta: hasta || null };
    return rangoDesdePreset(presetFecha);
  }, [presetFecha, desde, hasta]);

  const cargar = useCallback(async () => {
    if (!supabase || !rango?.desde || !rango?.hasta) return;
    setCargando(true);
    setError('');
    const res = await cargarResumenOperativo(supabase, {
      desde: rango.desde,
      hasta: rango.hasta,
      sucursal: filtroTienda || null,
      inventario: inventarioCompleto,
    });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'Error al cargar');
      return;
    }
    setDatos(res);
    setMetaInput(String(res.meta || ''));
  }, [supabase, rango, filtroTienda, inventarioCompleto]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarMeta = () => {
    guardarMetaVentasMes(filtroTienda || '', metaInput);
    cargar();
  };

  const t = datos?.totales || {};
  const proy = datos?.proyeccion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Resumen operativo</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          Vista ejecutiva para administración · {etiquetaMesClave(datos?.mesClave)}
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Filtros</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t} value={t}>{etiquetaTienda(t)}</option>
              ))}
            </select>
          </label>
          <FiltroPeriodo
            labelPeriodo="Periodo"
            preset={presetFecha}
            onPresetChange={setPresetFecha}
            desde={desde}
            hasta={hasta}
            onDesdeChange={setDesde}
            onHastaChange={setHasta}
            className="cal-picker-wrap--inline"
          />
          <button type="button" className="btn btn-primary" disabled={cargando} onClick={cargar}>
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        {datos?.aviso && <p className="muted" style={{ fontSize: '0.78rem', margin: '0.5rem 0 0' }}>{datos.aviso}</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{error}</p>}
        {datos?.errores?.length > 0 && (
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
            Algunos datos no cargaron: {datos.errores.slice(0, 2).join(' · ')}
          </p>
        )}
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Meta del mes</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Meta {filtroTienda ? etiquetaTienda(filtroTienda) : 'cadena'} ($)
            <input className="input" type="number" min="0" step="1000" style={{ display: 'block', marginTop: '0.25rem', minWidth: 140 }} value={metaInput} onChange={(e) => setMetaInput(e.target.value)} />
          </label>
          <button type="button" className="btn btn-gold" onClick={guardarMeta}>Guardar meta</button>
        </div>
        {proy && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem', marginTop: '0.85rem' }}>
            <div><span className="muted" style={{ fontSize: '0.72rem' }}>Acumulado mes</span><div style={{ fontWeight: 700 }}>{fmt(proy.acumulado)}</div></div>
            <div><span className="muted" style={{ fontSize: '0.72rem' }}>Proyección fin de mes</span><div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{fmt(proy.proyeccion)}</div></div>
            <div><span className="muted" style={{ fontSize: '0.72rem' }}>% meta (acumulado)</span><div style={{ fontWeight: 700 }}>{fmtPct(proy.pctMetaAcum)}</div></div>
            <div><span className="muted" style={{ fontSize: '0.72rem' }}>% meta (proyección)</span><div style={{ fontWeight: 700 }}>{fmtPct(proy.pctMetaProy)}</div></div>
            <div><span className="muted" style={{ fontSize: '0.72rem' }}>Día {proy.dia} de {proy.dias}</span><div style={{ fontWeight: 700 }}>{fmt(proy.meta)} meta</div></div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <Kpi label="Ventas del periodo" value={fmt(t.ventasPeriodo)} sub={`Hoy: ${fmt(t.ventasHoy)}`} accent="var(--brand-blue)" />
        <Kpi label="Ticket promedio" value={fmt(datos?.ticketPromedio)} sub={`${datos?.ventasPeriodo?.length || 0} tickets`} />
        <Kpi label="Ganancia neta" value={fmt(t.gananciaNeta)} sub="Ventas − egresos del periodo" accent="#16a34a" />
        <Kpi label="Egresos totales" value={fmt(t.egresos)} sub="Cortes + RT + compras + nómina" accent="var(--brand-red)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem' }}>
        <Kpi label="Gastos cortes" value={fmt(t.gastosCortes)} />
        <Kpi label="Gastos RT" value={fmt(t.gastosRt)} />
        <Kpi label="Pagos proveedores" value={fmt(t.compras)} sub="Compras recibidas" />
        <Kpi label="Nómina" value={fmt(t.nomina)} />
        <Kpi label="Cubre turnos" value={String(t.cubreTurnos || 0)} sub="Sesiones (sin costo automático)" />
        <Kpi label="Incidencias" value={String(datos?.incidenciasResumen?.total || 0)} sub="En el periodo" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Proyección / ventas por tienda</h4>
          <BarChart items={datos?.ventasPorTienda || []} campo="total" />
          {datos?.ventasPorTienda?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: '0.85rem' }}>
              <table className="data" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Efectivo</th>
                    <th style={{ textAlign: 'right' }}>Tarjeta</th>
                    <th style={{ textAlign: 'right' }}>Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.ventasPorTienda.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.total)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.efectivo)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.tarjeta)}</td>
                      <td style={{ textAlign: 'right' }}>{r.tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Composición de egresos</h4>
          {datos?.gastosComparativa?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: 130, height: 130, borderRadius: '50%', flexShrink: 0, ...estiloPastel(datos.gastosComparativa) }} />
              <div style={{ flex: 1, minWidth: 150 }}>
                {datos.gastosComparativa.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0, marginTop: 4 }} />
                    <span style={{ flex: 1 }}>{p.label}</span>
                    <strong>{fmt(p.total)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">Sin egresos en el periodo.</p>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Inventario operativo por tienda</h4>
          <BarChart items={datos?.inventarioPorTienda || []} campo="valorVenta" />
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0.65rem 0 0' }}>Valor a precio de venta en piso de tienda.</p>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Merma vs inventario (costo)</h4>
          <DualBar
            items={datos?.mermaPorTienda || []}
            campoA="inventarioCosto"
            campoB="valor"
            labelA="Inventario costo"
            labelB="Merma periodo"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Gastos RT por tienda</h4>
          <BarChart items={(datos?.gastosRtPorTienda || []).map((g) => ({ ...g, total: g.total }))} campo="total" />
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Incidencias</h4>
          {!datos?.incidenciasResumen?.total ? (
            <p className="muted">Sin incidencias en el periodo.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 0.65rem', fontWeight: 600 }}>{datos.incidenciasResumen.total} reporte(s)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.65rem' }}>
                {datos.incidenciasResumen.porEstado.map((e) => (
                  <span key={e.id} className="badge">{e.label}: {e.count}</span>
                ))}
              </div>
              <BarChart
                items={datos.incidenciasResumen.porTienda.map((x) => ({ ...x, total: x.count, color: 'var(--brand-red)' }))}
                campo="total"
              />
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Ventas del día</h4>
        {!datos?.ventasHoy?.length ? (
          <p className="muted">Sin ventas hoy{filtroTienda ? ` en ${etiquetaTienda(filtroTienda)}` : ''}.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 0.65rem' }}>
              <strong>{fmt(t.ventasHoy)}</strong>
              <span className="muted"> · {datos.ventasHoy.length} ticket(s)</span>
            </p>
            <div className="table-wrap">
              <table className="data" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tienda</th>
                    <th>Pago</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.ventasHoy.slice(0, 20).map((v) => (
                    <tr key={v.id}>
                      <td>{v.created_at ? new Date(v.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{etiquetaTienda(v.sucursal_id)}</td>
                      <td>{v.metodo_pago || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
