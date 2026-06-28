import React, { useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  ALMACEN_CENTRAL,
  esAlmacenCentral,
  etiquetaAlmacenCentral,
  etiquetaCedisEmpresa,
  inventarioParaSucursal,
  resumenStockProducto,
  stockAlmacenCentral,
} from '../lib/inventarioMultitienda.js';
import AjusteInventario from './AjusteInventario.jsx';

export default function AdminInventarioCentral({
  supabase,
  inventario,
  cargarDatos,
  user,
  sucursalesLista,
}) {
  const [vista, setVista] = useState('operar');
  const [tiendaOp, setTiendaOp] = useState(ALMACEN_CENTRAL);
  const [busqueda, setBusqueda] = useState('');

  const inventarioOp = useMemo(() => inventarioParaSucursal(inventario, tiendaOp), [inventario, tiendaOp]);

  const productosResumen = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    let list = inventario || [];
    if (t) {
      list = list.filter(
        (p) =>
          String(p.nombre || '')
            .toLowerCase()
            .includes(t) || String(p.id || '').toLowerCase().includes(t),
      );
    }
    return list.slice(0, 60);
  }, [inventario, busqueda]);

  const tiendas = sucursalesLista || [];
  const tiendasVenta = tiendas.filter((s) => !esAlmacenCentral(s));

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-blue)', marginBottom: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Inventario multitienda</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        <strong>{etiquetaCedisEmpresa()}</strong> (MAIN) es el único almacén de la empresa para mercancía por repartir.
        Cada tienda solo tiene <strong>piso de venta</strong>. Desde MAIN usa el traspaso «CEDIS central → Tienda» para surtir sucursales.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
        <button type="button" className={vista === 'operar' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setVista('operar')}>
          Entradas, retiros y traspasos
        </button>
        <button type="button" className={vista === 'resumen' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setVista('resumen')}>
          Stock en todas las tiendas
        </button>
      </div>

      <label className="muted" style={{ display: 'block', maxWidth: '360px' }}>
        Tienda donde operar
        <select className="select" style={{ marginTop: '0.35rem' }} value={tiendaOp} onChange={(e) => setTiendaOp(e.target.value)}>
          {tiendas.map((s) => (
            <option key={s} value={s}>
              {esAlmacenCentral(s) ? etiquetaAlmacenCentral() : etiquetaTienda(s)}
            </option>
          ))}
        </select>
      </label>

      {esAlmacenCentral(tiendaOp) && (
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          En MAIN las entradas y compras suman al CEDIS central. Usa «CEDIS central → Tienda» para distribuir a sucursales.
        </p>
      )}

      {vista === 'operar' ? (
        <div style={{ marginTop: '1rem' }}>
          <AjusteInventario
            supabase={supabase}
            inventario={inventarioOp}
            inventarioCompleto={inventario}
            cargarDatos={cargarDatos}
            user={user}
            sucursal={tiendaOp}
            sucursalOperacion={tiendaOp}
            puedeElegirTienda
            sucursalesLista={tiendas}
            modoInicial="libre"
            embebido
          />
        </div>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
            Buscar producto
            <input
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código o nombre…"
            />
          </label>
          <div className="table-wrap">
            <table className="data" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>{etiquetaCedisEmpresa()}</th>
                  {tiendasVenta.map((s) => (
                    <th key={s}>Piso · {etiquetaTienda(s)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productosResumen.length === 0 ? (
                  <tr>
                    <td colSpan={3 + tiendasVenta.length} className="muted">
                      Sin productos que coincidan.
                    </td>
                  </tr>
                ) : (
                  productosResumen.map((p) => {
                    const filas = resumenStockProducto(p, tiendas, ALMACEN_CENTRAL);
                    const central = stockAlmacenCentral(p, ALMACEN_CENTRAL);
                    const porTienda = new Map(filas.map((f) => [f.sucursal, f]));
                    return (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.nombre}</td>
                        <td style={{ fontWeight: 700 }}>{central}</td>
                        {tiendasVenta.map((s) => {
                          const row = porTienda.get(s) || { piso: 0 };
                          return <td key={`${p.id}-${s}`}>{row.piso}</td>;
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
