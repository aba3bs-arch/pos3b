import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import HistorialProducto from './HistorialProducto.jsx';
import ProductoThumb from './ProductoThumb.jsx';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import { esAlmacenCentral, etiquetaCedisEmpresa, etiquetaStockLista, stockVisible } from '../lib/inventarioMultitienda.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { tieneFoto } from '../lib/fotosCatalogo.js';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';

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
  onFotoActualizada,
  /** false = no mostrar negativos (cajero/repartidor). */
  verNegativos = true,
}) {
  const [tab, setTab] = useState('detalles');
  const [proveedoresOpen, setProveedoresOpen] = useState(false);
  const [nuevoProvId, setNuevoProvId] = useState('');
  const [nuevoSkuProv, setNuevoSkuProv] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [guardandoFoto, setGuardandoFoto] = useState(false);
  const camaraRef = useRef(null);

  useEffect(() => {
    setTab('detalles');
    setProveedoresOpen(false);
    setNuevoProvId('');
    setNuevoSkuProv('');
    setGuardandoFoto(false);
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
  const stockVista = etiquetaStockLista(producto, sucursal, { verNegativos });
  const stock = stockVista.primario;
  const sinFoto = !tieneFoto(producto);

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(String(producto.id));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const tomarFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !supabase || !producto?.id) return;
    setGuardandoFoto(true);
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file);
      const { error } = await supabase.from('productos').update({ foto_url: dataUrl }).eq('id', producto.id);
      if (error) throw new Error(error.message);
      onFotoActualizada?.({ ...producto, foto_url: dataUrl });
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setGuardandoFoto(false);
    }
  };

  return (
    <div className="prod-detalle">
      <div className="prod-detalle-header">
        <div className="prod-detalle-foto-wrap">
          <ProductoThumb producto={producto} size={110} className="prod-detalle-foto" sucursal={sucursal} verNegativos={verNegativos} />
          {sinFoto && onFotoActualizada && (
            <>
              <input
                ref={camaraRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={tomarFoto}
              />
              <button
                type="button"
                className="btn btn-camera btn-camera--icon prod-detalle-tomar-foto"
                disabled={guardandoFoto}
                onClick={() => camaraRef.current?.click()}
                title={guardandoFoto ? 'Guardando foto…' : 'Tomar foto'}
                aria-label={guardandoFoto ? 'Guardando foto' : 'Tomar foto del producto'}
              >
                <Icon name="camera" size={16} />
              </button>
            </>
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
        {(onToggleFavorito || onEditar) && (
          <div className="prod-detalle-acciones">
            {onToggleFavorito && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.4rem', color: favorito ? 'var(--brand-gold)' : undefined }}
                title={favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                onClick={() => onToggleFavorito(producto)}
              >
                <Icon name="check" size={18} />
              </button>
            )}
            {onEditar && (
              <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem' }} title="Editar producto" onClick={() => onEditar(producto)}>
                <Icon name="settings" size={18} />
              </button>
            )}
          </div>
        )}
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
          {enCentral
            ? `${stockVista.primario} ${stockVista.etiquetaPrimario}`
            : `${stockVista.primario} PZA`}
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
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.2rem 0.4rem', color: 'var(--brand-red)', display: onQuitarVinculo ? undefined : 'none' }}
                        onClick={() => onQuitarVinculo?.(v.id)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {onVincularProveedor && (
                <>
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
                      onVincularProveedor(nuevoProvId, nuevoSkuProv);
                      setNuevoProvId('');
                      setNuevoSkuProv('');
                    }}
                  >
                    Vincular proveedor
                  </button>
                </>
              )}
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
              IVA {impuesto}%
              {enCentral ? ` · Ganancia ${Number(producto.ganancia_pct ?? 0).toFixed(1)}%` : ''}
            </p>
          </div>

          {onEditar && (
            <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => onEditar(producto)}>
              <Icon name="settings" size={16} />
              Editar producto
            </button>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <div className="prod-detalle-body prod-detalle-historial">
          <HistorialProducto supabase={supabase} producto={producto} sucursal={sucursal} embebido verNegativos={verNegativos} />
        </div>
      )}

      {tab === 'stock' && (
        <div className="prod-detalle-body">
          <div className="prod-stock-cards">
            {enCentral && (
              <div className="prod-stock-card" style={{ borderColor: 'var(--brand-gold)' }}>
                <span className="muted">{etiquetaCedisEmpresa()}</span>
                <strong>{stockVisible(producto.stock_cedis, verNegativos)}</strong>
                <small className="muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.72rem' }}>
                  Aquí cae el ingreso de inventario en MAIN
                </small>
              </div>
            )}
            <div className="prod-stock-card">
              <span className="muted">Piso ({tiendaLabel})</span>
              <strong style={verNegativos && Number(producto.stock) < 0 ? { color: 'var(--brand-red)' } : undefined}>
                {stockVisible(producto.stock, verNegativos)}
              </strong>
              {verNegativos && Number(producto.stock) < 0 && (
                <small className="muted" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--brand-red)' }}>
                  Negativo: se vendió sin existencias
                </small>
              )}
            </div>
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
