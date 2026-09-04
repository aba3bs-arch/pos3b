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

/**
 * Tarifa CEDIS → sucursales por marca (último recurso si no hay precio_ruta en el SKU).
 * Es el precio real de venta del cigarro desde CEDIS / Smoking.
 */
export const TARIFA_CEDIS_POR_MARCA = {
  MARLBORO: 6,
  PALLMALL: 6,
  SMOKING: 2.1,
};

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
 * PallMall / Pall Mall / Double Fusion = Pall Mall.
 * Malboro / Marlboro = Marlboro.
 */
export function familiaMarcaPrecioRuta(nombre) {
  const n = normalizarNombreMarca(nombre);
  if (!n) return null;
  if (/\bSMOKING\b/.test(n)) return 'SMOKING';
  if (/MALBORO|MARLBORO/.test(n)) return 'MARLBORO';
  // PallMall (junto), Pall Mall, Double Fusion
  if (/PALL\s*MALL|PALLMALL|DOUBLE\s*FUSION/.test(n)) return 'PALLMALL';
  return null;
}

/** Precio ruta del producto (sin impuestos), o null si no aplica. */
export function precioRutaComoCostoCompra(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

/**
 * Precio que CEDIS / Smoking cobra por el cigarro (Precio Venta en Ruta).
 * Orden:
 * 1) precio_ruta del SKU
 * 2) hereda de otro SKU de la misma marca con precio_ruta
 * 3) Marlboro ↔ Pall Mall comparten tarifa
 * 4) tarifa CEDIS fija por marca (Marlboro/Pall Mall $6, Smoking $2.10)
 *
 * Nunca usa precio_compra_* ($5.25).
 */
export function precioRutaEfectivoParaCosto(producto, catalogo = []) {
  const nombre = producto?.nombre || producto?.producto_nombre || '';
  const propia = precioRutaComoCostoCompra(producto);
  if (propia != null) return propia;

  const fam = familiaMarcaPrecioRuta(nombre);
  if (!fam) {
    // Departamento CIGARROS sin marca reconocida: si el catálogo trae precio_ruta, úsalo.
    return null;
  }

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

  if (FAMILIAS_TARIFA_CEDIS_6.has(fam)) {
    const compartida = buscarEn(FAMILIAS_TARIFA_CEDIS_6);
    if (compartida != null) return compartida;
  }

  // Tarifa operativa CEDIS (lo que cobran por pieza a las sucursales).
  const fija = TARIFA_CEDIS_POR_MARCA[fam];
  if (fija != null && fija > 0) return round2(fija);
  return null;
}

/** True si el producto debe costearse con precio ruta (no compra proveedor $5.25). */
export function productoUsaCostoPrecioRutaPorMarca(producto) {
  if (familiaMarcaPrecioRuta(producto?.nombre || producto?.producto_nombre)) return true;
  const cat = String(producto?.cat || '').toUpperCase().trim();
  return cat === 'CIGARROS' || cat === 'CIGARRO';
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
