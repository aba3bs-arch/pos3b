/**
 * Al guardar/corregir Corte de caja, empuja el Total sistema (neto registrado)
 * al campo «venta» del Corte Abarrotes abierto (misma sucursal).
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Clave estable por fecha+turno (corregir reemplaza, no duplica). */
export function claveVentaPosCorteCaja({ fecha, turnoId } = {}) {
  const f = String(fecha || '').slice(0, 10);
  const t = String(turnoId || '').trim() || 'sin-turno';
  return `${f}|${t}`;
}

/**
 * Actualiza el mapa venta_pos_por_corte y recalcula estado.venta = suma.
 * @param {object} estado
 * @param {{ clave: string, totalVentas: number }} aporte
 */
export function aplicarVentaPosEnEstadoAbarrotes(estado = {}, aporte = {}) {
  const clave = String(aporte.clave || '').trim();
  if (!clave) return { ...estado };
  const map = { ...(estado.venta_pos_por_corte || {}) };
  const monto = aporte.totalVentas ?? aporte.efectivoEsperado;
  map[clave] = round2(monto);
  const venta = round2(
    Object.values(map).reduce((a, v) => a + (Number(v) || 0), 0),
  );
  return {
    ...estado,
    venta_pos_por_corte: map,
    venta,
  };
}

/**
 * Suma el ajuste del candado (opción registrar venta) a la venta de abarrotes
 * para el cierre/ticket, sin esperar a guardar el Corte de caja.
 */
export function aplicarAjusteRecargaMpEnVentaAbarrotes(estado = {}, montoAjuste, {
  fecha,
  turnoId,
} = {}) {
  const monto = round2(montoAjuste);
  if (!(monto > 0.009)) {
    return { ...estado, venta: round2(estado.venta) };
  }
  const map = { ...(estado.venta_pos_por_corte || {}) };
  if (Object.keys(map).length > 0) {
    const clave = claveVentaPosCorteCaja({ fecha, turnoId });
    map[clave] = round2((Number(map[clave]) || 0) + monto);
    return {
      ...estado,
      venta_pos_por_corte: map,
      venta: round2(Object.values(map).reduce((a, v) => a + (Number(v) || 0), 0)),
    };
  }
  return {
    ...estado,
    venta: round2((Number(estado.venta) || 0) + monto),
  };
}

/**
 * Carga el estado abierto de abarrotes, aplica el Total sistema del corte de caja y guarda.
 * No debe tumbar el guardado del corte de caja si falla.
 */
export async function sincronizarVentaAbarrotesDesdeCorteCaja(supabase, {
  sucursal,
  fecha,
  turnoId,
  totalVentas,
  /** @deprecated usar totalVentas (Total sistema) */
  efectivoEsperado,
} = {}) {
  if (!sucursal) {
    return { ok: false, skipped: true, error: 'Sin sucursal' };
  }
  const clave = claveVentaPosCorteCaja({ fecha, turnoId });
  try {
    const { cargarEstadoCorte, guardarEstadoCorte } = await import('./corteContabilidad/store.js');
    const cargado = await cargarEstadoCorte(supabase, sucursal, 'abarrotes');
    if (cargado?.lecturaFallida) {
      return { ok: false, error: cargado.error || 'No se pudo leer el corte de abarrotes' };
    }
    const next = aplicarVentaPosEnEstadoAbarrotes(cargado?.estado || {}, {
      clave,
      totalVentas: totalVentas ?? efectivoEsperado,
    });
    const guardado = await guardarEstadoCorte(supabase, sucursal, 'abarrotes', next);
    if (!guardado?.ok) {
      return { ok: false, error: guardado?.error || 'No se pudo guardar venta en abarrotes' };
    }
    return {
      ok: true,
      clave,
      venta: next.venta,
      soloLocal: !!guardado.soloLocal,
      aviso: guardado.aviso,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
