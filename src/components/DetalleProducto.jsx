import React, { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import HistorialProducto from './HistorialProducto.jsx';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import { esAlmacenCentral, etiquetaCedisEmpresa } from '../lib/inventarioMultitienda.js';
import { etiquetaTienda } from '../constants/sucursales.js';

function iniciales(nombre) {
  const parts = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtPrecio(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function DetalleProducto({
  producto,
  supabase,
  sucursal,
  proveedores = [],
  vinculos = [],
  onEditar,
  onToggleFavorito,
  onVincularProveedor,
  onQuitarVinculo,
}) {
  const [tab, setTab] = useState('detalles');
  const [proveedoresOpen, setProveedoresOpen] = useState(false);
  const [nuevoProvId, setNuevoProvId] = useState('');
  const [nuevoSkuProv, setNuevoSkuProv] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setTab('detalles');
    setProveedoresOpen(false);
    setNuevoProvId('');
    setNuevoSkuProv('');
  }, [producto?.id]);

  if (!producto) {
    return (
      <div className="prod-detalle-vacio">
        <Icon name="package" size={48} />
        <p className="muted">Selecciona un producto de la lista</p>
      </div>
    );
  }

  const enCentral = esAlmacenCentral(sucursal);
  const tiendaLabel = sucursal ? etiquetaTienda(sucursal) : 'MAIN';
  const precioCon = Number(producto.precio ?? producto.precio_venta_con ?? 0);
  const impuesto = Number(producto.impuesto ?? 8);
  const precioSin = Number(producto.precio_venta_sin ?? (precioCon / (1 + impuesto / 100)));
  const favorito = Boolean(producto.en_favoritos) || producto.cat === 'FAVORITOS';
  const stock = Number(producto.stock) || 0;

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(String(producto.id));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="prod-detalle">
      <div className="prod-detalle-header">
        <div className="prod-detalle-foto">
          {producto.foto_url ? (
            <img src={producto.foto_url} alt={producto.nombre} />
          ) : (
            <div className="prod-thumb-placeholder grande">{iniciales(producto.nombre)}</div>
          )}
        </div>
        <div className="prod-detalle-info">
          <div className="prod-detalle-codigo">
            <span>{producto.id}</span>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem' }} onClick={copiarCodigo} title="Copiar código">
              <Icon name="link" size={14} />
            </button>
            {copiado && <small className="muted">Copiado</small>}
          </div>
          <h3>{producto.nombre}</h3>
          <div className="prod-detalle-precio">{fmtPrecio(precioCon)} MXN</div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {etiquetaDepartamento(producto.cat)}
            {producto.descripcion ? ` · ${producto.descripcion}` : ''}
          </div>
        </div>
        <div className="prod-detalle-acciones">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0.4rem', color: favorito ? 'var(--brand-gold)' : undefined }}
            title={favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
            onClick={() => onToggleFavorito?.(producto)}
          >
            <Icon name="check" size={18} />
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem' }} title="Editar producto" onClick={() => onEditar?.(producto)}>
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>

      <div className="prod-detalle-tabs">
        <button type="button" className={tab === 'detalles' ? 'activo' : ''} onClick={() => setTab('detalles')}>
          <Icon name="package" size={16} />
          Detalles del producto
        </button>
        <button type="button" className={tab === 'historial' ? 'activo' : ''} onClick={() => setTab('historial')}>
          <Icon name="refresh" size={16} />
          Historial
        </button>
        <button type="button" className={tab === 'stock' ? 'activo' : ''} onClick={() => setTab('stock')}>
          <Icon name="package" size={16} />
          {stock} PZA
        </button>
      </div>

      {tab === 'detalles' && (
        <div className="prod-detalle-body">
          <button type="button" className="prod-acordeon" onClick={() => setProveedoresOpen((v) => !v)}>
            <Icon name="truck" size={18} />
            <span>Proveedores</span>
            <Icon name="chevronRight" size={16} style={{ marginLeft: 'auto', transform: proveedoresOpen ? 'rotate(90deg)' : undefined }} />
          </button>
          {proveedoresOpen && (
            <div className="prod-acordeon-panel">
              {vinculos.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Sin proveedores vinculados.</p>
              ) : (
                <ul className="prod-vinculos">
                  {vinculos.map((v) => (
                    <li key={v.id}>
                      <span>
                        {v.proveedores?.nombre || v.proveedor_id}
                        {v.sku_proveedor ? <small className="muted"> · SKU {v.sku_proveedor}</small> : null}
                      </span>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--brand-red)' }} onClick={() => onQuitarVinculo?.(v.id)}>
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid-2" style={{ gap: '0.5rem' }}>
                <select className="select" value={nuevoProvId} onChange={(e) => setNuevoProvId(e.target.value)}>
                  <option value="">— Proveedor —</option>
                  {proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="SKU proveedor" value={nuevoSkuProv} onChange={(e) => setNuevoSkuProv(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  if (!nuevoProvId) return alert('Elige proveedor.');
                  onVincularProveedor?.(nuevoProvId, nuevoSkuProv);
                  setNuevoProvId('');
                  setNuevoSkuProv('');
                }}
              >
                Vincular proveedor
              </button>
            </div>
          )}

          <div className="prod-precio-bloque">
            <h4>PRECIO 1</h4>
            <div className="prod-precio-grid">
              <div>
                <span className="muted">Sin impuesto</span>
                <strong>{fmtPrecio(precioSin)}</strong>
              </div>
              <div>
                <span className="muted">Con impuesto</span>
                <strong>{fmtPrecio(precioCon)}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              IVA {impuesto}% · Ganancia {Number(producto.ganancia_pct ?? 0).toFixed(1)}%
            </p>
          </div>

          <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => onEditar?.(producto)}>
            <Icon name="settings" size={16} />
            Editar producto
          </button>
        </div>
      )}

      {tab === 'historial' && (
        <div className="prod-detalle-body prod-detalle-historial">
          <HistorialProducto supabase={supabase} producto={producto} sucursal={sucursal} embebido />
        </div>
      )}

      {tab === 'stock' && (
        <div className="prod-detalle-body">
          <div className="prod-stock-cards">
            <div className="prod-stock-card">
              <span className="muted">Piso ({tiendaLabel})</span>
              <strong>{stock}</strong>
            </div>
            {enCentral && (
              <div className="prod-stock-card">
                <span className="muted">{etiquetaCedisEmpresa()}</span>
                <strong>{producto.stock_cedis ?? 0}</strong>
              </div>
            )}
            <div className="prod-stock-card">
              <span className="muted">Mínimo</span>
              <strong>{producto.stock_minimo ?? 0}</strong>
            </div>
            <div className="prod-stock-card">
              <span className="muted">En venta</span>
              <strong>{producto.en_venta !== false ? 'Sí' : 'No'}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
