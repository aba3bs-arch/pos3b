/**
 * Respaldo local de favoritos por sucursal cuando falta la columna
 * productos.favoritos_sucursales en Supabase.
 *
 * Mapa: { [productoId]: { "3B5": true, "FUSION": false, ... } }
 */

import { esAlmacenCentral, esSucursalRuta, normalizarCodigoTienda } from '../constants/sucursales.js';

export const LS_FAVORITOS_SUCURSALES = 'pos3b_favoritos_sucursales_v1';
export const LS_FAV_COLUMNA_AUSENTE = 'pos3b_favoritos_sucursales_col_missing';

function leerTodo() {
  try {
    const raw = localStorage.getItem(LS_FAVORITOS_SUCURSALES);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function escribirTodo(map) {
  try {
    localStorage.setItem(LS_FAVORITOS_SUCURSALES, JSON.stringify(map || {}));
  } catch {
    /* ignore quota */
  }
}

/** Normaliza un mapa tienda→bool (sin MAIN/CEDIS/RUTA). */
export function normalizarMapaFavoritosSucursales(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const suc = normalizarCodigoTienda(k);
    if (!suc || suc === 'MAIN' || esAlmacenCentral(suc) || esSucursalRuta(suc)) continue;
    out[suc] = Boolean(v);
  }
  return out;
}

export function marcarFavoritosSucursalesColumnaAusente() {
  try {
    localStorage.setItem(LS_FAV_COLUMNA_AUSENTE, '1');
  } catch {
    /* ignore */
  }
}

export function marcarFavoritosSucursalesColumnaOk() {
  try {
    localStorage.removeItem(LS_FAV_COLUMNA_AUSENTE);
  } catch {
    /* ignore */
  }
}

export function favoritosSucursalesColumnaAusente() {
  try {
    return localStorage.getItem(LS_FAV_COLUMNA_AUSENTE) === '1';
  } catch {
    return false;
  }
}

export function leerFavoritosSucursalesLocal(productoId) {
  const id = String(productoId || '').trim();
  if (!id) return {};
  return normalizarMapaFavoritosSucursales(leerTodo()[id]);
}

export function guardarFavoritosSucursalesLocal(productoId, mapa) {
  const id = String(productoId || '').trim();
  if (!id) return;
  const all = leerTodo();
  const limpio = normalizarMapaFavoritosSucursales(mapa);
  if (!Object.keys(limpio).length) delete all[id];
  else all[id] = limpio;
  escribirTodo(all);
}

export function limpiarFavoritosSucursalesLocal(productoId) {
  const id = String(productoId || '').trim();
  if (!id) return;
  const all = leerTodo();
  if (!(id in all)) return;
  delete all[id];
  escribirTodo(all);
}

/**
 * Une mapa de nube + local. Si la columna falta, gana el local.
 * Si la nube trae datos, gana la nube (y se puede limpiar local al guardar OK).
 */
export function mergeFavoritosSucursales(productoId, mapaNube) {
  const nube = normalizarMapaFavoritosSucursales(mapaNube);
  const local = leerFavoritosSucursalesLocal(productoId);
  if (favoritosSucursalesColumnaAusente()) {
    return { ...nube, ...local };
  }
  if (Object.keys(nube).length) return nube;
  return local;
}

export function esErrorColumnaFavoritosSucursales(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    msg.includes('favoritos_sucursales')
    || (code === 'PGRST204' && msg.includes('favoritos'))
  );
}
