/**
 * Consolidación ventas vs inventario de piso.
 * Detecta piezas vendidas (tickets − cancelaciones) que no tienen retiro
 * registrado en movimientos, y permite descontar el faltante del piso.
 */
import { normalizarCodigoTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { stockEnUbicacion } from './inventarioMultitienda.js';
import {
  descontarStockPorVenta,
  guardarMovimientoLocal,
  leerMovimientosLocal,
} from './inventarioMovimientos.js';

const PAGE = 1000;

function artsOf(row) {
  let a = row?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

function keyOf(suc, productoId) {
  return `${normalizarCodigoTienda(suc)}|${String(productoId)}`;
}

function parseKey(k) {
  const i = k.indexOf('|');
  return { sucursal: k.slice(0, i), productoId: k.slice(i + 1) };
}

async function cargarTodasLasFilas(supabase, table, columns, { sucursal, desdeIso, hastaIso } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).order('created_at', { ascending: true }).range(from, from + PAGE - 1);
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    if (desdeIso) q = q.gte('created_at', desdeIso);
    if (hastaIso) q = q.lte('created_at', hastaIso);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message };
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { data: out, error: null };
}

function acumular(map, suc, productoId, nombre, campo, qty, monto) {
  const k = keyOf(suc, productoId);
  if (!map.has(k)) {
    map.set(k, {
      sucursal: normalizarCodigoTienda(suc),
      producto_id: String(productoId),
      nombre: nombre || String(productoId),
      vendido: 0,
      cancelado: 0,
      descontadoMov: 0,
      montoVendido: 0,
      montoCancelado: 0,
    });
  }
  const row = map.get(k);
  row[campo] = (row[campo] || 0) + qty;
  if (campo === 'vendido') row.montoVendido += monto;
  if (campo === 'cancelado') row.montoCancelado += monto;
  if (nombre && (!row.nombre || row.nombre === row.producto_id)) row.nombre = nombre;
}

/**
 * Analiza ventas vs retiros de inventario (modo venta) en un periodo.
 * @returns {{ ok: boolean, filas: Array, resumen: object, error?: string, aviso?: string }}
 */
export async function analizarConsolidacionVentasInventario(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', filas: [], resumen: {} };

  const sucFiltro = opts.sucursal ? normalizarCodigoTienda(opts.sucursal) : null;
  const desdeIso = opts.desdeIso || null;
  const hastaIso = opts.hastaIso || null;
  const inventario = opts.inventario || [];

  const [ventasRes, cancRes, movRes] = await Promise.all([
    cargarTodasLasFilas(supabase, 'ventas', 'id,sucursal_id,articulos,created_at,total', {
      sucursal: sucFiltro,
      desdeIso,
      hastaIso,
    }),
    cargarTodasLasFilas(supabase, 'cancelaciones', 'id,sucursal_id,articulos,created_at,total', {
      sucursal: sucFiltro,
      desdeIso,
      hastaIso,
    }),
    cargarTodasLasFilas(
      supabase,
      'movimientos_inventario',
      'id,tipo,modo,producto_id,producto_nombre,cantidad,sucursal_id,created_at',
      { sucursal: sucFiltro, desdeIso, hastaIso },
    ),
  ]);

  let aviso = null;
  if (movRes.error && /movimientos_inventario|does not exist|schema cache/i.test(movRes.error)) {
    aviso =
      'Sin tabla movimientos_inventario en la nube. Se usan solo movimientos locales de este equipo. Ejecuta supabase/fix_movimientos_inventario.sql';
  } else if (ventasRes.error) {
    return { ok: false, error: ventasRes.error, filas: [], resumen: {} };
  }

  const map = new Map();

  for (const v of ventasRes.data || []) {
    const suc = v.sucursal_id;
    if (!suc || (sucFiltro && normalizarCodigoTienda(suc) !== sucFiltro)) continue;
    for (const a of artsOf(v)) {
      const pid = a.id != null ? String(a.id) : '';
      if (!pid) continue;
      const qty = Math.max(0, Math.floor(Number(a.qty ?? a.cantidad ?? 1) || 0));
      const precio = Number(a.precio) || 0;
      if (qty <= 0) continue;
      acumular(map, suc, pid, a.nombre, 'vendido', qty, precio * qty);
    }
  }

  for (const c of cancRes.data || []) {
    const suc = c.sucursal_id;
    if (!suc || (sucFiltro && normalizarCodigoTienda(suc) !== sucFiltro)) continue;
    for (const a of artsOf(c)) {
      const pid = a.id != null ? String(a.id) : '';
      if (!pid) continue;
      const qty = Math.max(0, Math.floor(Number(a.qty ?? a.cantidad ?? 1) || 0));
      const precio = Number(a.precio) || 0;
      if (qty <= 0) continue;
      acumular(map, suc, pid, a.nombre, 'cancelado', qty, precio * qty);
    }
  }

  const movNube = movRes.error ? [] : movRes.data || [];
  const movLocal = leerMovimientosLocal().filter((m) => {
    const suc = normalizarCodigoTienda(m.sucursal || m.sucursal_id);
    if (sucFiltro && suc !== sucFiltro) return false;
    const t = new Date(m.created_at || 0).getTime();
    if (desdeIso && t < new Date(desdeIso).getTime()) return false;
    if (hastaIso && t > new Date(hastaIso).getTime()) return false;
    return true;
  });

  const idsNube = new Set(movNube.map((m) => String(m.id)));
  const movs = [
    ...movNube,
    ...movLocal.filter((m) => !m.cloudId && !idsNube.has(String(m.id))),
  ];

  for (const m of movs) {
    const modo = String(m.modo || '').toLowerCase();
    const tipo = String(m.tipo || '').toLowerCase();
    const suc = m.sucursal_id || m.sucursal;
    const pid = m.producto_id != null ? String(m.producto_id) : '';
    if (!suc || !pid) continue;
    const qty = Math.max(0, Math.floor(Number(m.cantidad) || 0));
    if (qty <= 0) continue;

    const esVenta = modo === 'venta' || tipo === 'venta' || (tipo === 'retiro' && modo === 'venta');
    const esCancelMov = modo === 'cancelacion' || (tipo === 'entrada' && modo === 'cancelacion');
    const esConsol = modo === 'consolidacion_venta';

    if (esVenta || esConsol) {
      acumular(map, suc, pid, m.producto_nombre, 'descontadoMov', qty, 0);
    } else if (esCancelMov) {
      // Entrada por cancelación en bitácora: reduce el “descontado neto”
      acumular(map, suc, pid, m.producto_nombre, 'descontadoMov', -qty, 0);
    }
  }

  const byId = new Map((inventario || []).map((p) => [String(p.id), p]));

  const filas = [...map.values()]
    .map((r) => {
      const netoVendido = Math.max(0, r.vendido - r.cancelado);
      const descontado = Math.max(0, r.descontadoMov);
      const pendiente = netoVendido - descontado;
      const prod = byId.get(String(r.producto_id));
      const pisoActual = prod
        ? stockEnUbicacion(prod, r.sucursal, 'piso', r.sucursal)
        : null;
      return {
        ...r,
        netoVendido,
        descontado,
        pendiente,
        pisoActual,
        precio: Number(prod?.precio) || 0,
        montoPendiente: pendiente > 0 ? pendiente * (Number(prod?.precio) || 0) : 0,
      };
    })
    .filter((r) => r.vendido > 0 || r.descontado > 0 || r.cancelado > 0)
    .sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, 'es'));

  const conPendiente = filas.filter((f) => f.pendiente > 0);
  const resumen = {
    productos: filas.length,
    conPendiente: conPendiente.length,
    piezasPendientes: conPendiente.reduce((a, f) => a + f.pendiente, 0),
    montoPendiente: conPendiente.reduce((a, f) => a + f.montoPendiente, 0),
    tickets: (ventasRes.data || []).length,
    cancelaciones: (cancRes.data || []).length,
    movimientos: movs.length,
  };

  return {
    ok: true,
    filas,
    resumen,
    aviso,
    errorMov: movRes.error && !aviso ? movRes.error : null,
    errorCanc: cancRes.error || null,
  };
}

/**
 * Aplica descuentos de piso para filas con pendiente > 0 (todo el catálogo filtrado).
 */
export async function aplicarConsolidacionVentasInventario(supabase, filas, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const usuario = opts.usuario || '—';
  const pendientes = (filas || []).filter((f) => Number(f.pendiente) > 0);
  if (!pendientes.length) return { ok: true, aplicados: 0, errores: [], mensaje: 'No hay pendientes por descontar.' };

  const errores = [];
  let aplicados = 0;
  let piezas = 0;

  for (const f of pendientes) {
    const qty = Math.floor(Number(f.pendiente) || 0);
    if (qty <= 0) continue;
    const r = await descontarStockPorVenta(supabase, {
      productoId: f.producto_id,
      qty,
      sucursal: f.sucursal,
      intentos: 3,
    });
    if (!r.ok) {
      errores.push(`${f.nombre || f.producto_id} (${f.sucursal}): ${r.error}`);
      continue;
    }
    aplicados += 1;
    piezas += qty;
    guardarMovimientoLocal(
      {
        tipo: 'retiro',
        modo: 'consolidacion_venta',
        producto_id: f.producto_id,
        producto_nombre: f.nombre,
        cantidad: qty,
        stock_antes: r.antes,
        stock_despues: r.despues,
        ubicacion: 'piso',
        motivo: `Consolidación ventas vs piso · ${qty} pza no descontadas de tickets`,
        usuario,
        sucursal: f.sucursal,
        created_at: new Date().toISOString(),
      },
      supabase,
    );
  }

  return {
    ok: errores.length === 0,
    aplicados,
    piezas,
    errores,
    mensaje:
      errores.length === 0
        ? `Ajuste aplicado: ${aplicados} producto(s), ${piezas} pieza(s) descontadas del piso.`
        : `Parcial: ${aplicados} ok, ${errores.length} con error.`,
  };
}

/**
 * Ventas netas (tickets − cancelaciones) por producto en un periodo.
 * @returns {{ ok: boolean, porProducto: Map<string, number>, piezas: number, error?: string }}
 */
export async function obtenerVentasNetasEnPeriodo(supabase, {
  sucursal,
  desdeIso,
  hastaIso,
  productoIds = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', porProducto: new Map(), piezas: 0 };
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const idSet = productoIds?.length ? new Set(productoIds.map(String)) : null;

  const [ventasRes, cancRes] = await Promise.all([
    cargarTodasLasFilas(supabase, 'ventas', 'id,sucursal_id,articulos,created_at', {
      sucursal: sucFiltro,
      desdeIso,
      hastaIso,
    }),
    cargarTodasLasFilas(supabase, 'cancelaciones', 'id,sucursal_id,articulos,created_at', {
      sucursal: sucFiltro,
      desdeIso,
      hastaIso,
    }),
  ]);

  if (ventasRes.error) return { ok: false, error: ventasRes.error, porProducto: new Map(), piezas: 0 };

  const map = new Map();
  const sumar = (pid, qty) => {
    if (!pid || !qty) return;
    if (idSet && !idSet.has(String(pid))) return;
    map.set(String(pid), (map.get(String(pid)) || 0) + qty);
  };

  for (const v of ventasRes.data || []) {
    if (sucFiltro && normalizarCodigoTienda(v.sucursal_id) !== sucFiltro) continue;
    for (const a of artsOf(v)) {
      const qty = Math.max(0, Math.floor(Number(a.qty ?? a.cantidad ?? 1) || 0));
      sumar(a.id, qty);
    }
  }
  for (const c of cancRes.data || []) {
    if (sucFiltro && normalizarCodigoTienda(c.sucursal_id) !== sucFiltro) continue;
    for (const a of artsOf(c)) {
      const qty = Math.max(0, Math.floor(Number(a.qty ?? a.cantidad ?? 1) || 0));
      sumar(a.id, -qty);
    }
  }

  // Netos no negativos
  for (const [k, v] of [...map.entries()]) {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n <= 0) map.delete(k);
    else map.set(k, n);
  }

  const piezas = [...map.values()].reduce((a, n) => a + n, 0);
  return { ok: true, porProducto: map, piezas, tickets: (ventasRes.data || []).length };
}

/**
 * Resta ventas del periodo a las cantidades contadas (para cerrar conteo si se siguió vendiendo).
 * @returns {{ lineas: Array, piezasRestadas: number, productosAfectados: number }}
 */
export function restarVentasDeLineasConteo(lineas, ventasPorProducto) {
  const map = ventasPorProducto instanceof Map ? ventasPorProducto : new Map();
  let piezasRestadas = 0;
  let productosAfectados = 0;
  const out = (lineas || []).map((l) => {
    const contada = l.contadaNum != null
      ? Math.max(0, Math.floor(Number(l.contadaNum)))
      : (l.contada != null && String(l.contada).trim() !== ''
        ? Math.max(0, Math.floor(Number(l.contada)))
        : null);
    if (contada == null) return l;
    const vendido = Math.max(0, Math.floor(Number(map.get(String(l.productoId || l.codigo))) || 0));
    if (vendido <= 0) return l;
    const neto = Math.max(0, contada - vendido);
    piezasRestadas += Math.min(vendido, contada);
    productosAfectados += 1;
    return {
      ...l,
      contada: String(neto),
      contadaNum: neto,
      diferencia: l.existencia != null ? neto - Number(l.existencia) : l.diferencia,
      ventasDuranteConteo: vendido,
      contadaAntesVentas: contada,
    };
  });
  return { lineas: out, piezasRestadas, productosAfectados };
}

export function sucursalesParaConsolidacion(sucursalActiva) {
  const ops = listarSucursalesOperativas();
  const act = normalizarCodigoTienda(sucursalActiva);
  if (act && act !== 'MAIN' && ops.includes(act)) return [act];
  return ops;
}

export { parseKey, keyOf };
