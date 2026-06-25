import { buildPatchStock } from './inventarioMultitienda.js';

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
  };
}

export function productoDesdeDb(p) {
  if (!p) return productoVacio();
  const impuesto = impuestoEfectivo(p.impuesto);
  const ganancia = gananciaEfectiva(p.ganancia_pct);
  let compraSin = Number(p.precio_compra_sin) || 0;
  if (compraSin <= 0 && Number(p.precio_compra_con || p.costo) > 0) {
    compraSin = sinImpuesto(Number(p.precio_compra_con || p.costo), impuesto);
  }
  const compraCon = p.precio_compra_con != null ? Number(p.precio_compra_con) : conImpuesto(compraSin, impuesto);

  let ventaCon;
  let ventaSin;
  if (compraSin > 0) {
    ventaSin = ventaSinDesdeGanancia(compraSin, ganancia);
    ventaCon = precioVentaConDesdeCompra(compraSin, ganancia, impuesto);
  } else {
    ventaCon = precioConsumidor(Number(p.precio) || 0);
    ventaSin = p.precio_venta_sin != null ? Number(p.precio_venta_sin) : sinImpuesto(ventaCon, impuesto);
  }

  return {
    id: p.id || '',
    nombre: p.nombre || '',
    descripcion: p.descripcion || '',
    foto_url: p.foto_url || '',
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
  const base = {
    id: String(form.id || '').trim(),
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
  };
  if (sucursal) {
    const origen = productoDb || { ...form, stock_sucursales: form.stock_sucursales };
    return { ...base, ...buildPatchStock(origen, sucursal, 'piso', stockPiso, sucursal) };
  }
  return { ...base, stock: stockPiso };
}

export function productoEnVenta(p) {
  return p?.en_venta !== false;
}

export function productoEsFavorito(p) {
  return Boolean(p?.en_favoritos) || p?.cat === 'FAVORITOS';
}

export function mensajeErrorColumnasProducto(error) {
  const msg = String(error?.message || error || '');
  if (msg.includes('null value in column "costo"')) {
    return 'La columna costo en productos requiere valor. Actualiza la app (Ctrl+F5) o ejecuta supabase/fix_supabase_todas_columnas.sql en Supabase.';
  }
  if (msg.includes('Could not find') && msg.includes('productos') && msg.includes('schema cache')) {
    return 'Faltan columnas en productos. Ejecuta en Supabase: supabase/fix_supabase_todas_columnas.sql';
  }
  if (msg.includes('column') && msg.includes('does not exist') && msg.includes('productos')) {
    return 'Faltan columnas en productos. Ejecuta en Supabase: supabase/fix_supabase_todas_columnas.sql';
  }
  return null;
}
