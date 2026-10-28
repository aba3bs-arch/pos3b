/**
 * Persiste el carrito de Ventas en localStorage por sucursal.
 * Sobrevive a cambios de módulo y a cierre de sesión en este equipo.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  borrarCarritoAlmacenado,
  fotoLigeraParaCarrito,
  guardarCarritoAlmacenado,
  leerCarritoAlmacenado,
} from './persistenciaCarrito.js';

export const LS_CARRITO_VENTA_PREFIX = 'pos3b_carrito_venta_';

export function claveCarritoVenta(sucursal) {
  const s = normalizarCodigoTienda(sucursal) || 'MAIN';
  return `${LS_CARRITO_VENTA_PREFIX}${s}`;
}

function normalizarLinea(row) {
  if (!row || row.id == null) return null;
  const qty = Math.max(1, Math.floor(Number(row.qty) || 1));
  const precio = Number(row.precio);
  return {
    id: row.id,
    nombre: String(row.nombre || 'Producto'),
    precio: Number.isFinite(precio) && precio >= 0 ? precio : 0,
    foto_url: fotoLigeraParaCarrito(row.foto_url),
    qty,
  };
}

/** @returns {Array<{ id: *, nombre: string, precio: number, foto_url: *, qty: number }>} */
export function leerCarritoVenta(sucursal) {
  try {
    const raw = leerCarritoAlmacenado(claveCarritoVenta(sucursal));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizarLinea).filter(Boolean);
  } catch {
    return [];
  }
}

export function guardarCarritoVenta(sucursal, carrito) {
  try {
    const clave = claveCarritoVenta(sucursal);
    const limpio = (carrito || []).map(normalizarLinea).filter(Boolean);
    if (!limpio.length) {
      borrarCarritoAlmacenado(clave);
      return;
    }
    guardarCarritoAlmacenado(clave, JSON.stringify(limpio));
  } catch {
    /* ignore quota / private mode */
  }
}

export function limpiarCarritoVenta(sucursal) {
  try {
    borrarCarritoAlmacenado(claveCarritoVenta(sucursal));
  } catch {
    /* ignore */
  }
}

/** Borra todos los carritos persistidos (purga de caché local). */
export function limpiarTodosCarritosVenta() {
  try {
    const aBorrar = [];
    for (const area of [globalThis.localStorage, globalThis.sessionStorage]) {
      if (!area) continue;
      for (let i = 0; i < area.length; i += 1) {
        const k = area.key(i);
        if (k && k.startsWith(LS_CARRITO_VENTA_PREFIX)) aBorrar.push(k);
      }
    }
    for (const k of aBorrar) borrarCarritoAlmacenado(k);
  } catch {
    /* ignore */
  }
}
