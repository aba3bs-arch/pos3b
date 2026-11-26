import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import {
  FECHA_INICIO_ESTADISTICAS,
  hoyYmdEstadisticas,
  rangoDesdePreset,
} from '../lib/estadisticasData.js';
import {
  COLOR_DIAGNOSTICO,
  cargarReporteDeptoAbarrotes,
  descargarCsvReporteDepto,
} from '../lib/reporteDeptoAbarrotes.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtN(n, d = 0) {
  return (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: d });
}

function fmtCob(n) {
  if (n == null) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

function Kpi({ title, value, sub, accent }) {
  return (
    <div className="card" style={{ margin: 0, borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <h4 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)', fontSize: '0.88rem' }}>{title}</h4>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-gold-dark)' }}>{value}</div>
      {sub ? <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>{sub}</p> : null}
    </div>
  );
}

function ParetoBarras({ items, empty = 'Sin datos', onSelect, selectedId, hint, valueFmt = fmt }) {
  if (!items?.length) return <p className="muted">{empty}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {hint ? <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.75rem' }}>{hint}</p> : null}
      {items.map((p) => {
        const activo = selectedId != null && String(selectedId) === String(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={onSelect ? () => onSelect(activo ? null : p.id) : undefined}
            disabled={!onSelect}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: activo ? '1px solid var(--brand-blue)' : '1px solid transparent',
              borderRadius: 8,
              padding: '0.35rem 0.4rem',
              background: activo ? 'rgba(59,105,181,0.08)' : 'transparent',
              cursor: onSelect ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.15rem', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ textAlign: 'right' }}>
                {valueFmt(p.total)}{' '}
                <span className="muted">({p.pct.toFixed(1)}% · acum {p.acumPct.toFixed(0)}%)</span>
              </span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', background: p.color || 'var(--brand-gold)' }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BarrasCompraVenta({ items, empty = 'Sin datos' }) {
  const vis = (items || []).filter((w) => (w.ventasAbarrotes || w.comprasAbarrotes || w.ventas || w.compras) > 0
    || w.ticketsPOS > 0);
  if (!vis.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...vis.map((w) => Math.max(
    Number(w.ventasAbarrotes ?? w.ventas) || 0,
    Number(w.comprasAbarrotes ?? w.compras) || 0,
  )), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.75rem' }} className="muted">
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#b5a642', borderRadius: 2, marginRight: 4 }} />Ventas depto</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2980b9', borderRadius: 2, marginRight: 4 }} />Compras depto</span>
      </div>
      {vis.map((w) => {
        const v = Number(w.ventasAbarrotes ?? w.ventas) || 0;
        const c = Number(w.comprasAbarrotes ?? w.compras) || 0;
        return (
          <div key={w.semana || w.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.12rem' }}>
              <span style={{ fontWeight: 600 }}>{w.label}</span>
              <span className="muted">{fmt(v)} vs {fmt(c)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: '#b5a642' }} />
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ width: `${(c / max) * 100}%`, height: '100%', background: '#2980b9' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tablero del departamento ABARROTES (catálogo) por tienda:
 * ventas vs compras, Pareto y si se ha estado surtiendo.
 */
export default function ReporteDeptoAbarrotes({ supabase, inventario = [] }) {
  const [presetFecha, setPresetFecha] = useState('operativo');
  const [desde, setDesde] = useState(FECHA_INICIO_ESTADISTICAS);
  const [hasta, setHasta] = useState(hoyYmdEstadisticas());
  const [tienda, setTienda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [pack, setPack] = useState(null);
  const [error, setError] = useState('');
  const inventarioRef = useRef(inventario);
  inventarioRef.current = inventario;

  const rango = useMemo(() => {
    if (presetFecha === 'rango') {
      return { desde: desde || FECHA_INICIO_ESTADISTICAS, hasta: hasta || hoyYmdEstadisticas() };
    }
    if (presetFecha === 'operativo') {
      return { desde: FECHA_INICIO_ESTADISTICAS, hasta: hoyYmdEstadisticas() };
    }
    return rangoDesdePreset(presetFecha) || { desde: FECHA_INICIO_ESTADISTICAS, hasta: hoyYmdEstadisticas() };
  }, [presetFecha, desde, hasta]);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (!supabase || !rango?.desde || !rango?.hasta) return;
      setCargando(true);
      setError('');
      setProgreso('Iniciando…');
      const res = await cargarReporteDeptoAbarrotes(supabase, {
        desde: rango.desde,
        hasta: rango.hasta,
        inventario: inventarioRef.current,
        onProgress: ({ mensaje }) => {
          if (ok && mensaje) setProgreso(mensaje);
        },
      });
      if (!ok) return;
      if (!res?.ok) {
        setError(res?.error || 'No se pudo armar el reporte.');
        setPack(null);
      } else {
        setPack(res);
      }
      setCargando(false);
      setProgreso('');
    })();
    return () => {
      ok = false;
    };
  }, [supabase, rango.desde, rango.hasta]);

  const tiendaSel = pack?.tiendas?.find((t) => t.id === tienda) || null;
  const semanalVista = tiendaSel
    ? tiendaSel.semanal.map((w) => ({ ...w, ventasAbarrotes: w.ventas, comprasAbarrotes: w.compras }))
    : (pack?.semanal || []);
  const paretoSku = (tiendaSel?.paretoVentas?.top || []).map((s, i) => ({
    id: s.id,
    label: s.nombre,
    total: s.monto,
    pct: s.pct,
    acumPct: s.acumPct,
    color: ['#b5a642', '#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'][i % 6],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '3px solid #b5a642' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#b5a642' }}>Departamento ABARROTES</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Catálogo <code>ABARROTES</code> (no el corte del módulo). Ventas de tickets POS vs compras
              recibidas, desde el arranque de la app. Sirve para ver si se ha estado surtiendo.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            disabled={!pack?.ok || cargando}
            onClick={() => descargarCsvReporteDepto(pack)}
          >
            Descargar CSV
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.85rem' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }}
              value={tienda}
              onChange={(e) => setTienda(e.target.value)}
            >
              <option value="">Todas las tiendas</option>
              {listarSucursalesOperativas().map((t) => (
                <option key={t} value={t}>{etiquetaTienda(t)}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Periodo rápido
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 170 }}
              value={presetFecha}
              onChange={(e) => setPresetFecha(e.target.value)}
            >
              <option value="operativo">Desde 25-jul (arranque)</option>
              <option value="hoy">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="semana">Esta semana (sáb–vie)</option>
              <option value="mes">Este mes</option>
              <option value="mes_ant">Mes anterior</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="rango">Rango personalizado</option>
            </select>
          </label>
          {presetFecha === 'rango' && (
            <FiltroPeriodo
              labelPeriodo="Rango"
              preset="rango"
              onPresetChange={() => {}}
              desde={desde}
              hasta={hasta}
              onDesdeChange={setDesde}
              onHastaChange={setHasta}
              className="cal-picker-wrap--inline"
            />
          )}
        </div>
        <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.78rem' }}>
          {rango.desde} → {rango.hasta}
          {cargando ? ` · ${progreso || 'Cargando…'}` : ''}
          {error ? ` · ${error}` : ''}
          {(pack?.avisos || []).length ? ` · ${pack.avisos.join(' · ')}` : ''}
        </p>
      </div>

      {cargando && !pack && (
        <div className="card">
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--brand-blue)' }}>{progreso || 'Cargando ventas y compras…'}</p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
            Recorre todos los tickets del periodo. La primera carga puede tardar un minuto.
          </p>
        </div>
      )}

      {pack?.ok && (
        <>
          <div
            className="card"
            style={{
              border: `1px solid ${COLOR_DIAGNOSTICO[tiendaSel?.diagnostico] || '#b5a642'}`,
              background: 'var(--surface)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, color: COLOR_DIAGNOSTICO[tiendaSel?.diagnostico] || '#b5a642' }}>
              {tiendaSel ? `${tiendaSel.label}: ${tiendaSel.diagnosticoTxt}` : pack.conclusion}
            </p>
            <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem' }}>
              Arranque operativo {pack.rango.arranqueOperativo}
              {pack.rango.primeraVenta ? ` · 1ª venta POS ${pack.rango.primeraVenta}` : ''}
              {pack.rango.ultimaCompra ? ` · última compra ABARROTES ${pack.rango.ultimaCompra}` : ' · sin compra formal de ABARROTES'}
              {pack.rango.diasSinPedido != null ? ` · ${pack.rango.diasSinPedido} días sin pedido recibido` : ''}
              {` · ${pack.totales.skusCatalogo} SKUs en catálogo`}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <Kpi
              title="Ventas del depto."
              value={fmt(tiendaSel ? tiendaSel.ventasMonto : pack.totales.ventasAbarrotesMonto)}
              sub={tiendaSel
                ? `${fmtN(tiendaSel.tickets)} tickets con ABARROTES`
                : `${fmtN(pack.totales.ticketsConAbarrotes)} de ${fmtN(pack.totales.ticketsPOS)} tickets POS`}
              accent="#b5a642"
            />
            <Kpi
              title="% del POS"
              value={tiendaSel ? '—' : `${pack.totales.shareAbarrotesPct.toFixed(1)}%`}
              sub={tiendaSel ? 'Solo aplica a todas las tiendas' : `de ${fmt(pack.totales.ventasPOSMonto)} en caja`}
              accent="#e19929"
            />
            <Kpi
              title="Compras formales"
              value={fmt(tiendaSel ? tiendaSel.comprasMonto : pack.totales.comprasAbarrotesMonto)}
              sub={tiendaSel
                ? `${fmtN(tiendaSel.comprasDocs)} docs · cobertura ${fmtCob(tiendaSel.coberturaUnidades)}`
                : `${fmtN(pack.totales.comprasDocsAbarrotes)} docs · ${fmtN(pack.totales.comprasPedidoAbarrotesDocs)} Pedido Abarrotes`}
              accent="#2980b9"
            />
            <Kpi
              title="Cobertura unidades"
              value={fmtCob(tiendaSel ? tiendaSel.coberturaUnidades : pack.totales.coberturaUnidades)}
              sub="Comprado ÷ vendido (depto.)"
              accent="#8e44ad"
            />
            <Kpi
              title="Stock en piso"
              value={fmtN(tiendaSel ? tiendaSel.stockUnidades : pack.totales.stockPisoUnidades, 0)}
              sub={tiendaSel
                ? `${fmt(tiendaSel.stockValorVenta)} · ${fmtN(tiendaSel.skusConStock)} SKUs con stock`
                : `${fmt(pack.totales.stockPisoValorVenta)} · CEDIS ${fmtN(pack.cedis.unidades)} pzas`}
              accent="#27ae60"
            />
            <Kpi
              title="Entradas reales"
              value={fmtN(tiendaSel ? tiendaSel.entradasUnidades : (pack.totales.entradasMasivoU + pack.totales.entradasCompraU), 0)}
              sub={tiendaSel
                ? `compra ${fmtN(tiendaSel.entradasCompraU)} · masivo ${fmtN(tiendaSel.entradasMasivoU)}`
                : `compra ${fmtN(pack.totales.entradasCompraU)} · masivo ${fmtN(pack.totales.entradasMasivoU)}`}
              accent="#16a085"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            <div className="card">
              <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>
                Pareto de ventas por tienda
              </h4>
              <ParetoBarras
                items={pack.paretoTiendas}
                selectedId={tienda || null}
                onSelect={(id) => setTienda(id || '')}
                hint="Pulsa una tienda para ver su detalle. El 80% de la venta suele concentrarse en pocas sucursales."
                empty="Sin ventas del departamento."
              />
            </div>
            <div className="card">
              <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>
                Compras vs ventas {tiendaSel ? `· ${tiendaSel.label}` : '· cadena'}
              </h4>
              <BarrasCompraVenta
                items={semanalVista}
                empty="Sin movimiento semanal en el periodo."
              />
            </div>
          </div>

          {tiendaSel && (
            <div className="card">
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>
                Pareto SKU · {tiendaSel.label}
              </h4>
              <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
                {tiendaSel.paretoVentas.skus80} SKUs hacen el 80% de la venta del depto. en esta tienda
                · {fmtN(tiendaSel.skusVendidosSinCompra)} vendidos sin compra formal
                · {fmtN(tiendaSel.skusAgotadosVendidos)} vendidos y hoy en 0.
              </p>
              <ParetoBarras items={paretoSku} empty="Sin SKUs vendidos." />
            </div>
          )}

          <div className="card">
            <h4 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)' }}>Por tienda</h4>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Ventas</th>
                    <th>Compras</th>
                    <th>Cobertura</th>
                    <th>Stock</th>
                    <th>Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  {pack.tiendas.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setTienda(tienda === t.id ? '' : t.id)}
                      style={{
                        cursor: 'pointer',
                        background: tienda === t.id ? 'rgba(181,166,66,0.12)' : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 600 }}>{t.label}</td>
                      <td>{fmt(t.ventasMonto)} <span className="muted">{fmtN(t.tickets)} tks</span></td>
                      <td>{fmt(t.comprasMonto)} <span className="muted">{fmtN(t.comprasDocs)} docs</span></td>
                      <td>{fmtCob(t.coberturaUnidades)}</td>
                      <td>{fmtN(t.stockUnidades)}</td>
                      <td style={{ color: COLOR_DIAGNOSTICO[t.diagnostico] || undefined, fontWeight: 600 }}>
                        {t.diagnosticoTxt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Pedidos con nota «Abarrotes»</h4>
            <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
              Documentos de Compras cuya nota menciona Abarrotes (se excluye Venta en ruta).
              Los que siguen en estado «pedido» no entran a las unidades compradas hasta recibirlos.
            </p>
            {(pack.pedidosAbarrotes || []).length === 0 ? (
              <p className="muted">No hay Pedido Abarrotes en el periodo.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tienda</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.pedidosAbarrotes.map((p) => (
                      <tr key={p.id || `${p.fecha}-${p.sucursal}`}>
                        <td>{p.fecha || '—'}</td>
                        <td>{p.label}</td>
                        <td>{fmt(p.total)}</td>
                        <td>{p.estado || '—'}</td>
                        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.notas || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
