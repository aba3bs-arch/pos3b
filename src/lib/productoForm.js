import { buildPatchStock, buildPatchStockTienda, esAlmacenCentral } from './inventarioMultitienda.js';
import { normalizarCodigosAlt } from './buscarProductoTexto.js';

export const IVA_DEFAULT = 8;
export const GANANCIA_DEFAULT = 30;
/** IVA legacy en BD (16) se trata como 8% del negocio. */
const IVA_LEGACY = 16;

export const OPCIONES_IMPUESTO = [
  { value: 0, label: '0% (exento)' },
  { value: 8, label: '8% (default)' },
  { value: 16, label: '16% (IVA general)' },
];

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Precio al consumidor en pesos enteros (sin centavos). */
export function precioConsumidor(con) {
  return Math.round(Number(con) || 0);
}

/** Normaliza IVA: null, vacío o 16 (default viejo de Supabase) → 8%. */
export function impuestoEfectivo(v) {
  if (v == null || v === '') return IVA_DEFAULT;
  const n = Number(v);
  if (!Number.isFinite(n)) return IVA_DEFAULT;
  if (n === IVA_LEGACY) return IVA_DEFAULT;
  return n;
}

/** Ganancia %: 0 o vacío → 30%. */
export function gananciaEfectiva(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return GANANCIA_DEFAULT;
  return n;
}

export function costoCompraSin(p, impuestoPct = IVA_DEFAULT) {
  let compraSin = Number(p?.precio_compra_sin) || 0;
  if (compraSin <= 0 && Number(p?.precio_compra_con || p?.costo) > 0) {
    compraSin = sinImpuesto(Number(p.precio_compra_con || p.costo), impuestoPct);
  }
  return compraSin;
}

/** Precio al público ya guardado en el producto (el que debe cobrar la caja). */
export function precioVentaGuardado(p) {
  return precioConsumidor(Number(p?.precio ?? p?.precio_venta_con) || 0);
}

/** Precio sugerido: costo + ganancia + IVA. No sustituye al precio guardado. */
export function precioVentaSugeridoPorCosto(p) {
  const impuesto = impuestoEfectivo(p?.impuesto);
  const ganancia = gananciaEfectiva(p?.ganancia_pct);
  const compraSin = costoCompraSin(p, impuesto);
  if (!(compraSin > 0)) return 0;
  return precioVentaConDesdeCompra(compraSin, ganancia, impuesto);
}

/** Lo que cobra la caja: precio guardado; si está en 0, el sugerido por costo (evita vender a $0.00). */
export function precioVentaParaCaja(p) {
  const guardado = precioVentaGuardado(p);
  if (guardado > 0) return guardado;
  return precioVentaSugeridoPorCosto(p);
}

export function precioVentaConDesdeCompra(compraSin, gananciaPct = GANANCIA_DEFAULT, impuestoPct = IVA_DEFAULT) {
  const ventaSin = ventaSinDesdeGanancia(compraSin, gananciaPct);
  return precioConsumidor(conImpuesto(ventaSin, impuestoPct));
}

function aplicarPrecioVentaCalculado(next, imp) {
  const ganancia = gananciaEfectiva(next.ganancia_pct);
  next.ganancia_pct = ganancia;
  const ventaSin = ventaSinDesdeGanancia(next.precio_compra_sin, ganancia);
  next.precio_venta_sin = ventaSin;
  const ventaCon = precioConsumidor(conImpuesto(ventaSin, imp));
  next.precio_venta_con = ventaCon;
  next.precio = ventaCon;
  return next;
}

export function conImpuesto(sin, impuestoPct) {
  const f = 1 + Number(impuestoPct || 0) / 100;
  return round2(Number(sin || 0) * f);
}

export function sinImpuesto(con, impuestoPct) {
  const f = 1 + Number(impuestoPct || 0) / 100;
  return f > 0 ? round2(Number(con || 0) / f) : round2(Number(con || 0));
}

export function gananciaDesdePrecios(compraSin, ventaSin) {
  const c = Number(compraSin) || 0;
  if (c <= 0) return 0;
  return round2(((Number(ventaSin || 0) / c - 1) * 100));
}

export function ventaSinDesdeGanancia(compraSin, gananciaPct) {
  return round2(Number(compraSin || 0) * (1 + Number(gananciaPct || 0) / 100));
}

export function productoVacio() {
  return {
    id: '',
    nombre: '',
    descripcion: '',
    foto_url: '',
    cat: 'GENERAL',
    clave_sat: '',
    impuesto: IVA_DEFAULT,
    precio_compra_sin: 0,
    precio_compra_con: 0,
    precio_ruta: 0,
    ganancia_pct: GANANCIA_DEFAULT,
    precio_venta_sin: 0,
    precio_venta_con: 0,
    precio: 0,
    stock: 0,
    stock_cedis: 0,
    stock_sucursales: null,
    stock_minimo: 6,
    en_venta: true,
    en_favoritos: false,
    codigos_alt: [],
  };
}

export function productoDesdeDb(p) {
  if (!p) return productoVacio();
  const impuesto = impuestoEfectivo(p.impuesto);
  let compraSin = costoCompraSin(p, impuesto);
  const compraCon = p.precio_compra_con != null ? Number(p.precio_compra_con) : conImpuesto(compraSin, impuesto);

  const precioGuardado = precioVentaGuardado(p);
  let ventaCon;
  let ventaSin;
  let ganancia = Number(p.ganancia_pct);

  // El precio de venta guardado manda. No recalcular al abrir (eso hacía que
  // el formulario mostrara $26 y la caja cobrara $0 o $2).
  if (precioGuardado > 0) {
    ventaCon = precioGuardado;
    ventaSin = Number(p.precio_venta_sin) > 0 ? Number(p.precio_venta_sin) : sinImpuesto(ventaCon, impuesto);
    if (!Number.isFinite(ganancia) || ganancia <= 0) {
      ganancia = compraSin > 0 ? gananciaDesdePrecios(compraSin, ventaSin) : GANANCIA_DEFAULT;
    }
    if (!Number.isFinite(ganancia) || ganancia <= 0) ganancia = GANANCIA_DEFAULT;
  } else if (compraSin > 0) {
    ganancia = gananciaEfectiva(p.ganancia_pct);
    ventaSin = ventaSinDesdeGanancia(compraSin, ganancia);
    ventaCon = precioVentaConDesdeCompra(compraSin, ganancia, impuesto);
  } else {
    ganancia = gananciaEfectiva(p.ganancia_pct);
    ventaCon = 0;
    ventaSin = 0;
  }

  return {
    id: p.id || '',
    nombre: p.nombre || '',
    descripcion: p.descripcion || '',
    // Algunos registros guardan la imagen en `foto` en vez de `foto_url`.
    // ProductoThumb ya intenta ambos, pero aquí normalizamos a foto_url para el flujo de catálogo/favoritos.
    foto_url: p.foto_url || p.foto || '',
    cat: p.cat || 'GENERAL',
    clave_sat: p.clave_sat || '',
    impuesto,
    precio_compra_sin: compraSin,
    precio_compra_con: compraCon,
    ganancia_pct: ganancia,
    precio_venta_sin: ventaSin,
    precio_venta_con: ventaCon,
    precio: ventaCon,
    stock: Number(p.stock) || 0,
    stock_cedis: Number(p.stock_cedis) || 0,
    stock_sucursales: p.stock_sucursales && typeof p.stock_sucursales === 'object' ? p.stock_sucursales : null,
    stock_minimo: p.stock_minimo != null ? Number(p.stock_minimo) : 6,
    en_venta: p.en_venta !== false,
    en_favoritos: Boolean(p.en_favoritos) || p.cat === 'FAVORITOS',
    codigos_alt: normalizarCodigosAlt(p.codigos_alt),
  };
}

/** Recalcula precios derivados según el campo que el usuario editó. */
export function actualizarCampoProducto(form, campo, valor) {
  const next = { ...form, [campo]: valor };
  const imp = impuestoEfectivo(next.impuesto);
  next.impuesto = imp;

  if (campo === 'impuesto') {
    next.precio_compra_con = conImpuesto(next.precio_compra_sin, imp);
    next.precio_venta_con = precioConsumidor(conImpuesto(next.precio_venta_sin, imp));
    next.precio = next.precio_venta_con;
    return next;
  }

  if (campo === 'precio_compra_sin') {
    next.precio_compra_con = conImpuesto(valor, imp);
    return aplicarPrecioVentaCalculado(next, imp);
  }

  if (campo === 'precio_compra_con') {
    next.precio_compra_sin = sinImpuesto(valor, imp);
    return aplicarPrecioVentaCalculado(next, imp);
  }

  if (campo === 'ganancia_pct') {
    next.ganancia_pct = gananciaEfectiva(valor);
    return aplicarPrecioVentaCalculado(next, imp);
  }

  if (campo === 'precio_venta_sin') {
    next.precio_venta_sin = round2(valor);
    next.precio_venta_con = precioConsumidor(conImpuesto(valor, imp));
    next.precio = next.precio_venta_con;
    next.ganancia_pct = gananciaDesdePrecios(next.precio_compra_sin, next.precio_venta_sin);
    return next;
  }

  if (campo === 'precio_venta_con' || campo === 'precio') {
    const con = precioConsumidor(valor);
    next.precio_venta_con = con;
    next.precio = con;
    next.precio_venta_sin = sinImpuesto(con, imp);
    next.ganancia_pct = gananciaDesdePrecios(next.precio_compra_sin, next.precio_venta_sin);
    return next;
  }

  return next;
}

export function productoParaGuardar(form, opts = {}) {
  const { productoDb, sucursal } = opts;
  const imp = impuestoEfectivo(form.impuesto);
  const ventaCon = precioConsumidor(form.precio_venta_con ?? form.precio ?? 0);
  const ventaSin = round2(form.precio_venta_sin ?? sinImpuesto(ventaCon, imp));
  const compraCon = round2(form.precio_compra_con ?? conImpuesto(form.precio_compra_sin, imp));
  const compraSin = round2(form.precio_compra_sin);
  const stockPiso = Math.max(0, parseInt(String(form.stock), 10) || 0);
  const stockCedis = Math.max(0, parseInt(String(form.stock_cedis), 10) || 0);
  const id = String(form.id || '').trim();
  const idKey = id.toLowerCase();
  const codigosAlt = normalizarCodigosAlt(form.codigos_alt).filter((c) => c.toLowerCase() !== idKey);
  const base = {
    id,
    nombre: String(form.nombre || '').trim(),
    descripcion: String(form.descripcion || '').trim() || null,
    foto_url: form.foto_url?.trim() || null,
    cat: form.cat || 'GENERAL',
    clave_sat: String(form.clave_sat || '').trim() || null,
    impuesto: imp,
    precio_compra_sin: compraSin,
    precio_compra_con: compraCon,
    costo: compraCon,
    ganancia_pct: round2(form.ganancia_pct),
    precio_venta_sin: ventaSin,
    precio: ventaCon,
    stock_minimo: Math.max(0, parseInt(String(form.stock_minimo), 10) || 0),
    en_venta: form.en_venta !== false,
    en_favoritos: Boolean(form.en_favoritos),
    codigos_alt: codigosAlt,
  };
  if (sucursal) {
    const origen = productoDb || { ...form, stock_sucursales: form.stock_sucursales };
    if (esAlmacenCentral(sucursal)) {
      return { ...base, ...buildPatchStockTienda(origen, sucursal, stockPiso, stockCedis, sucursal) };
    }
    return { ...base, ...buildPatchStock(origen, sucursal, 'piso', stockPiso, sucursal) };
  }
  return { ...base, stock: stockPiso, stock_cedis: stockCedis };
}

export function productoEnVenta(p) {
  return p?.en_venta !== false;
}

export function productoEsFavorito(p) {
  return Boolean(p?.en_favoritos) || p?.cat === 'FAVORITOS';
}

export function mensajeErrorColumnasProducto(error) {
  const msg = String(error?.message || error || '');
  if (msg.includes('codigos_alt')) {
    return 'Falta la columna codigos_alt. Ejecuta en Supabase: supabase/fix_productos_codigos_alt.sql';
  }
  if (msg.includes('null value in column "costo"')) {
    return 'La columna costo en productos requiere valor. Actualiza la app (Ctrl+F5) o ejecuta supabase/fix_supabase_todas_columnas.sql en Supabase.';
  }
  if (msg.includes('Could not find') && msg.includes('productos') && msg.includes('schema cache')) {
    return 'Faltan columnas en productos. Ejecuta en Supabase: supabase/fix_supabase_todas_columnas.sql';
  }
  if (msg.includes('column') && msg.includes('does not exist') && msg.includes('productos')) {
    return 'Faltan columnas en productos. Ejecuta en Supabase: supabase/fix_supabase_todas_columnas.sql (o fix_productos_codigos_alt.sql).';
  }
  return null;
}
