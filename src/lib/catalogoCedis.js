/**
 * Catálogo visible en sucursal CEDIS (almacén).
 * No altera el catálogo global ni la vista de tiendas: solo filtra/enlaza
 * cuando la sesión opera en CEDIS.
 */

import { normalizarDepartamento } from './departamentos.js';
import { esAlmacenCentral } from '../constants/sucursales.js';

export const PROVEEDOR_CEDIS_NOMBRE = 'CEDIS LAS 3B';

/** Departamentos que el usuario quiere ver en CEDIS (nombres de negocio). */
export const DEPARTAMENTOS_CEDIS_UI = [
  'CIGARROS',
  'BLUNTWRAP',
  'ELECTRONICOS',
  'ABARROTES',
  'MEDICAMENTO',
  'ROPA',
];

/**
 * Valores reales (y alias) de `productos.cat` aceptados.
 * En producción «electronicos» vive como CIGARRO_ELECTRONICO.
 */
const DEPTOS_CEDIS_SET = new Set([
  'CIGARROS',
  'BLUNTWRAP',
  'ELECTRONICOS',
  'CIGARRO_ELECTRONICO',
  'ABARROTES',
  'MEDICAMENTO',
  'ROPA',
]);

/** UI «ELECTRONICOS» → valor canónico en BD. */
const CAT_UI_A_DB = {
  ELECTRONICOS: 'CIGARRO_ELECTRONICO',
};

const CAT_DB_A_UI = {
  CIGARRO_ELECTRONICO: 'ELECTRONICOS',
};

export function esProveedorCedisLas3b(nombreOrRow) {
  const nombre = typeof nombreOrRow === 'string' ? nombreOrRow : nombreOrRow?.nombre;
  return String(nombre || '').trim().toUpperCase() === PROVEEDOR_CEDIS_NOMBRE;
}

/** Valor de select UI a partir de cat en BD. */
export function departamentoCedisUiDesdeCat(cat) {
  const n = normalizarDepartamento(cat);
  return CAT_DB_A_UI[n] || (DEPARTAMENTOS_CEDIS_UI.includes(n) ? n : '');
}

/** Valor a guardar en productos / proveedor_catalogo.cat. */
export function catCedisDesdeUi(deptoUi) {
  const n = normalizarDepartamento(deptoUi);
  return CAT_UI_A_DB[n] || n || 'GENERAL';
}

export function aplicaFiltroCatalogoCedis(sucursal) {
  return esAlmacenCentral(sucursal);
}

export function esDepartamentoCatalogoCedis(cat) {
  const n = normalizarDepartamento(cat);
  return DEPTOS_CEDIS_SET.has(n);
}

/** Coincide filtro UI (ELECTRONICOS) con cat real (CIGARRO_ELECTRONICO). */
export function departamentoFiltroCoincideCedis(catProducto, deptoFiltro) {
  const f = normalizarDepartamento(deptoFiltro);
  if (!f) return true;
  const c = normalizarDepartamento(catProducto);
  if (f === 'ELECTRONICOS') return c === 'ELECTRONICOS' || c === 'CIGARRO_ELECTRONICO';
  return c === f;
}

/** Lista de depto para el selector en CEDIS (UI amigable). */
export function listarDepartamentosCatalogoCedis() {
  return [...DEPARTAMENTOS_CEDIS_UI];
}

/**
 * Filtra inventario para la vista CEDIS.
 * @param {Array} inventario
 * @param {{ idsProveedorCedis?: Set<string>|null, exigirProveedor?: boolean }} opts
 */
export function filtrarInventarioCatalogoCedis(inventario, opts = {}) {
  const { idsProveedorCedis = null, exigirProveedor = true } = opts;
  let list = (inventario || []).filter((p) => esDepartamentoCatalogoCedis(p.cat));
  if (exigirProveedor && idsProveedorCedis) {
    list = list.filter((p) => idsProveedorCedis.has(String(p.id)));
  }
  return list;
}

export async function buscarProveedorCedisLas3b(supabase) {
  if (!supabase) return null;
  const nombre = PROVEEDOR_CEDIS_NOMBRE;
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .ilike('nombre', nombre)
    .limit(5);
  if (error) return { error: error.message };
  const exact = (data || []).find((p) => String(p.nombre || '').trim().toUpperCase() === nombre);
  const row = exact || (data || [])[0] || null;
  return { proveedor: row };
}

/**
 * Inserta vínculos faltantes producto ↔ CEDIS LAS 3B para los deptos del catálogo CEDIS.
 * No borra vínculos con otros proveedores ni modifica filas de `productos`.
 */
export async function asegurarVinculosCatalogoCedis(supabase, inventario = []) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const found = await buscarProveedorCedisLas3b(supabase);
  if (found?.error) return { ok: false, error: found.error };
  const proveedor = found?.proveedor;
  if (!proveedor?.id) {
    return { ok: false, error: `No existe el proveedor «${PROVEEDOR_CEDIS_NOMBRE}». Créalo en Proveedores.` };
  }

  const candidatos = (inventario || [])
    .filter((p) => esDepartamentoCatalogoCedis(p.cat))
    .map((p) => String(p.id))
    .filter(Boolean);
  if (!candidatos.length) {
    return { ok: true, proveedorId: proveedor.id, vinculados: 0, yaEstaban: 0 };
  }

  // Traer todos los vínculos del proveedor (evita .in() gigante en la URL).
  const { data: existentes, error: eEx } = await supabase
    .from('proveedor_producto')
    .select('producto_id')
    .eq('proveedor_id', proveedor.id)
    .limit(20000);
  if (eEx) return { ok: false, error: eEx.message };

  const ya = new Set((existentes || []).map((r) => String(r.producto_id)));
  const faltan = candidatos.filter((id) => !ya.has(id));
  if (!faltan.length) {
    return { ok: true, proveedorId: proveedor.id, vinculados: 0, yaEstaban: ya.size };
  }

  const rows = faltan.map((producto_id) => ({
    proveedor_id: proveedor.id,
    producto_id,
    sku_proveedor: null,
  }));

  // Insert en lotes por si el catálogo crece
  const chunk = 200;
  let insertados = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from('proveedor_producto').insert(slice);
    if (error) return { ok: false, error: error.message, vinculados: insertados };
    insertados += slice.length;
  }

  return {
    ok: true,
    proveedorId: proveedor.id,
    vinculados: insertados,
    yaEstaban: ya.size,
  };
}
