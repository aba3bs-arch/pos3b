/**
 * Confirmación anti-error: evita cargar vale/pagaré en la sucursal incorrecta.
 * Muestra el nombre de la tienda destino de forma explícita antes de generar.
 */

import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * @param {{ tipo: 'vale'|'pagare', codigoSucursal: string, sesionSucursal?: string|null }} opts
 * @returns {string}
 */
export function mensajeConfirmarSucursal({ tipo, codigoSucursal, sesionSucursal = null } = {}) {
  const codigo = normalizarCodigoTienda(codigoSucursal);
  const dest = etiquetaTienda(codigo) || codigo || '(sin tienda)';
  const doc = tipo === 'pagare' ? 'pagaré' : 'vale';
  const lineas = [
    `¿Confirmas que este ${doc} debe cargarse en:`,
    '',
    `>>> ${dest} <<<`,
    '',
  ];
  const sesion = normalizarCodigoTienda(sesionSucursal);
  if (sesion && sesion !== codigo) {
    lineas.push(`Tu sesión actual es: ${etiquetaTienda(sesion)}.`);
    lineas.push('Si la tienda de arriba NO es la correcta, cancela.');
  } else {
    lineas.push('Si NO estás en esa tienda (o no es la correcta), cancela.');
  }
  return lineas.join('\n');
}

/**
 * @param {{ tipo: 'vale'|'pagare', codigoSucursal: string, sesionSucursal?: string|null, confirmFn?: (msg: string) => boolean }} opts
 * @returns {boolean}
 */
export function confirmarSucursalOperacion(opts = {}) {
  const confirmFn = typeof opts.confirmFn === 'function' ? opts.confirmFn : (msg) => window.confirm(msg);
  const msg = mensajeConfirmarSucursal(opts);
  return Boolean(confirmFn(msg));
}
