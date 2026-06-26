import { etiquetaTienda } from '../constants/sucursales.js';
import {
  ALMACEN_CENTRAL,
  asegurarMapaStock,
  esAlmacenCentral,
  etiquetaAlmacenCentral,
  stockEnUbicacion as stockEnUbicacionMt,
} from './inventarioMultitienda.js';
import { guardarMovimientoLocal, leerMovimientosLocal } from './inventarioMovimientos.js';

export function stockEnUbicacion(producto, sucursal, ubicacion, sucursalContext) {
  return stockEnUbicacionMt(producto, sucursal, ubicacion, sucursalContext || sucursal);
}

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
    id: 'central_tienda',
    label: 'Central de administración → Tienda',
    desc: 'Distribuye mercancía del almacén MAIN al CEDIS de una tienda.',
  },
  {
    id: 'tienda_tienda',
    label: 'Tienda → Tienda',
    desc: 'Envía mercancía del CEDIS de una tienda al CEDIS de otra sucursal.',
  },
];

/** ¿El producto ya usa inventario por sucursal? */
export function usaInventarioMultitienda(producto) {
  const map = asegurarMapaStock(producto, 'MAIN');
  return Object.keys(map).length > 0;
}

function etiquetaUbicacion(ubicacion) {
  return UBICACIONES[ubicacion]?.label || ubicacion;
}

function etiquetaSucursal(sucursal) {
  return esAlmacenCentral(sucursal) ? etiquetaAlmacenCentral() : etiquetaTienda(sucursal);
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
  if (subtipo === 'central_tienda') {
    if (!destino || destino === ALMACEN_CENTRAL) return null;
    return {
      sucursalOrigen: ALMACEN_CENTRAL,
      ubicacionOrigen: 'cedis',
      sucursalDestino: destino,
      ubicacionDestino: 'cedis',
    };
  }
  if (subtipo === 'tienda_tienda') {
    if (!destino || destino === origen) return null;
    return { sucursalOrigen: origen, ubicacionOrigen: 'cedis', sucursalDestino: destino, ubicacionDestino: 'cedis' };
  }
  return null;
}

/** Payload Supabase tras mover unidades entre ubicaciones/sucursales. */
export function patchTraspasoUbicacion(producto, opts) {
  const { sucursalOrigen, ubicacionOrigen, sucursalDestino, ubicacionDestino, cantidad, sucursalActiva } = opts;
  const qty = Math.floor(Number(cantidad));
  const ctx = sucursalActiva || sucursalOrigen;

  const stockO = stockEnUbicacionMt(producto, sucursalOrigen, ubicacionOrigen, ctx);
  const stockD = stockEnUbicacionMt(producto, sucursalDestino, ubicacionDestino, ctx);
  if (stockO < qty) {
    return {
      ok: false,
      error: `Stock insuficiente en ${etiquetaUbicacion(ubicacionOrigen)} · ${etiquetaSucursal(sucursalOrigen)} (hay ${stockO}, pides ${qty}).`,
    };
  }

  const map = { ...asegurarMapaStock(producto, ctx) };
  for (const suc of [sucursalOrigen, sucursalDestino]) {
    if (!map[suc]) map[suc] = { cedis: 0, piso: 0 };
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
  if (!ruta) {
    if (subtipo === 'central_tienda') {
      return { ok: false, error: 'Selecciona la tienda destino para distribuir desde el almacén central.' };
    }
    return { ok: false, error: 'Selecciona una tienda destino distinta a la origen.' };
  }

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

  const origenTxt = `${etiquetaUbicacion(ruta.ubicacionOrigen)} · ${etiquetaSucursal(ruta.sucursalOrigen)}`;
  const destTxt = `${etiquetaUbicacion(ruta.ubicacionDestino)} · ${etiquetaSucursal(ruta.sucursalDestino)}`;

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
