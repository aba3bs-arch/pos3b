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
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import ModalLeerTicketCompra from '../components/ModalLeerTicketCompra.jsx';
import { rangoDesdePreset } from '../lib/consultasInventario.js';
import { enRangoYmd, parseYmd, toYmd } from '../lib/fechas.js';
import { productoIdsDesdeProveedor } from '../lib/proveedorCatalogo.js';
import { aplicarMovimientoInventario } from '../lib/inventarioMovimientos.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { PRUEBA_LEER_TICKET_COMPRA } from '../lib/leerTicketCompra.js';
import {
  MODOS_COMPRA_PROVEEDOR,
  etiquetaModoCompraProveedor,
  normalizarModoCompraProveedor,
  proveedorUsaEntregaDirecta,
} from '../lib/comprasProveedor.js';

async function aplicarInventarioCompra(supabase, items, motivoBase, { sucursal, user }) {
  const errores = [];
  let aplicados = 0;
  for (const l of items) {
    const r = await aplicarMovimientoInventario(supabase, {
      tipo: 'entrada',
      modo: 'compra',
      productoOrigen: { id: l.id, nombre: l.nombre },
      cantidad: l.qty,
      motivo: motivoBase,
      usuario: user?.nombre || '—',
      sucursal,
      sucursalOperacion: sucursal,
    });
    if (!r.ok) {
      errores.push(`${l.nombre || l.id}: ${r.error}`);
      if (r.faltaRpc) return { aplicados, errores, faltaRpc: true, error: r.error };
      continue;
    }
    aplicados += 1;
  }
  return { aplicados, errores, faltaRpc: false };
}

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

export default function Compras({ supabase, sucursal, inventario, cargarDatos, onNavigate, user }) {
  const [pestana, setPestana] = useState('herramienta');
  const [proveedores, setProveedores] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [err, setErr] = useState('');

  const [proveedorId, setProveedorId] = useState('');
  const [herramientaAbierta, setHerramientaAbierta] = useState(false);
  const [compraActiva, setCompraActiva] = useState(null);
  const [modoRecepcion, setModoRecepcion] = useState(false);
  const [modoEntregaDirecta, setModoEntregaDirecta] = useState(false);

  const [umbralCatalogo, setUmbralCatalogo] = useState(8);
  const [verTodoInventario, setVerTodoInventario] = useState(false);
  const [verDetalleVentas, setVerDetalleVentas] = useState(false);
  const [notasPedido, setNotasPedido] = useState('');
  const [lineas, setLineas] = useState([]);
  const [vinculoProductoIds, setVinculoProductoIds] = useState([]);
  const [codigoRecepcion, setCodigoRecepcion] = useState('');
  const [modalLeerTicket, setModalLeerTicket] = useState(false);
  const [totalTicketSugerido, setTotalTicketSugerido] = useState(null);
  const [ventasPorProducto, setVentasPorProducto] = useState({});
  const [ventasPorDia, setVentasPorDia] = useState({});
  const [presetVentasCompras, setPresetVentasCompras] = useState('14d');
  const [ventasDesde, setVentasDesde] = useState('');
  const [ventasHasta, setVentasHasta] = useState('');
  const [presetHistCompras, setPresetHistCompras] = useState('6m');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');
  const diasDetalle = useMemo(() => ultimosDias(7), []);
  const pedidoInputRefs = useRef({});

  const PRESETS_VENTAS_COMPRAS = [
    { id: '7d', label: 'Últimos 7 días' },
    { id: '14d', label: 'Últimos 14 días' },
    { id: 'mes', label: 'Mes actual' },
    { id: 'rango', label: 'Rango de fechas' },
  ];

  const rangoVentasCompras = useMemo(() => {
    if (presetVentasCompras === 'rango' && ventasDesde) {
      return {
        desde: parseYmd(ventasDesde) || new Date(),
        hasta: parseYmd(ventasHasta) || new Date(),
      };
    }
    if (presetVentasCompras === '14d') {
      const hasta = new Date();
      const desde = new Date();
      desde.setDate(desde.getDate() - 14);
      desde.setHours(0, 0, 0, 0);
      return { desde, hasta };
    }
    const ymd = rangoDesdePreset(presetVentasCompras);
    if (ymd) {
      return {
        desde: parseYmd(ymd.desde) || new Date(),
        hasta: parseYmd(ymd.hasta) || new Date(),
      };
    }
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(desde.getDate() - 14);
    desde.setHours(0, 0, 0, 0);
    return { desde, hasta };
  }, [presetVentasCompras, ventasDesde, ventasHasta]);

  const historialFiltrado = useMemo(() => {
    if (presetHistCompras === 'rango' && histDesde && histHasta) {
      return historial.filter((c) => enRangoYmd(toYmd(c.created_at), histDesde, histHasta));
    }
    const r = rangoDesdePreset(presetHistCompras);
    if (!r) return historial;
    return historial.filter((c) => enRangoYmd(toYmd(c.created_at), r.desde, r.hasta));
  }, [historial, presetHistCompras, histDesde, histHasta]);

  const cambiarPresetVentasCompras = (preset) => {
    setPresetVentasCompras(preset);
    if (preset !== 'rango' && preset !== '14d') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setVentasDesde(r.desde);
        setVentasHasta(r.hasta);
      }
    }
  };

  const cambiarPresetHistCompras = (preset) => {
    setPresetHistCompras(preset);
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setHistDesde(r.desde);
        setHistHasta(r.hasta);
      }
    }
  };

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
    const { data, error } = await supabase
      .from('compras')
      .select('*, proveedores(nombre)')
      .eq('estado', 'pedido')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setPedidosPendientes([]);
      if (!alertSqlCompras(error)) setErr(error.message);
      return;
    }
    setPedidosPendientes(data || []);
    setErr('');
  };

  useEffect(() => {
    loadProveedoresYHistorial();
    loadPedidosPendientes();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !herramientaAbierta) return;
      const { desde, hasta } = rangoVentasCompras;
      const { data } = await consultarVentas(supabase, { desde, hasta, sucursal, limit: 800 });
      if (cancelled) return;
      setVentasPorProducto(ventasPorProductoDesdeVentas(data));
      setVentasPorDia(ventasPorProductoPorDia(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sucursal, herramientaAbierta, rangoVentasCompras]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !proveedorId) {
        setVinculoProductoIds([]);
        return;
      }
      const ids = await productoIdsDesdeProveedor(supabase, proveedorId);
      if (!cancelled) {
        setVinculoProductoIds(ids);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, proveedorId]);

  const construirLineas = useCallback(
    (pedidoExistente = null) => {
      const idsSet = new Set(vinculoProductoIds);
      let base = inventario || [];
      if (proveedorId && !verTodoInventario) {
        base = idsSet.size > 0 ? base.filter((p) => idsSet.has(String(p.id))) : [];
      }

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
    [inventario, vinculoProductoIds, verTodoInventario, proveedorId, umbralCatalogo, ventasPorProducto],
  );

  useEffect(() => {
    if (!herramientaAbierta) return;
    setLineas(construirLineas(modoRecepcion ? compraActiva : null));
  }, [herramientaAbierta, construirLineas, modoRecepcion, compraActiva]);

  const lineasVisibles = useMemo(() => {
    if (verTodoInventario) return lineas;
    if (modoEntregaDirecta) return lineas.filter((l) => l.sugerido > 0 || Number(l.qty_pedido) > 0);
    if (modoRecepcion) return lineas.filter((l) => Number(l.qty_pedido) > 0 || Number(l.qty_recibido) > 0);
    return lineas.filter((l) => l.sugerido > 0 || Number(l.qty_pedido) > 0);
  }, [lineas, verTodoInventario, modoRecepcion, modoEntregaDirecta]);

  const proveedorNombre = useMemo(() => proveedores.find((p) => p.id === proveedorId)?.nombre || '', [proveedores, proveedorId]);
  const proveedorSeleccionado = useMemo(() => proveedores.find((p) => p.id === proveedorId) || null, [proveedores, proveedorId]);
  const proveedorEsDirecta = useMemo(() => proveedorUsaEntregaDirecta(proveedorSeleccionado), [proveedorSeleccionado]);

  const pedidosDelProveedor = useMemo(
    () => pedidosPendientes.filter((p) => String(p.proveedor_id || '') === String(proveedorId || '')),
    [pedidosPendientes, proveedorId],
  );

  const abrirHerramientaNueva = () => {
    if (!proveedorId) return alert('Selecciona primero un proveedor.');
    if (!vinculoProductoIds.length) {
      return alert('Este proveedor no tiene productos en su catálogo ni vinculados. Ve a Proveedores → edita el proveedor, agrega productos al catálogo y regístralos en inventario.');
    }
    setCompraActiva(null);
    setModoRecepcion(false);
    setModoEntregaDirecta(false);
    setHerramientaAbierta(true);
    setNotasPedido('');
  };

  const abrirEntregaDirecta = () => {
    if (!proveedorId) return alert('Selecciona primero un proveedor.');
    if (!vinculoProductoIds.length) {
      return alert('Este proveedor no tiene productos vinculados. Regístralos en Proveedores → catálogo.');
    }
    setCompraActiva(null);
    setModoRecepcion(false);
    setModoEntregaDirecta(true);
    setHerramientaAbierta(true);
    setNotasPedido('');
  };

  const abrirHerramientaRecepcion = (compra) => {
    if (!compra) return;
    setProveedorId(compra.proveedor_id || proveedorId);
    setCompraActiva(compra);
    setModoRecepcion(true);
    setModoEntregaDirecta(false);
    setHerramientaAbierta(true);
  };

  const setLinea = (id, patch) => {
    setLineas((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const escanearRecepcion = (raw) => {
    const c = String(raw ?? codigoRecepcion).trim();
    if (!c) return;
    const resolverLinea = () => {
      const enPedido = lineas.find((l) => String(l.id) === c);
      if (enPedido) return enPedido;
      const { producto } = buscarProductoInventario(inventario, c);
      return producto ? lineas.find((l) => String(l.id) === String(producto.id)) : null;
    };
    const linea = resolverLinea();
    if (!linea) {
      alert(`Producto no está en la lista: ${c}`);
      setCodigoRecepcion('');
      return;
    }
    if (modoEntregaDirecta) {
      setLinea(linea.id, { qty_pedido: (Number(linea.qty_pedido) || 0) + 1 });
    } else {
      setLinea(linea.id, { qty_recibido: (Number(linea.qty_recibido) || 0) + 1 });
    }
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
    await imprimirPedidoCompra(
      {
        sucursal,
        usuario: user?.nombre || null,
        proveedor: data.proveedores?.nombre || proveedorNombre,
        folio: data.id,
        notas: notasPedido,
        items: items_pedido,
        total,
      },
      { forzar: true },
    );
    alert(
      `Pedido guardado como pendiente de recepción (${items_pedido.length} producto(s)).\n` +
        'Cuando llegue la mercancía, elígelo en «Pedido pendiente» o en Historial → Recibir.',
    );
    setHerramientaAbierta(false);
    setCompraActiva(null);
    setModoRecepcion(false);
    setModoEntregaDirecta(false);
    setLineas([]);
    setNotasPedido('');
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
    const sugeridoTicket =
      totalTicketSugerido != null && Number.isFinite(Number(totalTicketSugerido))
        ? Number(totalTicketSugerido)
        : calculado;
    const ticketRaw = prompt(
      `Total calculado por líneas: $${calculado.toFixed(2)} MXN\n\n¿Cuál es el total del ticket del proveedor?`,
      sugeridoTicket.toFixed(2),
    );
    if (ticketRaw === null) return;
    const totalTicket = parseFloat(String(ticketRaw).replace(',', '.'));
    if (Number.isNaN(totalTicket) || totalTicket < 0) return alert('Total del ticket no válido.');

    const errores = [];
    let aplicados = 0;
    const motivoBase = `Compra/recepción · ${compraActiva.id}${compraActiva.notas ? ` · ${compraActiva.notas}` : ''}`;

    const inv = await aplicarInventarioCompra(supabase, items, motivoBase, { sucursal, user });
    if (inv.faltaRpc) {
      alert(inv.error);
      return;
    }
    aplicados = inv.aplicados;
    errores.push(...inv.errores);

    if (!aplicados) {
      alert(`No se pudo actualizar inventario:\n${errores.join('\n') || 'Sin productos aplicables.'}`);
      return;
    }

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

    const msgExtra = errores.length
      ? `\n\nAdvertencia: ${errores.length} línea(s) no entraron al inventario:\n${errores.join('\n')}`
      : '';
    alert(`Mercancía recibida. Ticket: $${totalTicket.toFixed(2)} MXN. Inventario actualizado (${aplicados} producto(s)).${msgExtra}`);
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
    setModoEntregaDirecta(false);
    setLineas([]);
    setTotalTicketSugerido(null);
    cargarDatos();
    loadProveedoresYHistorial();
    loadPedidosPendientes();
  };

  const registrarEntregaDirecta = async () => {
    if (!supabase || !proveedorId) return;
    const items = lineas
      .filter((l) => Number(l.qty_pedido) > 0)
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        costo: Number(l.costo_est) || 0,
        qty: Number(l.qty_pedido),
      }));
    if (!items.length) return alert('Captura las cantidades entregadas en la columna Cantidad.');
    const calculado = items.reduce((a, l) => a + l.costo * l.qty, 0);
    const sugeridoTicket =
      totalTicketSugerido != null && Number.isFinite(Number(totalTicketSugerido))
        ? Number(totalTicketSugerido)
        : calculado;
    const ticketRaw = prompt(
      `Entrega directa · Total calculado: $${calculado.toFixed(2)} MXN\n\n¿Total del ticket / nota del proveedor?`,
      sugeridoTicket.toFixed(2),
    );
    if (ticketRaw === null) return;
    const totalTicket = parseFloat(String(ticketRaw).replace(',', '.'));
    if (Number.isNaN(totalTicket) || totalTicket < 0) return alert('Total no válido.');

    const notas = `Entrega directa · ${notasPedido || proveedorNombre}`.trim();
    const invPreview = await aplicarInventarioCompra(supabase, items, notas, { sucursal, user });
    if (invPreview.faltaRpc) {
      alert(invPreview.error);
      return;
    }
    if (!invPreview.aplicados) {
      alert(`No se pudo actualizar inventario:\n${invPreview.errores.join('\n') || 'Sin productos aplicables.'}`);
      return;
    }

    const items_pedido = items.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      stock_teorico: lineas.find((x) => x.id === l.id)?.teorico ?? 0,
      qty_pedido: l.qty,
      costo_est: l.costo,
    }));

    const { data, error } = await supabase
      .from('compras')
      .insert([
        {
          proveedor_id: proveedorId,
          sucursal_id: sucursal,
          total: totalTicket,
          notas,
          estado: 'recibida',
          items_pedido,
          items,
        },
      ])
      .select('*, proveedores(nombre)')
      .single();
    if (error) {
      if (!alertSqlCompras(error)) alert(error.message);
      return;
    }

    const msgExtra = invPreview.errores.length
      ? `\n\nAdvertencia: ${invPreview.errores.length} línea(s) no entraron:\n${invPreview.errores.join('\n')}`
      : '';
    alert(
      `Entrega directa registrada. Inventario actualizado (${invPreview.aplicados} producto(s)). Ticket: $${totalTicket.toFixed(2)} MXN.${msgExtra}`,
    );
    await imprimirRecepcionCompra({
      sucursal,
      proveedor: data.proveedores?.nombre || proveedorNombre,
      folio: data.id,
      items,
      total: totalTicket,
    });
    setHerramientaAbierta(false);
    setModoEntregaDirecta(false);
    setLineas([]);
    setNotasPedido('');
    setTotalTicketSugerido(null);
    cargarDatos();
    loadProveedoresYHistorial();
    loadPedidosPendientes();
  };

  const cerrarHerramienta = () => {
    if (herramientaAbierta && !confirm('¿Cerrar la herramienta de compra? Los cambios no guardados se perderán.')) return;
    setHerramientaAbierta(false);
    setCompraActiva(null);
    setModoRecepcion(false);
    setModoEntregaDirecta(false);
    setLineas([]);
    setModalLeerTicket(false);
    setTotalTicketSugerido(null);
  };

  const onAplicarTicketLeido = (r, meta) => {
    if (!r?.lineas) return;
    setLineas(r.lineas);
    if (meta?.totalTicket != null && Number.isFinite(Number(meta.totalTicket))) {
      setTotalTicketSugerido(Number(meta.totalTicket));
    }
    const extra =
      r.omitidas?.length > 0 ? `\nSin aplicar: ${r.omitidas.slice(0, 5).join(', ')}` : '';
    alert(
      `Se aplicaron ${r.aplicadas} línea(s) del ticket a ${modoEntregaDirecta ? 'entrega' : 'recepción'}.` +
        `\nRevisa cantidades y pulsa ${modoEntregaDirecta ? '«Registrar entrega e inventario»' : '«Recibir mercancía»'} para entrar al teórico.` +
        extra,
    );
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
              <strong>Pedido + recepción:</strong> mayorista (pedido pendiente, inventario al recibir).
              <strong style={{ marginLeft: '0.35rem' }}>Entrega directa:</strong> preventa / repartidor (inventario al registrar la entrega).
            </p>
            {proveedorId && proveedorEsDirecta && !herramientaAbierta && (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--brand-blue)' }}>
                Este proveedor está configurado como <strong>entrega directa</strong>.
              </p>
            )}
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
                    setModoEntregaDirecta(false);
                  }}
                  disabled={herramientaAbierta && (modoRecepcion || modoEntregaDirecta)}
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
                    const c = pedidosDelProveedor.find((x) => String(x.id) === String(e.target.value));
                    if (c) abrirHerramientaRecepcion(c);
                  }}
                  disabled={!proveedorId || herramientaAbierta}
                >
                  <option value="">— Nuevo pedido —</option>
                  {pedidosDelProveedor.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '—'} · $
                      {Number(c.total || 0).toFixed(2)} · {(c.items_pedido || []).length} prod.
                    </option>
                  ))}
                </select>
                {proveedorId && !herramientaAbierta && (
                  <span className="muted" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem' }}>
                    {pedidosDelProveedor.length
                      ? `${pedidosDelProveedor.length} pedido(s) pendiente(s) de recepción`
                      : 'Sin pedidos pendientes para este proveedor'}
                  </span>
                )}
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {!herramientaAbierta ? (
                <>
                  <button type="button" className="btn btn-primary" disabled={!proveedorId} onClick={abrirHerramientaNueva}>
                    Pedido (recepción después)
                  </button>
                  <button
                    type="button"
                    className={proveedorEsDirecta ? 'btn btn-success' : 'btn btn-gold'}
                    disabled={!proveedorId}
                    onClick={abrirEntregaDirecta}
                  >
                    Entrega directa a inventario
                  </button>
                </>
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
                    {modoEntregaDirecta
                      ? 'Entrega directa'
                      : modoRecepcion
                        ? 'Recepción de mercancía'
                        : 'Nuevo pedido'}{' '}
                    · {proveedorNombre}
                  </h3>
                  <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                    {modoEntregaDirecta
                      ? 'Preventa / repartidor: captura lo entregado y entra directo al inventario (CEDIS en MAIN, piso en tiendas).'
                      : modoRecepcion
                        ? 'Columna Pedido = lo ordenado. Columna Recepción = lo entregado. «Recibir mercancía» suma al inventario.'
                        : 'En Pedido: Enter acepta la sugerida. El inventario no cambia hasta recibir la mercancía.'}
                  </p>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--brand-blue)', textAlign: 'right' }}>
                  {modoEntregaDirecta && <>Entrega: ${totalPedido(lineas).toFixed(2)}</>}
                  {!modoRecepcion && !modoEntregaDirecta && <>Pedido: ${totalPedido(lineas).toFixed(2)}</>}
                  {modoRecepcion && <>Recibido: ${totalRecibidoCalc(lineas).toFixed(2)}</>}
                </div>
              </div>

              <FiltroPeriodo
                labelPeriodo="Ventas para sugerencia de pedido"
                presets={PRESETS_VENTAS_COMPRAS}
                preset={presetVentasCompras}
                onPresetChange={cambiarPresetVentasCompras}
                desde={ventasDesde}
                hasta={ventasHasta}
                onDesdeChange={setVentasDesde}
                onHastaChange={setVentasHasta}
                style={{ marginBottom: '0.75rem' }}
              />

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
                    <input type="checkbox" checked={verTodoInventario} onChange={(e) => setVerTodoInventario(e.target.checked)} />
                    Ver catálogo completo
                  </label>
                )}
                {proveedorId && vinculoProductoIds.length === 0 && !verTodoInventario && (
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Sin vínculos — ve a Proveedores</span>
                )}
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  Umbral
                  <input type="number" min={1} className="input" style={{ width: '64px', padding: '0.35rem' }} value={umbralCatalogo} onChange={(e) => setUmbralCatalogo(parseInt(e.target.value, 10) || 8)} />
                </label>
              </div>

              {(modoRecepcion || modoEntregaDirecta) && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <CampoCodigo
                    value={codigoRecepcion}
                    onChange={(e) => setCodigoRecepcion(e.target.value)}
                    onEscanear={escanearRecepcion}
                    onKeyDown={(e) => e.key === 'Enter' && escanearRecepcion()}
                    placeholder={
                      modoEntregaDirecta
                        ? 'Escanear código para sumar +1 a cantidad entregada…'
                        : 'Escanear código para sumar +1 en recepción…'
                    }
                    tituloCamara={modoEntregaDirecta ? 'Entrega directa' : 'Recepción de mercancía'}
                  />
                  {PRUEBA_LEER_TICKET_COMPRA && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <button type="button" className="btn btn-gold" onClick={() => setModalLeerTicket(true)}>
                        Leer ticket (prueba)
                      </button>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>
                        Foto o texto del ticket → revisar → aplicar cantidades. Si no sirve, se quita.
                      </span>
                    </div>
                  )}
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
                      <th>{modoEntregaDirecta ? 'Cantidad entregada' : 'Pedido'}</th>
                      {!modoEntregaDirecta ? <th>Recepción</th> : null}
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasVisibles.length === 0 ? (
                      <tr>
                        <td colSpan={7 + (verDetalleVentas ? diasDetalle.length : 0) + (modoEntregaDirecta ? 0 : 1)} className="muted">
                          Sin productos. Regístralos desde Proveedores → catálogo, o activa “Ver todo el catálogo”.
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
                              style={{
                                width: '72px',
                                padding: '0.35rem',
                                ...(modoEntregaDirecta ? { background: '#f0fdf4' } : {}),
                              }}
                              value={l.qty_pedido}
                              readOnly={modoRecepcion}
                              disabled={modoRecepcion}
                              onChange={(e) => setLinea(l.id, { qty_pedido: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              onKeyDown={(e) => onPedidoKeyDown(e, l, idx)}
                              title={
                                modoRecepcion
                                  ? 'Pedido ya registrado'
                                  : modoEntregaDirecta
                                    ? 'Piezas entregadas (entra al inventario al registrar)'
                                    : 'Enter = cantidad sugerida'
                              }
                            />
                          </td>
                          {!modoEntregaDirecta ? (
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
                          ) : null}
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

              {!modoRecepcion && !modoEntregaDirecta && (
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
                    Imprimir pedido
                  </button>
                </>
              )}

              {modoEntregaDirecta && (
                <>
                  <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                    Notas de la entrega
                    <textarea className="input" style={{ marginTop: '0.35rem', minHeight: '56px' }} value={notasPedido} onChange={(e) => setNotasPedido(e.target.value)} />
                  </label>
                  <button type="button" className="btn btn-success" style={{ marginTop: '0.75rem' }} onClick={registrarEntregaDirecta}>
                    Registrar entrega e inventario
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.75rem', marginLeft: '0.5rem' }}
                    onClick={() =>
                      imprimirRecepcionCompra({
                        sucursal,
                        proveedor: proveedorNombre,
                        items: lineas
                          .filter((l) => Number(l.qty_pedido) > 0)
                          .map((l) => ({ id: l.id, nombre: l.nombre, qty: l.qty_pedido, costo: l.costo_est })),
                        total: totalPedido(lineas),
                      })
                    }
                  >
                    Imprimir entrega
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
                      imprimirPedidoCompra({
                        sucursal,
                        proveedor: compraActiva?.proveedores?.nombre || proveedorNombre,
                        folio: compraActiva?.id,
                        notas: compraActiva?.notas || notasPedido,
                        items: (compraActiva?.items_pedido || lineas.filter((l) => Number(l.qty_pedido) > 0)).map((l) => ({
                          id: l.id,
                          nombre: l.nombre,
                          qty_pedido: l.qty_pedido,
                          costo_est: l.costo_est,
                        })),
                        total: totalPedido(
                          (compraActiva?.items_pedido || []).length
                            ? compraActiva.items_pedido
                            : lineas.filter((l) => Number(l.qty_pedido) > 0),
                        ),
                      })
                    }
                  >
                    Imprimir pedido
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
          <FiltroPeriodo
            preset={presetHistCompras}
            onPresetChange={cambiarPresetHistCompras}
            desde={histDesde}
            hasta={histHasta}
            onDesdeChange={setHistDesde}
            onHastaChange={setHistHasta}
            style={{ marginBottom: '0.75rem' }}
          />
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
                {historialFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin movimientos.
                    </td>
                  </tr>
                ) : (
                  historialFiltrado.map((c) => (
                    <tr key={c.id}>
                      <td>{c.created_at ? new Date(c.created_at).toLocaleString('es-MX') : '—'}</td>
                      <td>
                        <span className="badge">{c.estado || 'recibida'}</span>
                      </td>
                      <td>{c.proveedores?.nombre || '—'}</td>
                      <td>${Number(c.total || 0).toFixed(2)}</td>
                      <td>{c.notas}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {c.estado === 'pedido' && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.8rem' }}
                              onClick={() => {
                                setProveedorId(c.proveedor_id);
                                setPestana('herramienta');
                                abrirHerramientaRecepcion(c);
                              }}
                            >
                              Recibir
                            </button>
                          )}
                          {(c.estado === 'pedido' || (Array.isArray(c.items_pedido) && c.items_pedido.length > 0)) && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.8rem' }}
                              onClick={() =>
                                imprimirPedidoCompra({
                                  sucursal: c.sucursal_id || sucursal,
                                  proveedor: c.proveedores?.nombre || '—',
                                  folio: c.id,
                                  notas: c.notas,
                                  items: c.items_pedido || [],
                                  total: totalPedido(c.items_pedido || []),
                                })
                              }
                            >
                              Imprimir pedido
                            </button>
                          )}
                          {c.estado === 'recibida' && Array.isArray(c.items) && c.items.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.8rem' }}
                              onClick={() =>
                                imprimirRecepcionCompra({
                                  sucursal: c.sucursal_id || sucursal,
                                  proveedor: c.proveedores?.nombre || '—',
                                  folio: c.id,
                                  items: c.items,
                                  total: Number(c.total) || 0,
                                })
                              }
                            >
                              Imprimir recepción
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {PRUEBA_LEER_TICKET_COMPRA && (
        <ModalLeerTicketCompra
          open={modalLeerTicket}
          onClose={() => setModalLeerTicket(false)}
          inventario={inventario}
          modo={modoEntregaDirecta ? 'entrega' : 'recepcion'}
          lineasActuales={lineas}
          onAplicar={onAplicarTicketLeido}
        />
      )}
    </div>
  );
}
