/**
 * Candado de cobro con tarjeta: exige últimos 4–5 dígitos del baucher
 * antes de finalizar o cambiar de método (salvo salir del cobro).
 */

export function esMetodoTarjeta(metodo) {
  if (!metodo) return false;
  const id = String(metodo.id || '').toLowerCase();
  const label = String(metodo.label || '').toLowerCase();
  return id.includes('tarjeta') || /\btarjeta\b/.test(label);
}

/** Solo dígitos, máx. 5 (últimos del baucher). */
export function normalizarDigitosBaucher(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 5);
}

/** Válido si hay exactamente 4 o 5 dígitos. */
export function baucherTarjetaValido(raw) {
  const d = normalizarDigitosBaucher(raw);
  return d.length === 4 || d.length === 5;
}

/**
 * Candado activo: método tarjeta y baucher incompleto.
 * Mientras esté activo no se puede finalizar ni cambiar de método.
 */
export function tarjetaCandadoActivo(metodo, refPago) {
  return esMetodoTarjeta(metodo) && !baucherTarjetaValido(refPago);
}

export const MSG_CANDADO_TARJETA =
  'Pago con tarjeta bloqueado. Ingresa los últimos 4 o 5 dígitos del baucher, o pulsa Salir del cobro.';

export const MSG_BAUCHER_REQUERIDO =
  'Ingresa los últimos 4 o 5 dígitos del baucher de la terminal para continuar.';
