import { etiquetaTienda } from '../constants/sucursales.js';
import {
  ALMACEN_CENTRAL,
  asegurarMapaStock,
  esAlmacenCentral,
  etiquetaAlmacenCentral,
  etiquetaCedisEmpresa,
  normalizarMapaStockCedisUnico,
  stockEnUbicacion as stockEnUbicacionMt,
  sucursalParaUbicacion,
} from './inventarioMultitienda.js';
import { guardarMovimientoLocal, leerMovimientosLocal, parseCantidadInventario, leerProductoInventarioFresco, aplicarDeltaStockAtomico } from './inventarioMovimientos.js';

const LS_FOLIO_TRP = 'pos3b_folio_traspaso_seq';

function generarFolioTraspaso() {
  const PREFIX = 'trp';
  let seq = 1;
  try {
    const raw = localStorage.getItem(LS_FOLIO_TRP);
    const o = raw ? JSON.parse(raw) : {};
    // Soporta formato nuevo { seq } y el viejo { ymd, seq }.
    seq = Math.max(1, (Number(o.seq) || 0) + 1);
    localStorage.setItem(LS_FOLIO_TRP, JSON.stringify({ seq }));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1;
  }
  // trp-0001 … trp-9999; desde 10000 ya no rellena a 4 dígitos.
  const ancho = seq <= 9999 ? 4 : String(seq).length;
  return `${PREFIX}-${String(seq).padStart(ancho, '0')}`;
}

export function stockEnUbicacion(producto, sucursal, ubicacion, sucursalContext) {
  return stockEnUbicacionMt(producto, sucursal, ubicacion, sucursalContext || sucursal);
}

export const UBICACIONES = {
  cedis: { id: 'cedis', label: 'CEDIS central' },
  piso: { id: 'piso', label: 'Piso de venta' },
};

export const SUBTIPOS_TRASPASO = [
  {
    id: 'cedis_piso',
    label: 'CEDIS → Piso (MAIN)',
    desc: 'Saca mercancía del almacén central al piso de MAIN (uso interno en central).',
    soloCentral: true,
  },
  {
    id: 'piso_cedis',
    label: 'Piso → CEDIS central',
    desc: 'Regresa unidades del piso de venta al almacén central de la empresa.',
  },
  {
    id: 'central_tienda',
    label: 'CEDIS central → Tienda',
    desc: 'Distribuye mercancía del almacén central al piso de venta de una sucursal.',
    soloCentral: true,
  },
  {
    id: 'tienda_tienda',
    label: 'Tienda → Tienda',
    desc: 'Envía mercancía del piso de una sucursal al piso de otra.',
  },
];

export function subtiposTraspasoParaSucursal(sucursal) {
  const central = esAlmacenCentral(sucursal);
  // Solo MAIN→sucursal o sucursal→sucursal (sin CEDIS↔piso ni retorno a MAIN).
  return SUBTIPOS_TRASPASO.filter((s) => {
    if (s.id === 'cedis_piso' || s.id === 'piso_cedis') return false;
    if (s.id === 'central_tienda') return central;
    if (s.id === 'tienda_tienda') return !central;
    return false;
  });
}

/** ¿El producto ya usa inventario por sucursal? */
export function usaInventarioMultitienda(producto) {
  const map = asegurarMapaStock(producto, 'MAIN');
  return Object.keys(map).length > 0;
}

function etiquetaUbicacion(ubicacion, sucursal) {
  if (ubicacion === 'cedis') return etiquetaCedisEmpresa();
  return esAlmacenCentral(sucursal) ? 'Piso · MAIN' : `Piso · ${etiquetaTienda(sucursal)}`;
}

function etiquetaSucursal(sucursal) {
  return esAlmacenCentral(sucursal) ? etiquetaAlmacenCentral() : etiquetaTienda(sucursal);
}

export function resolverTraspaso(subtipo, sucursalOrigen, sucursalDestino) {
  const origen = String(sucursalOrigen || '').trim();
  const destino = String(sucursalDestino || origen).trim();

  if (subtipo === 'cedis_piso') {
    return {
      sucursalOrigen: ALMACEN_CENTRAL,
      ubicacionOrigen: 'cedis',
      sucursalDestino: ALMACEN_CENTRAL,
      ubicacionDestino: 'piso',
    };
  }
  if (subtipo === 'piso_cedis') {
    return {
      sucursalOrigen: origen,
      ubicacionOrigen: 'piso',
      sucursalDestino: ALMACEN_CENTRAL,
      ubicacionDestino: 'cedis',
    };
  }
  if (subtipo === 'central_tienda') {
    if (!destino || destino === ALMACEN_CENTRAL) return null;
    return {
      sucursalOrigen: ALMACEN_CENTRAL,
      ubicacionOrigen: 'cedis',
      sucursalDestino: destino,
      ubicacionDestino: 'piso',
    };
  }
  if (subtipo === 'tienda_tienda') {
    if (!destino || destino === origen) return null;
    return {
      sucursalOrigen: origen,
      ubicacionOrigen: 'piso',
      sucursalDestino: destino,
      ubicacionDestino: 'piso',
    };
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
      error: `Stock insuficiente en ${etiquetaUbicacion(ubicacionOrigen, sucursalOrigen)} (hay ${stockO}, pides ${qty}).`,
    };
  }

  const map = { ...asegurarMapaStock(producto, ctx) };
  const sucO = sucursalParaUbicacion(sucursalOrigen, ubicacionOrigen);
  const sucD = sucursalParaUbicacion(sucursalDestino, ubicacionDestino);
  for (const suc of [sucO, sucD]) {
    if (!map[suc]) map[suc] = { cedis: 0, piso: 0 };
  }
  map[sucO][ubicacionOrigen] = stockO - qty;
  map[sucD][ubicacionDestino] = stockD + qty;

  const normalized = normalizarMapaStockCedisUnico(map);
  const patch = { stock_sucursales: normalized };
  const act = String(sucursalActiva || '');
  if (act && normalized[act]) {
    patch.stock = normalized[act].piso;
  }
  patch.stock_cedis = Math.max(0, Number(normalized[ALMACEN_CENTRAL]?.cedis) || 0);

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
    folio = null,
  } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!producto?.id) return { ok: false, error: 'Producto no válido.' };

  const qty = parseCantidadInventario(cantidad);
  if (!qty) return { ok: false, error: `Cantidad inválida («${cantidad}»). Debe ser un entero ≥ 1.` };

  const ruta = resolverTraspaso(subtipo, sucursalOrigen, sucursalDestino);
  if (!ruta) {
    if (subtipo === 'central_tienda') {
      return { ok: false, error: 'Selecciona la tienda destino para distribuir desde el almacén central.' };
    }
    return { ok: false, error: 'Selecciona una tienda destino distinta a la origen.' };
  }

  const fresco = await leerProductoInventarioFresco(supabase, producto.id);
  if (!fresco.ok) return fresco;
  const productoDb = fresco.producto;

  const stockO = stockEnUbicacionMt(productoDb, ruta.sucursalOrigen, ruta.ubicacionOrigen, sucursalActiva);
  if (stockO < qty) {
    return {
      ok: false,
      error: `Stock insuficiente en ${etiquetaUbicacion(ruta.ubicacionOrigen, ruta.sucursalOrigen)} (hay ${stockO}, pides ${qty}).`,
    };
  }

  const rO = await aplicarDeltaStockAtomico(supabase, {
    productoId: producto.id,
    sucursal: ruta.sucursalOrigen,
    ubicacion: ruta.ubicacionOrigen,
    delta: -qty,
  });
  if (!rO.ok) return rO;

  const rD = await aplicarDeltaStockAtomico(supabase, {
    productoId: producto.id,
    sucursal: ruta.sucursalDestino,
    ubicacion: ruta.ubicacionDestino,
    delta: qty,
  });
  if (!rD.ok) {
    await aplicarDeltaStockAtomico(supabase, {
      productoId: producto.id,
      sucursal: ruta.sucursalOrigen,
      ubicacion: ruta.ubicacionOrigen,
      delta: qty,
    });
    return { ok: false, error: `Error en destino: ${rD.error}. Se revirtió el origen.` };
  }

  const origenTxt = `${etiquetaUbicacion(ruta.ubicacionOrigen, ruta.sucursalOrigen)} · ${etiquetaSucursal(ruta.sucursalOrigen)}`;
  const destTxt = `${etiquetaUbicacion(ruta.ubicacionDestino, ruta.sucursalDestino)} · ${etiquetaSucursal(ruta.sucursalDestino)}`;
  const folioTrp = folio || generarFolioTraspaso();

  const log = guardarMovimientoLocal({
    tipo: 'traspaso',
    modo: 'ubicacion',
    subtipo,
    folio: folioTrp,
    traspaso_origen: origenTxt,
    traspaso_destino: destTxt,
    sucursal_origen: ruta.sucursalOrigen,
    sucursal_destino: ruta.sucursalDestino,
    ubicacion_origen: ruta.ubicacionOrigen,
    ubicacion_destino: ruta.ubicacionDestino,
    producto_id: producto.id,
    producto_nombre: producto.nombre || productoDb.nombre,
    cantidad: qty,
    stock_antes: rO.antes,
    stock_despues: rO.despues,
    stock_dest_antes: rD.antes,
    stock_dest_despues: rD.despues,
    motivo: motivo?.trim() || `Traspaso ${folioTrp}`,
    usuario: usuario || '—',
    sucursal: sucursalActiva || sucursalOrigen || '',
    created_at: new Date().toISOString(),
  }, supabase);

  return {
    ok: true,
    log,
    folio: folioTrp,
    mensaje: `Traspaso ${folioTrp}: ${qty} uds. de "${producto.nombre || productoDb.nombre}" (${origenTxt} → ${destTxt}).`,
    patch: rD.patch,
    producto: { ...productoDb, ...rD.patch },
  };
}

export async function aplicarTraspasosMasivos(supabase, opts) {
  const { lineas, inventario, subtipo, sucursalOrigen, sucursalDestino, motivo, usuario, sucursalActiva } = opts;
  const lista = [];
  for (const l of lineas || []) {
    if (!l?.productoId) continue;
    const qty = parseCantidadInventario(l.cantidad);
    if (!qty) {
      return { ok: false, error: `Cantidad inválida en ${l.productoId} («${l.cantidad}»).` };
    }
    lista.push({ productoId: String(l.productoId), cantidad: qty });
  }
  if (!lista.length) return { ok: false, error: 'Agrega al menos un producto con cantidad.' };

  const folio = generarFolioTraspaso();
  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];
  const productosVivos = new Map((inventario || []).map((p) => [String(p.id), { ...p }]));

  for (const { productoId, cantidad } of lista) {
    let producto = productosVivos.get(String(productoId));
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
      folio,
    });
    if (!r.ok) {
      errores.push(`${producto.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    log = r.log || log;
    if (r.producto) productosVivos.set(String(productoId), r.producto);
    else productosVivos.set(String(productoId), { ...producto, ...r.patch });
  }

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se aplicó ningún traspaso.' };
  return {
    ok: true,
    aplicados,
    errores,
    folio,
    log,
    mensaje:
      errores.length > 0
        ? `Traspaso ${folio}: ${aplicados} producto(s) OK. ${errores.length} con error.`
        : `Traspaso ${folio} aplicado: ${aplicados} producto(s).`,
  };
}

export function etiquetaSubtipoTraspaso(id) {
  return SUBTIPOS_TRASPASO.find((s) => s.id === id)?.label || id;
}
