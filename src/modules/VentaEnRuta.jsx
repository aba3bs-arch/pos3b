import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import {
  AVISO_FALTA_VENTA_RUTA,
  NOMBRE_ALMACEN_RUTA,
  crearCargaRuta,
  disponibleEnLineaCarga,
  guardarClienteRuta,
  guardarPrecioRutaProducto,
  lineasDeCarga,
  listarCargasRuta,
  listarClientesRuta,
  listarDestinosVentaRuta,
  listarUsuariosRepartidores,
  listarVentasRuta,
  puedeAdministrarVentaRuta,
  precioRutaEspecial,
  registrarVentaRuta,
} from '../lib/ventaEnRuta.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { stockEnUbicacion, ALMACEN_CENTRAL } from '../lib/inventarioMultitienda.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import {
  DEPARTAMENTOS_CEDIS_UI,
  departamentoFiltroCoincideCedis,
} from '../lib/catalogoCedis.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';
import { esRolRepartidor } from '../lib/roles.js';
import './VentaEnRuta.css';

const COLOR = '#0f766e';

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

export default function VentaEnRuta({ supabase, user, inventario = [], onNavigate }) {
  const [vista, setVista] = useState('hub');
  const [aviso, setAviso] = useState('');
  const esAdmin = puedeAdministrarVentaRuta(user?.rol);

  const productoPorId = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

  const subs = useMemo(() => {
    const items = [];
    if (esAdmin) {
      items.push(
        { id: 'carga', label: 'Carga de camión', desc: `Repartidor · descuenta ${NOMBRE_ALMACEN_RUTA}`, icon: 'truck' },
        { id: 'precios', label: 'Precios de ruta', desc: 'Precio especial sin impuestos', icon: 'dollar' },
        { id: 'clientes', label: 'Clientes externos', desc: 'Clientes no propios', icon: 'users' },
        { id: 'consultas', label: 'Consultas', desc: 'Cargas y ventas', icon: 'search' },
      );
    }
    items.push({
      id: 'venta',
      label: 'POS venta en ruta',
      desc: 'Escanear · efectivo o crédito',
      icon: 'cart',
    });
    return items;
  }, [esAdmin]);

  const ir = (id) => {
    setAviso('');
    setVista(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        {vista !== 'hub' && (
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.5rem' }} onClick={() => ir('hub')}>
            ← Venta en Ruta
          </button>
        )}
        <h2 style={{ margin: 0, color: COLOR }}>Venta en Ruta</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          {NOMBRE_ALMACEN_RUTA} → camión → POS. Efectivo a tránsito · Crédito lo paga el cajero con PIN ·
          mercancía a Compras (lista para recibir).
        </p>
      </div>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', fontSize: '0.85rem' }}>{aviso}</div>
      )}
      {vista === 'hub' && (
        <SubcomandosHub
          color={COLOR}
          items={subs.map((s) => ({ ...s, ayuda: s.desc, color: COLOR }))}
          onSelect={ir}
        />
      )}
      {vista === 'carga' && esAdmin && (
        <VistaCarga supabase={supabase} user={user} inventario={inventario} setAviso={setAviso} />
      )}
      {vista === 'precios' && esAdmin && (
        <VistaPrecios supabase={supabase} user={user} inventario={inventario} setAviso={setAviso} />
      )}
      {vista === 'clientes' && esAdmin && <VistaClientes supabase={supabase} setAviso={setAviso} />}
      {vista === 'venta' && (
        <VistaPos
          supabase={supabase}
          user={user}
          productoPorId={productoPorId}
          inventario={inventario}
          setAviso={setAviso}
          onNavigate={onNavigate}
        />
      )}
      {vista === 'consultas' && esAdmin && <VistaConsultas supabase={supabase} setAviso={setAviso} />}
    </div>
  );
}

function VistaCarga({ supabase, user, inventario, setAviso }) {
  const [lineas, setLineas] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('1');
  const [repartidores, setRepartidores] = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargandoRep, setCargandoRep] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCargandoRep(false);
      return undefined;
    }
    let cancel = false;
    (async () => {
      setCargandoRep(true);
      const r = await listarUsuariosRepartidores(supabase);
      if (cancel) return;
      if (r.error) setAviso(r.error);
      setRepartidores(r.data || []);
      setCargandoRep(false);
    })();
    return () => { cancel = true; };
  }, [supabase, setAviso]);

  const repartidorSel = useMemo(
    () => repartidores.find((u) => String(u.id) === String(repartidorId)) || null,
    [repartidores, repartidorId],
  );

  const agregar = () => {
    const { producto } = buscarProductoInventario(inventario, codigo);
    if (!producto) return alert('Producto no encontrado.');
    const precio = precioRutaEspecial(producto);
    if (!(precio > 0)) {
      return alert(`«${producto.nombre}» sin precio de ruta. Ajústalo en Precios de ruta.`);
    }
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida (enteros).');
    const stockCedis = stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', ALMACEN_CENTRAL);
    const ya = lineas.filter((l) => String(l.productoId) === String(producto.id)).reduce((s, l) => s + l.cantidad, 0);
    if (stockCedis < ya + n) return alert(`Stock insuficiente en ${NOMBRE_ALMACEN_RUTA} (hay ${stockCedis}).`);
    setLineas((prev) => {
      const i = prev.findIndex((l) => String(l.productoId) === String(producto.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + n };
        return next;
      }
      return [...prev, { productoId: producto.id, nombre: producto.nombre, precio, cantidad: n }];
    });
    setCodigo('');
    setQty('1');
  };

  const crear = async () => {
    if (!lineas.length) return alert('Agrega productos.');
    if (!repartidorSel) return alert('Selecciona un repartidor (usuarios con rol Repartidor).');
    if (!confirm(`¿Cargar camión para ${repartidorSel.nombre}? Se descuenta de ${NOMBRE_ALMACEN_RUTA}.`)) return;
    setGuardando(true);
    const r = await crearCargaRuta(supabase, {
      vendedorNombre: repartidorSel.nombre,
      vendedorId: repartidorSel.id,
      lineas,
      usuarioNombre: user?.nombre,
      rol: user?.rol,
      inventario,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    alert(`Carga ${r.carga?.folio || ''} creada para ${repartidorSel.nombre}. Stock CEDIS descontado.`);
    setLineas([]);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Carga de camión</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Elige un repartidor con rol Repartidor. Al crear la carga se descuenta el inventario de {NOMBRE_ALMACEN_RUTA}.
      </p>
      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
        Repartidor
        <select
          className="input"
          style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          value={repartidorId}
          onChange={(e) => setRepartidorId(e.target.value)}
          disabled={cargandoRep}
        >
          <option value="">{cargandoRep ? 'Cargando…' : '— Seleccionar repartidor —'}</option>
          {repartidores.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </label>
      {!cargandoRep && repartidores.length === 0 && (
        <p className="muted" style={{ fontSize: '0.8rem', color: 'var(--danger, #b91c1c)' }}>
          No hay usuarios activos con rol Repartidor. Créalos en Usuarios.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código / escanear" onKeyDown={(e) => e.key === 'Enter' && agregar()} />
        <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
        <button type="button" className="btn btn-primary" onClick={agregar}>Agregar</button>
      </div>
      {lineas.length === 0 ? <p className="muted">Sin líneas.</p> : (
        <table className="consultas-table">
          <thead><tr><th>Producto</th><th>Cant</th><th>P. ruta</th><th /></tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.productoId}>
                <td>{l.nombre}</td>
                <td>{fmtQty(l.cantidad)}</td>
                <td>{fmtMonto(l.precio)}</td>
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.4rem' }} onClick={() => setLineas((p) => p.filter((x) => x.productoId !== l.productoId))}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={guardando || !lineas.length || !repartidorId} onClick={() => void crear()}>
        Crear carga y descontar CEDIS
      </button>
    </div>
  );
}

function VistaPrecios({ supabase, user, inventario, setAviso }) {
  const [q, setQ] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [productosPorProveedor, setProductosPorProveedor] = useState(() => new Map());
  const [idsConProveedor, setIdsConProveedor] = useState(() => new Set());
  const [editId, setEditId] = useState('');
  const [editVal, setEditVal] = useState('');

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      if (!cancel) setProveedores(data || []);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancel = false;
    (async () => {
      const { data, error } = await supabase.from('proveedor_producto').select('proveedor_id, producto_id');
      if (cancel) return;
      if (error) {
        setProductosPorProveedor(new Map());
        setIdsConProveedor(new Set());
        return;
      }
      const map = new Map();
      const todos = new Set();
      for (const row of data || []) {
        const prov = String(row.proveedor_id ?? '').trim();
        const prod = String(row.producto_id ?? '').trim();
        if (!prov || !prod) continue;
        if (!map.has(prov)) map.set(prov, new Set());
        map.get(prov).add(prod);
        todos.add(prod);
      }
      setProductosPorProveedor(map);
      setIdsConProveedor(todos);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase]);

  const filtrosActivos = Boolean(q.trim() || departamento || proveedorId);

  const lista = useMemo(() => {
    let list = inventario || [];
    const term = q.trim();
    if (term) list = list.filter((p) => productoCoincideBusqueda(p, term));
    if (departamento) {
      list = list.filter((p) => String(p.cat || '').toUpperCase() === departamento.toUpperCase());
    }
    if (proveedorId === '__ninguno__') {
      list = list.filter((p) => !idsConProveedor.has(String(p.id)));
    } else if (proveedorId) {
      const ids = productosPorProveedor.get(String(proveedorId));
      list = list.filter((p) => ids?.has(String(p.id)));
    }
    // Con filtro depto/proveedor mostrar más filas; sin filtro mantener tope razonable
    const tope = filtrosActivos ? 500 : 80;
    return list.slice(0, tope);
  }, [
    inventario,
    q,
    departamento,
    proveedorId,
    productosPorProveedor,
    idsConProveedor,
    filtrosActivos,
  ]);

  const guardar = async (p) => {
    const r = await guardarPrecioRutaProducto(supabase, p.id, editVal, { rol: user?.rol });
    if (!r.ok) return alert(r.error);
    setAviso('Precio de ruta actualizado (sin impuestos). Recarga catálogo si no ves el cambio.');
    setEditId('');
    p.precio_ruta = r.precio;
  };

  const limpiarFiltros = () => {
    setQ('');
    setDepartamento('');
    setProveedorId('');
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Precios de ruta</h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
        Precio especial sin impuestos. Filtra por departamento o proveedor para elegir los productos que se
        repartirán por ruta. Solo admin/gerente.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Buscar por nombre o código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <select
          className="select"
          style={{ flex: '0 1 180px', minWidth: 140 }}
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          title="Filtrar por departamento"
        >
          <option value="">Todos los departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {etiquetaDepartamento(d)}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ flex: '0 1 180px', minWidth: 140 }}
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
          title="Filtrar por proveedor"
        >
          <option value="">Todos los proveedores</option>
          <option value="__ninguno__">Sin proveedor</option>
          {proveedores.map((pr) => (
            <option key={pr.id} value={String(pr.id)}>
              {pr.nombre || pr.id}
            </option>
          ))}
        </select>
        {filtrosActivos ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem' }} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
        {lista.length} producto(s)
        {departamento ? ` · ${etiquetaDepartamento(departamento)}` : ''}
        {proveedorId && proveedorId !== '__ninguno__'
          ? ` · ${proveedores.find((p) => String(p.id) === String(proveedorId))?.nombre || 'proveedor'}`
          : proveedorId === '__ninguno__'
            ? ' · sin proveedor'
            : ''}
      </p>

      <table className="consultas-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Depto</th>
            <th>P. ruta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.nombre}</strong>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{p.id}</div>
              </td>
              <td className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {etiquetaDepartamento(p.cat || 'GENERAL')}
              </td>
              <td>
                {editId === p.id ? (
                  <input className="input" type="number" style={{ width: 110 }} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                ) : (
                  precioRutaEspecial(p) != null ? fmtMonto(precioRutaEspecial(p)) : <span className="muted">Sin precio</span>
                )}
              </td>
              <td>
                {editId === p.id ? (
                  <>
                    <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }} onClick={() => void guardar(p)}>Guardar</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditId('')}>×</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }}
                    onClick={() => { setEditId(p.id); setEditVal(String(p.precio_ruta || '')); }}
                  >
                    Editar
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!lista.length ? (
            <tr>
              <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                No hay productos con estos filtros.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function VistaPos({ supabase, user, productoPorId, inventario, setAviso, onNavigate }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState('');
  const [codigo, setCodigo] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [deptoActivo, setDeptoActivo] = useState('');
  const [qDepto, setQDepto] = useState('');
  const [qtyEditId, setQtyEditId] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [metodo, setMetodo] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoCredito, setMontoCredito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esRep = esRolRepartidor(user?.rol);
  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);

  const cargarBase = useCallback(async () => {
    const filtros = { estado: 'en_ruta' };
    if (esRolRepartidor(user?.rol) && user?.id) filtros.vendedorId = user.id;
    const [c, cli] = await Promise.all([
      listarCargasRuta(supabase, filtros),
      listarClientesRuta(supabase),
    ]);
    if (c.aviso || cli.aviso) setAviso(c.aviso || cli.aviso || AVISO_FALTA_VENTA_RUTA);
    setCargas(c.data || []);
    setClientesExt(cli.data || []);
  }, [supabase, setAviso, user?.id, user?.rol]);

  useEffect(() => { void cargarBase(); }, [cargarBase]);

  useEffect(() => {
    if (!cargaId) { setLineas([]); return; }
    void lineasDeCarga(supabase, cargaId).then((r) => setLineas(r.data || []));
  }, [supabase, cargaId]);

  /** Productos del camión enriquecidos con catálogo (foto, depto). */
  const productosCamion = useMemo(() => {
    return (lineas || [])
      .map((lin) => {
        const p = productoPorId.get(String(lin.producto_id)) || {};
        const disp = disponibleEnLineaCarga(lin);
        const precio = Number(lin.precio) > 0 ? Number(lin.precio) : precioRutaEspecial(p);
        return {
          id: String(lin.producto_id),
          nombre: lin.producto_nombre || p.nombre || lin.producto_id,
          cat: p.cat || 'GENERAL',
          foto_url: p.foto_url || p.foto || null,
          precio: Number(precio) || 0,
          disponible: disp,
          linea: lin,
        };
      })
      .filter((p) => p.disponible > 0 && p.precio > 0);
  }, [lineas, productoPorId]);

  const departamentosMenu = useMemo(() => {
    const counts = new Map();
    for (const p of productosCamion) {
      const cat = normalizarDepartamento(p.cat) || 'GENERAL';
      // Agrupa CIGARRO_ELECTRONICO bajo ELECTRONICOS en el menú
      const key = cat === 'CIGARRO_ELECTRONICO' ? 'ELECTRONICOS' : cat;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const preferidos = DEPARTAMENTOS_CEDIS_UI.filter((d) => counts.has(d));
    const otros = [...counts.keys()]
      .filter((d) => !DEPARTAMENTOS_CEDIS_UI.includes(d))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const ids = [...preferidos, ...otros];
    if (!ids.length) return [{ id: '', label: 'Sin productos', count: 0 }];
    return ids.map((id) => ({
      id,
      label: etiquetaDepartamento(id),
      count: counts.get(id) || 0,
    }));
  }, [productosCamion]);

  useEffect(() => {
    if (!departamentosMenu.length) return;
    if (!deptoActivo || !departamentosMenu.some((d) => d.id === deptoActivo)) {
      setDeptoActivo(departamentosMenu[0].id);
    }
  }, [departamentosMenu, deptoActivo]);

  const productosCatalogo = useMemo(() => {
    const t = qDepto.trim();
    let list = productosCamion;
    if (deptoActivo) {
      list = list.filter((p) => departamentoFiltroCoincideCedis(p.cat, deptoActivo));
    }
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t) || String(p.id).includes(t));
    return list;
  }, [productosCamion, deptoActivo, qDepto]);

  const qtyEnCarrito = useCallback((productoId) => {
    const it = carrito.find((x) => String(x.productoId) === String(productoId));
    return it ? Number(it.cantidad) || 0 : 0;
  }, [carrito]);

  const agregarProducto = (prod, qtyAdd = 1) => {
    if (!cargaId) return alert('Elige una carga.');
    const add = Math.max(1, Math.floor(Number(qtyAdd) || 1));
    const enCarrito = qtyEnCarrito(prod.id);
    const max = Number(prod.disponible) || 0;
    if (enCarrito + add > max) {
      return alert(`En camión solo hay ${max} de ${prod.nombre}.`);
    }
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(prod.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + add };
        return next;
      }
      return [...prev, {
        productoId: prod.id,
        nombre: prod.nombre,
        precio: prod.precio,
        cantidad: add,
        foto_url: prod.foto_url || null,
        disponible: prod.disponible,
      }];
    });
  };

  const ajustarQty = (productoId, delta) => {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(productoId));
      if (i < 0) return prev;
      const next = [...prev];
      const max = Number(next[i].disponible) || 0;
      const nueva = (Number(next[i].cantidad) || 0) + delta;
      if (nueva <= 0) {
        setQtyEditId(null);
        return next.filter((_, idx) => idx !== i);
      }
      if (nueva > max) {
        alert(`En camión solo hay ${max}.`);
        return prev;
      }
      next[i] = { ...next[i], cantidad: nueva };
      return next;
    });
  };

  const setQtyManual = (productoId, raw) => {
    const n = Math.floor(Number(raw) || 0);
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(productoId));
      if (i < 0) return prev;
      const max = Number(prev[i].disponible) || 0;
      if (n <= 0) return prev.filter((_, idx) => idx !== i);
      if (n > max) {
        alert(`En camión solo hay ${max}.`);
        return prev;
      }
      const next = [...prev];
      next[i] = { ...next[i], cantidad: n };
      return next;
    });
  };

  const scanAgregar = (codigoIn) => {
    if (!cargaId) return alert('Elige una carga.');
    const raw = String(codigoIn ?? codigo ?? '').trim();
    if (!raw) return;
    const { producto } = buscarProductoInventario(inventario, raw);
    const pid = producto?.id || raw;
    const prod = productosCamion.find((p) => String(p.id) === String(pid));
    if (!prod) return alert('Ese producto no está disponible en la carga del camión.');
    agregarProducto(prod, 1);
    setCodigo('');
  };

  const total = carrito.reduce((s, a) => s + a.precio * a.cantidad, 0);

  const abrirCobro = () => {
    if (!cargaId) return alert('Elige una carga.');
    if (!carrito.length) return alert('Carrito vacío.');
    setMetodo('efectivo');
    setMontoEfectivo(String(total.toFixed(2)));
    setMontoCredito('0');
    setMostrarCobro(true);
  };

  const setEfectivoMixto = (raw) => {
    setMontoEfectivo(raw);
    const efe = Math.max(0, Number(raw) || 0);
    const resto = Math.max(0, Math.round((total - efe) * 100) / 100);
    setMontoCredito(String(resto.toFixed(2)));
  };

  const cobrar = async () => {
    if (!cargaId) return alert('Elige carga.');
    if (!clienteKey) return alert('Elige la tienda (o cliente) a la que traspasarás la venta.');
    if (!carrito.length) return alert('Carrito vacío.');
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const dest = destinos.find((d) => d.tipo === tipo && String(d.id) === id);
    let montoEfe = 0;
    let montoCre = 0;
    if (metodo === 'efectivo') {
      montoEfe = total;
    } else if (metodo === 'credito') {
      montoCre = total;
    } else {
      montoEfe = Math.round((Number(montoEfectivo) || 0) * 100) / 100;
      montoCre = Math.round((Number(montoCredito) || 0) * 100) / 100;
      if (Math.abs(montoEfe + montoCre - total) > 0.02) {
        return alert(`Efectivo + crédito debe sumar ${fmtMonto(total)}.`);
      }
    }
    const labelMetodo = metodo === 'mixto'
      ? `MIXTO (efe ${fmtMonto(montoEfe)} + créd ${fmtMonto(montoCre)})`
      : metodo.toUpperCase();
    if (!confirm(`¿Cerrar venta ${fmtMonto(total)} · ${labelMetodo}\nDestino: ${dest?.nombre || id}?`)) return;

    setGuardando(true);
    const r = await registrarVentaRuta(supabase, {
      cargaId,
      clienteTipo: tipo,
      clienteId: id,
      clienteNombre: dest?.nombre || id,
      metodoPago: metodo,
      articulos: carrito,
      vendedorNombre: user?.nombre,
      vendedorId: user?.id,
      montoEfectivo: montoEfe,
      montoCredito: montoCre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.avisos?.length) setAviso(r.avisos.join(' · '));
    const extra = [
      r.cuenta === 'mixto'
        ? `Mixto · efe ${fmtMonto(r.montoEfectivo)} · créd ${fmtMonto(r.montoCredito)}`
        : r.cuenta === 'credito'
          ? 'Crédito pendiente (cajero paga con PIN)'
          : 'Efectivo en tránsito',
      r.compraId ? 'Pedido en Compras listo para recibir' : null,
    ].filter(Boolean).join(' · ');
    alert(`Venta ${r.venta?.folio || ''} OK.\n${extra}`);
    setCarrito([]);
    setMostrarCobro(false);
    setQtyEditId(null);
    const lin = await lineasDeCarga(supabase, cargaId);
    setLineas(lin.data || []);
    // Ir a Productos → Traspasos (preselecciona tienda destino si es sucursal)
    onNavigate?.('Productos', {
      vista: 'traspaso',
      destinoTraspaso: tipo === 'sucursal' ? id : null,
    });
  };

  return (
    <div className="ruta-pos">
      <div className="ruta-pos-toolbar card">
        <div>
          <h3 style={{ margin: 0, color: COLOR }}>POS venta en ruta</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
            Departamentos a la izquierda · carrito a la derecha. Un folio por tienda.
            {esRep ? ' Solo ves las cargas asignadas a ti.' : ''}
          </p>
        </div>
        <div className="ruta-pos-toolbar-fields">
          <label>
            Carga
            <select className="input" value={cargaId} onChange={(e) => { setCargaId(e.target.value); setCarrito([]); }}>
              <option value="">—</option>
              {cargas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.folio}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tienda / cliente (traspaso)
            <select className="input" value={clienteKey} onChange={(e) => setClienteKey(e.target.value)}>
              <option value="">— Elige destino —</option>
              {destinos.map((d) => (
                <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!cargaId ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Elige una carga en ruta para ver el catálogo del camión.</p></div>
      ) : (
        <div className="ruta-pos-layout">
          <nav className="ruta-pos-deptos card" aria-label="Departamentos">
            <h4 className="ruta-pos-deptos-title">Departamentos</h4>
            {departamentosMenu.map((d) => (
              <button
                key={d.id || 'vacio'}
                type="button"
                className={`ruta-pos-depto-btn${deptoActivo === d.id ? ' activo' : ''}`}
                onClick={() => { setDeptoActivo(d.id); setQDepto(''); }}
                disabled={!d.id}
              >
                <span>{d.label}</span>
                <span className="ruta-pos-depto-count">{d.count}</span>
              </button>
            ))}
          </nav>

          <section className="ruta-pos-catalogo card">
            <div className="ruta-pos-catalogo-head">
              <strong>{etiquetaDepartamento(deptoActivo) || 'Catálogo'}</strong>
              <div className="ruta-pos-buscar">
                <CampoCodigo
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && scanAgregar()}
                  onEscanear={(c) => scanAgregar(c)}
                  beepAlEnter
                  placeholder="Escanear o buscar…"
                  tituloCamara="Escanear producto del camión"
                />
                <button type="button" className="btn btn-primary" onClick={() => scanAgregar()}>+</button>
              </div>
              <input
                className="input"
                value={qDepto}
                onChange={(e) => setQDepto(e.target.value)}
                placeholder="Filtrar en departamento…"
                aria-label="Filtrar departamento"
              />
            </div>
            {productosCatalogo.length === 0 ? (
              <div className="ruta-pos-vacio">
                <Icon name="package" size={36} />
                <p className="muted">No hay productos disponibles en este departamento.</p>
              </div>
            ) : (
              <div className="ventas-favoritos-grid ruta-pos-grid">
                {productosCatalogo.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ventas-favorito-btn"
                    title={`${p.nombre} · disp ${p.disponible}`}
                    onClick={() => agregarProducto(p, 1)}
                  >
                    <ProductoThumb producto={p} size="full" className="ventas-favorito-thumb" />
                    <div className="ventas-favorito-precio">{fmtMonto(p.precio)}</div>
                    <div className="ventas-favorito-nombre">{p.nombre}</div>
                    <div className="muted" style={{ fontSize: '0.68rem' }}>
                      Camión: {p.disponible}{qtyEnCarrito(p.id) ? ` · carrito ${qtyEnCarrito(p.id)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="ruta-pos-ticket card">
            <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Carrito</h3>
            <div className="ruta-pos-ticket-lineas">
              {carrito.length === 0 && <p className="muted">Toca un producto para agregarlo</p>}
              {carrito.map((it) => {
                const editando = qtyEditId === it.productoId;
                return (
                  <div key={it.productoId} className="ventas-carrito-linea">
                    <ProductoThumb producto={it} size={40} />
                    <div className="ventas-carrito-info">
                      <span className="ventas-carrito-nombre">{it.nombre}</span>
                      <button
                        type="button"
                        className="btn btn-ghost ventas-carrito-quitar"
                        onClick={() => setCarrito((p) => p.filter((x) => x.productoId !== it.productoId))}
                      >
                        Quitar
                      </button>
                    </div>
                    <div className={`ventas-qty${editando ? ' ventas-qty--open' : ''}`}>
                      {editando ? (
                        <>
                          <button type="button" className="ventas-qty__btn" aria-label="Quitar uno" onClick={() => ajustarQty(it.productoId, -1)}>−</button>
                          <input
                            className="ventas-qty__valor ventas-qty__valor--activo"
                            style={{ width: 42, textAlign: 'center', border: 'none', background: 'transparent' }}
                            value={it.cantidad}
                            onChange={(e) => setQtyManual(it.productoId, e.target.value)}
                            onBlur={() => setQtyEditId(null)}
                            inputMode="numeric"
                          />
                          <button type="button" className="ventas-qty__btn" aria-label="Agregar uno" onClick={() => ajustarQty(it.productoId, 1)}>+</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ventas-qty__valor"
                          onClick={() => setQtyEditId(it.productoId)}
                          title="Cambiar cantidad"
                        >
                          {it.cantidad}
                        </button>
                      )}
                    </div>
                    <b className="ventas-carrito-importe">{fmtMonto(it.precio * it.cantidad)}</b>
                  </div>
                );
              })}
            </div>
            <div className="ruta-pos-total">TOTAL {fmtMonto(total)}</div>
            <button
              type="button"
              className="btn btn-success"
              style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
              disabled={!carrito.length}
              onClick={abrirCobro}
            >
              Pagar {fmtMonto(total)}
            </button>
          </aside>
        </div>
      )}

      {mostrarCobro && (
        <div
          className="prod-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !guardando && setMostrarCobro(false)}
        >
          <div className="ventas-cobro-modal" onClick={(e) => e.stopPropagation()}>
            <header className="prod-modal-header">
              <button type="button" className="prod-modal-close" aria-label="Cerrar" disabled={guardando} onClick={() => setMostrarCobro(false)}>
                <Icon name="x" size={18} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Cobrar venta en ruta</h2>
              <span style={{ width: 36 }} />
            </header>
            <div className="ventas-cobro-body">
              <div className="ventas-cobro-total">
                TOTAL <strong>{fmtMonto(total)}</strong>
              </div>

              <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                Tienda a la que se traspasará la venta
              </label>
              <select
                className="select"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                value={clienteKey}
                onChange={(e) => setClienteKey(e.target.value)}
                disabled={guardando}
              >
                <option value="">— Elige destino —</option>
                {destinos.map((d) => (
                  <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
                ))}
              </select>

              <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                Forma de pago
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {[
                  { id: 'efectivo', label: 'Efectivo' },
                  { id: 'credito', label: 'Crédito' },
                  { id: 'mixto', label: 'Mixto' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={metodo === m.id ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ flex: '1 1 calc(33% - 0.4rem)', minWidth: 90 }}
                    onClick={() => {
                      setMetodo(m.id);
                      if (m.id === 'efectivo') {
                        setMontoEfectivo(String(total.toFixed(2)));
                        setMontoCredito('0');
                      } else if (m.id === 'credito') {
                        setMontoEfectivo('0');
                        setMontoCredito(String(total.toFixed(2)));
                      } else {
                        setMontoEfectivo('');
                        setMontoCredito(String(total.toFixed(2)));
                      }
                    }}
                    disabled={guardando}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {metodo === 'mixto' && (
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
                  <label className="muted" style={{ fontSize: '0.8rem' }}>
                    Efectivo
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoEfectivo}
                      onChange={(e) => setEfectivoMixto(e.target.value)}
                      disabled={guardando}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </label>
                  <label className="muted" style={{ fontSize: '0.8rem' }}>
                    Crédito
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoCredito}
                      onChange={(e) => setMontoCredito(e.target.value)}
                      disabled={guardando}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="btn btn-success"
                style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
                disabled={guardando || !clienteKey}
                onClick={() => void cobrar()}
              >
                {guardando ? 'Guardando…' : `Confirmar · ${fmtMonto(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VistaClientes({ supabase, setAviso }) {
  const [list, setList] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');

  const cargar = useCallback(async () => {
    const r = await listarClientesRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setList(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    const r = await guardarClienteRuta(supabase, { nombre, telefono: tel });
    if (!r.ok) return alert(r.error);
    setNombre('');
    setTel('');
    await cargar();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Clientes externos</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="input" placeholder="Tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void guardar()}>Guardar</button>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {list.map((c) => <li key={c.id}>{c.nombre} {c.telefono ? `· ${c.telefono}` : ''}</li>)}
      </ul>
    </div>
  );
}

function VistaConsultas({ supabase, setAviso }) {
  const [tab, setTab] = useState('ventas');
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setCargando(true);
      try {
        if (tab === 'cargas') {
          const r = await listarCargasRuta(supabase, { limit: 80 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        } else {
          const r = await listarVentasRuta(supabase, { limit: 100 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, tab, setAviso]);

  const fmtFecha = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  };

  const badgeEstado = (estado) => {
    const e = String(estado || '').toLowerCase();
    const color = e === 'en_ruta' ? '#0f766e' : e === 'liquidada' ? '#64748b' : 'var(--brand-blue)';
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.1rem 0.45rem',
          borderRadius: 4,
          fontSize: '0.72rem',
          fontWeight: 600,
          background: `${color}18`,
          color,
        }}
      >
        {estado || '—'}
      </span>
    );
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Consultas</h3>
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[
          { id: 'ventas', label: 'Ventas' },
          { id: 'cargas', label: 'Cargas' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : !rows.length ? (
        <p className="muted">Sin registros.</p>
      ) : tab === 'cargas' ? (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Repartidor</th>
                <th>Estado</th>
                <th>Liquidada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.folio || '—'}</strong></td>
                  <td>{c.fecha || fmtFecha(c.created_at)}</td>
                  <td>{c.vendedor_nombre || '—'}</td>
                  <td>{badgeEstado(c.estado)}</td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>{c.liquidada_at ? fmtFecha(c.liquidada_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th>Total</th>
                <th>Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.folio || '—'}</strong></td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>{fmtFecha(v.created_at)}</td>
                  <td>
                    {v.cliente_nombre || v.cliente_id || '—'}
                    {v.cliente_tipo ? <span className="muted" style={{ fontSize: '0.72rem' }}> · {v.cliente_tipo}</span> : null}
                  </td>
                  <td>{v.metodo_pago || '—'}{v.estado_credito ? ` · ${v.estado_credito}` : ''}</td>
                  <td>{fmtMonto(v.total)}</td>
                  <td className="muted">{v.vendedor_nombre || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
