import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import FormularioCobranzaRuta from '../components/FormularioCobranzaRuta.jsx';
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
  precioCedisRuta,
  registrarVentaRuta,
  stockProductoCedisRuta,
} from '../lib/ventaEnRuta.js';
import {
  ajustarEfectivoRuta,
  listarMovimientosEfectivoRuta,
  puedeAdministrarVentaRuta,
  puedeModificarStockCedisRuta,
  saldoEfectivoRuta,
} from '../lib/rutaCuentas.js';
import { saldosCxcPorCliente } from '../lib/rutaCxc.js';
import {
  justificarCapitalRuta,
  liberarCapitalRuta,
  listarCapitalRuta,
  rechazarCapitalRuta,
  solicitarCapitalRuta,
} from '../lib/rutaCapital.js';
import {
  aplicarConteoLinea,
  generarPlantillaPreinventarioRuta,
  guardarSesionPreinventarioRuta,
  listarSesionesPreinventarioRuta,
  resumenPreinventarioRuta,
} from '../lib/rutaPreinventario.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { confirmarSiCantidadFueraDeEmpaque } from '../lib/empaqueSoda.js';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';

const COLOR = '#0f766e';

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

function etiquetaEstadoCapital(e) {
  if (e === 'pendiente') return 'Pendiente';
  if (e === 'liberado') return 'Liberado · falta ticket';
  if (e === 'justificado') return 'Justificado';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  return e || '—';
}

export default function VentaEnRuta({ supabase, user, inventario = [] }) {
  const [vista, setVista] = useState('hub');
  const [aviso, setAviso] = useState('');
  const esAdmin = puedeAdministrarVentaRuta(user?.rol);
  const puedeSurte = puedeModificarStockCedisRuta(user?.rol);

  const productoPorId = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

  const subs = useMemo(() => {
    const items = [];
    if (puedeSurte) {
      items.push({
        id: 'surte',
        label: 'Surte almacén',
        desc: `Ingresos y ajustes de ${NOMBRE_ALMACEN_RUTA}`,
        icon: 'package',
      });
    }
    items.push({
      id: 'inventario',
      label: puedeSurte ? `Almacén ${NOMBRE_ALMACEN_RUTA}` : 'Inventario (solo lectura)',
      desc: puedeSurte ? 'Existencias del CEDIS Ruta' : 'Consulta existencias · sin modificar',
      icon: 'eye',
    });
    if (puedeSurte) {
      items.push({
        id: 'carga',
        label: 'Carga de camión',
        desc: 'Sacar producto del CEDIS al camión',
        icon: 'truck',
      });
    }
    items.push(
      {
        id: 'venta',
        label: 'Venta en ruta',
        desc: 'POS de ruta · efectivo o crédito',
        icon: 'cart',
      },
      {
        id: 'cobranza',
        label: 'Cobranza',
        desc: 'Cobrar créditos (vendedor de ruta)',
        icon: 'dollar',
      },
      {
        id: 'cuentas',
        label: 'Cuentas',
        desc: esAdmin ? 'Efectivo y crédito · ajustes solo admin' : 'Consulta saldos · sin modificar',
        icon: 'chart',
      },
      {
        id: 'capital',
        label: 'Capital / gastos',
        desc: esAdmin ? 'Liberar solicitudes de capital' : 'Solicitar capital y subir foto del ticket',
        icon: 'file',
      },
      {
        id: 'preinventario',
        label: 'Preinventario',
        desc: 'Plantilla del catálogo CEDIS Ruta',
        icon: 'package',
      },
    );
    if (esAdmin) {
      items.push(
        { id: 'clientes', label: 'Clientes de ruta', desc: 'Clientes externos', icon: 'users' },
        { id: 'liquidacion', label: 'Liquidación', desc: 'Cuadre de carga y sobrante', icon: 'check' },
        { id: 'consultas', label: 'Consultas', desc: 'Cargas, ventas y liquidaciones', icon: 'search' },
      );
    }
    return items;
  }, [puedeSurte, esAdmin]);

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
          Admin surte {NOMBRE_ALMACEN_RUTA} → carga → venta tipo POS. Ventas a cuenta efectivo o crédito.
          El vendedor no modifica cuentas ni inventario.
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
          subtitulo={esAdmin ? 'Panel administración / CEDIS' : 'Panel vendedor de ruta'}
          items={subs.map((s) => ({
            id: s.id,
            label: s.label,
            desc: s.desc,
            ayuda: s.desc,
            icon: s.icon || 'truck',
            color: COLOR,
          }))}
          onSelect={ir}
        />
      )}

      {vista === 'surte' && puedeSurte && (
        <VistaSurte
          supabase={supabase}
          user={user}
          productoPorId={productoPorId}
          inventario={inventario}
          setAviso={setAviso}
        />
      )}
      {vista === 'inventario' && (
        <VistaInventario
          supabase={supabase}
          productoPorId={productoPorId}
          setAviso={setAviso}
          soloLectura={!puedeSurte}
        />
      )}
      {vista === 'carga' && puedeSurte && (
        <VistaCarga supabase={supabase} user={user} productoPorId={productoPorId} inventario={inventario} setAviso={setAviso} />
      )}
      {vista === 'venta' && (
        <VistaVenta supabase={supabase} user={user} productoPorId={productoPorId} setAviso={setAviso} />
      )}
      {vista === 'cobranza' && (
        <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
          <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Cobranza de créditos</h3>
          <FormularioCobranzaRuta supabase={supabase} user={user} onAviso={setAviso} />
        </div>
      )}
      {vista === 'cuentas' && <VistaCuentas supabase={supabase} user={user} esAdmin={esAdmin} setAviso={setAviso} />}
      {vista === 'capital' && <VistaCapital supabase={supabase} user={user} esAdmin={esAdmin} setAviso={setAviso} />}
      {vista === 'preinventario' && (
        <VistaPreinventario supabase={supabase} user={user} inventario={inventario} setAviso={setAviso} />
      )}
      {vista === 'clientes' && esAdmin && <VistaClientes supabase={supabase} setAviso={setAviso} />}
      {vista === 'liquidacion' && esAdmin && <VistaLiquidacion supabase={supabase} user={user} setAviso={setAviso} />}
      {vista === 'consultas' && esAdmin && <VistaConsultas supabase={supabase} setAviso={setAviso} />}
    </div>
  );
}

/* ─── Surte almacén (admin) ─────────────────────────────────────── */

function VistaSurte({ supabase, user, productoPorId, inventario, setAviso }) {
  const [stock, setStock] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('');
  const [tipo, setTipo] = useState('ingreso');
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const r = await listarStockCedisRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setStock(r.data || []);
    setLoading(false);
  }, [supabase, setAviso]);

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
      nota: `${tipo} · surte admin`,
      usuarioNombre: user?.nombre,
      rol: user?.rol,
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
      return { ...s, nombre: p?.nombre || s.producto_id, precio: precioCedisRuta(p) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Surte almacén · {NOMBRE_ALMACEN_RUTA}</h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
        Solo admin/gerente. El vendedor de ruta ve el inventario pero no lo modifica.
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
              <th>P. CEDIS</th>
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
                <td>{f.precio != null ? fmtMonto(f.precio) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Inventario solo lectura ───────────────────────────────────── */

function VistaInventario({ supabase, productoPorId, setAviso, soloLectura }) {
  const [stock, setStock] = useState([]);

  useEffect(() => {
    void listarStockCedisRuta(supabase).then((r) => {
      if (r.aviso) setAviso(r.aviso);
      setStock(r.data || []);
    });
  }, [supabase, setAviso]);

  const filas = stock
    .filter((s) => Number(s.cantidad) > 0)
    .map((s) => {
      const p = productoPorId.get(String(s.producto_id));
      return { ...s, nombre: p?.nombre || s.producto_id, precio: precioCedisRuta(p) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>
        {soloLectura ? 'Inventario CEDIS Ruta (solo lectura)' : NOMBRE_ALMACEN_RUTA}
      </h3>
      {soloLectura && (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Puedes consultar existencias. No puedes ingresar, retirar ni ajustar stock.
        </p>
      )}
      {filas.length === 0 ? (
        <p className="muted">Sin existencias.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Existencia</th>
              <th>P. CEDIS</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto_id}>
                <td>
                  <strong>{f.nombre}</strong>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>{f.producto_id}</div>
                </td>
                <td style={{ fontWeight: 700 }}>{fmtQty(f.cantidad)}</td>
                <td>{f.precio != null ? fmtMonto(f.precio) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Carga camión ──────────────────────────────────────────────── */

function VistaCarga({ supabase, user, productoPorId, inventario, setAviso }) {
  const [lineas, setLineas] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('1');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    const { producto } = buscarProductoInventario(inventario, codigo);
    if (!producto) return alert('Producto no encontrado.');
    const precioRuta = precioCedisRuta(producto);
    if (!(precioRuta > 0)) {
      return alert(`«${producto.nombre || producto.id}» sin precio de compra (CEDIS Ruta).`);
    }
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida.');
    const disp = await stockProductoCedisRuta(supabase, producto.id);
    const ya = lineas.filter((l) => String(l.productoId) === String(producto.id)).reduce((s, l) => s + l.cantidad, 0);
    if (disp + 0.0001 < ya + n) return alert(`Stock insuficiente en CEDIS (hay ${disp}).`);
    setLineas((prev) => {
      const i = prev.findIndex((l) => String(l.productoId) === String(producto.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + n };
        return next;
      }
      return [...prev, { productoId: producto.id, nombre: producto.nombre, precio: precioRuta, cantidad: n }];
    });
    setCodigo('');
    setQty('1');
  };

  const crear = async () => {
    if (!lineas.length) return alert('Agrega productos.');
    if (!confirm(`¿Crear carga con ${lineas.length} producto(s)? Se descuenta de ${NOMBRE_ALMACEN_RUTA}.`)) return;
    setGuardando(true);
    const r = await crearCargaRuta(supabase, {
      vendedorNombre: user?.nombre,
      vendedorId: user?.id,
      notas,
      lineas,
      usuarioNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    alert(`Carga ${r.carga?.folio || ''} creada.`);
    setLineas([]);
    setNotas('');
  };

  const total = lineas.reduce((s, l) => s + (Number(l.precio) || 0) * (Number(l.cantidad) || 0), 0);

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Carga de camión</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" onKeyDown={(e) => e.key === 'Enter' && void agregar()} />
        <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
        <button type="button" className="btn btn-primary" onClick={() => void agregar()}>Agregar</button>
      </div>
      {lineas.length === 0 ? (
        <p className="muted">Sin líneas.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cant</th>
              <th>Precio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.productoId}>
                <td>{l.nombre}</td>
                <td>{fmtQty(l.cantidad)}</td>
                <td>{fmtMonto(l.precio)}</td>
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.4rem' }} onClick={() => setLineas((p) => p.filter((x) => x.productoId !== l.productoId))}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <input className="input" style={{ marginTop: '0.75rem' }} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" />
      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Total: {fmtMonto(total)}</strong>
        <button type="button" className="btn btn-primary" disabled={guardando || !lineas.length} onClick={() => void crear()}>
          Crear carga
        </button>
      </div>
    </div>
  );
}

/* ─── Venta POS ─────────────────────────────────────────────────── */

function VistaVenta({ supabase, user, productoPorId, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [carrito, setCarrito] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);

  const cargarBase = useCallback(async () => {
    const [c, cli] = await Promise.all([
      listarCargasRuta(supabase, { estado: 'en_ruta' }),
      listarClientesRuta(supabase),
    ]);
    if (c.aviso || cli.aviso) setAviso(c.aviso || cli.aviso || AVISO_FALTA_VENTA_RUTA);
    setCargas(c.data || []);
    setClientesExt(cli.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargarBase();
  }, [cargarBase]);

  useEffect(() => {
    if (!cargaId) {
      setLineas([]);
      return;
    }
    void lineasDeCarga(supabase, cargaId).then((r) => setLineas(r.data || []));
  }, [supabase, cargaId]);

  const agregarLinea = (lin) => {
    const disp = disponibleEnLineaCarga(lin);
    if (!(disp > 0)) return alert('Sin disponible en camión.');
    const p = productoPorId.get(String(lin.producto_id));
    const precioLin = Number(lin.precio) > 0 ? Number(lin.precio) : precioCedisRuta(p);
    if (!(precioLin > 0)) return alert('Sin precio CEDIS.');
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(lin.producto_id));
      if (i >= 0) {
        const next = [...prev];
        const nueva = next[i].cantidad + 1;
        if (nueva > disp + 0.0001) {
          alert(`Solo hay ${disp} en camión.`);
          return prev;
        }
        next[i] = { ...next[i], cantidad: nueva };
        return next;
      }
      return [...prev, { productoId: lin.producto_id, nombre: lin.producto_nombre || lin.producto_id, precio: precioLin, cantidad: 1, max: disp }];
    });
  };

  const total = carrito.reduce((s, a) => s + (Number(a.precio) || 0) * (Number(a.cantidad) || 0), 0);

  const cobrar = async () => {
    if (!cargaId) return alert('Elige una carga.');
    if (!clienteKey) return alert('Elige cliente / sucursal.');
    if (!carrito.length) return alert('Carrito vacío.');
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const dest = destinos.find((d) => d.tipo === tipo && String(d.id) === id);
    if (!confirm(`¿Cobrar ${fmtMonto(total)} en ${metodo === 'credito' ? 'CRÉDITO' : 'EFECTIVO'} a ${dest?.nombre || id}?`)) return;
    setGuardando(true);
    const r = await registrarVentaRuta(supabase, {
      cargaId,
      clienteTipo: tipo,
      clienteId: id,
      clienteNombre: dest?.nombre || id,
      metodoPago: metodo,
      articulos: carrito,
      vendedorNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    alert(`Venta ${r.venta?.folio || ''} · cuenta ${r.cuenta === 'credito' ? 'crédito' : 'efectivo'}.`);
    setCarrito([]);
    const lin = await lineasDeCarga(supabase, cargaId);
    setLineas(lin.data || []);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Venta en ruta (POS)</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Efectivo → cuenta efectivo · Crédito → cuenta crédito. El vendedor no edita esas cuentas.
      </p>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: '0.75rem' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Carga
          <select className="input" value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
            <option value="">— Elegir —</option>
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>{c.folio} · {c.vendedor_nombre}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Cliente / sucursal
          <select className="input" value={clienteKey} onChange={(e) => setClienteKey(e.target.value)}>
            <option value="">— Elegir —</option>
            {destinos.map((d) => (
              <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>
                {d.nombre} ({d.tipo === 'externo' ? 'externo' : 'sucursal'})
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Forma de pago
          <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="efectivo">Efectivo → cuenta efectivo</option>
            <option value="credito">Crédito → cuenta crédito</option>
          </select>
        </label>
      </div>

      {cargaId && (
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }}>Camión</h4>
            <table className="consultas-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Disp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const disp = disponibleEnLineaCarga(l);
                  return (
                    <tr key={l.id || l.producto_id}>
                      <td>{l.producto_nombre || l.producto_id}</td>
                      <td>{fmtQty(disp)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.4rem' }} disabled={!(disp > 0)} onClick={() => agregarLinea(l)}>
                          +
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }}>Carrito · {fmtMonto(total)}</h4>
            {carrito.length === 0 ? (
              <p className="muted">Vacío</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {carrito.map((a) => (
                  <li key={a.productoId} style={{ marginBottom: 4 }}>
                    {a.nombre} × {fmtQty(a.cantidad)} = {fmtMonto(a.precio * a.cantidad)}{' '}
                    <button type="button" className="btn btn-ghost" style={{ padding: '0 0.3rem' }} onClick={() => setCarrito((p) => p.filter((x) => x.productoId !== a.productoId))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} disabled={guardando || !carrito.length} onClick={() => void cobrar()}>
              Cobrar {fmtMonto(total)}
            </button>
          </div>
        </div>
      )}
      {!cargas.length && <p className="muted">No hay cargas en ruta. El admin debe surtir y crear una carga.</p>}
    </div>
  );
}

/* ─── Cuentas (lectura; ajuste solo admin) ───────────────────────── */

function VistaCuentas({ supabase, user, esAdmin, setAviso }) {
  const [saldoEfe, setSaldoEfe] = useState(0);
  const [movEfe, setMovEfe] = useState([]);
  const [saldosCred, setSaldosCred] = useState([]);
  const [ajusteMonto, setAjusteMonto] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState('ingreso');

  const cargar = useCallback(async () => {
    const [e, m, c] = await Promise.all([
      saldoEfectivoRuta(supabase),
      listarMovimientosEfectivoRuta(supabase, { limit: 40 }),
      saldosCxcPorCliente(supabase),
    ]);
    if (e.aviso || m.aviso || c.aviso) setAviso(e.aviso || m.aviso || c.aviso);
    setSaldoEfe(e.saldo || 0);
    setMovEfe(m.data || []);
    setSaldosCred((c.data || []).filter((r) => r.saldo > 0.009));
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ajustar = async () => {
    if (!esAdmin) return;
    const r = await ajustarEfectivoRuta(supabase, {
      monto: ajusteMonto,
      tipo: ajusteTipo,
      notas: 'Ajuste admin cuenta efectivo ruta',
      usuarioNombre: user?.nombre,
      rol: user?.rol,
    });
    if (!r.ok) return alert(r.error);
    setAjusteMonto('');
    await cargar();
    alert('Ajuste registrado.');
  };

  const totalCredito = saldosCred.reduce((s, r) => s + (Number(r.saldo) || 0), 0);

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Cuentas de ruta</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        {esAdmin
          ? 'Consulta y ajustes (solo admin/gerente). El vendedor no puede modificar.'
          : 'Solo consulta. Las ventas y cobranzas mueven las cuentas automáticamente.'}
      </p>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
        <div className="card" style={{ margin: 0, background: 'rgba(15,118,110,0.06)' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Cuenta efectivo</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: COLOR }}>{fmtMonto(saldoEfe)}</div>
        </div>
        <div className="card" style={{ margin: 0, background: 'rgba(180,83,9,0.08)' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Cuenta crédito (por cobrar)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b45309' }}>{fmtMonto(totalCredito)}</div>
        </div>
      </div>

      {esAdmin && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <select className="input" value={ajusteTipo} onChange={(e) => setAjusteTipo(e.target.value)}>
            <option value="ingreso">Ajuste +</option>
            <option value="egreso">Ajuste −</option>
          </select>
          <input className="input" type="number" placeholder="Monto" value={ajusteMonto} onChange={(e) => setAjusteMonto(e.target.value)} style={{ width: 120 }} />
          <button type="button" className="btn btn-primary" onClick={() => void ajustar()}>Ajustar efectivo</button>
        </div>
      )}

      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }}>Créditos pendientes</h4>
      {saldosCred.length === 0 ? (
        <p className="muted">Sin saldos de crédito.</p>
      ) : (
        <table className="consultas-table" style={{ marginBottom: '1rem' }}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {saldosCred.map((s) => (
              <tr key={`${s.cliente_tipo}:${s.cliente_id}`}>
                <td>{s.cliente_nombre}</td>
                <td style={{ fontWeight: 700 }}>{fmtMonto(s.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }}>Últimos movimientos efectivo</h4>
      {movEfe.length === 0 ? (
        <p className="muted">Sin movimientos.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Origen</th>
              <th>Monto</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movEfe.slice(0, 25).map((m) => (
              <tr key={m.id}>
                <td className="muted" style={{ fontSize: '0.75rem' }}>{String(m.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td>{m.tipo}</td>
                <td>{m.origen}</td>
                <td style={{ color: m.tipo === 'egreso' ? 'var(--danger)' : COLOR, fontWeight: 700 }}>
                  {m.tipo === 'egreso' ? '−' : '+'}{fmtMonto(m.monto)}
                </td>
                <td>{fmtMonto(m.saldo_despues)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Capital ───────────────────────────────────────────────────── */

function VistaCapital({ supabase, user, esAdmin, setAviso }) {
  const [lista, setLista] = useState([]);
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fotoId, setFotoId] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const cargar = useCallback(async () => {
    const r = await listarCapitalRuta(supabase, {
      vendedorId: esAdmin ? undefined : user?.id,
      limit: 80,
    });
    if (r.aviso) setAviso(r.aviso);
    let data = r.data || [];
    if (!esAdmin && user?.nombre) {
      data = data.filter(
        (s) => String(s.vendedor_id) === String(user.id) || String(s.vendedor_nombre) === String(user.nombre),
      );
    }
    setLista(data);
  }, [supabase, esAdmin, user?.id, user?.nombre, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const solicitar = async () => {
    const r = await solicitarCapitalRuta(supabase, {
      monto,
      motivo,
      vendedorId: user?.id,
      vendedorNombre: user?.nombre,
    });
    if (!r.ok) return alert(r.error);
    alert('Solicitud enviada. Espera a que admin libere el capital.');
    setMonto('');
    setMotivo('');
    await cargar();
  };

  const liberar = async (id) => {
    if (!confirm('¿Liberar capital? Se descuenta de la cuenta de efectivo de ruta.')) return;
    const r = await liberarCapitalRuta(supabase, { id, rol: user?.rol, liberadoPor: user?.nombre });
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    await cargar();
  };

  const rechazar = async (id) => {
    const motivoR = prompt('Motivo del rechazo (opcional):') ?? '';
    const r = await rechazarCapitalRuta(supabase, { id, rol: user?.rol, rechazadoPor: user?.nombre, motivo: motivoR });
    if (!r.ok) return alert(r.error);
    await cargar();
  };

  const onFoto = async (e, id) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    setFotoId(id);
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file, { maxSide: 1000, quality: 0.75 });
      const r = await justificarCapitalRuta(supabase, {
        id,
        fotoTicketUrl: dataUrl,
        vendedorId: user?.id,
        vendedorNombre: user?.nombre,
      });
      if (!r.ok) alert(r.error);
      else {
        alert('Ticket cargado. Capital justificado.');
        await cargar();
      }
    } catch (err) {
      alert(err?.message || 'No se pudo leer la imagen.');
    }
    setSubiendo(false);
    setFotoId('');
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Capital para gastos</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Vendedor solicita → admin libera (sale de efectivo) → vendedor sube foto del ticket.
      </p>

      {!esAdmin && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
          <input className="input" type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} style={{ width: 120 }} />
          <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Motivo del gasto" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={() => void solicitar()}>Solicitar</button>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="muted">Sin solicitudes.</p>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Vendedor</th>
              <th>Monto</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id}>
                <td className="muted" style={{ fontSize: '0.75rem' }}>{String(s.created_at || '').slice(0, 10)}</td>
                <td>
                  <strong>{s.vendedor_nombre}</strong>
                  {s.motivo && <div className="muted" style={{ fontSize: '0.72rem' }}>{s.motivo}</div>}
                </td>
                <td style={{ fontWeight: 700 }}>{fmtMonto(s.monto)}</td>
                <td>{etiquetaEstadoCapital(s.estado)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {esAdmin && s.estado === 'pendiente' && (
                    <>
                      <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }} onClick={() => void liberar(s.id)}>Liberar</button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }} onClick={() => void rechazar(s.id)}>Rechazar</button>
                    </>
                  )}
                  {!esAdmin && s.estado === 'liberado' && (
                    <label className="btn btn-primary" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                      {subiendo && fotoId === s.id ? 'Subiendo…' : 'Subir ticket'}
                      <input type="file" accept="image/*" capture="environment" hidden disabled={subiendo} onChange={(e) => void onFoto(e, s.id)} />
                    </label>
                  )}
                  {s.estado === 'justificado' && s.foto_ticket_url && (
                    <a href={s.foto_ticket_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem' }}>Ver ticket</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Preinventario ─────────────────────────────────────────────── */

function VistaPreinventario({ supabase, user, inventario, setAviso }) {
  const [lineas, setLineas] = useState([]);
  const [hist, setHist] = useState([]);
  const [generando, setGenerando] = useState(false);

  const cargarHist = useCallback(async () => {
    const r = await listarSesionesPreinventarioRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setHist(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargarHist();
  }, [cargarHist]);

  const generar = async () => {
    setGenerando(true);
    const r = await generarPlantillaPreinventarioRuta(supabase, inventario, { soloConStock: true });
    setGenerando(false);
    if (r.aviso) setAviso(r.aviso);
    if (!r.lineas?.length) return alert('No hay productos en CEDIS Ruta para armar la plantilla.');
    setLineas(r.lineas);
  };

  const setConteo = (productoId, raw) => {
    setLineas((prev) => prev.map((l) => (l.producto_id === productoId ? aplicarConteoLinea(l, raw) : l)));
  };

  const resumen = useMemo(() => resumenPreinventarioRuta(lineas), [lineas]);

  const cerrar = async () => {
    if (!lineas.length) return;
    if (!confirm('¿Cerrar preinventario? No modifica el stock teórico.')) return;
    const r = await guardarSesionPreinventarioRuta(supabase, {
      nombre: `Preinventario ${new Date().toISOString().slice(0, 10)}`,
      lineas,
      vendedorId: user?.id,
      vendedorNombre: user?.nombre,
      cerrar: true,
    });
    if (!r.ok) return alert(r.error);
    alert(`Guardado. Contadas ${resumen.contadas}/${resumen.total}.`);
    setLineas([]);
    await cargarHist();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Preinventario de ruta</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Plantilla generada del catálogo / existencias de CEDIS Ruta. Solo conteo de referencia; no altera inventario.
      </p>
      <button type="button" className="btn btn-primary" disabled={generando} onClick={() => void generar()} style={{ marginBottom: '0.75rem' }}>
        {generando ? 'Generando…' : 'Generar plantilla'}
      </button>

      {lineas.length > 0 && (
        <>
          <p style={{ fontSize: '0.85rem' }}>
            Contadas {resumen.contadas}/{resumen.total}
            {resumen.faltante > 0 ? ` · faltante ${fmtQty(resumen.faltante)}` : ''}
            {resumen.sobrante > 0 ? ` · sobrante ${fmtQty(resumen.sobrante)}` : ''}
          </p>
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Teórico</th>
                <th>Contado</th>
                <th>Dif</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.producto_id}>
                  <td>{l.nombre}</td>
                  <td>{fmtQty(l.teorico)}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      style={{ width: 90 }}
                      value={l.contado ?? ''}
                      onChange={(e) => setConteo(l.producto_id, e.target.value)}
                    />
                  </td>
                  <td style={{ color: l.diferencia < 0 ? 'var(--danger)' : l.diferencia > 0 ? COLOR : undefined }}>
                    {l.diferencia == null ? '—' : fmtQty(l.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => void cerrar()}>
            Cerrar preinventario
          </button>
        </>
      )}

      {hist.length > 0 && (
        <>
          <h4 style={{ margin: '1.25rem 0 0.35rem', fontSize: '0.9rem' }}>Historial</h4>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {hist.slice(0, 10).map((h) => (
              <li key={h.id}>
                {String(h.created_at || '').slice(0, 10)} · {h.nombre} · {h.vendedor_nombre || '—'}
                {h.resumen ? ` · contadas ${h.resumen.contadas}/${h.resumen.total}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ─── Clientes / liquidación / consultas (admin) ────────────────── */

function VistaClientes({ supabase, setAviso }) {
  const [list, setList] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');
  const [limite, setLimite] = useState('');

  const cargar = useCallback(async () => {
    const r = await listarClientesRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setList(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    const r = await guardarClienteRuta(supabase, { nombre, telefono: tel, credito_limite: limite });
    if (!r.ok) return alert(r.error);
    setNombre('');
    setTel('');
    setLimite('');
    await cargar();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Clientes externos</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="input" placeholder="Teléfono" value={tel} onChange={(e) => setTel(e.target.value)} />
        <input className="input" type="number" placeholder="Límite crédito" value={limite} onChange={(e) => setLimite(e.target.value)} style={{ width: 130 }} />
        <button type="button" className="btn btn-primary" onClick={() => void guardar()}>Guardar</button>
      </div>
      <table className="consultas-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tel</th>
            <th>Límite</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.telefono || '—'}</td>
              <td>{fmtMonto(c.credito_limite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VistaLiquidacion({ supabase, user, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [efectivo, setEfectivo] = useState('');

  useEffect(() => {
    void listarCargasRuta(supabase, { estado: 'en_ruta' }).then((r) => {
      if (r.aviso) setAviso(r.aviso);
      setCargas(r.data || []);
    });
  }, [supabase, setAviso]);

  const liquidar = async () => {
    if (!cargaId) return alert('Elige carga.');
    if (!confirm('¿Liquidar carga? El sobrante regresa a CEDIS Ruta.')) return;
    const r = await liquidarCargaRuta(supabase, {
      cargaId,
      efectivoEntregado: efectivo,
      usuarioNombre: user?.nombre,
    });
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    alert('Liquidación registrada.');
    setCargaId('');
    setEfectivo('');
    const c = await listarCargasRuta(supabase, { estado: 'en_ruta' });
    setCargas(c.data || []);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Liquidación</h3>
      <select className="input" value={cargaId} onChange={(e) => setCargaId(e.target.value)} style={{ marginBottom: '0.5rem' }}>
        <option value="">— Carga —</option>
        {cargas.map((c) => (
          <option key={c.id} value={c.id}>{c.folio}</option>
        ))}
      </select>
      <input className="input" type="number" placeholder="Efectivo entregado" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} style={{ marginBottom: '0.5rem' }} />
      <button type="button" className="btn btn-primary" onClick={() => void liquidar()}>Liquidar</button>
    </div>
  );
}

function VistaConsultas({ supabase, setAviso }) {
  const [tab, setTab] = useState('cargas');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    void (async () => {
      if (tab === 'cargas') {
        const r = await listarCargasRuta(supabase, { limit: 60 });
        if (r.aviso) setAviso(r.aviso);
        setRows(r.data || []);
      } else if (tab === 'ventas') {
        const r = await listarVentasRuta(supabase, { limit: 80 });
        if (r.aviso) setAviso(r.aviso);
        setRows(r.data || []);
      } else {
        const r = await listarLiquidacionesRuta(supabase);
        if (r.aviso) setAviso(r.aviso);
        setRows(r.data || []);
      }
    })();
  }, [supabase, tab, setAviso]);

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Consultas</h3>
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {['cargas', 'ventas', 'liquidaciones'].map((t) => (
          <button key={t} type="button" className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8rem' }} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <pre style={{ fontSize: '0.72rem', overflow: 'auto', maxHeight: 360, background: 'rgba(0,0,0,0.03)', padding: '0.5rem', borderRadius: 6 }}>
        {JSON.stringify(rows.slice(0, 40), null, 2)}
      </pre>
    </div>
  );
}
