import { HORA_LIMITE_VALE } from './contabilidadConstants.js';

/** Hora límite para cobrar el vale el mismo día (15:00); después cuenta como falta. */
export const HORA_LIMITE_COBRO_GASOLINA = 15;

function fechaValeLocal(vale) {
  return String(vale?.fecha || '').slice(0, 10);
}

function limiteCobroDelDia(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, HORA_LIMITE_COBRO_GASOLINA, 0, 0, 0);
}

/** Vale solicitado después de las 9:00 y aprobado por administrador. */
export function valeRequirioAprobacionAdmin(vale) {
  return Boolean(vale?.requiere_autorizacion) && vale?.estado_aprobacion === 'aprobado';
}

/** Cobrado antes de las 9:00 (día laboral temprano). */
export function cobradoAntesDeLas9(vale) {
  if (!vale?.cobrado || !vale?.cobrado_at) return false;
  const hora = new Date(vale.cobrado_at).getHours();
  return hora < HORA_LIMITE_VALE;
}

/** No cobrado y ya pasó las 15:00 del día del vale. */
export function esFaltaGasolina(vale, now = new Date()) {
  if (vale?.cobrado) return false;
  if (vale?.estado_aprobacion !== 'aprobado') return false;
  const fecha = fechaValeLocal(vale);
  if (!fecha) return false;
  const limite = limiteCobroDelDia(fecha);
  if (!limite) return false;
  return now >= limite;
}

/** Aún puede cobrarse el mismo día (antes de las 15:00). */
export function esPendienteCobroGasolina(vale, now = new Date()) {
  if (vale?.cobrado || esFaltaGasolina(vale, now)) return false;
  if (vale?.estado_aprobacion !== 'aprobado') return false;
  return true;
}

/**
 * Estado de cobro para iconografía:
 * - cobrado_temprano: 2 palomitas verdes (cobrado antes de 9)
 * - cobrado: 1 palomita verde
 * - falta: no cobrado después de las 15:00
 * - pendiente: aún no cobrado, dentro del plazo
 */
export function estadoCobroGasolina(vale, now = new Date()) {
  if (vale?.cobrado) {
    return cobradoAntesDeLas9(vale) ? 'cobrado_temprano' : 'cobrado';
  }
  if (esFaltaGasolina(vale, now)) return 'falta';
  return 'pendiente';
}

export function cuentaComoDiaLaboralGasolina(vale, now = new Date()) {
  return estadoCobroGasolina(vale, now) === 'cobrado' || estadoCobroGasolina(vale, now) === 'cobrado_temprano';
}

export function cuentaComoFaltaGasolina(vale, now = new Date()) {
  return estadoCobroGasolina(vale, now) === 'falta';
}
