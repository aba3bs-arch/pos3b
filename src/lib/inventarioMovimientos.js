import {
  aplicarDeltaStock,
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

/**
 * Descuenta stock de piso por una venta (lee fresco de la nube y confirma el update).
 * Evita el fallo silencioso de update con 0 filas y el mapa viejo del catálogo en memoria.
 */
export async function descontarStockPorVenta(supabase, { productoId, qty, sucursal, intentos = 2 } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const id = String(productoId || '').trim();
  const need = Math.max(0, Math.floor(Number(qty) || 0));
  const tienda = normalizarCodigoTienda(sucursal);
  if (!id || !tienda || need <= 0) return { ok: false, error: 'Datos de descuento incompletos.' };

  let ultimoError = 'No se pudo descontar stock.';
  for (let i = 0; i < Math.max(1, intentos); i += 1) {
    const fresco = await leerProductoInventarioFresco(supabase, id);
    if (!fresco.ok) return fresco;
    const productoDb = fresco.producto;
    const calc = aplicarDeltaStock(productoDb, tienda, 'piso', -need, tienda, { permitirNegativo: true });
    if (!calc.ok) return calc;

    const { data: rowsUpd, error } = await supabase
      .from('productos')
      .update(calc.patch)
      .eq('id', id)
      .select('id, stock, stock_cedis, stock_sucursales');
    if (error) {
      if (String(error.message).includes('stock_sucursales') || String(error.message).includes('stock_cedis')) {
        return {
          ok: false,
          error: 'Faltan columnas de inventario. Ejecuta supabase/fix_stock_ubicaciones.sql en Supabase.',
        };
      }
      return { ok: false, error: error.message };
    }
    if (!rowsUpd?.length) {
      // 0 filas: a veces id no coincide o RLS bloquea sin error explícito.
      ultimoError = `No se actualizó stock de ${id} (0 filas). Revisa id del producto o permisos RLS.`;
      continue;
    }

    // Confirmamos que el piso de esta tienda bajó (o quedó en el valor calculado).
    // Si otra caja vendió al mismo tiempo, el stock puede ser < calc.despues: igual OK.
    const verif = await leerProductoInventarioFresco(supabase, id);
    if (verif.ok) {
      const real = stockEnUbicacion(verif.producto, tienda, 'piso', tienda);
      if (real === calc.antes) {
        // El update “pasó” pero el mapa no refleja el descuento → reintentar.
        ultimoError = `El stock de ${id} no bajó tras el update (sigue en ${real}). Reintentando…`;
        continue;
      }
      return {
        ok: true,
        antes: calc.antes,
        despues: real,
        patch: calc.patch,
        producto: verif.producto,
      };
    }

    return {
      ok: true,
      antes: calc.antes,
      despues: calc.despues,
      patch: calc.patch,
      producto: rowsUpd[0] ? { ...productoDb, ...rowsUpd[0] } : { ...productoDb, ...calc.patch },
    };
  }
  return { ok: false, error: ultimoError };
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
    const stockDest = stockEnUbicacion(productoDestDb, tienda, 'piso', tienda);
    const calcO = aplicarDeltaStock(productoDb, tienda, 'piso', -qty, tienda);
    if (!calcO.ok) return calcO;
    const prodDestMerged = { ...productoDestDb, ...calcO.patch };
    const calcD = aplicarDeltaStock(prodDestMerged, tienda, 'piso', qty, tienda);
    if (!calcD.ok) return calcD;

    const { error: e1 } = await supabase.from('productos').update(calcO.patch).eq('id', productoOrigen.id);
    if (e1) return { ok: false, error: e1.message };
    const { error: e2 } = await supabase.from('productos').update(calcD.patch).eq('id', productoDestino.id);
    if (e2) {
      await supabase
        .from('productos')
        .update({
          stock_sucursales: productoDb.stock_sucursales,
          stock: productoDb.stock,
          stock_cedis: productoDb.stock_cedis,
        })
        .eq('id', productoOrigen.id);
      return { ok: false, error: `Error en destino: ${e2.message}. Se revirtió el origen.` };
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
        stock_antes: stockOrigen,
        stock_despues: calcO.despues,
        stock_dest_antes: stockDest,
        stock_dest_despues: calcD.despues,
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
      stock_antes: stockOrigen,
      stock_despues: calcO.despues,
      patch: calcO.patch,
      producto: { ...productoDb, ...calcO.patch },
    };
  }

  const ubicacion = ubicacionMovimiento(tipo, tienda, modo);
  const signo = tipo === 'entrada' ? 1 : -1;
  const calc = aplicarDeltaStock(productoDb, tienda, ubicacion, signo * qty, tienda);
  if (!calc.ok) return calc;

  const { data: rowsUpd, error } = await supabase
    .from('productos')
    .update(calc.patch)
    .eq('id', productoOrigen.id)
    .select('id');
  if (error) {
    if (String(error.message).includes('stock_sucursales') || String(error.message).includes('stock_cedis')) {
      return { ok: false, error: 'Faltan columnas de inventario. Ejecuta supabase/fix_stock_ubicaciones.sql en Supabase.' };
    }
    return { ok: false, error: error.message };
  }
  if (!rowsUpd?.length) {
    return {
      ok: false,
      error: `No se actualizó stock de ${productoOrigen.id} (0 filas). Revisa permisos RLS o id.`,
    };
  }

  // Verificar que la nube quedó con exactamente el stock calculado.
  const verif = await leerProductoInventarioFresco(supabase, productoOrigen.id);
  if (verif.ok) {
    const real = stockEnUbicacion(verif.producto, tienda, ubicacion, tienda);
    if (real !== calc.despues) {
      await supabase
        .from('productos')
        .update({
          stock_sucursales: productoDb.stock_sucursales,
          stock: productoDb.stock,
          stock_cedis: productoDb.stock_cedis,
        })
        .eq('id', productoOrigen.id);
      return {
        ok: false,
        error:
          `Fallo de verificación en "${productoOrigen.nombre || productoDb.nombre}": ` +
          `se intentó dejar ${calc.despues} piezas y la nube tiene ${real}. Se revirtió el cambio.`,
        cantidad: qty,
        stock_antes: calc.antes,
        stock_despues: real,
      };
    }
  }

  const donde = etiquetaUbicacionMovimiento(tipo, tienda, modo);
  const log = guardarMovimientoLocal(
    {
      tipo,
      modo,
      departamento: departamento || productoOrigen.cat || productoDb.cat,
      producto_id: productoOrigen.id,
      producto_nombre: productoOrigen.nombre || productoDb.nombre,
      cantidad: qty,
      stock_antes: calc.antes,
      stock_despues: calc.despues,
      ubicacion,
      sucursal_operacion: tienda,
      motivo: motivo?.trim() || '',
      usuario: usuario || '—',
      sucursal: tienda || '',
      created_at: new Date().toISOString(),
    },
    supabase,
  );

  const verbo = tipo === 'entrada' ? `Entrada a ${donde}` : `Retiro de ${donde}`;
  const avisoMain =
    tipo === 'entrada' && esAlmacenCentral(tienda) && ubicacion === 'cedis'
      ? ' En Productos (MAIN) revisa la columna CEDIS: el piso de MAIN puede seguir en 0 hasta que hagas traspaso a tienda.'
      : '';
  return {
    ok: true,
    mensaje: `${verbo} (${etiquetaTienda(tienda)}): ${tipo === 'entrada' ? '+' : '−'}${qty} uds. en "${productoOrigen.nombre || productoDb.nombre}". Stock: ${calc.antes} → ${calc.despues} (se ${tipo === 'entrada' ? 'suma' : 'resta'}, no se reemplaza).${avisoMain}`,
    log,
    patch: calc.patch,
    cantidad: qty,
    stock_antes: calc.antes,
    stock_despues: calc.despues,
    ubicacion,
    producto: verif.ok ? verif.producto : { ...productoDb, ...calc.patch },
  };
}

/** Varias entradas de inventario en un solo paso (recepción / conteo). */
export async function aplicarEntradasMasivas(supabase, opts) {
  const { lineas, inventario, inventarioCompleto, motivo, usuario, sucursal, sucursalOperacion } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

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
      tipo: 'entrada',
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

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se aplicó ninguna entrada.' };

  const lineasTxt = detalle
    .map((d) => `• ${d.nombre}: +${d.cantidad} (${d.stock_antes} → ${d.stock_despues})`)
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
        ? `Entrada masiva: ${aplicados} producto(s) / ${piezas} pieza(s) OK. ${errores.length} con error.\n`
        : `Entrada masiva OK en ${etiquetaTienda(tienda)}: ${aplicados} producto(s), ${piezas} pieza(s) SUMADAS al stock.\n`) +
      lineasTxt,
  };
}
