import React, { useMemo, useState } from 'react';
import { etiquetaTienda, esSucursalNoVenta } from '../constants/sucursales.js';
import {
  ALMACEN_CENTRAL,
  esAlmacenCentral,
  esCentralAdmin,
  etiquetaAlmacenCentral,
  etiquetaCedisEmpresa,
  inventarioParaSucursal,
  resumenStockProducto,
  stockAlmacenCentral,
} from '../lib/inventarioMultitienda.js';
import AjusteInventario from './AjusteInventario.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';

export default function AdminInventarioCentral({
  supabase,
  inventario,
  cargarDatos,
  fusionarProducto,
  user,
  sucursalesLista,
}) {
  const [vista, setVista] = useState('operar');
  const [tiendaOp, setTiendaOp] = useState(ALMACEN_CENTRAL);
  const [busqueda, setBusqueda] = useState('');

  const inventarioOp = useMemo(() => inventarioParaSucursal(inventario, tiendaOp), [inventario, tiendaOp]);

  const productosResumen = useMemo(() => {
    const t = busqueda.trim();
    let list = inventario || [];
    if (t) {
      list = list.filter((p) => productoCoincideBusqueda(p, t));
    }
    return list.slice(0, 60);
  }, [inventario, busqueda]);

  const tiendas = sucursalesLista || [];
  const tiendasVenta = tiendas.filter((s) => !esSucursalNoVenta(s));

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-blue)', marginBottom: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Inventario multitienda</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        <strong>{etiquetaCedisEmpresa()}</strong> es el almacén de la empresa (sucursal <strong>CEDIS</strong>, aparte de MAIN).
        <strong> MAIN</strong> es solo la central de administración. Cada tienda solo tiene <strong>piso de venta</strong>.
        Desde CEDIS usa el traspaso «CEDIS central → Tienda» para surtir sucursales.
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
              {esAlmacenCentral(s) || esCentralAdmin(s) ? etiquetaTienda(s) : etiquetaTienda(s)}
            </option>
          ))}
        </select>
      </label>

      {esAlmacenCentral(tiendaOp) && (
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          En CEDIS las entradas y compras suman al almacén central. Usa «CEDIS central → Tienda» para distribuir a sucursales.
        </p>
      )}
      {esCentralAdmin(tiendaOp) && (
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          MAIN es panel administrativo (sin inventario CEDIS). Cambia a <strong>CEDIS</strong> para entradas y traspasos de almacén.
        </p>
      )}

      {vista === 'operar' ? (
        <div style={{ marginTop: '1rem' }}>
          <AjusteInventario
            supabase={supabase}
            inventario={inventarioOp}
            inventarioCompleto={inventario}
            cargarDatos={cargarDatos}
            fusionarProducto={typeof fusionarProducto === 'function' ? fusionarProducto : undefined}
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
            <div style={{ marginTop: '0.35rem' }}>
              <CampoCodigo
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onEscanear={(codigo) => setBusqueda(String(codigo || '').trim())}
                beepAlEnter
                placeholder="Código o nombre… usa Escanear"
                tituloCamara="Buscar producto en inventario central"
              />
            </div>
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
