/**
 * Pago mixto de nómina (pagador «ambos»): Virtual y Abarrotes se suman por día.
 * `pago_virtual` es la tarifa diaria de Virtual (igual que $/día de Abarrotes).
 * Sueldo Abarrotes = días × $/día. Virtual = días × pago_virtual.
 * Pago = sueldo + virtual + bono − gastos.
 */
const LS_PREFIX = 'pos3b_nomina_pago_virtual_';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function esPagoMixto(linea) {
  return String(linea?.pagador_nomina || '').toLowerCase() === 'ambos';
}

function diasTrabajadosLinea(linea) {
  const raw = linea?.dias_trabajados;
  if (raw === '' || raw == null) return 0;
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Tarifa diaria capturada en «Virtual $/día». No es el total de la semana. */
export function tarifaVirtualDiaria(linea) {
  if (!esPagoMixto(linea)) return 0;
  const v = r2(linea?.pago_virtual);
  return v > 0 ? v : 0;
}

/** Virtual de la semana = tarifa diaria × días trabajados. */
export function montoVirtualLinea(linea, _neto) {
  return r2(tarifaVirtualDiaria(linea) * diasTrabajadosLinea(linea));
}

/**
 * Reparto del pago por cuenta IE. El neto ya incluye Virtual.
 * Sin pago_virtual en «ambos», todo va a Abarrotes.
 * `sufijoRef` evita chocar con el ref_id original de la línea.
 */
export function repartoPagoPorCuenta(linea, neto, cuentaUnica = 'abarrotes') {
  const total = r2(neto);
  if (!(total > 0)) return [];
  if (!esPagoMixto(linea)) return [{ cuenta: cuentaUnica, monto: total, sufijoRef: '' }];
  let virtual = montoVirtualLinea(linea, total);
  let abarrotes = r2(total - virtual);
  // No erogar más que el neto (p. ej. si Abarrotes queda en deuda).
  if (virtual > total || abarrotes < 0) {
    virtual = total;
    abarrotes = 0;
  }
  const partes = [];
  if (virtual > 0) partes.push({ cuenta: 'virtual', monto: r2(virtual), sufijoRef: ':virtual' });
  if (abarrotes > 0) partes.push({ cuenta: 'abarrotes', monto: r2(abarrotes), sufijoRef: '' });
  return partes;
}

/**
 * Reparte el pago de la línea entre cuentas.
 * En «ambos», Virtual es `pago_virtual` y Abarrotes es el pago calculado (neto − Virtual).
 * Esas partes suman el pago: Virtual + Abarrotes (+ Garage) = pago.
 */
export function partesPagoLinea(linea, neto) {
  const total = r2(neto ?? linea?.total ?? linea?.pago);
  const pag = String(linea?.pagador_nomina || 'abarrotes').toLowerCase();
  if (pag === 'ambos') {
    const virtual = montoVirtualLinea(linea, total);
    return { virtual, abarrotes: r2(total - virtual), garage: 0, total };
  }
  if (pag === 'virtual') return { virtual: total, abarrotes: 0, garage: 0, total };
  if (pag === 'garage') return { virtual: 0, abarrotes: 0, garage: total, total };
  return { virtual: 0, abarrotes: total, garage: 0, total };
}

/** Suma por cuenta de varias líneas. Las cuentas suman `total`. */
export function sumarPagosPorCuenta(lineas, netoDe) {
  const acc = { virtual: 0, abarrotes: 0, garage: 0, total: 0 };
  for (const l of lineas || []) {
    const neto = typeof netoDe === 'function' ? netoDe(l) : (netoDe ?? l?.total ?? l?.pago);
    const p = partesPagoLinea(l, neto);
    acc.virtual = r2(acc.virtual + p.virtual);
    acc.abarrotes = r2(acc.abarrotes + p.abarrotes);
    acc.garage = r2(acc.garage + p.garage);
    acc.total = r2(acc.total + p.total);
  }
  return acc;
}

/**
 * Filas de desglose cuando hay más de una cuenta con monto.
 * La suma de `filas` es `total` (los pagos mixtos entran partidos, no completos en cada cuenta).
 */
export function filasDesgloseCuentas(sumas) {
  const filas = [
    { cuenta: 'virtual', etiqueta: 'Virtual', monto: r2(sumas?.virtual) },
    { cuenta: 'abarrotes', etiqueta: 'Abarrotes', monto: r2(sumas?.abarrotes) },
    { cuenta: 'garage', etiqueta: 'Garage', monto: r2(sumas?.garage) },
  ].filter((f) => f.monto !== 0);
  const mostrar = filas.length > 1;
  return { filas: mostrar ? filas : [], mostrar, total: r2(sumas?.total) };
}

export function etiquetaPagoMixto(linea, neto) {
  if (!esPagoMixto(linea)) return '';
  const partes = partesPagoLinea(linea, neto ?? linea?.total ?? linea?.pago);
  if (!(partes.total > 0) || !(partes.virtual > 0)) return '';
  const f = (n) => `$${n.toFixed(2)}`;
  return `Virtual ${f(partes.virtual)} + Abarrotes ${f(partes.abarrotes)} = ${f(partes.total)}`;
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
