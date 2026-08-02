import {
  esAlmacenCentral,
  etiquetaCedisEmpresa,
  stockEnUbicacion,
  ubicacionEntradaDefault,
} from './inventarioMultitienda.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

const LS_MOVIMIENTOS = 'pos3b_movimientos_inventario';
const MAX_LOCAL = 800;

/**
 * Cantidad de inventario: solo enteros ≥ 1.
 * Rechaza vacíos, decimales truncados a 0, y valores no numéricos.
 */
export function parseCantidadInventario(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/** Lee el producto fresco de la nube antes de mover stock (evita mapas viejos). */
export async function leerProductoInventarioFresco(supabase, productoId) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  if (!id) return { ok: false, error: 'Sin id de producto.' };
  const { data, error } = await supabase.from('productos').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `Producto ${id} no existe en la nube.` };
  return { ok: true, producto: data };
}

function faltaRpcDeltaStock(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('aplicar_delta_stock_ubicacion') ||
    msg.includes('aplicar_delta_stock_piso') ||
    msg.includes('aplicar_set_stock_ubicacion') ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    error?.code === 'PGRST202' ||
    error?.code === '42883'
  );
}

export const AVISO_FALTA_RPC_STOCK =
  'Falta la función atómica de stock. En Supabase → SQL Editor ejecuta: supabase/fix_stock_delta_atomico.sql (obligatorio para no regenerar inventario entre cajas).';

function resultadoRpcStock(data, id) {
  const row = data && typeof data === 'object' ? data : {};
  return {
    ok: true,
    antes: Number(row.antes) || 0,
    despues: Number(row.despues) || 0,
    patch: {
      stock_sucursales: row.stock_sucursales,
      stock: row.stock != null ? Number(row.stock) : undefined,
      stock_cedis: row.stock_cedis != null ? Number(row.stock_cedis) : undefined,
    },
    producto: {
      id,
      stock_sucursales: row.stock_sucursales,
      stock: row.stock,
      stock_cedis: row.stock_cedis,
    },
  };
}

/**
 * Delta atómico piso/cedis (RPC). No reescribe el JSON completo desde memoria.
 */
export async function aplicarDeltaStockAtomico(supabase, { productoId, sucursal, ubicacion = 'piso', delta } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  const tienda = normalizarCodigoTienda(sucursal);
  const ubi = String(ubicacion || 'piso').toLowerCase() === 'cedis' ? 'cedis' : 'piso';
  const d = Math.floor(Number(delta) || 0);
  if (!id || !tienda || d === 0) return { ok: false, error: 'Datos de delta incompletos.' };

  let { data, error } = await supabase.rpc('aplicar_delta_stock_ubicacion', {
    p_producto_id: id,
    p_sucursal: tienda,
    p_ubicacion: ubi,
    p_delta: d,
  });
  if (error && faltaRpcDeltaStock(error) && ubi === 'piso') {
    ({ data, error } = await supabase.rpc('aplicar_delta_stock_piso', {
      p_producto_id: id,
      p_sucursal: tienda,
      p_delta: d,
    }));
  }
  if (error) {
    if (faltaRpcDeltaStock(error)) {
      return { ok: false, faltaRpc: true, error: AVISO_FALTA_RPC_STOCK };
    }
    return { ok: false, error: error.message };
  }
  return resultadoRpcStock(data, id);
}

/** @deprecated usar aplicarDeltaStockAtomico */
export async function aplicarDeltaPisoAtomico(supabase, opts = {}) {
  return aplicarDeltaStockAtomico(supabase, { ...opts, ubicacion: 'piso' });
}

/**
 * Set atómico (conteo físico): deja el valor exacto en piso/cedis.
 */
export async function aplicarSetStockAtomico(supabase, { productoId, sucursal, ubicacion = 'piso', valor } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  const tienda = normalizarCodigoTienda(sucursal);
  const ubi = String(ubicacion || 'piso').toLowerCase() === 'cedis' ? 'cedis' : 'piso';
  const v = Math.max(0, Math.floor(Number(valor) || 0));
  if (!id || !tienda) return { ok: false, error: 'Datos de set incompletos.' };

  const { data, error } = await supabase.rpc('aplicar_set_stock_ubicacion', {
    p_producto_id: id,
    p_sucursal: tienda,
    p_ubicacion: ubi,
    p_valor: v,
  });
  if (error) {
    if (faltaRpcDeltaStock(error)) {
      return { ok: false, faltaRpc: true, error: AVISO_FALTA_RPC_STOCK };
    }
    return { ok: false, error: error.message };
  }
  return resultadoRpcStock(data, id);
}

/**
 * Descuenta stock de piso por una venta.
 * Exige RPC atómica (sin fallback JSON) para no regenerar inventario entre cajas.
 */
export async function descontarStockPorVenta(supabase, { productoId, qty, sucursal } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  const need = Math.max(0, Math.floor(Number(qty) || 0));
  const tienda = normalizarCodigoTienda(sucursal);
  if (!id || !tienda || need <= 0) return { ok: false, error: 'Datos de descuento incompletos.' };

  return aplicarDeltaStockAtomico(supabase, { productoId: id, sucursal: tienda, ubicacion: 'piso', delta: -need });
}

/**
 * Devuelve piezas al piso (cancelación de venta). Exige RPC atómica.
 */
export async function devolverStockPorCancelacion(supabase, { productoId, qty, sucursal } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  const need = Math.max(0, Math.floor(Number(qty) || 0));
  const tienda = normalizarCodigoTienda(sucursal);
  if (!id || !tienda || need <= 0) return { ok: false, error: 'Datos de devolución incompletos.' };

  return aplicarDeltaStockAtomico(supabase, { productoId: id, sucursal: tienda, ubicacion: 'piso', delta: need });
}

export const TIPOS_MOVIMIENTO = [
  { id: 'entrada', label: 'Entrada', signo: 1, desc: 'En MAIN suma al CEDIS central; en tienda suma al piso de venta.' },
  { id: 'retiro', label: 'Retiro', signo: -1, desc: 'En MAIN resta del CEDIS; en tienda resta del piso de venta.' },
  { id: 'traspaso', label: 'Traspaso', signo: 0, desc: 'Distribuye desde el almacén central o mueve entre pisos de tiendas.' },
];

export const AVISO_FALTA_MOVIMIENTOS_SQL =
  'Falta la tabla movimientos_inventario. En Supabase → SQL Editor ejecuta: supabase/fix_movimientos_inventario.sql';

function faltaTablaMovimientos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    (msg.includes('movimientos_inventario') &&
      (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')))
  );
}

export function leerMovimientosLocal() {
  try {
    const raw = localStorage.getItem(LS_MOVIMIENTOS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function toCloudPayload(row) {
  const suc = normalizarCodigoTienda(row.sucursal || row.sucursal_id || row.sucursal_operacion || '') || 'MAIN';
  return {
    tipo: row.tipo || 'retiro',
    modo: row.modo || null,
    producto_id: row.producto_id != null ? String(row.producto_id) : null,
    producto_nombre: row.producto_nombre || null,
    producto_destino_id: row.producto_destino_id != null ? String(row.producto_destino_id) : null,
    producto_destino_nombre: row.producto_destino_nombre || null,
    cantidad: Number(row.cantidad) || 0,
    stock_antes: row.stock_antes != null ? Number(row.stock_antes) : null,
    stock_despues: row.stock_despues != null ? Number(row.stock_despues) : null,
    stock_dest_antes: row.stock_dest_antes != null ? Number(row.stock_dest_antes) : null,
    stock_dest_despues: row.stock_dest_despues != null ? Number(row.stock_dest_despues) : null,
    precio_antes: row.precio_antes != null ? Number(row.precio_antes) : null,
    precio_despues: row.precio_despues != null ? Number(row.precio_despues) : null,
    ubicacion: row.ubicacion || null,
    departamento: row.departamento || null,
    motivo: row.motivo || null,
    usuario: row.usuario || null,
    sucursal_id: suc,
    meta: {
      folio: row.folio || null,
      subtipo: row.subtipo || null,
      traspaso_origen: row.traspaso_origen || null,
      traspaso_destino: row.traspaso_destino || null,
      sucursal_origen: row.sucursal_origen || null,
      sucursal_destino: row.sucursal_destino || null,
      ubicacion_origen: row.ubicacion_origen || null,
      ubicacion_destino: row.ubicacion_destino || null,
      origen_local_id: row.id || null,
    },
    created_at: row.created_at || new Date().toISOString(),
  };
}

async function syncMovimientoNube(supabase, row) {
  if (!supabase || !row) return { ok: false };
  const payload = toCloudPayload(row);
  const { data, error } = await supabase.from('movimientos_inventario').insert([payload]).select('id').single();
  if (error) {
    if (faltaTablaMovimientos(error)) return { ok: false, aviso: AVISO_FALTA_MOVIMIENTOS_SQL };
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/**
 * Guarda en este equipo. Si pasas `supabase`, también intenta subir a la nube
 * (fire-and-forget) para que Consultas vea el movimiento en otras cajas.
 */
export function guardarMovimientoLocal(row, supabase = null) {
  const prev = leerMovimientosLocal();
  const saved = {
    ...row,
    id: row.id || `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: row.created_at || new Date().toISOString(),
  };
  const next = [saved, ...prev].slice(0, MAX_LOCAL);
  try {
    localStorage.setItem(LS_MOVIMIENTOS, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (supabase) {
    void syncMovimientoNube(supabase, saved).then((r) => {
      if (r?.id) {
        try {
          const cur = leerMovimientosLocal().map((m) =>
            String(m.id) === String(saved.id) ? { ...m, cloudId: r.id } : m,
          );
          localStorage.setItem(LS_MOVIMIENTOS, JSON.stringify(cur));
        } catch {
          /* ignore */
        }
      }
    });
  }
  return next;
}

/** Guarda local + nube (espera confirmación de nube). */
export async function registrarMovimientoInventario(supabase, row) {
  const next = guardarMovimientoLocal(row, null);
  const saved = next[0];
  const sync = await syncMovimientoNube(supabase, saved);
  if (sync.ok && sync.id) {
    try {
      const cur = leerMovimientosLocal().map((m) =>
        String(m.id) === String(saved.id) ? { ...m, cloudId: sync.id } : m,
      );
      localStorage.setItem(LS_MOVIMIENTOS, JSON.stringify(cur));
    } catch {
      /* ignore */
    }
  }
  return { log: next, cloudId: sync.id || null, aviso: sync.aviso || null, error: sync.error || null };
}

export async function registrarCambioPrecio(supabase, opts) {
  const precioAntes = Number(opts?.precio_antes);
  const precioDespues = Number(opts?.precio_despues);
  if (!Number.isFinite(precioAntes) || !Number.isFinite(precioDespues) || precioAntes === precioDespues) {
    return { ok: true, skipped: true };
  }
  const row = {
    tipo: 'cambio_precio',
    modo: 'precio',
    producto_id: opts.producto_id,
    producto_nombre: opts.producto_nombre || opts.nombre || '',
    cantidad: 0,
    precio_antes: precioAntes,
    precio_despues: precioDespues,
    motivo: opts.motivo || `Cambio de precio $${precioAntes.toFixed(2)} → $${precioDespues.toFixed(2)}`,
    usuario: opts.usuario || '—',
    sucursal: opts.sucursal || '',
    created_at: new Date().toISOString(),
  };
  const r = await registrarMovimientoInventario(supabase, row);
  return { ok: true, ...r };
}

function ubicacionMovimiento(tipo, sucursalOperacion, modo = '') {
  // MAIN → CEDIS (almacén central); tiendas → piso de venta.
  // Así al aplicar desde iPhone en MAIN se actualiza la columna CEDIS (no solo piso MAIN).
  if (modo === 'piso') return 'piso';
  if (modo === 'cedis') return 'cedis';
  if (tipo === 'entrada' || tipo === 'retiro') {
    return ubicacionEntradaDefault(sucursalOperacion);
  }
  return 'piso';
}

function etiquetaUbicacionMovimiento(tipo, sucursalOperacion, modo = '') {
  const u = ubicacionMovimiento(tipo, sucursalOperacion, modo);
  if (u === 'cedis') return etiquetaCedisEmpresa();
  return esAlmacenCentral(sucursalOperacion) ? 'piso de venta · MAIN' : 'piso de venta';
}

export async function aplicarMovimientoInventario(supabase, opts) {
  const {
    tipo,
    productoOrigen,
    cantidad,
    productoDestino,
    motivo,
    usuario,
    sucursal,
    sucursalOperacion,
    modo,
    departamento,
    inventarioCompleto,
  } = opts;
  const tienda = sucursalOperacion || sucursal;
  const qty = parseCantidadInventario(cantidad);
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!productoOrigen?.id) return { ok: false, error: 'Selecciona un producto.' };
  if (!qty) {
    return {
      ok: false,
      error: `Cantidad inválida («${cantidad}»). Debe ser un número entero de piezas ≥ 1 (ej. 12).`,
    };
  }

  // Siempre stock fresco de la nube: el catálogo en memoria puede estar desfasado.
  const frescoOrigen = await leerProductoInventarioFresco(supabase, productoOrigen.id);
  if (!frescoOrigen.ok) return frescoOrigen;
  const productoDb = frescoOrigen.producto;

  if (tipo === 'traspaso') {
    if (!productoDestino?.id) return { ok: false, error: 'Selecciona el producto destino del traspaso.' };
    if (String(productoDestino.id) === String(productoOrigen.id)) {
      return { ok: false, error: 'Origen y destino deben ser productos distintos.' };
    }
    const stockOrigen = stockEnUbicacion(productoDb, tienda, 'piso', tienda);
    if (stockOrigen < qty) {
      return { ok: false, error: `Stock insuficiente en origen (hay ${stockOrigen}, pides ${qty}).` };
    }
    const frescoDest = await leerProductoInventarioFresco(supabase, productoDestino.id);
    if (!frescoDest.ok) return frescoDest;
    const productoDestDb = frescoDest.producto;

    // Nunca mezclar patch del origen en el destino (corrupción cruzada de mapas).
    const rO = await aplicarDeltaStockAtomico(supabase, {
      productoId: productoOrigen.id,
      sucursal: tienda,
      ubicacion: 'piso',
      delta: -qty,
    });
    if (!rO.ok) return rO;
    const rD = await aplicarDeltaStockAtomico(supabase, {
      productoId: productoDestino.id,
      sucursal: tienda,
      ubicacion: 'piso',
      delta: qty,
    });
    if (!rD.ok) {
      // Compensar origen si el destino falló.
      await aplicarDeltaStockAtomico(supabase, {
        productoId: productoOrigen.id,
        sucursal: tienda,
        ubicacion: 'piso',
        delta: qty,
      });
      return { ok: false, error: `Error en destino: ${rD.error}. Se revirtió el origen.` };
    }

    const log = guardarMovimientoLocal(
      {
        tipo,
        modo,
        departamento: departamento || productoOrigen.cat || productoDb.cat,
        producto_id: productoOrigen.id,
        producto_nombre: productoOrigen.nombre || productoDb.nombre,
        producto_destino_id: productoDestino.id,
        producto_destino_nombre: productoDestino.nombre || productoDestDb.nombre,
        cantidad: qty,
        stock_antes: rO.antes,
        stock_despues: rO.despues,
        stock_dest_antes: rD.antes,
        stock_dest_despues: rD.despues,
        motivo: motivo?.trim() || '',
        usuario: usuario || '—',
        sucursal: tienda || '',
        created_at: new Date().toISOString(),
      },
      supabase,
    );
    return {
      ok: true,
      mensaje: `Traspaso: ${qty} uds. de "${productoOrigen.nombre || productoDb.nombre}" → "${productoDestino.nombre || productoDestDb.nombre}".`,
      log,
      cantidad: qty,
      stock_antes: rO.antes,
      stock_despues: rO.despues,
      patch: rO.patch,
      producto: { ...productoDb, ...rO.patch },
    };
  }

  const ubicacion = ubicacionMovimiento(tipo, tienda, modo);
  const signo = tipo === 'entrada' ? 1 : -1;
  const atom = await aplicarDeltaStockAtomico(supabase, {
    productoId: productoOrigen.id,
    sucursal: tienda,
    ubicacion,
    delta: signo * qty,
  });
  if (!atom.ok) return atom;

  const donde = etiquetaUbicacionMovimiento(tipo, tienda, modo);
  const log = guardarMovimientoLocal(
    {
      tipo,
      modo,
      departamento: departamento || productoOrigen.cat || productoDb.cat,
      producto_id: productoOrigen.id,
      producto_nombre: productoOrigen.nombre || productoDb.nombre,
      cantidad: qty,
      stock_antes: atom.antes,
      stock_despues: atom.despues,
      ubicacion,
      sucursal_operacion: tienda,
      motivo: motivo?.trim() || '',
      usuario: usuario || '—',
      sucursal: tienda || '',
      created_at: new Date().toISOString(),
    },
    supabase,
  );

  const avisoMain =
    tipo === 'entrada' && esAlmacenCentral(tienda) && ubicacion === 'cedis'
      ? ' (CEDIS central)'
      : '';
  return {
    ok: true,
    mensaje: `${tipo === 'entrada' ? 'Entrada' : 'Retiro'} (${etiquetaTienda(tienda)}): ${tipo === 'entrada' ? '+' : '−'}${qty} uds. en "${productoOrigen.nombre || productoDb.nombre}" · ${donde}. Stock: ${atom.antes} → ${atom.despues}.${avisoMain}`,
    log,
    cantidad: qty,
    stock_antes: atom.antes,
    stock_despues: atom.despues,
    patch: atom.patch,
    producto: { ...productoDb, ...atom.patch },
  };
}

/** Varias entradas o retiros de inventario en un solo paso (recepción / salida). */
export async function aplicarEntradasMasivas(supabase, opts) {
  const {
    lineas,
    inventario,
    inventarioCompleto,
    motivo,
    usuario,
    sucursal,
    sucursalOperacion,
    tipo: tipoMov = 'entrada',
  } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const tipo = tipoMov === 'retiro' ? 'retiro' : 'entrada';
  const signoTxt = tipo === 'entrada' ? '+' : '−';
  const verbo = tipo === 'entrada' ? 'SUMADAS' : 'RESTADAS';
  const etiquetaOk = tipo === 'entrada' ? 'Entrada masiva' : 'Retiro masivo';

  const lista = [];
  for (const l of lineas || []) {
    if (!l?.productoId) continue;
    const qty = parseCantidadInventario(l.cantidad);
    if (!qty) {
      return {
        ok: false,
        error: `Cantidad inválida en producto ${l.productoId} («${l.cantidad}»). Corrige a un entero ≥ 1.`,
      };
    }
    lista.push({ productoId: String(l.productoId), cantidad: qty });
  }
  if (!lista.length) return { ok: false, error: 'Agrega al menos un producto con cantidad.' };

  const catalogo = inventarioCompleto || inventario || [];
  const tienda = sucursalOperacion || sucursal;
  let log = leerMovimientosLocal();
  let aplicados = 0;
  let piezas = 0;
  const errores = [];
  const detalle = [];
  const productosVivos = new Map(catalogo.map((p) => [String(p.id), { ...p }]));

  for (const { productoId, cantidad } of lista) {
    let productoOrigen =
      productosVivos.get(String(productoId)) ||
      (inventario || []).find((p) => String(p.id) === String(productoId));
    if (!productoOrigen) {
      errores.push(`${productoId}: no encontrado`);
      continue;
    }
    const r = await aplicarMovimientoInventario(supabase, {
      tipo,
      productoOrigen,
      cantidad,
      motivo,
      usuario,
      sucursal,
      sucursalOperacion: tienda,
      modo: 'masivo',
      departamento: productoOrigen.cat,
    });
    if (!r.ok) {
      errores.push(`${productoOrigen.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    piezas += cantidad;
    detalle.push({
      productoId,
      nombre: productoOrigen.nombre,
      cantidad,
      stock_antes: r.stock_antes,
      stock_despues: r.stock_despues,
      producto: r.producto || null,
      patch: r.patch || null,
    });
    log = r.log || log;
    if (r.producto) productosVivos.set(String(productoId), r.producto);
    else if (r.patch) productosVivos.set(String(productoId), { ...productoOrigen, ...r.patch });
  }

  if (!aplicados) {
    return { ok: false, error: errores.join('\n') || `No se aplicó ningún ${tipo === 'entrada' ? 'ingreso' : 'retiro'}.` };
  }

  const lineasTxt = detalle
    .map((d) => `• ${d.nombre}: ${signoTxt}${d.cantidad} (${d.stock_antes} → ${d.stock_despues})`)
    .join('\n');
  return {
    ok: true,
    aplicados,
    piezas,
    detalle,
    errores,
    log,
    mensaje:
      (errores.length > 0
        ? `${etiquetaOk}: ${aplicados} producto(s) / ${piezas} pieza(s) OK. ${errores.length} con error.\n`
        : `${etiquetaOk} OK en ${etiquetaTienda(tienda)}: ${aplicados} producto(s), ${piezas} pieza(s) ${verbo} al stock.\n`) +
      lineasTxt,
  };
}
