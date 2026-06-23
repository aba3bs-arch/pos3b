import React, { useEffect, useMemo, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import Icon, { BtnLabel } from '../components/Icon.jsx';
import { iconoDeModulo } from '../lib/moduloIcons.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { fmtMxn, resumirValorInventario } from '../lib/valorInventario.js';

export default function Inicio({ supabase, sucursal, inventario, onNavigate, puedeModulo }) {
  const puede = typeof puedeModulo === 'function' ? puedeModulo : () => true;
  const [ventasHoy, setVentasHoy] = useState([]);
  const [loading, setLoading] = useState(true);
  const valorInv = useMemo(() => resumirValorInventario(inventario), [inventario]);
  const nombreTienda = etiquetaTienda(sucursal);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await consultarVentas(supabase, {
        columns: 'id,total,created_at,vendedor,metodo_pago',
        desde: start,
        sucursal,
        limit: 12,
      });
      if (ok) setVentasHoy((data || []).slice(0, 12));
      setLoading(false);
    })();
    return () => {
      ok = false;
    };
  }, [supabase, sucursal]);

  const totalHoy = ventasHoy.reduce((a, v) => a + Number(v.total || 0), 0);
  const ticketProm = ventasHoy.length ? totalHoy / ventasHoy.length : 0;
  const lowStock = (inventario || []).filter((p) => Number(p.stock) < 5 && Number(p.stock) >= 0).slice(0, 8);

  const kpi = (label, value, sub, onClick, icon) => (
    <button
      type="button"
      className="card"
      onClick={onClick}
      style={{
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid var(--border)',
        background: 'linear-gradient(145deg, #fff 0%, #f7f9fc 100%)',
      }}
    >
      <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-blue)', marginTop: '0.35rem' }}>{value}</div>
      {sub && <div className="muted" style={{ marginTop: '0.25rem' }}>{sub}</div>}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div
        className="card"
        style={{
          borderTop: '5px solid var(--brand-gold)',
          background: 'linear-gradient(135deg, #fff 0%, rgba(59,105,181,0.07) 45%, rgba(225,153,41,0.12) 100%)',
          padding: '1.5rem 1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Icon name="package" size={16} />
              Inventario en tienda · <span className="badge">{nombreTienda}</span>
            </div>
            <div style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 800, color: 'var(--brand-blue)', lineHeight: 1.1, marginTop: '0.5rem' }}>
              {fmtMxn(valorInv.valorTotal)}
            </div>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
              <strong>Total del inventario en tienda</strong> a precio de venta · {valorInv.unidades.toLocaleString('es-MX')} unidades en {valorInv.skusConStock} productos
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem', flex: '1 1 280px', maxWidth: '420px' }}>
            <div style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: 'rgba(255,255,255,0.85)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>A costo compra</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmtMxn(valorInv.valorCosto)}</div>
            </div>
            <div style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: 'rgba(255,255,255,0.85)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Margen potencial</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)', fontSize: '1.05rem' }}>{fmtMxn(valorInv.margenPotencial)}</div>
            </div>
          </div>
        </div>
        {valorInv.skusSinPrecio > 0 && (
          <p className="muted" style={{ margin: '0.85rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
            {valorInv.skusSinPrecio} producto(s) con stock sin precio de venta — se contaron a $0. Complétalo en Productos.
          </p>
        )}
        {valorInv.skusSinPrecio === 0 && valorInv.skusSinCosto > 0 && (
          <p className="muted" style={{ margin: '0.85rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
            {valorInv.skusSinCosto} producto(s) sin precio de compra — se contaron a $0. Complétalo en Productos.
          </p>
        )}
        {puede('Productos') && (
          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => onNavigate('Productos')}>
            <BtnLabel icon="package">Ver detalle en Productos</BtnLabel>
          </button>
        )}
      </div>

      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Panel de inicio</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Sucursal <span className="badge">{nombreTienda}</span> · Resumen operativo del día
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        {kpi('Total inventario', fmtMxn(valorInv.valorTotal), `${valorInv.unidades} uds. a precio venta`, puede('Productos') ? () => onNavigate('Productos') : undefined, 'package')}
        {kpi('Ventas hoy', ventasHoy.length.toString(), `$${totalHoy.toFixed(2)} MXN acumulado`, puede('Ventas') ? () => onNavigate('Ventas') : undefined, 'cart')}
        {kpi('Ticket promedio', `$${ticketProm.toFixed(2)}`, 'MXN por venta', puede('Estadisticas') ? () => onNavigate('Estadisticas') : undefined, 'dollar')}
        {kpi('Alertas stock', String(lowStock.length), 'SKU con menos de 5 uds.', puede('Productos') ? () => onNavigate('Productos') : undefined, 'alert')}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Accesos rápidos</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {['Ventas', 'Corte de caja', 'Checador', 'Compras', 'Clientes', 'Reportes'].filter((m) => puede(m)).map((m) => (
              <button key={m} type="button" className="btn btn-gold" onClick={() => onNavigate(m)} style={{ fontSize: '0.85rem' }}>
                <Icon name={iconoDeModulo(m)} size={16} />
                <span>{m}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Stock bajo</h3>
          {lowStock.length === 0 ? (
            <p className="muted">Sin alertas por ahora.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {lowStock.map((p) => (
                <li key={p.id}>
                  <strong>{p.nombre}</strong> <span className="muted">· {p.stock} uds.</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Últimas ventas del día</h3>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : ventasHoy.length === 0 ? (
          <p className="muted">Aún no hay ventas registradas hoy. Abre el módulo Ventas para cobrar.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Vendedor</th>
                  <th>Total</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {ventasHoy.map((v) => (
                  <tr key={v.id}>
                    <td>{v.created_at ? new Date(v.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>{v.vendedor}</td>
                    <td>${Number(v.total).toFixed(2)}</td>
                    <td>{v.metodo_pago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
