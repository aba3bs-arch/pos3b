import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import {
  AVISO_FALTA_VENTA_RUTA,
  NOMBRE_ALMACEN_RUTA,
  crearCargaRuta,
  disponibleEnLineaCarga,
  guardarClienteRuta,
  lineasDeCarga,
  listarCargasRuta,
  listarClientesRuta,
  listarDestinosVentaRuta,
  listarLiquidacionesRuta,
  listarStockCedisRuta,
  listarVentasRuta,
  liquidarCargaRuta,
  moverStockCedisRuta,
  registrarVentaRuta,
  stockProductoCedisRuta,
} from '../lib/ventaEnRuta.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { confirmarSiCantidadFueraDeEmpaque } from '../lib/empaqueSoda.js';

const COLOR = '#0f766e';

const SUBS = [
  { id: 'almacen', label: NOMBRE_ALMACEN_RUTA, desc: 'Existencias aisladas de MAIN', icon: '📦' },
  { id: 'carga', label: 'Carga de camión', desc: 'Sacar producto de CEDIS Ruta al camión', icon: '🚚' },
  { id: 'venta', label: 'Venta en ruta', desc: 'Venta directa (efectivo / crédito)', icon: '🧾' },
  { id: 'liquidacion', label: 'Liquidación', desc: 'Cuadre y sobrante de regreso', icon: '🧮' },
  { id: 'clientes', label: 'Clientes de ruta', desc: 'Clientes externos (no propios)', icon: '👥' },
  { id: 'consultas', label: 'Consultas', desc: 'Cargas, ventas y liquidaciones', icon: '🔍' },
];

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

export default function VentaEnRuta({ supabase, user, inventario = [] }) {
  const [vista, setVista] = useState('hub');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);

  const productoPorId = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

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
          {NOMBRE_ALMACEN_RUTA}: almacén propio · no usa MAIN ni traspasos · venta directa
        </p>
      </div>

      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', fontSize: '0.85rem' }}>
          {aviso}
        </div>
      )}

      {vista === 'hub' && (
        <SubcomandosHub
          color={COLOR}
          items={SUBS.map((s) => ({
            id: s.id,
            label: s.label,
            desc: s.desc,
            ayuda: s.desc,
            icon: 'truck',
            color: COLOR,
          }))}
          onSelect={ir}
        />
      )}

      {vista === 'almacen' && (
        <VistaAlmacen
          supabase={supabase}
          user={user}
          productoPorId={productoPorId}
          inventario={inventario}
          setAviso={setAviso}
          loading={loading}
          setLoading={setLoading}
        />
      )}
      {vista === 'carga' && (
        <VistaCarga
          supabase={supabase}
          user={user}
          productoPorId={productoPorId}
          inventario={inventario}
          setAviso={setAviso}
        />
      )}
      {vista === 'venta' && (
        <VistaVenta
          supabase={supabase}
          user={user}
          productoPorId={productoPorId}
          setAviso={setAviso}
        />
      )}
      {vista === 'liquidacion' && <VistaLiquidacion supabase={supabase} user={user} setAviso={setAviso} />}
      {vista === 'clientes' && <VistaClientes supabase={supabase} setAviso={setAviso} />}
      {vista === 'consultas' && <VistaConsultas supabase={supabase} setAviso={setAviso} />}
    </div>
  );
}

function VistaAlmacen({ supabase, user, productoPorId, inventario, setAviso, loading, setLoading }) {
  const [stock, setStock] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('');
  const [tipo, setTipo] = useState('ingreso');

  const cargar = useCallback(async () => {
    setLoading(true);
    const r = await listarStockCedisRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setStock(r.data || []);
    setLoading(false);
  }, [supabase, setAviso, setLoading]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aplicar = async () => {
    const { producto } = buscarProductoInventario(inventario, codigo);
    if (!producto) return alert('Producto no encontrado.');
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida.');
    if (tipo === 'ingreso' && !confirmarSiCantidadFueraDeEmpaque(producto, n)) return;
    setLoading(true);
    const r = await moverStockCedisRuta(supabase, {
      productoId: producto.id,
      tipo,
      cantidad: n,
      nota: `${tipo} manual ${NOMBRE_ALMACEN_RUTA}`,
      usuarioNombre: user?.nombre,
    });
    setLoading(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    setCodigo('');
    setQty('');
    await cargar();
    alert(`OK · ${producto.nombre || producto.id}: ${r.antes} → ${r.despues}`);
  };

  const filas = stock
    .filter((s) => Number(s.cantidad) > 0)
    .map((s) => {
      const p = productoPorId.get(String(s.producto_id));
      return {
        ...s,
        nombre: p?.nombre || s.producto_id,
        precio: Number(p?.precio) || 0,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>{NOMBRE_ALMACEN_RUTA}</h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
        Inicia vacío. Los ingresos aquí no tocan MAIN ni el piso de tiendas.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem' }}>
          Tipo
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="ingreso">Ingreso</option>
            <option value="retiro">Retiro</option>
            <option value="ajuste">Ajuste (dejar en…)</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', flex: 1, minWidth: 140 }}>
          Código / producto
          <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código o nombre" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem' }}>
          Cantidad
          <input className="input" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 100 }} />
        </label>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={aplicar}>
          Aplicar
        </button>
        <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => void cargar()}>
          ↻
        </button>
      </div>
      {filas.length === 0 ? (
        <p className="muted">Sin existencias. El almacén está vacío.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Existencia</th>
              <th>P. venta</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.nombre}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>{f.producto_id}</div>
                </td>
                <td style={{ fontWeight: 700 }}>{fmtQty(f.cantidad)}</td>
                <td>{fmtMonto(f.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VistaCarga({ supabase, user, productoPorId, inventario, setAviso }) {
  const [lineas, setLineas] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('');
  const [vendedor, setVendedor] = useState(user?.nombre || '');
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    const { producto } = buscarProductoInventario(inventario, codigo);
    if (!producto) return alert('Producto no encontrado.');
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida.');
    if (!confirmarSiCantidadFueraDeEmpaque(producto, n)) return;
    const disp = await stockProductoCedisRuta(supabase, producto.id);
    if (disp < n) return alert(`En ${NOMBRE_ALMACEN_RUTA} solo hay ${disp}.`);
    setLineas((prev) => {
      const i = prev.findIndex((l) => String(l.productoId) === String(producto.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + n };
        return next;
      }
      return [...prev, {
        productoId: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio) || 0,
        cantidad: n,
      }];
    });
    setCodigo('');
    setQty('');
  };

  const confirmar = async () => {
    if (!lineas.length) return alert('Agrega productos.');
    if (!confirm(`¿Crear carga con ${lineas.length} producto(s) para ${vendedor || 'vendedor'}?\nSe descontará de ${NOMBRE_ALMACEN_RUTA}.`)) return;
    setGuardando(true);
    const r = await crearCargaRuta(supabase, {
      vendedorNombre: vendedor,
      lineas,
      usuarioNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso || r.soloLocal) setAviso(r.aviso || AVISO_FALTA_VENTA_RUTA);
    alert(`Carga creada: ${r.carga?.folio || 'OK'}`);
    setLineas([]);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Carga de camión</h3>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        Vendedor / ruta
        <input className="input" value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código producto" />
        <input className="input" style={{ width: 90 }} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant." />
        <button type="button" className="btn btn-ghost" onClick={() => void agregar()}>+ Agregar</button>
      </div>
      {lineas.length === 0 ? (
        <p className="muted">Sin líneas.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.productoId}>
                <td>{l.nombre}</td>
                <td style={{ fontWeight: 700 }}>{l.cantidad}</td>
                <td>
                  <button type="button" className="btn btn-ghost" onClick={() => setLineas((p) => p.filter((x) => x.productoId !== l.productoId))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={guardando || !lineas.length} onClick={() => void confirmar()}>
        {guardando ? 'Guardando…' : 'Confirmar carga'}
      </button>
    </div>
  );
}

function VistaVenta({ supabase, user, productoPorId, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineasCarga, setLineasCarga] = useState([]);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [cart, setCart] = useState([]);
  const [prodId, setProdId] = useState('');
  const [qty, setQty] = useState('1');
  const [guardando, setGuardando] = useState(false);

  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);

  const refresh = useCallback(async () => {
    const [c, cli] = await Promise.all([
      listarCargasRuta(supabase, { estado: 'en_ruta', limit: 40 }),
      listarClientesRuta(supabase),
    ]);
    if (c.aviso || cli.aviso) setAviso(c.aviso || cli.aviso);
    setCargas(c.data || []);
    setClientesExt(cli.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cargaId) {
      setLineasCarga([]);
      return;
    }
    void lineasDeCarga(supabase, cargaId).then((r) => setLineasCarga(r.data || []));
  }, [supabase, cargaId]);

  const disponibles = lineasCarga.filter((l) => disponibleEnLineaCarga(l) > 0);

  const agregar = () => {
    const lin = disponibles.find((l) => String(l.producto_id) === String(prodId));
    if (!lin) return alert('Elige un producto de la carga.');
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida.');
    const disp = disponibleEnLineaCarga(lin);
    const ya = cart.find((c) => String(c.productoId) === String(prodId));
    const pedidas = (ya?.cantidad || 0) + n;
    if (pedidas > disp) return alert(`En camión solo hay ${disp}.`);
    const p = productoPorId.get(String(prodId));
    setCart((prev) => {
      if (ya) {
        return prev.map((c) => (String(c.productoId) === String(prodId) ? { ...c, cantidad: c.cantidad + n } : c));
      }
      return [...prev, {
        productoId: lin.producto_id,
        nombre: lin.producto_nombre || p?.nombre || lin.producto_id,
        precio: Number(lin.precio) || Number(p?.precio) || 0,
        cantidad: n,
      }];
    });
    setQty('1');
  };

  const total = cart.reduce((s, c) => s + c.precio * c.cantidad, 0);

  const cobrar = async () => {
    if (!cargaId) return alert('Elige una carga.');
    if (!clienteKey) return alert('Elige sucursal o cliente.');
    if (!cart.length) return alert('Carrito vacío.');
    const dest = destinos.find((d) => `${d.tipo}:${d.id}` === clienteKey);
    if (!dest) return alert('Destino inválido.');
    if (!confirm(`¿Registrar venta ${metodo} a ${dest.nombre} por ${fmtMonto(total)}?`)) return;
    setGuardando(true);
    const r = await registrarVentaRuta(supabase, {
      cargaId,
      clienteTipo: dest.tipo,
      clienteId: dest.id,
      clienteNombre: dest.nombre,
      metodoPago: metodo,
      articulos: cart,
      vendedorNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso || r.soloLocal) setAviso(r.aviso || AVISO_FALTA_VENTA_RUTA);
    alert(`Venta ${r.venta?.folio || ''} registrada.`);
    setCart([]);
    const lin = await lineasDeCarga(supabase, cargaId);
    setLineasCarga(lin.data || []);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Venta en ruta</h3>
      <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Carga en ruta
          <select className="input" value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
            <option value="">— Elige —</option>
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>{c.folio} · {c.vendedor_nombre || '—'}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Destino
          <select className="input" value={clienteKey} onChange={(e) => setClienteKey(e.target.value)}>
            <option value="">— Elige —</option>
            <optgroup label="Sucursales propias">
              {destinos.filter((d) => d.propio).map((d) => (
                <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
              ))}
            </optgroup>
            <optgroup label="Clientes externos">
              {destinos.filter((d) => !d.propio).map((d) => (
                <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Pago
          <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="credito">Crédito</option>
          </select>
        </label>
      </div>

      {cargaId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
          <select className="input" style={{ flex: 1, minWidth: 160 }} value={prodId} onChange={(e) => setProdId(e.target.value)}>
            <option value="">Producto en camión…</option>
            {disponibles.map((l) => (
              <option key={l.producto_id} value={l.producto_id}>
                {l.producto_nombre || l.producto_id} ({fmtQty(disponibleEnLineaCarga(l))})
              </option>
            ))}
          </select>
          <input className="input" style={{ width: 80 }} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button type="button" className="btn btn-ghost" onClick={agregar}>+ </button>
        </div>
      )}

      {cart.length > 0 && (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Importe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cart.map((c) => (
              <tr key={c.productoId}>
                <td>{c.nombre}</td>
                <td>{c.cantidad}</td>
                <td>{fmtMonto(c.precio * c.cantidad)}</td>
                <td>
                  <button type="button" className="btn btn-ghost" onClick={() => setCart((p) => p.filter((x) => x.productoId !== c.productoId))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
        <strong>Total {fmtMonto(total)}</strong>
        <button type="button" className="btn btn-primary" disabled={guardando || !cart.length} onClick={() => void cobrar()}>
          {guardando ? '…' : 'Registrar venta'}
        </button>
      </div>
    </div>
  );
}

function VistaLiquidacion({ supabase, user, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [ventas, setVentas] = useState([]);
  const [efectivo, setEfectivo] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void listarCargasRuta(supabase, { estado: 'en_ruta' }).then((r) => {
      if (r.aviso) setAviso(r.aviso);
      setCargas(r.data || []);
    });
  }, [supabase, setAviso]);

  useEffect(() => {
    if (!cargaId) {
      setVentas([]);
      return;
    }
    void listarVentasRuta(supabase, { cargaId }).then((r) => setVentas(r.data || []));
  }, [supabase, cargaId]);

  const ventaEfectivo = ventas.filter((v) => v.metodo_pago === 'efectivo').reduce((s, v) => s + (Number(v.total) || 0), 0);
  const ventaCredito = ventas.filter((v) => v.metodo_pago === 'credito').reduce((s, v) => s + (Number(v.total) || 0), 0);

  const cerrar = async () => {
    if (!cargaId) return;
    if (!confirm('¿Liquidar carga? El sobrante del camión regresará a CEDIS Ruta.')) return;
    setGuardando(true);
    const r = await liquidarCargaRuta(supabase, {
      cargaId,
      efectivoEntregado: Number(efectivo) || 0,
      notas,
      usuarioNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(`Liquidación OK · Dif. efectivo ${fmtMonto(r.liquidacion?.diferencia)}`);
    setCargaId('');
    setEfectivo('');
    setNotas('');
    const c = await listarCargasRuta(supabase, { estado: 'en_ruta' });
    setCargas(c.data || []);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Liquidación de ruta</h3>
      <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.75rem' }}>
        Carga
        <select className="input" value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
          <option value="">— Elige —</option>
          {cargas.map((c) => (
            <option key={c.id} value={c.id}>{c.folio} · {c.vendedor_nombre}</option>
          ))}
        </select>
      </label>
      {cargaId && (
        <>
          <div className="grid-2" style={{ gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            <div>Ventas efectivo: <strong>{fmtMonto(ventaEfectivo)}</strong></div>
            <div>Ventas crédito: <strong>{fmtMonto(ventaCredito)}</strong></div>
            <div>Tickets: <strong>{ventas.length}</strong></div>
          </div>
          <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>
            Efectivo entregado
            <input className="input" type="number" step="0.01" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.75rem' }}>
            Notas
            <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void cerrar()}>
            {guardando ? '…' : 'Cerrar liquidación'}
          </button>
        </>
      )}
    </div>
  );
}

function VistaClientes({ supabase, setAviso }) {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [credito, setCredito] = useState('0');

  const cargar = useCallback(async () => {
    const r = await listarClientesRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setLista(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    const r = await guardarClienteRuta(supabase, {
      nombre,
      direccion,
      telefono,
      credito_limite: Number(credito) || 0,
    });
    if (!r.ok) return alert(r.error);
    setNombre('');
    setDireccion('');
    setTelefono('');
    setCredito('0');
    await cargar();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Clientes de ruta (externos)</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Las sucursales propias ya aparecen en Venta. Aquí solo clientes no propios.
      </p>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '0.75rem' }}>
        <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="input" placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <input className="input" placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <input className="input" type="number" placeholder="Límite crédito" value={credito} onChange={(e) => setCredito(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={!nombre.trim()}>
        Guardar cliente
      </button>
      <ul style={{ marginTop: '1rem', paddingLeft: '1.1rem' }}>
        {lista.map((c) => (
          <li key={c.id} style={{ marginBottom: '0.35rem' }}>
            <strong>{c.nombre}</strong>
            {c.activo === false ? ' (inactivo)' : ''}
            <span className="muted"> · crédito {fmtMonto(c.credito_limite)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VistaConsultas({ supabase, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [liqs, setLiqs] = useState([]);

  useEffect(() => {
    void (async () => {
      const [c, v, l] = await Promise.all([
        listarCargasRuta(supabase, { limit: 50 }),
        listarVentasRuta(supabase, { limit: 80 }),
        listarLiquidacionesRuta(supabase, { limit: 40 }),
      ]);
      if (c.aviso || v.aviso || l.aviso) setAviso(c.aviso || v.aviso || l.aviso);
      setCargas(c.data || []);
      setVentas(v.data || []);
      setLiqs(l.data || []);
    })();
  }, [supabase, setAviso]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: COLOR }}>Cargas</h4>
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Vendedor</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {cargas.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 700 }}>{c.folio}</td>
                <td>{c.vendedor_nombre}</td>
                <td>{c.estado}</td>
                <td>{String(c.fecha || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: COLOR }}>Ventas</h4>
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Pago</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 700 }}>{v.folio}</td>
                <td>{v.cliente_nombre}{v.cliente_tipo === 'externo' ? ' · ext' : ''}</td>
                <td>{v.metodo_pago}</td>
                <td>{fmtMonto(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem', color: COLOR }}>Liquidaciones</h4>
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Carga</th>
              <th>Efectivo</th>
              <th>Crédito</th>
              <th>Entregado</th>
              <th>Dif.</th>
            </tr>
          </thead>
          <tbody>
            {liqs.map((l) => (
              <tr key={l.id}>
                <td style={{ fontSize: '0.75rem' }}>{String(l.carga_id).slice(0, 8)}</td>
                <td>{fmtMonto(l.venta_efectivo)}</td>
                <td>{fmtMonto(l.venta_credito)}</td>
                <td>{fmtMonto(l.efectivo_entregado)}</td>
                <td>{fmtMonto(l.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
