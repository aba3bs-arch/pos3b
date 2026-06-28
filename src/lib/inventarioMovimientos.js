import {
  aplicarDeltaStock,
  esAlmacenCentral,
  etiquetaCedisEmpresa,
  stockEnUbicacion,
  ubicacionEntradaDefault,
} from './inventarioMultitienda.js';
import { etiquetaTienda } from '../constants/sucursales.js';

const LS_MOVIMIENTOS = 'pos3b_movimientos_inventario';

export const TIPOS_MOVIMIENTO = [
  { id: 'entrada', label: 'Entrada', signo: 1, desc: 'En MAIN suma al CEDIS central; en tienda suma al piso de venta.' },
  { id: 'retiro', label: 'Retiro', signo: -1, desc: 'Resta del piso de venta (merma, uso interno, etc.). En MAIN puede restar del CEDIS central.' },
  { id: 'traspaso', label: 'Traspaso', signo: 0, desc: 'Distribuye desde el almacén central o mueve entre pisos de tiendas.' },
];

export function leerMovimientosLocal() {
  try {
    const raw = localStorage.getItem(LS_MOVIMIENTOS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function guardarMovimientoLocal(row) {
  const prev = leerMovimientosLocal();
  const next = [{ ...row, id: row.id || `mov_${Date.now()}` }, ...prev].slice(0, 200);
  localStorage.setItem(LS_MOVIMIENTOS, JSON.stringify(next));
  return next;
}

function ubicacionMovimiento(tipo, sucursalOperacion) {
  if (tipo === 'entrada') return ubicacionEntradaDefault(sucursalOperacion);
  if (esAlmacenCentral(sucursalOperacion) && tipo === 'retiro') return 'cedis';
  return 'piso';
}

function etiquetaUbicacionMovimiento(tipo, sucursalOperacion) {
  const u = ubicacionMovimiento(tipo, sucursalOperacion);
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
  const qty = Math.floor(Number(cantidad));
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!productoOrigen?.id) return { ok: false, error: 'Selecciona un producto.' };
  if (!qty || qty < 1) return { ok: false, error: 'La cantidad debe ser al menos 1.' };

  const catalogo = inventarioCompleto || [productoOrigen];
  const productoDb = catalogo.find((p) => p.id === productoOrigen.id) || productoOrigen;

  if (tipo === 'traspaso') {
    if (!productoDestino?.id) return { ok: false, error: 'Selecciona el producto destino del traspaso.' };
    if (productoDestino.id === productoOrigen.id) return { ok: false, error: 'Origen y destino deben ser productos distintos.' };
    const stockOrigen = stockEnUbicacion(productoDb, tienda, 'piso', tienda);
    if (stockOrigen < qty) {
      return { ok: false, error: `Stock insuficiente en origen (hay ${stockOrigen}, pides ${qty}).` };
    }
    const productoDestDb = catalogo.find((p) => p.id === productoDestino.id) || productoDestino;
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
      await supabase.from('productos').update({ stock_sucursales: productoDb.stock_sucursales, stock: productoDb.stock, stock_cedis: productoDb.stock_cedis }).eq('id', productoOrigen.id);
      return { ok: false, error: `Error en destino: ${e2.message}. Se revirtió el origen.` };
    }

    const log = guardarMovimientoLocal({
      tipo,
      modo,
      departamento: departamento || productoOrigen.cat,
      producto_id: productoOrigen.id,
      producto_nombre: productoOrigen.nombre,
      producto_destino_id: productoDestino.id,
      producto_destino_nombre: productoDestino.nombre,
      cantidad: qty,
      stock_antes: stockOrigen,
      stock_despues: calcO.despues,
      stock_dest_antes: stockDest,
      stock_dest_despues: calcD.despues,
      motivo: motivo?.trim() || '',
      usuario: usuario || '—',
      sucursal: tienda || '',
      created_at: new Date().toISOString(),
    });
    return {
      ok: true,
      mensaje: `Traspaso: ${qty} uds. de "${productoOrigen.nombre}" → "${productoDestino.nombre}".`,
      log,
    };
  }

  const ubicacion = ubicacionMovimiento(tipo, tienda);
  const signo = tipo === 'entrada' ? 1 : -1;
  const calc = aplicarDeltaStock(productoDb, tienda, ubicacion, signo * qty, tienda);
  if (!calc.ok) return calc;

  const { error } = await supabase.from('productos').update(calc.patch).eq('id', productoOrigen.id);
  if (error) {
    if (String(error.message).includes('stock_sucursales') || String(error.message).includes('stock_cedis')) {
      return { ok: false, error: 'Faltan columnas de inventario. Ejecuta supabase/fix_stock_ubicaciones.sql en Supabase.' };
    }
    return { ok: false, error: error.message };
  }

  const donde = etiquetaUbicacionMovimiento(tipo, tienda);
  const log = guardarMovimientoLocal({
    tipo,
    modo,
    departamento: departamento || productoOrigen.cat,
    producto_id: productoOrigen.id,
    producto_nombre: productoOrigen.nombre,
    cantidad: qty,
    stock_antes: calc.antes,
    stock_despues: calc.despues,
    ubicacion,
    sucursal_operacion: tienda,
    motivo: motivo?.trim() || '',
    usuario: usuario || '—',
    sucursal: tienda || '',
    created_at: new Date().toISOString(),
  });

  const verbo = tipo === 'entrada' ? `Entrada a ${donde}` : `Retiro de ${donde}`;
  return {
    ok: true,
    mensaje: `${verbo} (${etiquetaTienda(tienda)}): ${qty} uds. en "${productoOrigen.nombre}". Stock: ${calc.antes} → ${calc.despues}.`,
    log,
    patch: calc.patch,
  };
}

/** Varias entradas de inventario en un solo paso (recepción / conteo). */
export async function aplicarEntradasMasivas(supabase, opts) {
  const { lineas, inventario, inventarioCompleto, motivo, usuario, sucursal, sucursalOperacion } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const lista = (lineas || []).filter((l) => l?.productoId && Number(l.cantidad) > 0);
  if (!lista.length) return { ok: false, error: 'Agrega al menos un producto con cantidad.' };

  const catalogo = inventarioCompleto || inventario || [];
  const tienda = sucursalOperacion || sucursal;
  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];
  const productosVivos = new Map(catalogo.map((p) => [p.id, { ...p }]));

  for (const { productoId, cantidad } of lista) {
    let productoOrigen = productosVivos.get(productoId) || (inventario || []).find((p) => p.id === productoId);
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
      inventarioCompleto: catalogo,
    });
    if (!r.ok) {
      errores.push(`${productoOrigen.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    log = r.log || log;
    productoOrigen = { ...productoOrigen, ...r.patch };
    productosVivos.set(productoId, productoOrigen);
  }

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se aplicó ninguna entrada.' };
  return {
    ok: true,
    aplicados,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Entrada masiva: ${aplicados} producto(s) OK. ${errores.length} con error.`
        : `Entrada masiva aplicada: ${aplicados} producto(s) en ${etiquetaTienda(tienda)}.`,
  };
}
