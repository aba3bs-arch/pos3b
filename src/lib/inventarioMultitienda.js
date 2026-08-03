import { normalizarCodigoTienda, etiquetaTienda, listarSucursales } from '../constants/sucursales.js';

/** MAIN = central de administración y CEDIS (almacén) de toda la cadena. */
export const ALMACEN_CENTRAL = 'MAIN';

export function esAlmacenCentral(sucursal) {
  return normalizarCodigoTienda(sucursal) === ALMACEN_CENTRAL;
}

export function etiquetaAlmacenCentral() {
  return 'Central de administración (MAIN)';
}

export function etiquetaCedisEmpresa() {
  return 'CEDIS · almacén central';
}

/** El CEDIS vive solo en MAIN; el piso de venta en cada sucursal. */
export function sucursalParaUbicacion(sucursal, ubicacion) {
  if (ubicacion === 'cedis') return ALMACEN_CENTRAL;
  return normalizarCodigoTienda(sucursal);
}

/** Normaliza una entrada de sucursal (objeto, número plano o formas legacy). */
export function normalizarEntradaStockSucursal(raw) {
  if (raw == null) return { cedis: 0, piso: 0 };
  if (typeof raw === 'number' || typeof raw === 'string') {
    return { cedis: 0, piso: Math.floor(Number(raw) || 0) };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const piso = Math.floor(Number(raw.piso ?? raw.stock ?? raw.cantidad ?? raw.existencia) || 0);
    const cedis = Math.floor(Number(raw.cedis) || 0);
    return { cedis, piso };
  }
  return { cedis: 0, piso: 0 };
}

export function parseStockSucursales(producto) {
  const raw = producto?.stock_sucursales;
  if (!raw) return {};
  let obj = null;
  if (typeof raw === 'object' && !Array.isArray(raw)) obj = { ...raw };
  else {
    try {
      const p = JSON.parse(raw);
      obj = p && typeof p === 'object' && !Array.isArray(p) ? { ...p } : null;
    } catch {
      return {};
    }
  }
  if (!obj) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const suc = normalizarCodigoTienda(k) || String(k || '').trim().toUpperCase();
    if (!suc) continue;
    out[suc] = normalizarEntradaStockSucursal(v);
  }
  return out;
}

/** Consolida CEDIS de sucursales en MAIN (migración / datos legacy). */
export function normalizarMapaStockCedisUnico(map) {
  const m = {};
  for (const [k, v] of Object.entries(map || {})) {
    const suc = normalizarCodigoTienda(k) || String(k || '').trim().toUpperCase();
    if (!suc) continue;
    m[suc] = normalizarEntradaStockSucursal(v);
  }
  let cedisCentral = Math.floor(Number(m[ALMACEN_CENTRAL]?.cedis) || 0);

  for (const s of Object.keys(m)) {
    if (s === ALMACEN_CENTRAL) continue;
    const branchCedis = Math.floor(Number(m[s]?.cedis) || 0);
    if (branchCedis > 0) cedisCentral += branchCedis;
    m[s] = { cedis: 0, piso: Math.floor(Number(m[s]?.piso) || 0) };
  }

  if (!m[ALMACEN_CENTRAL]) m[ALMACEN_CENTRAL] = { cedis: 0, piso: 0 };
  m[ALMACEN_CENTRAL] = {
    cedis: cedisCentral,
    piso: Math.floor(Number(m[ALMACEN_CENTRAL]?.piso) || 0),
  };

  return m;
}

/** Migra columnas legacy a stock_sucursales si el mapa está vacío. */
export function asegurarMapaStock(producto, sucursalContext = 'MAIN') {
  const existente = parseStockSucursales(producto);
  const ctx = normalizarCodigoTienda(sucursalContext) || ALMACEN_CENTRAL;
  const cedisLegacy = Number(producto?.stock_cedis) || 0;
  const pisoLegacy = Math.floor(Number(producto?.stock) || 0);

  if (Object.keys(existente).length > 0) {
    const map = normalizarMapaStockCedisUnico(existente);
    // NO sembrar piso de la tienda activa desde `stock` legado:
    // esa columna es global (última caja que escribió) y inventa existencias falsas
    // (ej. Smoking en 3B5 mostraba 6 sin tener clave 3B5 en el mapa).
    // Tienda sin clave en el mapa = 0 piezas reales en esa sucursal.
    const cedisMapa = Math.floor(Number(map[ALMACEN_CENTRAL]?.cedis) || 0);
    if (cedisLegacy > cedisMapa) {
      if (!map[ALMACEN_CENTRAL]) map[ALMACEN_CENTRAL] = { cedis: 0, piso: 0 };
      map[ALMACEN_CENTRAL] = {
        ...map[ALMACEN_CENTRAL],
        cedis: cedisLegacy,
        piso: Math.floor(Number(map[ALMACEN_CENTRAL]?.piso) || 0),
      };
    }
    return map;
  }

  const map = {};
  map[ALMACEN_CENTRAL] = { cedis: cedisLegacy, piso: 0 };

  if (pisoLegacy > 0) {
    if (ctx === ALMACEN_CENTRAL) {
      map[ALMACEN_CENTRAL] = { cedis: cedisLegacy, piso: pisoLegacy };
    } else {
      map[ctx] = { cedis: 0, piso: pisoLegacy };
    }
  }

  return normalizarMapaStockCedisUnico(map);
}

export function stockEnUbicacion(producto, sucursal, ubicacion, sucursalContext) {
  return stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalContext);
}

/** Stock real (puede ser negativo tras ventas sin existencia en sistema). */
export function stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext || sucursal);
  const sucStock = sucursalParaUbicacion(sucursal, ubicacion);
  if (!sucStock) return 0;
  return Math.floor(Number(map[sucStock]?.[ubicacion]) || 0);
}

/** Stock del almacén central (MAIN · cedis). */
export function stockAlmacenCentral(producto, sucursalContext) {
  return stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', sucursalContext);
}

export function productoParaVistaTienda(producto, sucursal, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext || sucursal);
  const suc = normalizarCodigoTienda(sucursal);
  const cedisEmpresa = Math.max(0, Number(map[ALMACEN_CENTRAL]?.cedis) || 0);
  // No enmascarar negativos: si la tienda quedó en -N por ventas sin existencias,
  // el badge debe mostrar -N (rojo), no un 0 falso.
  const pisoRaw = map[suc]?.piso;
  const pisoTienda = Number.isFinite(Number(pisoRaw)) ? Math.floor(Number(pisoRaw)) : 0;
  return {
    ...producto,
    stock_sucursales: map,
    stock: pisoTienda,
    stock_cedis: cedisEmpresa,
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
  }
  patch.stock_cedis = Math.max(0, Number(map[ALMACEN_CENTRAL]?.cedis) || 0);
  return patch;
}

export function buildPatchStock(producto, sucursal, ubicacion, nuevoValor, sucursalActiva, opts = {}) {
  const { permitirNegativo = false } = opts;
  const map = { ...asegurarMapaStock(producto, sucursalActiva) };
  const sucStock = sucursalParaUbicacion(sucursal, ubicacion);
  if (!map[sucStock]) map[sucStock] = { cedis: 0, piso: 0 };
  const val = Math.floor(Number(nuevoValor) || 0);
  map[sucStock][ubicacion] = permitirNegativo ? val : Math.max(0, val);
  return syncColumnasLegacy({ stock_sucursales: normalizarMapaStockCedisUnico(map) }, map, sucursalActiva);
}

/** Piso de la tienda + CEDIS central (MAIN) en un solo patch. */
export function buildPatchStockTienda(producto, sucursal, piso, cedis, sucursalActiva) {
  let base = producto || {};
  let patch = buildPatchStock(base, sucursal, 'piso', piso, sucursalActiva);
  base = { ...base, ...patch };
  return buildPatchStock(base, ALMACEN_CENTRAL, 'cedis', cedis, sucursalActiva);
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
  map[ALMACEN_CENTRAL] = { cedis: 0, piso: 0 };
  return { stock_sucursales: map, stock: 0, stock_cedis: 0 };
}

export function aplicarDeltaStock(producto, sucursal, ubicacion, delta, sucursalActiva, opts = {}) {
  const { permitirNegativo = false } = opts;
  const antes = stockEnUbicacionReal(producto, sucursal, ubicacion, sucursalActiva);
  const qty = Math.floor(Number(delta));
  const despues = antes + qty;
  if (!permitirNegativo && despues < 0) {
    const sucStock = sucursalParaUbicacion(sucursal, ubicacion);
    const donde =
      ubicacion === 'cedis'
        ? etiquetaCedisEmpresa()
        : `${esAlmacenCentral(sucStock) ? etiquetaAlmacenCentral() : `Piso · ${etiquetaTienda(sucStock)}`}`;
    return { ok: false, error: `Stock insuficiente en ${donde} (hay ${antes}, pides ${Math.abs(qty)}).` };
  }
  return {
    ok: true,
    patch: buildPatchStock(producto, sucursal, ubicacion, despues, sucursalActiva, { permitirNegativo }),
    antes,
    despues,
  };
}

/** Entero de stock; si no se permiten negativos en UI, muestra 0. */
export function stockVisible(valor, verNegativos = true) {
  const n = Number.isFinite(Number(valor)) ? Math.floor(Number(valor)) : 0;
  if (!verNegativos && n < 0) return 0;
  return n;
}

/**
 * Texto corto de existencia para listas (Main muestra CEDIS + piso).
 * @param {{ verNegativos?: boolean }} [opts] — false oculta negativos (cajero/repartidor).
 */
export function etiquetaStockLista(producto, sucursal, opts = {}) {
  const verNegativos = opts.verNegativos !== false;
  const piso = stockVisible(producto?.stock, verNegativos);
  if (esAlmacenCentral(sucursal)) {
    const cedis = stockVisible(producto?.stock_cedis, verNegativos);
    return { primario: cedis, etiquetaPrimario: 'CEDIS', secundario: piso, etiquetaSecundario: 'Piso' };
  }
  return { primario: piso, etiquetaPrimario: 'PZA', secundario: null, etiquetaSecundario: null };
}

/** Ubicación por defecto para entradas: CEDIS central en MAIN, piso en tiendas. */
export function ubicacionEntradaDefault(sucursal) {
  return esAlmacenCentral(sucursal) ? 'cedis' : 'piso';
}

/** Resumen de stock por tienda para panel admin. */
export function resumenStockProducto(producto, sucursales, sucursalContext) {
  const map = asegurarMapaStock(producto, sucursalContext);
  return (sucursales || listarSucursales()).map((s) => ({
    sucursal: s,
    etiqueta: esAlmacenCentral(s) ? etiquetaAlmacenCentral() : etiquetaTienda(s),
    cedis: esAlmacenCentral(s) ? Math.floor(Number(map[s]?.cedis) || 0) : 0,
    // No enmascarar negativos: ventas sin existencia deben verse.
    piso: Number.isFinite(Number(map[s]?.piso)) ? Math.floor(Number(map[s].piso)) : 0,
  }));
}
