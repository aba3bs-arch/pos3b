/**
 * Proveedores cuya compra (costo para gasto / consultas) usa
 * productos.precio_ruta («Precio Venta en Ruta») en lugar de precio_compra_*.
 *
 * Por defecto: Smoking. En Configuración se pueden ir sumando más.
 */
import { normalizarNombreProveedorClave } from './proveedorEntregas.js';
import { productoIdsDesdeProveedor } from './proveedorCatalogo.js';
import { round2 } from './productoForm.js';

const LS_KEY = 'pos3b_proveedores_costo_precio_ruta';
export const EVENTO_PROVEEDORES_COSTO_RUTA = 'pos3b-proveedores-costo-ruta-updated';

/** Nombres por defecto (se pueden ampliar en Configuración). */
export const PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT = ['Smoking'];

export function leerProveedoresCostoPrecioRuta() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null || raw === '') return [...PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT];
    const limpios = arr.map((n) => String(n || '').trim()).filter(Boolean);
    return limpios.length ? limpios : [...PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT];
  } catch {
    return [...PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT];
  }
}

export function guardarProveedoresCostoPrecioRuta(nombres) {
  const list = [...new Set((nombres || []).map((n) => String(n || '').trim()).filter(Boolean))];
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PROVEEDORES_COSTO_RUTA));
  } catch {
    /* ignore */
  }
  return list;
}

/** True si el nombre del proveedor está en la lista configurada. */
export function proveedorUsaCostoPrecioRuta(nombre) {
  const clave = normalizarNombreProveedorClave(nombre);
  if (!clave) return false;
  const list = leerProveedoresCostoPrecioRuta().map(normalizarNombreProveedorClave).filter(Boolean);
  return list.some((cfg) => cfg === clave || clave.includes(cfg) || cfg.includes(clave));
}

/** Precio ruta del producto (sin impuestos), o null si no aplica. */
export function precioRutaComoCostoCompra(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

/**
 * Ids de productos ligados a proveedores configurados (catálogo / vínculo).
 * @returns {Promise<string[]>}
 */
export async function cargarProductoIdsCostoPrecioRuta(supabase) {
  if (!supabase) return [];
  const nombresCfg = leerProveedoresCostoPrecioRuta();
  if (!nombresCfg.length) return [];

  const { data, error } = await supabase.from('proveedores').select('id, nombre');
  if (error || !data?.length) return [];

  const idsProv = (data || [])
    .filter((p) => proveedorUsaCostoPrecioRuta(p.nombre))
    .map((p) => p.id)
    .filter(Boolean);

  if (!idsProv.length) return [];

  const sets = await Promise.all(idsProv.map((id) => productoIdsDesdeProveedor(supabase, id)));
  const out = new Set();
  for (const arr of sets) {
    for (const id of arr || []) out.add(String(id));
  }
  return [...out];
}
