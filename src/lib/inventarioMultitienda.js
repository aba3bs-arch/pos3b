import { normalizarCodigoTienda, etiquetaTienda, listarSucursales } from '../constants/sucursales.js';

/** MAIN = central de administración / CEDIS de toda la cadena. */
export const ALMACEN_CENTRAL = 'MAIN';

export function esAlmacenCentral(sucursal) {
  return normalizarCodigoTienda(sucursal) === ALMACEN_CENTRAL;
}

export function etiquetaAlmacenCentral() {
  return 'Central de administración (MAIN)';
}

export function parseStockSucursales(producto) {
  const raw = producto?.stock_sucursales;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? { ...p } : {};
  } catch {
    return {};
  }
}

/** Migra columnas legacy a stock_sucursales si el mapa está vacío. */
export function asegurarMapaStock(producto, sucursalContext = 'MAIN') {
  const existente = parseStockSucursales(producto);
  if (Object.keys(existente).length > 0) return existente;

  const map = {};
  const cedisLegacy = Number(producto?.stock_cedis) || 0;
  const pisoLegacy = Number(producto?.stock) || 0;
  const ctx = normalizarCodigoTienda(sucursalContext) || ALMACEN_CENTRAL;

  map[ALMACEN_CENTRAL] = { cedis: cedisLegacy, piso: 0 };

  if (pisoLegacy > 0) {
    if (ctx === ALMACEN_CENTRAL) {
      const tiendas = listarSucursales().filter((t) => t !== ALMACEN_CENTRAL);
      const dest = tiendas[0] || 'FUSION';
      map[dest] = { cedis: 0, piso: pisoLegacy };
    } else {
      map[ctx] = { cedis: 0, piso: pisoLegacy };
    }
  }

  return map;
}

export function stockEnUbicacion(producto, sucursal, ubicacion, sucursalContext) {
  return stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalContext);
}

/** Stock real (puede ser negativo tras ventas sin existencia en sistema). */
export function stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext || sucursal);
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return 0;
  return Math.floor(Number(map[suc]?.[ubicacion]) || 0);
}

/** Stock de almacén central (MAIN · cedis). */
export function stockAlmacenCentral(producto, sucursalContext) {
  return stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', sucursalContext);
}

export function productoParaVistaTienda(producto, sucursal, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext || sucursal);
  const suc = normalizarCodigoTienda(sucursal);
  const bucket = map[suc] || { cedis: 0, piso: 0 };
  return {
    ...producto,
    stock_sucursales: map,
    stock: bucket.piso,
    stock_cedis: bucket.cedis,
    _sucursalVista: suc,
  };
}

export function inventarioParaSucursal(inventario, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (inventario || []).map((p) => productoParaVistaTienda(p, suc, suc));
}

function syncColumnasLegacy(patch, map, sucursalActiva) {
  const act = normalizarCodigoTienda(sucursalActiva);
  if (act && map[act]) {
    patch.stock = map[act].piso;
    patch.stock_cedis = map[act].cedis;
  }
  return patch;
}

export function buildPatchStock(producto, sucursal, ubicacion, nuevoValor, sucursalActiva, opts = {}) {
  const { permitirNegativo = false } = opts;
  const map = { ...asegurarMapaStock(producto, sucursalActiva) };
  const suc = normalizarCodigoTienda(sucursal);
  if (!map[suc]) map[suc] = { cedis: 0, piso: 0 };
  const val = Math.floor(Number(nuevoValor) || 0);
  map[suc][ubicacion] = permitirNegativo ? val : Math.max(0, val);
  return syncColumnasLegacy({ stock_sucursales: map }, map, sucursalActiva);
}

/** Piso + CEDIS de una tienda en un solo patch. */
export function buildPatchStockTienda(producto, sucursal, piso, cedis, sucursalActiva) {
  let base = producto || {};
  let patch = buildPatchStock(base, sucursal, 'piso', piso, sucursalActiva);
  base = { ...base, ...patch };
  return buildPatchStock(base, sucursal, 'cedis', cedis, sucursalActiva);
}

/** Pone en cero el stock de todas las sucursales del producto. */
export function buildPatchVaciarInventarioCompleto(producto) {
  const map = { ...asegurarMapaStock(producto, 'MAIN') };
  for (const s of listarSucursales()) {
    map[s] = { cedis: 0, piso: 0 };
  }
  for (const s of Object.keys(map)) {
    map[s] = { cedis: 0, piso: 0 };
  }
  return { stock_sucursales: map, stock: 0, stock_cedis: 0 };
}

export function aplicarDeltaStock(producto, sucursal, ubicacion, delta, sucursalActiva, opts = {}) {
  const { permitirNegativo = false } = opts;
  const antes = stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalActiva);
  const qty = Math.floor(Number(delta));
  const despues = antes + qty;
  if (!permitirNegativo && despues < 0) {
    const donde = esAlmacenCentral(sucursal) && ubicacion === 'cedis'
      ? etiquetaAlmacenCentral()
      : `${ubicacion === 'cedis' ? 'CEDIS' : 'Piso'} · ${etiquetaTienda(sucursal)}`;
    return { ok: false, error: `Stock insuficiente en ${donde} (hay ${antes}, pides ${Math.abs(qty)}).` };
  }
  return {
    ok: true,
    patch: buildPatchStock(producto, sucursal, ubicacion, despues, sucursalActiva, { permitirNegativo }),
    antes,
    despues,
  };
}

/** Ubicación por defecto para entradas según tienda. */
export function ubicacionEntradaDefault() {
  return 'cedis';
}

/** Resumen de stock por tienda para panel admin. */
export function resumenStockProducto(producto, sucursales, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext);
  return (sucursales || listarSucursales()).map((s) => ({
    sucursal: s,
    etiqueta: esAlmacenCentral(s) ? etiquetaAlmacenCentral() : etiquetaTienda(s),
    cedis: Math.max(0, Number(map[s]?.cedis) || 0),
    piso: Math.max(0, Number(map[s]?.piso) || 0),
  }));
}
