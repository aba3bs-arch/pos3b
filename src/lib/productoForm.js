import { buildPatchStock } from './inventarioMultitienda.js';

export const OPCIONES_IMPUESTO = [
  { value: 0, label: '0% (exento)' },
  { value: 8, label: '8%' },
  { value: 16, label: '16% (IVA general)' },
];

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
    impuesto: 16,
    precio_compra_sin: 0,
    precio_compra_con: 0,
    ganancia_pct: 30,
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
  const impuesto = p.impuesto != null ? Number(p.impuesto) : 16;
  const precioCon = Number(p.precio) || 0;
  const ventaSin = p.precio_venta_sin != null ? Number(p.precio_venta_sin) : sinImpuesto(precioCon, impuesto);
  const ventaCon = precioCon || conImpuesto(ventaSin, impuesto);
  const compraSin = Number(p.precio_compra_sin) || 0;
  const compraCon = p.precio_compra_con != null ? Number(p.precio_compra_con) : conImpuesto(compraSin, impuesto);
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
    ganancia_pct: p.ganancia_pct != null ? Number(p.ganancia_pct) : gananciaDesdePrecios(compraSin, ventaSin),
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
  const imp = Number(next.impuesto) || 0;

  if (campo === 'impuesto') {
    next.precio_compra_con = conImpuesto(next.precio_compra_sin, imp);
    next.precio_venta_con = conImpuesto(next.precio_venta_sin, imp);
    next.precio = next.precio_venta_con;
    return next;
  }

  if (campo === 'precio_compra_sin') {
    next.precio_compra_con = conImpuesto(valor, imp);
    next.precio_venta_sin = ventaSinDesdeGanancia(valor, next.ganancia_pct);
    next.precio_venta_con = conImpuesto(next.precio_venta_sin, imp);
    next.precio = next.precio_venta_con;
    return next;
  }

  if (campo === 'precio_compra_con') {
    next.precio_compra_sin = sinImpuesto(valor, imp);
    next.precio_venta_sin = ventaSinDesdeGanancia(next.precio_compra_sin, next.ganancia_pct);
    next.precio_venta_con = conImpuesto(next.precio_venta_sin, imp);
    next.precio = next.precio_venta_con;
    return next;
  }

  if (campo === 'ganancia_pct') {
    next.precio_venta_sin = ventaSinDesdeGanancia(next.precio_compra_sin, valor);
    next.precio_venta_con = conImpuesto(next.precio_venta_sin, imp);
    next.precio = next.precio_venta_con;
    return next;
  }

  if (campo === 'precio_venta_sin') {
    next.precio_venta_con = conImpuesto(valor, imp);
    next.precio = next.precio_venta_con;
    next.ganancia_pct = gananciaDesdePrecios(next.precio_compra_sin, valor);
    return next;
  }

  if (campo === 'precio_venta_con' || campo === 'precio') {
    const con = round2(valor);
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
  const imp = Number(form.impuesto) || 0;
  const ventaCon = round2(form.precio_venta_con ?? form.precio ?? 0);
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
