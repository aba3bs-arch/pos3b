import {
  GANANCIA_DEFAULT,
  IVA_DEFAULT,
  mensajeErrorColumnasProducto,
  precioVentaConDesdeCompra,
  productoParaGuardar,
  productoVacio,
  round2,
  sinImpuesto,
} from './productoForm.js';

export const AVISO_FALTA_TABLA_CATALOGO =
  'Ejecuta en Supabase: supabase/fix_proveedor_catalogo.sql para crear el catálogo de proveedores.';

export function nombreCatalogoItem(item) {
  if (!item) return '';
  const n = String(item.nombre || '').trim();
  const p = String(item.presentacion || '').trim();
  return p ? `${n} ${p}` : n;
}

export function esErrorTablaCatalogo(error) {
  const msg = String(error?.message || '');
  return error?.code === '42P01' || (msg.includes('relation') && msg.includes('proveedor_catalogo'));
}

export async function listarCatalogoProveedor(supabase, proveedorId) {
  if (!supabase || !proveedorId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('proveedor_catalogo')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  return { data: data || [], error };
}

export async function guardarItemCatalogo(supabase, proveedorId, item, editId = null) {
  if (!supabase || !proveedorId) return { ok: false, error: 'Sin conexión.' };
  const nombre = String(item?.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'Nombre obligatorio.' };

  const row = {
    proveedor_id: proveedorId,
    nombre,
    presentacion: String(item?.presentacion || '').trim() || null,
    sku_proveedor: String(item?.sku_proveedor || '').trim() || null,
    codigo_barras: String(item?.codigo_barras || '').trim() || null,
    cat: String(item?.cat || 'GENERAL').trim() || 'GENERAL',
    precio_compra_sugerido:
      item?.precio_compra_sugerido != null && item.precio_compra_sugerido !== ''
        ? round2(item.precio_compra_sugerido)
        : null,
    activo: item?.activo !== false,
    orden: Math.max(0, parseInt(String(item?.orden ?? 0), 10) || 0),
  };

  if (editId) {
    const { error } = await supabase.from('proveedor_catalogo').update(row).eq('id', editId);
    if (error) {
      if (esErrorTablaCatalogo(error)) return { ok: false, error: AVISO_FALTA_TABLA_CATALOGO };
      if (error.code === '23505') return { ok: false, error: 'Ya existe ese producto en el catálogo del proveedor.' };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const { error } = await supabase.from('proveedor_catalogo').insert([row]);
  if (error) {
    if (esErrorTablaCatalogo(error)) return { ok: false, error: AVISO_FALTA_TABLA_CATALOGO };
    if (error.code === '23505') return { ok: false, error: 'Ya existe ese producto en el catálogo del proveedor.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function eliminarItemCatalogo(supabase, catalogoId) {
  if (!supabase || !catalogoId) return { ok: false, error: 'Sin conexión.' };
  const { error } = await supabase.from('proveedor_catalogo').delete().eq('id', catalogoId);
  if (error) {
    if (esErrorTablaCatalogo(error)) return { ok: false, error: AVISO_FALTA_TABLA_CATALOGO };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function vincularProveedorProducto(supabase, proveedorId, productoId, skuProveedor) {
  const { data: existe } = await supabase
    .from('proveedor_producto')
    .select('id')
    .eq('proveedor_id', proveedorId)
    .eq('producto_id', productoId)
    .maybeSingle();
  if (existe?.id) return { ok: true };
  const { error } = await supabase.from('proveedor_producto').insert([
    {
      proveedor_id: proveedorId,
      producto_id: productoId,
      sku_proveedor: skuProveedor || null,
    },
  ]);
  if (error && error.code !== '23505') return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Crea o enlaza un ítem del catálogo del proveedor en productos (inventario de la sucursal activa).
 */
export async function registrarCatalogoEnInventario(supabase, catalogoId, opts = {}) {
  const { sucursal, codigo, stockInicial = 0, precioCompra, cargarDatos } = opts;
  if (!supabase || !catalogoId) return { ok: false, error: 'Sin conexión.' };
  if (!sucursal) return { ok: false, error: 'Selecciona la sucursal activa.' };

  const { data: item, error: errItem } = await supabase.from('proveedor_catalogo').select('*').eq('id', catalogoId).maybeSingle();
  if (errItem) {
    if (esErrorTablaCatalogo(errItem)) return { ok: false, error: AVISO_FALTA_TABLA_CATALOGO };
    return { ok: false, error: errItem.message };
  }
  if (!item) return { ok: false, error: 'Ítem de catálogo no encontrado.' };
  if (item.producto_id) {
    return { ok: true, producto_id: item.producto_id, yaRegistrado: true };
  }

  const codigoFinal = String(codigo || item.codigo_barras || '').trim();
  if (!codigoFinal) return { ok: false, error: 'Indica el código de barras para registrar en inventario.' };

  const { data: productoExistente } = await supabase.from('productos').select('id, nombre').eq('id', codigoFinal).maybeSingle();

  if (productoExistente) {
    const { error: errCat } = await supabase
      .from('proveedor_catalogo')
      .update({ producto_id: codigoFinal })
      .eq('id', catalogoId);
    if (errCat) return { ok: false, error: errCat.message };
    const v = await vincularProveedorProducto(supabase, item.proveedor_id, codigoFinal, item.sku_proveedor);
    if (!v.ok) return v;
    if (typeof cargarDatos === 'function') await cargarDatos();
    return { ok: true, producto_id: codigoFinal, existente: true, nombre: productoExistente.nombre };
  }

  const compraCon = round2(precioCompra ?? item.precio_compra_sugerido ?? 0);
  const compraSin = compraCon > 0 ? sinImpuesto(compraCon, IVA_DEFAULT) : 0;
  const ventaCon = compraSin > 0 ? precioVentaConDesdeCompra(compraSin, GANANCIA_DEFAULT, IVA_DEFAULT) : 0;

  const form = productoVacio();
  form.id = codigoFinal;
  form.nombre = nombreCatalogoItem(item);
  form.cat = item.cat || 'GENERAL';
  form.precio_compra_sin = compraSin;
  form.precio_compra_con = compraCon;
  form.precio_venta_con = ventaCon;
  form.precio = ventaCon;
  form.stock = Math.max(0, parseInt(String(stockInicial), 10) || 0);

  const payload = productoParaGuardar(form, { sucursal });
  const { error: errInsert } = await supabase.from('productos').insert([payload]);
  if (errInsert) {
    const aviso = mensajeErrorColumnasProducto(errInsert);
    return { ok: false, error: aviso || errInsert.message };
  }

  const { error: errCat } = await supabase.from('proveedor_catalogo').update({ producto_id: codigoFinal }).eq('id', catalogoId);
  if (errCat) return { ok: false, error: errCat.message };

  const v = await vincularProveedorProducto(supabase, item.proveedor_id, codigoFinal, item.sku_proveedor);
  if (!v.ok) return v;

  if (typeof cargarDatos === 'function') await cargarDatos();
  return { ok: true, producto_id: codigoFinal, nombre: form.nombre };
}

/**
 * Registra en inventario todos los ítems pendientes que ya tienen código de barras.
 * Usa precio del catálogo y stock 0 (sin preguntar uno por uno).
 */
export async function registrarCatalogoPendientesEnInventario(supabase, items, opts = {}) {
  const { sucursal, stockInicial = 0, cargarDatos } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!sucursal) return { ok: false, error: 'Selecciona la sucursal activa.' };

  const pendientes = (items || []).filter((c) => !c.producto_id && c.activo !== false);
  if (!pendientes.length) return { ok: true, registrados: 0, enlazados: 0, omitidos: [], errores: [] };

  let registrados = 0;
  let enlazados = 0;
  const omitidos = [];
  const errores = [];

  for (const item of pendientes) {
    const codigo = String(item.codigo_barras || '').trim();
    if (!codigo) {
      omitidos.push(nombreCatalogoItem(item) || item.id);
      continue;
    }
    const res = await registrarCatalogoEnInventario(supabase, item.id, {
      sucursal,
      codigo,
      stockInicial,
      precioCompra: item.precio_compra_sugerido ?? 0,
      // refrescar una sola vez al final
      cargarDatos: null,
    });
    if (!res.ok) {
      errores.push(`${nombreCatalogoItem(item) || codigo}: ${res.error}`);
      continue;
    }
    if (res.existente || res.yaRegistrado) enlazados += 1;
    else registrados += 1;
  }

  if (typeof cargarDatos === 'function') await cargarDatos();
  return { ok: errores.length === 0 || registrados + enlazados > 0, registrados, enlazados, omitidos, errores };
}

export async function productoIdsDesdeProveedor(supabase, proveedorId) {
  if (!supabase || !proveedorId) return [];
  const ids = new Set();

  const [vinculos, catalogo] = await Promise.all([
    supabase.from('proveedor_producto').select('producto_id').eq('proveedor_id', proveedorId),
    supabase.from('proveedor_catalogo').select('producto_id').eq('proveedor_id', proveedorId).not('producto_id', 'is', null),
  ]);

  for (const r of vinculos.data || []) {
    if (r.producto_id) ids.add(String(r.producto_id));
  }
  for (const r of catalogo.data || []) {
    if (r.producto_id) ids.add(String(r.producto_id));
  }
  return [...ids];
}
