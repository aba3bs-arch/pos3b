import { leerMovimientosLocal } from './inventarioMovimientos.js';

export const FILTROS_EVENTO_PRODUCTO = [
  { id: 'todos', label: 'Todos' },
  { id: 'existencia', label: 'Existencia' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'salidas', label: 'Salidas' },
  { id: 'ajustes', label: 'Ajustes' },
  { id: 'negativo', label: 'Stock negativo' },
];

export const FILTROS_TIPO_MOVIMIENTO = [
  { id: '', label: 'Todos los tipos' },
  { id: 'entrada', label: 'Ingreso de inventario' },
  { id: 'retiro', label: 'Retiro de inventario' },
  { id: 'traspaso', label: 'Traspaso' },
];

export function etiquetaTipoMovimiento(tipo, modo) {
  if (tipo === 'entrada') return modo === 'cancelacion' ? 'Entrada (cancelación)' : 'Entrada';
  if (tipo === 'retiro') {
    if (modo === 'venta') return 'Salida (venta)';
    if (modo === 'vaciado_inventario') return 'Vaciado inventario';
    return 'Retiro';
  }
  if (tipo === 'traspaso') return 'Traspaso';
  if (tipo === 'venta') return 'Venta';
  return tipo || '—';
}

function esStockNegativo(e) {
  const a = Number(e.stock_antes);
  const d = Number(e.stock_despues);
  return (Number.isFinite(a) && a < 0) || (Number.isFinite(d) && d < 0);
}

function enRango(iso, desde, hasta) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (desde) {
    const d = new Date(desde);
    d.setHours(0, 0, 0, 0);
    if (t < d.getTime()) return false;
  }
  if (hasta) {
    const h = new Date(hasta);
    h.setHours(23, 59, 59, 999);
    if (t > h.getTime()) return false;
  }
  return true;
}

export function listarMovimientosInventario(opts = {}) {
  const { desde, hasta, productoId, tipo, sucursal } = opts;
  let list = leerMovimientosLocal();
  if (productoId) {
    const pid = String(productoId);
    list = list.filter(
      (m) => String(m.producto_id) === pid || String(m.producto_destino_id) === pid,
    );
  }
  if (tipo) list = list.filter((m) => m.tipo === tipo);
  if (sucursal) list = list.filter((m) => !m.sucursal || m.sucursal === sucursal);
  list = list.filter((m) => enRango(m.created_at, desde, hasta));
  return list;
}

export function ventasConProducto(ventas, productoId) {
  const pid = String(productoId);
  const out = [];
  for (const v of ventas || []) {
    const arts = v.articulos || [];
    const line = arts.find((a) => String(a.id) === pid);
    if (!line) continue;
    const qty = Number(line.qty) || 1;
    const precio = Number(line.precio) || 0;
    out.push({
      id: `venta_${v.id}`,
      tipo: 'venta',
      created_at: v.created_at,
      cantidad: qty,
      stock_antes: null,
      stock_despues: null,
      usuario: v.vendedor,
      sucursal: v.sucursal_id,
      motivo: `Venta · ${v.metodo_pago || ''}`.trim(),
      subtotal: precio * qty,
      venta_id: v.id,
      producto_nombre: line.nombre,
    });
  }
  return out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function eventoDesdeMovimiento(m, productoId) {
  const pid = String(productoId);
  const esDestino = String(m.producto_destino_id) === pid;
  return {
    id: m.id,
    tipo: m.tipo,
    created_at: m.created_at,
    cantidad: m.cantidad,
    stock_antes: esDestino ? m.stock_dest_antes : m.stock_antes,
    stock_despues: esDestino ? m.stock_dest_despues : m.stock_despues,
    usuario: m.usuario,
    sucursal: m.sucursal,
    motivo: m.motivo,
    modo: m.modo,
    producto_nombre: esDestino ? m.producto_destino_nombre : m.producto_nombre,
    producto_destino_nombre: m.producto_destino_nombre,
    detalle:
      m.tipo === 'traspaso'
        ? `${m.producto_nombre} → ${m.producto_destino_nombre}`
        : m.producto_nombre,
  };
}

function dedupeVentasConMovimientos(eventosMov, eventosVenta) {
  return eventosVenta.filter((v) => {
    const t = new Date(v.created_at).getTime();
    return !eventosMov.some(
      (m) =>
        m.modo === 'venta' &&
        Math.abs(new Date(m.created_at).getTime() - t) < 120000 &&
        Number(m.cantidad) === Number(v.cantidad),
    );
  });
}

export function timelineProducto(productoId, ventas, movimientos, filtroEvento = 'todos') {
  const pid = String(productoId);
  const movs = (movimientos || []).filter(
    (m) => String(m.producto_id) === pid || String(m.producto_destino_id) === pid,
  );
  const eventosMov = movs.map((m) => eventoDesdeMovimiento(m, pid));
  const eventosVenta = dedupeVentasConMovimientos(eventosMov, ventasConProducto(ventas, pid));

  let eventos = [...eventosMov, ...eventosVenta].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  );

  if (filtroEvento === 'existencia') {
    eventos = eventos.filter((e) => e.stock_antes != null || e.stock_despues != null);
  } else if (filtroEvento === 'entradas') {
    eventos = eventos.filter((e) => e.tipo === 'entrada' || (e.tipo === 'traspaso' && e.stock_despues > e.stock_antes));
  } else if (filtroEvento === 'salidas') {
    eventos = eventos.filter(
      (e) => e.tipo === 'retiro' || e.tipo === 'venta' || (e.tipo === 'traspaso' && e.stock_despues < e.stock_antes),
    );
  } else if (filtroEvento === 'ajustes') {
    eventos = eventos.filter(
      (e) =>
        e.tipo === 'traspaso' ||
        e.modo === 'masivo' ||
        e.modo === 'departamento' ||
        e.modo === 'vaciado_inventario',
    );
  } else if (filtroEvento === 'negativo') {
    eventos = eventos.filter((e) => esStockNegativo(e));
  }

  return eventos;
}

export function filtrarMovimientosPorEvento(movimientos, filtroEvento) {
  if (!filtroEvento || filtroEvento === 'todos') return movimientos || [];
  const fake = (movimientos || []).map((m) => eventoDesdeMovimiento(m, m.producto_id));
  return fake
    .filter((e) => {
      if (filtroEvento === 'existencia') return e.stock_antes != null || e.stock_despues != null;
      if (filtroEvento === 'entradas') return e.tipo === 'entrada';
      if (filtroEvento === 'salidas') return e.tipo === 'retiro';
      if (filtroEvento === 'ajustes') return e.tipo === 'traspaso' || e.modo === 'masivo' || e.modo === 'vaciado_inventario';
      if (filtroEvento === 'negativo') return esStockNegativo(e);
      return true;
    })
    .map((e) => movimientos.find((m) => m.id === e.id))
    .filter(Boolean);
}

export function buscarProductos(inventario, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return [];
  return (inventario || []).filter(
    (p) =>
      String(p.id || '').toLowerCase().includes(t) ||
      String(p.nombre || '').toLowerCase().includes(t),
  );
}

export const PRESETS_FECHA_PRODUCTO = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: 'mes', label: 'Mes actual' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: 'rango', label: 'Rango de fechas' },
];

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function rangoDesdePreset(preset) {
  const hoy = new Date();
  const hasta = toYmd(hoy);
  if (preset === 'hoy') return { desde: hasta, hasta };
  if (preset === '7d') return { desde: toYmd(new Date(hoy.getTime() - 7 * 864e5)), hasta };
  if (preset === 'mes') return { desde: toYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  if (preset === '6m') {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() - 6);
    return { desde: toYmd(d), hasta };
  }
  return null;
}
