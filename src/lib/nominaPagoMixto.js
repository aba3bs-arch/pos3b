/**
 * Pago mixto de nómina (pagador «ambos»): una parte sale de Virtual y el resto de Abarrotes.
 * `pago_virtual` = monto que paga Virtual; Abarrotes = neto de la línea − pago_virtual.
 */
const LS_PREFIX = 'pos3b_nomina_pago_virtual_';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function esPagoMixto(linea) {
  return String(linea?.pagador_nomina || '').toLowerCase() === 'ambos';
}

/** Monto de Virtual acotado a [0, neto]. */
export function montoVirtualLinea(linea, neto) {
  if (!esPagoMixto(linea)) return 0;
  const total = Math.max(0, r2(neto ?? linea?.total ?? linea?.pago));
  const v = r2(linea?.pago_virtual);
  if (!(v > 0)) return 0;
  return Math.min(v, total);
}

/**
 * Reparto del neto por cuenta IE. Sin pago_virtual en «ambos» todo va a Abarrotes
 * (comportamiento anterior). `sufijoRef` evita chocar con el ref_id original de la línea.
 */
export function repartoPagoPorCuenta(linea, neto, cuentaUnica = 'abarrotes') {
  const total = r2(neto);
  if (!(total > 0)) return [];
  if (!esPagoMixto(linea)) return [{ cuenta: cuentaUnica, monto: total, sufijoRef: '' }];
  const virtual = montoVirtualLinea(linea, total);
  const abarrotes = r2(total - virtual);
  const partes = [];
  if (virtual > 0) partes.push({ cuenta: 'virtual', monto: virtual, sufijoRef: ':virtual' });
  if (abarrotes > 0) partes.push({ cuenta: 'abarrotes', monto: abarrotes, sufijoRef: '' });
  return partes;
}

export function etiquetaPagoMixto(linea, neto) {
  if (!esPagoMixto(linea)) return '';
  const total = r2(neto ?? linea?.total ?? linea?.pago);
  const v = montoVirtualLinea(linea, total);
  if (!(v > 0)) return '';
  const f = (n) => `$${n.toFixed(2)}`;
  return `Virtual ${f(v)} · Abarrotes ${f(r2(total - v))}`;
}

export function leerPagoVirtualDefault(usuarioId) {
  if (usuarioId == null) return 0;
  try {
    return r2(globalThis.localStorage?.getItem(`${LS_PREFIX}${usuarioId}`));
  } catch {
    return 0;
  }
}

export function guardarPagoVirtualDefault(usuarioId, monto) {
  if (usuarioId == null) return;
  try {
    const v = r2(monto);
    if (v > 0) globalThis.localStorage?.setItem(`${LS_PREFIX}${usuarioId}`, String(v));
    else globalThis.localStorage?.removeItem(`${LS_PREFIX}${usuarioId}`);
  } catch {
    /* ignore */
  }
}
