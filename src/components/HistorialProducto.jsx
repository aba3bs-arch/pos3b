import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import {
  FILTROS_EVENTO_PRODUCTO,
  etiquetaTipoMovimiento,
  cargarReporteMovimientosInventario,
  rangoDesdePreset,
  timelineProducto,
} from '../lib/consultasInventario.js';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import { esAlmacenCentral, stockVisible } from '../lib/inventarioMultitienda.js';

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
    cambio_precio: { bg: 'rgba(124,58,237,0.12)', c: '#6d28d9' },
  };
  const s = colors[tipo] || { bg: 'var(--surface)', c: 'var(--muted)' };
  return (
    <span className="badge" style={{ background: s.bg, color: s.c, fontSize: '0.72rem' }}>
      {etiquetaTipoMovimiento(tipo, modo)}
    </span>
  );
}

export default function HistorialProducto({ supabase, producto, sucursal, onVolver, embebido = false, verNegativos = true }) {
  const [presetFecha, setPresetFecha] = useState('7d');
  const [desde, setDesde] = useState(() => rangoDesdePreset('7d').desde);
  const [hasta, setHasta] = useState(() => rangoDesdePreset('7d').hasta);
  const [filtroEvento, setFiltroEvento] = useState('todos');
  const [movimientos, setMovimientos] = useState([]);
  const [aviso, setAviso] = useState('');
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

  const cargar = useCallback(async () => {
    if (!producto?.id) {
      setMovimientos([]);
      return;
    }
    setCargando(true);
    setAviso('');
    try {
      const r = await cargarReporteMovimientosInventario(supabase, {
        desde,
        hasta,
        productoId: producto.id,
        sucursal: sucursal || null,
      });
      setMovimientos(r.data || []);
      setAviso((r.avisos || []).join(' · '));
    } catch (e) {
      setMovimientos([]);
      setAviso(`Error: ${e?.message || e}`);
    } finally {
      setCargando(false);
    }
  }, [supabase, producto?.id, desde, hasta, sucursal]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const historialVentas = useMemo(
    () =>
      (movimientos || [])
        .filter((m) => m.modo === 'venta' || m.origen === 'ventas' || m.tipo === 'venta')
        .map((m) => ({
          id: m.id,
          created_at: m.created_at,
          cantidad: m.cantidad,
          subtotal: Number(m.subtotal) || 0,
          usuario: m.usuario,
          motivo: m.motivo,
        })),
    [movimientos],
  );

  const timelineSinFiltro = useMemo(() => {
    if (!producto?.id) return [];
    return timelineProducto(producto.id, [], movimientos, 'todos');
  }, [producto?.id, movimientos]);

  const timeline = useMemo(() => {
    if (!producto?.id) return [];
    return timelineProducto(producto.id, [], movimientos, filtroEvento);
  }, [producto?.id, movimientos, filtroEvento]);

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
      {!embebido && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-blue)' }}>{producto.nombre}</strong>
              <div className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                Código {producto.id} · {etiquetaDepartamento(producto.cat)} · IVA {Number(producto.impuesto ?? 8)}%
                {esAlmacenCentral(sucursal) ? ` · Ganancia ${Number(producto.ganancia_pct ?? 30)}%` : ''}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-red)', marginTop: '0.5rem' }}>
                ${Math.round(Number(producto.precio) || 0)}
              </div>
              <div style={{ marginTop: '0.35rem' }}>
                Existencia:{' '}
                <strong style={verNegativos && Number(producto.stock) < 0 ? { color: 'var(--brand-red)' } : undefined}>
                  {stockVisible(producto.stock, verNegativos)}
                </strong>{' '}
                piso ·{' '}
                <strong style={verNegativos && Number(producto.stock_cedis) < 0 ? { color: 'var(--brand-red)' } : undefined}>
                  {stockVisible(producto.stock_cedis, verNegativos)}
                </strong>{' '}
                CEDIS
              </div>
            </div>
            {onVolver && (
              <button type="button" className="btn btn-ghost" onClick={onVolver}>
                Volver al catálogo
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Rango de fechas</h3>
        <FiltroPeriodo
          preset={presetFecha}
          onPresetChange={cambiarPreset}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
        />
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar historial'}
        </button>
        {aviso && (
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--brand-gold-dark)' }}>
            {aviso}
          </p>
        )}
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
                    <td>{v.subtotal ? `$${Number(v.subtotal).toFixed(2)}` : '—'}</td>
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
                    Sin movimientos en el rango. Incluye ventas, compras, cancelaciones y ajustes sincronizados.
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
