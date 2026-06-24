import { etiquetaTienda } from '../constants/sucursales.js';
import { guardarMovimientoLocal, leerMovimientosLocal } from './inventarioMovimientos.js';

export const UBICACIONES = {
  cedis: { id: 'cedis', label: 'CEDIS' },
  piso: { id: 'piso', label: 'Piso de venta' },
};

export const SUBTIPOS_TRASPASO = [
  {
    id: 'cedis_piso',
    label: 'CEDIS → Piso de venta',
    desc: 'Saca mercancía del almacén y la pone en el piso para vender.',
  },
  {
    id: 'piso_cedis',
    label: 'Piso de venta → CEDIS',
    desc: 'Regresa unidades del piso al almacén (sobrantes, corrección).',
  },
  {
    id: 'tienda_tienda',
    label: 'Tienda → Tienda',
    desc: 'Envía mercancía del CEDIS de esta tienda al CEDIS de otra sucursal.',
  },
];

function parseStockSucursales(producto) {
  const raw = producto?.stock_sucursales;
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? { ...p } : {};
  } catch {
    return {};
  }
}

/** ¿El producto ya usa inventario por sucursal? */
export function usaInventarioMultitienda(producto) {
  const map = parseStockSucursales(producto);
  return Object.keys(map).length > 0;
}

/** Stock en una ubicación (cedis / piso) de una sucursal. */
export function stockEnUbicacion(producto, sucursal, ubicacion) {
  const map = parseStockSucursales(producto);
  const suc = String(sucursal || '').trim();
  if (map[suc]) {
    return Math.max(0, Number(map[suc][ubicacion]) || 0);
  }
  if (ubicacion === 'piso') return Math.max(0, Number(producto?.stock) || 0);
  if (ubicacion === 'cedis') return Math.max(0, Number(producto?.stock_cedis) || 0);
  return 0;
}

function etiquetaUbicacion(ubicacion) {
  return UBICACIONES[ubicacion]?.label || ubicacion;
}

export function resolverTraspaso(subtipo, sucursalOrigen, sucursalDestino) {
  const origen = String(sucursalOrigen || '').trim();
  const destino = String(sucursalDestino || origen).trim();
  if (subtipo === 'cedis_piso') {
    return { sucursalOrigen: origen, ubicacionOrigen: 'cedis', sucursalDestino: origen, ubicacionDestino: 'piso' };
  }
  if (subtipo === 'piso_cedis') {
    return { sucursalOrigen: origen, ubicacionOrigen: 'piso', sucursalDestino: origen, ubicacionDestino: 'cedis' };
  }
  if (subtipo === 'tienda_tienda') {
    if (!destino || destino === origen) return null;
    return { sucursalOrigen: origen, ubicacionOrigen: 'cedis', sucursalDestino: destino, ubicacionDestino: 'cedis' };
  }
  return null;
}

function construirMapaActualizado(producto, sucursal, ubicacion, nuevoValor, forzarMultitienda) {
  const map = parseStockSucursales(producto);
  const suc = String(sucursal || '').trim();
  const multitienda = forzarMultitienda || Object.keys(map).length > 0;

  if (multitienda) {
    if (!map[suc]) {
      map[suc] = {
        cedis: stockEnUbicacion(producto, suc, 'cedis'),
        piso: stockEnUbicacion(producto, suc, 'piso'),
      };
    }
    map[suc][ubicacion] = Math.max(0, nuevoValor);
    const patch = { stock_sucursales: map };
    if (suc === String(producto?._sucursalActiva || '')) {
      patch.stock = map[suc].piso;
      patch.stock_cedis = map[suc].cedis;
    }
    return patch;
  }

  if (ubicacion === 'piso') return { stock: Math.max(0, nuevoValor), stock_cedis: stockEnUbicacion(producto, suc, 'cedis') };
  return { stock: stockEnUbicacion(producto, suc, 'piso'), stock_cedis: Math.max(0, nuevoValor) };
}

/** Payload Supabase tras mover unidades entre ubicaciones/sucursales. */
export function patchTraspasoUbicacion(producto, opts) {
  const { sucursalOrigen, ubicacionOrigen, sucursalDestino, ubicacionDestino, cantidad, sucursalActiva } = opts;
  const qty = Math.floor(Number(cantidad));
  const forzarMultitienda = sucursalOrigen !== sucursalDestino;
  const prod = { ...producto, _sucursalActiva: sucursalActiva };

  const stockO = stockEnUbicacion(prod, sucursalOrigen, ubicacionOrigen);
  const stockD = stockEnUbicacion(prod, sucursalDestino, ubicacionDestino);
  if (stockO < qty) return { ok: false, error: `Stock insuficiente en ${etiquetaUbicacion(ubicacionOrigen)} (hay ${stockO}, pides ${qty}).` };

  let map = parseStockSucursales(prod);
  const multitienda = forzarMultitienda || Object.keys(map).length > 0;

  if (multitienda) {
    for (const suc of [sucursalOrigen, sucursalDestino]) {
      if (!map[suc]) {
        map[suc] = {
          cedis: stockEnUbicacion(prod, suc, 'cedis'),
          piso: stockEnUbicacion(prod, suc, 'piso'),
        };
      }
    }
    map[sucursalOrigen][ubicacionOrigen] = stockO - qty;
    map[sucursalDestino][ubicacionDestino] = stockD + qty;
    const patch = { stock_sucursales: map };
    const act = String(sucursalActiva || '');
    if (act && map[act]) {
      patch.stock = map[act].piso;
      patch.stock_cedis = map[act].cedis;
    }
    return {
      ok: true,
      patch,
      stockOrigenAntes: stockO,
      stockOrigenDespues: stockO - qty,
      stockDestAntes: stockD,
      stockDestDespues: stockD + qty,
    };
  }

  const nuevoOrigen = stockO - qty;
  const nuevoDest = stockD + qty;
  const patchO = construirMapaActualizado(prod, sucursalOrigen, ubicacionOrigen, nuevoOrigen, false);
  const patchD = construirMapaActualizado({ ...prod, ...patchO }, sucursalDestino, ubicacionDestino, nuevoDest, false);
  return {
    ok: true,
    patch: { ...patchO, ...patchD },
    stockOrigenAntes: stockO,
    stockOrigenDespues: nuevoOrigen,
    stockDestAntes: stockD,
    stockDestDespues: nuevoDest,
  };
}

export async function aplicarTraspasoUbicacion(supabase, opts) {
  const {
    producto,
    cantidad,
    subtipo,
    sucursalOrigen,
    sucursalDestino,
    motivo,
    usuario,
    sucursalActiva,
  } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!producto?.id) return { ok: false, error: 'Producto no válido.' };

  const qty = Math.floor(Number(cantidad));
  if (!qty || qty < 1) return { ok: false, error: 'La cantidad debe ser al menos 1.' };

  const ruta = resolverTraspaso(subtipo, sucursalOrigen, sucursalDestino);
  if (!ruta) return { ok: false, error: 'Selecciona una tienda destino distinta a la origen.' };

  const calc = patchTraspasoUbicacion(producto, { ...ruta, cantidad: qty, sucursalActiva });
  if (!calc.ok) return calc;

  const { error } = await supabase.from('productos').update(calc.patch).eq('id', producto.id);
  if (error) {
    if (String(error.message).includes('stock_cedis') || String(error.message).includes('stock_sucursales')) {
      return {
        ok: false,
        error: 'Faltan columnas de ubicación en Supabase. Ejecuta supabase/fix_stock_ubicaciones.sql en el SQL Editor.',
      };
    }
    return { ok: false, error: error.message };
  }

  const origenTxt = `${etiquetaUbicacion(ruta.ubicacionOrigen)} · ${etiquetaTienda(ruta.sucursalOrigen)}`;
  const destTxt = `${etiquetaUbicacion(ruta.ubicacionDestino)} · ${etiquetaTienda(ruta.sucursalDestino)}`;

  const log = guardarMovimientoLocal({
    tipo: 'traspaso',
    modo: 'ubicacion',
    subtipo,
    traspaso_origen: origenTxt,
    traspaso_destino: destTxt,
    sucursal_origen: ruta.sucursalOrigen,
    sucursal_destino: ruta.sucursalDestino,
    ubicacion_origen: ruta.ubicacionOrigen,
    ubicacion_destino: ruta.ubicacionDestino,
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    cantidad: qty,
    stock_antes: calc.stockOrigenAntes,
    stock_despues: calc.stockOrigenDespues,
    stock_dest_antes: calc.stockDestAntes,
    stock_dest_despues: calc.stockDestDespues,
    motivo: motivo?.trim() || '',
    usuario: usuario || '—',
    sucursal: sucursalActiva || sucursalOrigen || '',
    created_at: new Date().toISOString(),
  });

  return {
    ok: true,
    log,
    mensaje: `Traspaso: ${qty} uds. de "${producto.nombre}" (${origenTxt} → ${destTxt}).`,
    patch: calc.patch,
  };
}

export async function aplicarTraspasosMasivos(supabase, opts) {
  const { lineas, inventario, subtipo, sucursalOrigen, sucursalDestino, motivo, usuario, sucursalActiva } = opts;
  const lista = (lineas || []).filter((l) => l?.productoId && Number(l.cantidad) > 0);
  if (!lista.length) return { ok: false, error: 'Agrega al menos un producto con cantidad.' };

  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];
  const productosVivos = new Map((inventario || []).map((p) => [p.id, { ...p }]));

  for (const { productoId, cantidad } of lista) {
    let producto = productosVivos.get(productoId);
    if (!producto) {
      errores.push(`${productoId}: no encontrado`);
      continue;
    }
    const r = await aplicarTraspasoUbicacion(supabase, {
      producto,
      cantidad,
      subtipo,
      sucursalOrigen,
      sucursalDestino,
      motivo,
      usuario,
      sucursalActiva,
    });
    if (!r.ok) {
      errores.push(`${producto.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    log = r.log || log;
    producto = { ...producto, ...r.patch };
    productosVivos.set(productoId, producto);
  }

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se aplicó ningún traspaso.' };
  return {
    ok: true,
    aplicados,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Traspaso: ${aplicados} producto(s) OK. ${errores.length} con error.`
        : `Traspaso aplicado: ${aplicados} producto(s).`,
  };
}

export function etiquetaSubtipoTraspaso(id) {
  return SUBTIPOS_TRASPASO.find((s) => s.id === id)?.label || id;
}
