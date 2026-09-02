import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
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
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';
import { esRolRepartidor } from '../lib/roles.js';

const COLOR = '#0f766e';

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

export default function VentaEnRuta({ supabase, user, inventario = [] }) {
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
        <VistaPos supabase={supabase} user={user} productoPorId={productoPorId} inventario={inventario} setAviso={setAviso} />
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

function VistaPos({ supabase, user, productoPorId, inventario, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [codigo, setCodigo] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const esRep = esRolRepartidor(user?.rol);
  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);

  const cargarBase = useCallback(async () => {
    const filtros = { estado: 'en_ruta' };
    // El repartidor solo ve las cargas asignadas a él.
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

  const scanAgregar = () => {
    if (!cargaId) return alert('Elige una carga.');
    const { producto } = buscarProductoInventario(inventario, codigo);
    const pid = producto?.id || String(codigo || '').trim();
    const lin = lineas.find((l) => String(l.producto_id) === String(pid));
    if (!lin) return alert('Ese producto no está en la carga del camión.');
    const disp = disponibleEnLineaCarga(lin);
    if (!(disp > 0)) return alert('Sin disponible en camión.');
    const p = productoPorId.get(String(lin.producto_id));
    const precio = Number(lin.precio) > 0 ? Number(lin.precio) : precioRutaEspecial(p);
    if (!(precio > 0)) return alert('Sin precio de ruta.');
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(lin.producto_id));
      if (i >= 0) {
        const next = [...prev];
        if (next[i].cantidad + 1 > disp) { alert(`Solo hay ${disp}`); return prev; }
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [...prev, { productoId: lin.producto_id, nombre: lin.producto_nombre || lin.producto_id, precio, cantidad: 1 }];
    });
    setCodigo('');
  };

  const total = carrito.reduce((s, a) => s + a.precio * a.cantidad, 0);

  const cobrar = async () => {
    if (!cargaId) return alert('Elige carga.');
    if (!clienteKey) return alert('Elige sucursal o cliente (un folio por destino).');
    if (!carrito.length) return alert('Carrito vacío.');
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const dest = destinos.find((d) => d.tipo === tipo && String(d.id) === id);
    if (!confirm(`¿Cerrar venta ${fmtMonto(total)} en ${metodo.toUpperCase()} a ${dest?.nombre || id}?`)) return;
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
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    const extra = [
      r.cuenta === 'credito' ? 'Crédito pendiente (cajero paga con PIN)' : 'Efectivo en tránsito',
      r.compraId ? 'Pedido en Compras listo para recibir' : null,
    ].filter(Boolean).join(' · ');
    alert(`Venta ${r.venta?.folio || ''} OK.\n${extra}`);
    setCarrito([]);
    const lin = await lineasDeCarga(supabase, cargaId);
    setLineas(lin.data || []);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>POS venta en ruta</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Escanea productos del camión. Un folio por sucursal. Efectivo → tránsito · Crédito → CxC.
        {esRep ? ' Solo ves las cargas asignadas a ti.' : ''}
      </p>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '0.75rem' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Carga
          <select className="input" value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
            <option value="">—</option>
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.folio}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Sucursal / cliente
          <select className="input" value={clienteKey} onChange={(e) => setClienteKey(e.target.value)}>
            <option value="">—</option>
            {destinos.map((d) => (
              <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Pago
          <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="efectivo">Efectivo (tránsito)</option>
            <option value="credito">Crédito (cajero paga)</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Escanear código…"
          onKeyDown={(e) => e.key === 'Enter' && scanAgregar()}
          autoFocus
        />
        <button type="button" className="btn btn-primary" onClick={scanAgregar}>+</button>
      </div>
      {carrito.length === 0 ? <p className="muted">Carrito vacío</p> : (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {carrito.map((a) => (
            <li key={a.productoId}>
              {a.nombre} × {a.cantidad} = {fmtMonto(a.precio * a.cantidad)}{' '}
              <button type="button" className="btn btn-ghost" style={{ padding: '0 0.3rem' }} onClick={() => setCarrito((p) => p.filter((x) => x.productoId !== a.productoId))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} disabled={guardando || !carrito.length} onClick={() => void cobrar()}>
        Cerrar venta {fmtMonto(total)}
      </button>
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
