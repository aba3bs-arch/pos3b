/**
 * Candado de recolección en efectivo después de liquidar el día.
 * ON (default): si el recolector ya liquidó hoy, no se acepta más efectivo.
 * OFF: se puede seguir cobrando efectivo (sigue avisando al admin).
 */
const LS_CANDADO = 'pos3b_candado_post_liquidacion';
export const EVENTO_CANDADO_POST_LIQUIDACION = 'pos3b-candado-post-liquidacion-updated';

/** Default: candado activo (comportamiento histórico). */
export const CANDADO_POST_LIQUIDACION_DEFAULT = true;

export function leerCandadoPostLiquidacion() {
  try {
    const raw = localStorage.getItem(LS_CANDADO);
    if (raw == null || raw === '') return CANDADO_POST_LIQUIDACION_DEFAULT;
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    const j = JSON.parse(raw);
    if (typeof j === 'boolean') return j;
    if (j && typeof j.activo === 'boolean') return j.activo;
  } catch {
    /* ignore */
  }
  return CANDADO_POST_LIQUIDACION_DEFAULT;
}

export function guardarCandadoPostLiquidacion(activo) {
  const next = activo !== false;
  localStorage.setItem(LS_CANDADO, JSON.stringify({ activo: next }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CANDADO_POST_LIQUIDACION, { detail: { activo: next } }));
  }
  return next;
}

export function etiquetaCandadoPostLiquidacion(activo = leerCandadoPostLiquidacion()) {
  return activo ? 'ON (bloquea efectivo tras liquidar)' : 'OFF (permite efectivo tras liquidar)';
}
