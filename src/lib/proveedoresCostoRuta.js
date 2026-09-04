/**
 * Precio CEDIS → sucursales («Precio Venta en Ruta»).
 * Marlboro / Pall Mall / Double Fusion → normalmente $6.
 * Smoking → $2.10.
 *
 * Si un SKU no tiene precio_ruta capturado, hereda el de otro producto
 * de la misma familia de marca (ej. Blanco hereda de Vista).
 */
import { normalizarNombreProveedorClave } from './proveedorEntregas.js';
import { productoIdsDesdeProveedor } from './proveedorCatalogo.js';
import { round2 } from './productoForm.js';

const LS_KEY = 'pos3b_proveedores_costo_precio_ruta';
export const EVENTO_PROVEEDORES_COSTO_RUTA = 'pos3b-proveedores-costo-ruta-updated';

/** Nombres por defecto (se pueden ampliar en Configuración). */
export const PROVEEDORES_COSTO_PRECIO_RUTA_DEFAULT = ['Smoking'];

/** Familias que comparten tarifa CEDIS $6 (Marlboro + Pall Mall). */
const FAMILIAS_TARIFA_CEDIS_6 = new Set(['MARLBORO', 'PALLMALL']);

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

function normalizarNombreMarca(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Familia de marca para heredar precio_ruta entre SKUs.
 * Double Fusion = Pall Mall. Malboro/Marlboro = misma familia.
 */
export function familiaMarcaPrecioRuta(nombre) {
  const n = normalizarNombreMarca(nombre);
  if (!n) return null;
  if (/\bSMOKING\b/.test(n)) return 'SMOKING';
  if (/MALBORO|MARLBORO/.test(n)) return 'MARLBORO';
  if (/PALL\s*MALL|DOUBLE\s*FUSION/.test(n)) return 'PALLMALL';
  return null;
}

/** Precio ruta del producto (sin impuestos), o null si no aplica. */
export function precioRutaComoCostoCompra(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

/**
 * Precio ruta efectivo para costo CEDIS→sucursal.
 * 1) precio_ruta del propio SKU
 * 2) hereda de otro SKU de la misma familia con precio_ruta
 * 3) Marlboro ↔ Pall Mall comparten tarifa ($6) si alguna de las dos lo tiene
 *
 * @param {object|null} producto
 * @param {object[]} [catalogo] inventario completo para heredar
 */
export function precioRutaEfectivoParaCosto(producto, catalogo = []) {
  const propia = precioRutaComoCostoCompra(producto);
  if (propia != null) return propia;

  const fam = familiaMarcaPrecioRuta(producto?.nombre || producto?.producto_nombre);
  if (!fam) return null;

  const lista = Array.isArray(catalogo) ? catalogo : [];
  const buscarEn = (familias) => {
    for (const p of lista) {
      if (producto?.id != null && String(p?.id) === String(producto.id)) continue;
      const f = familiaMarcaPrecioRuta(p?.nombre);
      if (!familias.has(f)) continue;
      const r = precioRutaComoCostoCompra(p);
      if (r != null) return r;
    }
    return null;
  };

  const misma = buscarEn(new Set([fam]));
  if (misma != null) return misma;

  // Marlboro y Pall Mall (Double Fusion) usan la misma tarifa CEDIS.
  if (FAMILIAS_TARIFA_CEDIS_6.has(fam)) {
    const compartida = buscarEn(FAMILIAS_TARIFA_CEDIS_6);
    if (compartida != null) return compartida;
  }
  return null;
}

/** True si el producto es de marca que debe costearse con precio ruta (no compra proveedor). */
export function productoUsaCostoPrecioRutaPorMarca(producto) {
  return Boolean(familiaMarcaPrecioRuta(producto?.nombre || producto?.producto_nombre));
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
