import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import {
  FILTROS_EVENTO_PRODUCTO,
  PRESETS_FECHA_PRODUCTO,
  etiquetaTipoMovimiento,
  listarMovimientosInventario,
  rangoDesdePreset,
  timelineProducto,
  ventasConProducto,
} from '../lib/consultasInventario.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX');
}

function badgeTipo(tipo, modo) {
  const colors = {
    entrada: { bg: 'rgba(34,197,94,0.15)', c: 'var(--brand-green)' },
    retiro: { bg: 'rgba(211,47,47,0.12)', c: 'var(--brand-red)' },
    traspaso: { bg: 'rgba(59,105,181,0.12)', c: 'var(--brand-blue)' },
    venta: { bg: 'rgba(225,153,41,0.2)', c: '#b45309' },
  };
  const s = colors[tipo] || { bg: 'var(--surface)', c: 'var(--muted)' };
  return (
    <span className="badge" style={{ background: s.bg, color: s.c, fontSize: '0.72rem' }}>
      {etiquetaTipoMovimiento(tipo, modo)}
    </span>
  );
}

export default function HistorialProducto({ supabase, producto, sucursal, onVolver }) {
  const [presetFecha, setPresetFecha] = useState('7d');
  const [desde, setDesde] = useState(() => rangoDesdePreset('7d').desde);
  const [hasta, setHasta] = useState(() => rangoDesdePreset('7d').hasta);
  const [filtroEvento, setFiltroEvento] = useState('todos');
  const [ventasProducto, setVentasProducto] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cambiarPreset = (preset) => {
    setPresetFecha(preset);
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setDesde(r.desde);
        setHasta(r.hasta);
      }
    }
  };

  const cargarVentas = useCallback(async () => {
    if (!supabase || !producto?.id) {
      setVentasProducto([]);
      return;
    }
    setCargando(true);
    const ini = new Date(desde);
    ini.setHours(0, 0, 0, 0);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);
    const { data, error } = await consultarVentas(supabase, {
      columns: '*',
      desde: ini,
      hasta: fin,
      sucursal: sucursal || null,
      limit: 800,
    });
    setCargando(false);
    if (error) {
      console.warn(error);
      setVentasProducto([]);
      return;
    }
    setVentasProducto(data || []);
  }, [supabase, producto?.id, desde, hasta, sucursal]);

  useEffect(() => {
    cargarVentas();
  }, [cargarVentas]);

  const historialVentas = useMemo(() => ventasConProducto(ventasProducto, producto?.id), [ventasProducto, producto?.id]);

  const timelineSinFiltro = useMemo(() => {
    if (!producto?.id) return [];
    const movs = listarMovimientosInventario({
      desde,
      hasta,
      productoId: producto.id,
      sucursal: sucursal || null,
    });
    return timelineProducto(producto.id, ventasProducto, movs, 'todos');
  }, [producto?.id, ventasProducto, desde, hasta, sucursal]);

  const timeline = useMemo(() => {
    if (!producto?.id) return [];
    if (filtroEvento === 'todos') return timelineSinFiltro;
    const movs = listarMovimientosInventario({
      desde,
      hasta,
      productoId: producto.id,
      sucursal: sucursal || null,
    });
    return timelineProducto(producto.id, ventasProducto, movs, filtroEvento);
  }, [producto?.id, ventasProducto, desde, hasta, sucursal, filtroEvento, timelineSinFiltro]);

  const totales = useMemo(() => {
    const vendido = historialVentas.reduce((a, v) => a + Number(v.cantidad || 0), 0);
    const ingresos = historialVentas.reduce((a, v) => a + Number(v.subtotal || 0), 0);
    const entradas = timelineSinFiltro
      .filter((e) => e.tipo === 'entrada' || (e.tipo === 'traspaso' && e.stock_despues > e.stock_antes))
      .reduce((a, e) => a + Number(e.cantidad || 0), 0);
    const salidas = timelineSinFiltro
      .filter((e) => e.tipo === 'retiro' || e.tipo === 'venta' || (e.tipo === 'traspaso' && e.stock_despues < e.stock_antes))
      .reduce((a, e) => a + Number(e.cantidad || 0), 0);
    return { vendido, ingresos, entradas, salidas };
  }, [historialVentas, timelineSinFiltro]);

  if (!producto) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--brand-blue)' }}>{producto.nombre}</strong>
            <div className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
              Código {producto.id} · {etiquetaDepartamento(producto.cat)} · IVA {Number(producto.impuesto ?? 8)}% · Ganancia {Number(producto.ganancia_pct ?? 30)}%
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-red)', marginTop: '0.5rem' }}>
              ${Math.round(Number(producto.precio) || 0)}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              Existencia: <strong>{producto.stock}</strong> piso · <strong>{producto.stock_cedis ?? 0}</strong> CEDIS
            </div>
          </div>
          {onVolver && (
            <button type="button" className="btn btn-ghost" onClick={onVolver}>
              Volver al catálogo
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Rango de fechas</h3>
        <label className="muted" style={{ display: 'block' }}>
          Periodo
          <select className="select" style={{ marginTop: '0.35rem' }} value={presetFecha} onChange={(e) => cambiarPreset(e.target.value)}>
            {PRESETS_FECHA_PRODUCTO.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {presetFecha === 'rango' ? (
          <div className="grid-2" style={{ marginTop: '0.75rem' }}>
            <label className="muted">
              Desde
              <input type="date" className="input" style={{ marginTop: '0.35rem' }} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="muted">
              Hasta
              <input type="date" className="input" style={{ marginTop: '0.35rem' }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </div>
        ) : (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            {desde === hasta ? `Fecha: ${desde}` : `${desde} — ${hasta}`}
          </p>
        )}
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={cargarVentas} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar historial'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>Vendido</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{totales.vendido} uds.</div>
        </div>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>Ingresos</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--brand-red)' }}>${totales.ingresos.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>Entradas</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--brand-green)' }}>{totales.entradas}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>Salidas</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{totales.salidas}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Ventas ({historialVentas.length})</h3>
        <div className="table-wrap" style={{ maxHeight: '260px' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cant.</th>
                <th>Subtotal</th>
                <th>Vendedor</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              {historialVentas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin ventas en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                historialVentas.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontSize: '0.82rem' }}>{fmtFecha(v.created_at)}</td>
                    <td>{v.cantidad}</td>
                    <td>${Number(v.subtotal).toFixed(2)}</td>
                    <td>{v.usuario}</td>
                    <td style={{ fontSize: '0.8rem' }}>{v.motivo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Movimientos ({timeline.length})</h3>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {FILTROS_EVENTO_PRODUCTO.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filtroEvento === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                onClick={() => setFiltroEvento(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: '360px' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cant.</th>
                <th>Stock</th>
                <th>Detalle</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {timeline.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Sin movimientos en el rango. Las ventas y ajustes se registran al cobrar o en Ajuste de inventario.
                  </td>
                </tr>
              ) : (
                timeline.map((e) => (
                  <tr
                    key={e.id}
                    style={Number(e.stock_despues) < 0 || Number(e.stock_antes) < 0 ? { background: 'rgba(211,47,47,0.06)' } : undefined}
                  >
                    <td style={{ fontSize: '0.82rem' }}>{fmtFecha(e.created_at)}</td>
                    <td>{badgeTipo(e.tipo, e.modo)}</td>
                    <td>{e.cantidad}</td>
                    <td style={{ fontSize: '0.8rem' }}>{e.stock_antes != null ? `${e.stock_antes} → ${e.stock_despues}` : '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {e.detalle || e.producto_nombre}
                      {e.motivo && <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>{e.motivo}</span>}
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {e.usuario || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
