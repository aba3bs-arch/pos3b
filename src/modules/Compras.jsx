import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { imprimirPedidoCompra, imprimirRecepcionCompra } from '../lib/impresion.js';
import {
  costoEstimadoProducto,
  etiquetaDiaCorto,
  sugerirQtyPedido,
  ultimosDias,
  ventasPorProductoDesdeVentas,
  ventasPorProductoPorDia,
} from '../lib/comprasPedido.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { aplicarDeltaStock } from '../lib/inventarioMultitienda.js';

function totalPedido(lines) {
  return lines.reduce((a, l) => a + (Number(l.costo_est) || 0) * (Number(l.qty_pedido) || 0), 0);
}

function totalRecibidoCalc(lines) {
  return lines.reduce((a, l) => a + (Number(l.costo_est) || 0) * (Number(l.qty_recibido) || 0), 0);
}

function alertSqlCompras(error) {
  const msg = String(error?.message || error || '');
  if (msg.includes('items') || msg.includes('estado') || msg.includes('items_pedido') || msg.includes('schema cache')) {
    alert('Falta actualizar la tabla compras. En Supabase → SQL Editor ejecuta: supabase/fix_compras_items.sql');
    return true;
  }
  return false;
}

export default function Compras({ supabase, sucursal, inventario, cargarDatos, onNavigate }) {
  const [pestana, setPestana] = useState('herramienta');
  const [proveedores, setProveedores] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [err, setErr] = useState('');

  const [proveedorId, setProveedorId] = useState('');
  const [herramientaAbierta, setHerramientaAbierta] = useState(false);
  const [compraActiva, setCompraActiva] = useState(null);
  const [modoRecepcion, setModoRecepcion] = useState(false);

  const [umbralCatalogo, setUmbralCatalogo] = useState(8);
  const [verTodoInventario, setVerTodoInventario] = useState(false);
  const [verDetalleVentas, setVerDetalleVentas] = useState(false);
  const [notasPedido, setNotasPedido] = useState('');
  const [lineas, setLineas] = useState([]);
  const [vinculoProductoIds, setVinculoProductoIds] = useState([]);
  const [soloVinculados, setSoloVinculados] = useState(false);
  const [codigoRecepcion, setCodigoRecepcion] = useState('');
  const [ventasPorProducto, setVentasPorProducto] = useState({});
  const [ventasPorDia, setVentasPorDia] = useState({});
  const diasDetalle = useMemo(() => ultimosDias(7), []);
  const pedidoInputRefs = useRef({});

  const loadProveedoresYHistorial = async () => {
    if (!supabase) return;
    const [pr, co] = await Promise.all([
      supabase.from('proveedores').select('*').order('nombre'),
      supabase.from('compras').select('*, proveedores(nombre)').order('created_at', { ascending: false }).limit(40),
    ]);
    if (!pr.error) setProveedores(pr.data || []);
    if (!co.error) {
      setHistorial(co.data || []);
      setErr('');
    } else setErr(co.error.message);
  };

  const loadPedidosPendientes = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('compras')
      .select('*, proveedores(nombre)')
      .eq('estado', 'pedido')
      .order('created_at', { ascending: false })
      .limit(50);
    setPedidosPendientes(data || []);
  };

  useEffect(() => {
    loadProveedoresYHistorial();
    loadPedidosPendientes();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !herramientaAbierta) return;
      const desde = new Date();
      desde.setDate(desde.getDate() - 14);
      desde.setHours(0, 0, 0, 0);
      const { data } = await consultarVentas(supabase, { desde, sucursal, limit: 800 });
      if (cancelled) return;
      setVentasPorProducto(ventasPorProductoDesdeVentas(data));
      setVentasPorDia(ventasPorProductoPorDia(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sucursal, herramientaAbierta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !proveedorId) {
        setVinculoProductoIds([]);
        return;
      }
      const { data } = await supabase.from('proveedor_producto').select('producto_id').eq('proveedor_id', proveedorId);
      if (!cancelled) {
        const ids = (data || []).map((r) => String(r.producto_id));
        setVinculoProductoIds(ids);
        if (ids.length) setSoloVinculados(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, proveedorId]);

  const construirLineas = useCallback(
    (pedidoExistente = null) => {
      const idsSet = new Set(vinculoProductoIds);
      const base =
        soloVinculados && proveedorId && idsSet.size > 0
          ? (inventario || []).filter((p) => idsSet.has(String(p.id)))
          : (inventario || []);

      const pedidoMap = new Map();
      if (pedidoExistente?.items_pedido) {
        for (const x of pedidoExistente.items_pedido) pedidoMap.set(String(x.id), x);
      }

      const rows = base.map((p) => {
        const ref = pedidoMap.get(String(p.id));
        const vendido14 = Number(ventasPorProducto[String(p.id)] || 0);
        const sugerido = sugerirQtyPedido(p, umbralCatalogo, vendido14);
        return {
          id: p.id,
          nombre: p.nombre,
          precio: Number(p.precio) || 0,
          teorico: Number(p.stock) || 0,
          sugerido,
          vendido14,
          costo_est: ref ? Number(ref.costo_est) || costoEstimadoProducto(p) : costoEstimadoProducto(p),
          qty_pedido: ref ? Number(ref.qty_pedido) || 0 : 0,
          qty_recibido: 0,
        };
      });

      if (pedidoExistente?.items_pedido) {
        const invIds = new Set(rows.map((r) => String(r.id)));
        for (const x of pedidoExistente.items_pedido) {
          if (!invIds.has(String(x.id))) {
            rows.push({
              id: x.id,
              nombre: x.nombre || x.id,
              precio: 0,
              teorico: x.stock_teorico ?? 0,
              sugerido: 0,
              vendido14: 0,
              costo_est: Number(x.costo_est) || 0,
              qty_pedido: Number(x.qty_pedido) || 0,
              qty_recibido: 0,
            });
          }
        }
      }

      return rows;
    },
    [inventario, vinculoProductoIds, soloVinculados, proveedorId, umbralCatalogo, ventasPorProducto],
  );

  useEffect(() => {
    if (!herramientaAbierta) return;
    setLineas(construirLineas(modoRecepcion ? compraActiva : null));
  }, [herramientaAbierta, construirLineas, modoRecepcion, compraActiva]);

  const lineasVisibles = useMemo(() => {
    if (verTodoInventario) return lineas;
    if (modoRecepcion) return lineas.filter((l) => Number(l.qty_pedido) > 0 || Number(l.qty_recibido) > 0);
    return lineas.filter((l) => l.sugerido > 0 || Number(l.qty_pedido) > 0);
  }, [lineas, verTodoInventario, modoRecepcion]);

  const proveedorNombre = useMemo(() => proveedores.find((p) => p.id === proveedorId)?.nombre || '', [proveedores, proveedorId]);

  const pedidosDelProveedor = useMemo(
    () => pedidosPendientes.filter((p) => p.proveedor_id === proveedorId),
    [pedidosPendientes, proveedorId],
  );

  const abrirHerramientaNueva = () => {
    if (!proveedorId) return alert('Selecciona primero un proveedor.');
    setCompraActiva(null);
    setModoRecepcion(false);
    setHerramientaAbierta(true);
    setNotasPedido('');
  };

  const abrirHerramientaRecepcion = (compra) => {
    if (!compra) return;
    setProveedorId(compra.proveedor_id || proveedorId);
    setCompraActiva(compra);
    setModoRecepcion(true);
    setHerramientaAbierta(true);
  };

  const setLinea = (id, patch) => {
    setLineas((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const escanearRecepcion = (raw) => {
    const c = String(raw ?? codigoRecepcion).trim();
    if (!c) return;
    const linea = lineas.find((l) => String(l.id) === c);
    if (!linea) {
      alert(`Producto no está en este pedido: ${c}`);
      setCodigoRecepcion('');
      return;
    }
    setLinea(linea.id, { qty_recibido: (Number(linea.qty_recibido) || 0) + 1 });
    setCodigoRecepcion('');
  };

  const onPedidoKeyDown = (e, line, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!modoRecepcion) {
        const qty = line.qty_pedido > 0 ? line.qty_pedido : line.sugerido;
        setLinea(line.id, { qty_pedido: qty });
        const next = lineasVisibles[index + 1];
        if (next) pedidoInputRefs.current[next.id]?.focus();
      }
    }
  };

  const generarPedido = async () => {
    if (!supabase || !proveedorId) return;
    const items_pedido = lineas
      .filter((l) => Number(l.qty_pedido) > 0)
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        stock_teorico: l.teorico,
        qty_pedido: Number(l.qty_pedido),
        costo_est: Number(l.costo_est) || 0,
      }));
    if (!items_pedido.length) return alert('Captura cantidades en la columna Pedido (Enter acepta la sugerida).');
    const total = totalPedido(lineas.filter((l) => Number(l.qty_pedido) > 0));
    const { data, error } = await supabase
      .from('compras')
      .insert([
        {
          proveedor_id: proveedorId,
          sucursal_id: sucursal,
          total,
          notas: notasPedido || `Pedido ${proveedorNombre}`,
          estado: 'pedido',
          items_pedido,
          items: [],
        },
      ])
      .select('*, proveedores(nombre)')
      .single();
    if (error) {
      if (!alertSqlCompras(error)) alert(error.message);
      return;
    }
    alert('Pedido registrado. Cuando llegue la mercancía, ábrelo en recepción para anotar lo recibido.');
    setCompraActiva(data);
    setModoRecepcion(true);
    await imprimirPedidoCompra({
      sucursal,
      usuario: null,
      proveedor: data.proveedores?.nombre || proveedorNombre,
      folio: data.id,
      notas: notasPedido,
      items: items_pedido,
      total,
    });
    await loadProveedoresYHistorial();
    await loadPedidosPendientes();
  };

  const recibirMercancia = async () => {
    if (!supabase || !compraActiva) return alert('No hay un pedido activo para recibir.');
    const items = lineas
      .filter((l) => Number(l.qty_recibido) > 0)
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        costo: Number(l.costo_est) || 0,
        qty: Number(l.qty_recibido),
      }));
    if (!items.length) return alert('Anota las cantidades recibidas en la columna Recepción.');
    const calculado = totalRecibidoCalc(lineas.filter((l) => Number(l.qty_recibido) > 0));
    const ticketRaw = prompt(
      `Total calculado por líneas: $${calculado.toFixed(2)} MXN\n\n¿Cuál es el total del ticket del proveedor?`,
      calculado.toFixed(2),
    );
    if (ticketRaw === null) return;
    const totalTicket = parseFloat(String(ticketRaw).replace(',', '.'));
    if (Number.isNaN(totalTicket) || totalTicket < 0) return alert('Total del ticket no válido.');

    const { error } = await supabase
      .from('compras')
      .update({
        estado: 'recibida',
        items,
        total: totalTicket,
        notas: `${compraActiva.notas || ''} · Ticket proveedor: $${totalTicket.toFixed(2)}`.trim(),
      })
      .eq('id', compraActiva.id);
    if (error) {
      if (!alertSqlCompras(error)) alert(error.message);
      return;
    }

    const { data: productosDb, error: eProd } = await supabase.from('productos').select('*');
    if (eProd) {
      alert(`Compra cerrada pero no se pudo actualizar inventario: ${eProd.message}`);
      return;
    }
    const byId = new Map((productosDb || []).map((p) => [p.id, p]));
    for (const l of items) {
      const prod = byId.get(l.id);
      if (prod && l.qty > 0) {
        const calc = aplicarDeltaStock(prod, sucursal, 'cedis', l.qty, sucursal);
        if (calc.ok) {
          await supabase.from('productos').update(calc.patch).eq('id', prod.id);
          Object.assign(prod, calc.patch);
        }
      }
    }

    alert(`Mercancía recibida. Ticket: $${totalTicket.toFixed(2)} MXN. Inventario actualizado.`);
    await imprimirRecepcionCompra({
      sucursal,
      proveedor: compraActiva.proveedores?.nombre || proveedorNombre,
      folio: compraActiva.id,
      items,
      total: totalTicket,
    });
    setHerramientaAbierta(false);
    setCompraActiva(null);
    setModoRecepcion(false);
    setLineas([]);
    cargarDatos();
    loadProveedoresYHistorial();
    loadPedidosPendientes();
  };

  const cerrarHerramienta = () => {
    if (herramientaAbierta && !confirm('¿Cerrar la herramienta de compra? Los cambios no guardados se perderán.')) return;
    setHerramientaAbierta(false);
    setCompraActiva(null);
    setModoRecepcion(false);
    setLineas([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {err && (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <strong>Nota:</strong> <span className="muted">{err}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className={pestana === 'herramienta' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana('herramienta')}>
          Herramienta de compra
        </button>
        <button type="button" className={pestana === 'historial' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana('historial')}>
          Historial
        </button>
      </div>

      {pestana === 'herramienta' && (
        <>
          <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Proveedor</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Selecciona el proveedor antes de abrir la herramienta. La tabla incluye pedido y recepción en un solo flujo.
            </p>
            <div className="grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="muted">
                Proveedor
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={proveedorId}
                  onChange={(e) => {
                    setProveedorId(e.target.value);
                    setHerramientaAbierta(false);
                    setCompraActiva(null);
                    setModoRecepcion(false);
                  }}
                  disabled={herramientaAbierta && modoRecepcion}
                >
                  <option value="">— Elige proveedor —</option>
                  {proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Pedido pendiente (recepción)
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={compraActiva?.id || ''}
                  onChange={(e) => {
                    const c = pedidosDelProveedor.find((x) => x.id === e.target.value);
                    if (c) abrirHerramientaRecepcion(c);
                  }}
                  disabled={!proveedorId || herramientaAbierta}
                >
                  <option value="">— Nuevo pedido —</option>
                  {pedidosDelProveedor.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '—'} · ${Number(c.total || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {!herramientaAbierta ? (
                <button type="button" className="btn btn-primary" disabled={!proveedorId} onClick={abrirHerramientaNueva}>
                  Abrir herramienta de compra
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={cerrarHerramienta}>
                  Cerrar herramienta
                </button>
              )}
              {typeof onNavigate === 'function' && (
                <button type="button" className="btn btn-gold" onClick={() => onNavigate('Proveedores')}>
                  Gestionar proveedores
                </button>
              )}
            </div>
          </div>

          {!herramientaAbierta && (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                Elige un proveedor y pulsa <strong>Abrir herramienta de compra</strong>, o selecciona un pedido pendiente para recibir mercancía.
              </p>
            </div>
          )}

          {herramientaAbierta && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                    {modoRecepcion ? 'Recepción de mercancía' : 'Nuevo pedido'} · {proveedorNombre}
                  </h3>
                  <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                    {modoRecepcion
                      ? 'Columna Pedido = lo ordenado. Columna Recepción = lo que entregó el proveedor.'
                      : 'En Pedido: Enter acepta la cantidad sugerida, o teclea la cantidad deseada.'}
                  </p>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--brand-blue)', textAlign: 'right' }}>
                  {!modoRecepcion && <>Pedido: ${totalPedido(lineas).toFixed(2)}</>}
                  {modoRecepcion && <>Recibido: ${totalRecibidoCalc(lineas).toFixed(2)}</>}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }} className="muted">
                  <input type="checkbox" checked={verDetalleVentas} onChange={(e) => setVerDetalleVentas(e.target.checked)} />
                  <strong>Detalle</strong> ventas por día (últimos 7 días)
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }} className="muted">
                  <input type="checkbox" checked={verTodoInventario} onChange={(e) => setVerTodoInventario(e.target.checked)} />
                  Ver todo el catálogo
                </label>
                {vinculoProductoIds.length > 0 && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }} className="muted">
                    <input type="checkbox" checked={soloVinculados} onChange={(e) => setSoloVinculados(e.target.checked)} />
                    Solo productos del proveedor
                  </label>
                )}
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  Umbral
                  <input type="number" min={1} className="input" style={{ width: '64px', padding: '0.35rem' }} value={umbralCatalogo} onChange={(e) => setUmbralCatalogo(parseInt(e.target.value, 10) || 8)} />
                </label>
              </div>

              {modoRecepcion && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <CampoCodigo
                    value={codigoRecepcion}
                    onChange={(e) => setCodigoRecepcion(e.target.value)}
                    onEscanear={escanearRecepcion}
                    onKeyDown={(e) => e.key === 'Enter' && escanearRecepcion()}
                    placeholder="Escanear código para sumar +1 en recepción…"
                    tituloCamara="Recepción de mercancía"
                  />
                </div>
              )}

              <div className="table-wrap" style={{ maxHeight: '520px' }}>
                <table className="data" style={{ fontSize: '0.88rem' }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Precio</th>
                      <th>Teórico</th>
                      <th>Sugerido</th>
                      {verDetalleVentas &&
                        diasDetalle.map((d) => (
                          <th key={d} title={d} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                            {etiquetaDiaCorto(d)}
                          </th>
                        ))}
                      <th>Pedido</th>
                      <th>Recepción</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasVisibles.length === 0 ? (
                      <tr>
                        <td colSpan={7 + (verDetalleVentas ? diasDetalle.length : 0)} className="muted">
                          Sin productos. Activa “Ver todo el catálogo” o vincula productos al proveedor.
                        </td>
                      </tr>
                    ) : (
                      lineasVisibles.map((l, idx) => (
                        <tr key={l.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{l.id}</td>
                          <td>{l.nombre}</td>
                          <td>${Number(l.precio).toFixed(2)}</td>
                          <td>{l.teorico}</td>
                          <td style={{ fontWeight: 700, color: l.sugerido > 0 ? 'var(--brand-blue)' : 'var(--muted)' }}>{l.sugerido}</td>
                          {verDetalleVentas &&
                            diasDetalle.map((d) => (
                              <td key={d} style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                {ventasPorDia[l.id]?.[d] || '·'}
                              </td>
                            ))}
                          <td>
                            <input
                              ref={(el) => {
                                pedidoInputRefs.current[l.id] = el;
                              }}
                              type="number"
                              min={0}
                              className="input"
                              style={{ width: '72px', padding: '0.35rem' }}
                              value={l.qty_pedido}
                              readOnly={modoRecepcion}
                              disabled={modoRecepcion}
                              onChange={(e) => setLinea(l.id, { qty_pedido: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              onKeyDown={(e) => onPedidoKeyDown(e, l, idx)}
                              title={modoRecepcion ? 'Pedido ya registrado' : 'Enter = cantidad sugerida'}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              className="input"
                              style={{ width: '72px', padding: '0.35rem', background: modoRecepcion ? '#f0fdf4' : undefined }}
                              value={l.qty_recibido}
                              disabled={!modoRecepcion}
                              onChange={(e) => setLinea(l.id, { qty_recibido: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              title={modoRecepcion ? 'Cantidad recibida del proveedor' : 'Disponible al recibir mercancía'}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="input"
                              style={{ width: '80px', padding: '0.35rem' }}
                              value={l.costo_est}
                              onChange={(e) => setLinea(l.id, { costo_est: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!modoRecepcion && (
                <>
                  <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                    Notas al proveedor
                    <textarea className="input" style={{ marginTop: '0.35rem', minHeight: '56px' }} value={notasPedido} onChange={(e) => setNotasPedido(e.target.value)} />
                  </label>
                  <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={generarPedido}>
                    Generar pedido (sin tocar inventario)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.75rem', marginLeft: '0.5rem' }}
                    onClick={() =>
                      imprimirPedidoCompra({
                        sucursal,
                        proveedor: proveedorNombre,
                        notas: notasPedido,
                        items: lineas.filter((l) => Number(l.qty_pedido) > 0).map((l) => ({
                          id: l.id,
                          nombre: l.nombre,
                          qty_pedido: l.qty_pedido,
                          costo_est: l.costo_est,
                        })),
                        total: totalPedido(lineas),
                      })
                    }
                  >
                    Imprimir borrador
                  </button>
                </>
              )}

              {modoRecepcion && (
                <>
                  <button type="button" className="btn btn-success" style={{ marginTop: '0.75rem' }} onClick={recibirMercancia}>
                    Recibir mercancía
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.75rem', marginLeft: '0.5rem' }}
                    onClick={() =>
                      imprimirRecepcionCompra({
                        sucursal,
                        proveedor: proveedorNombre,
                        folio: compraActiva?.id,
                        items: lineas
                          .filter((l) => Number(l.qty_recibido) > 0)
                          .map((l) => ({ id: l.id, nombre: l.nombre, qty: l.qty_recibido, costo: l.costo_est })),
                        total: totalRecibidoCalc(lineas),
                      })
                    }
                  >
                    Imprimir recepción
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {pestana === 'historial' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Historial de compras</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th>Notas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin movimientos.
                    </td>
                  </tr>
                ) : (
                  historial.map((c) => (
                    <tr key={c.id}>
                      <td>{c.created_at ? new Date(c.created_at).toLocaleString('es-MX') : '—'}</td>
                      <td>
                        <span className="badge">{c.estado || 'recibida'}</span>
                      </td>
                      <td>{c.proveedores?.nombre || '—'}</td>
                      <td>${Number(c.total || 0).toFixed(2)}</td>
                      <td>{c.notas}</td>
                      <td>
                        {c.estado === 'pedido' && (
                          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setProveedorId(c.proveedor_id); setPestana('herramienta'); abrirHerramientaRecepcion(c); }}>
                            Recibir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
