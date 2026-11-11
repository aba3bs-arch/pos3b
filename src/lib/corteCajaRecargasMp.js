/**
 * Candado de cierre: conciliar recargas Mercado Pago (terminal) vs POS.
 * Si terminal > POS, la diferencia se trata como faltante del cajero/CT.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Normaliza texto para detectar «recarga», «tiempo aire», etc. */
export function normalizarTextoRecarga(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** ¿El texto parece una venta de recarga / tiempo aire? */
export function textoEsRecarga(s) {
  const t = normalizarTextoRecarga(s);
  if (!t) return false;
  if (t.includes('recarga')) return true;
  if (t.includes('tiempo aire') || t.includes('tiempoaire')) return true;
  if (/\btae\b/.test(t)) return true;
  return false;
}

function montoLineaArticulo(a) {
  const qty = Number(a?.qty ?? a?.cantidad ?? 1) || 1;
  const precio = Number(a?.precio) || 0;
  const linea = Number(a?.total ?? a?.importe);
  if (Number.isFinite(linea) && linea > 0) return round2(linea);
  return round2(qty * precio);
}

/** Monto de recargas dentro de una venta (método o artículos). */
export function montoRecargasDeVenta(venta) {
  if (!venta) return 0;
  if (textoEsRecarga(venta.metodo_pago)) return round2(venta.total);
  let sum = 0;
  let hay = false;
  for (const a of venta.articulos || []) {
    if (textoEsRecarga(a?.nombre) || textoEsRecarga(a?.id) || textoEsRecarga(a?.codigo)) {
      hay = true;
      sum = round2(sum + montoLineaArticulo(a));
    }
  }
  return hay ? sum : 0;
}

/** Monto de recargas canceladas (resta). */
export function montoRecargasDeCancelacion(canc) {
  if (!canc) return 0;
  if (textoEsRecarga(canc.metodo_pago)) return round2(canc.total ?? canc.monto);
  let sum = 0;
  let hay = false;
  for (const a of canc.articulos || []) {
    if (textoEsRecarga(a?.nombre) || textoEsRecarga(a?.id) || textoEsRecarga(a?.codigo)) {
      hay = true;
      const qty = Number(a?.qty ?? a?.cantidad ?? 1) || 1;
      sum = round2(sum + qty * (Number(a?.precio) || 0));
    }
  }
  return hay ? sum : 0;
}

/** Total neto de recargas registradas en el POS del turno. */
export function totalRecargasPos(ventas = [], cancelaciones = []) {
  let total = 0;
  for (const v of ventas || []) total = round2(total + montoRecargasDeVenta(v));
  for (const c of cancelaciones || []) total = round2(total - montoRecargasDeCancelacion(c));
  return total < 0 ? 0 : total;
}

/**
 * Evalúa el candado.
 * @returns {{
 *   ok: boolean,
 *   terminal: number|null,
 *   pos: number,
 *   diferencia: number|null,
 *   faltante: number,
 *   requiereAceptarFaltante: boolean,
 *   requiereAceptarRevision: boolean,
 *   error?: string,
 * }}
 */
export function evaluarCandadoRecargasMp({ terminalRaw, pos = 0, aceptoFaltante = false, aceptoRevision = false } = {}) {
  const posN = round2(pos);
  if (terminalRaw === '' || terminalRaw == null) {
    return {
      ok: false,
      terminal: null,
      pos: posN,
      diferencia: null,
      faltante: 0,
      requiereAceptarFaltante: false,
      requiereAceptarRevision: false,
      error: 'Indica el total de recargas que muestra la terminal Mercado Pago (puede ser 0).',
    };
  }
  const terminal = round2(terminalRaw);
  if (!Number.isFinite(terminal) || terminal < 0) {
    return {
      ok: false,
      terminal: null,
      pos: posN,
      diferencia: null,
      faltante: 0,
      requiereAceptarFaltante: false,
      requiereAceptarRevision: false,
      error: 'El monto de la terminal no es válido.',
    };
  }

  const diferencia = round2(terminal - posN);
  const faltante = diferencia > 0.009 ? diferencia : 0;
  const requiereAceptarFaltante = faltante > 0;
  const requiereAceptarRevision = diferencia < -0.009;

  if (requiereAceptarFaltante && !aceptoFaltante) {
    return {
      ok: false,
      terminal,
      pos: posN,
      diferencia,
      faltante,
      requiereAceptarFaltante: true,
      requiereAceptarRevision: false,
      error: `La terminal reporta $${faltante.toFixed(2)} más que el POS. Debes aceptar el faltante a cargo del cajero/CT.`,
    };
  }

  if (requiereAceptarRevision && !aceptoRevision) {
    return {
      ok: false,
      terminal,
      pos: posN,
      diferencia,
      faltante: 0,
      requiereAceptarFaltante: false,
      requiereAceptarRevision: true,
      error: `El POS tiene $${Math.abs(diferencia).toFixed(2)} más en recargas que la terminal. Revisa e indica que ya verificaste.`,
    };
  }

  return {
    ok: true,
    terminal,
    pos: posN,
    diferencia,
    faltante,
    requiereAceptarFaltante,
    requiereAceptarRevision,
  };
}

/** Payload para guardar dentro de corroboracion.recargas_mp */
export function payloadRecargasMpCorroboracion(evalResult, { usuarioNombre = null, usuarioId = null } = {}) {
  return {
    terminal: evalResult.terminal,
    pos: evalResult.pos,
    diferencia: evalResult.diferencia,
    faltante: evalResult.faltante || 0,
    aceptado_faltante: (evalResult.faltante || 0) > 0,
    aceptado_revision: (evalResult.diferencia || 0) < -0.009,
    usuario_nombre: usuarioNombre,
    usuario_id: usuarioId,
    registrado_at: new Date().toISOString(),
  };
}

/** Línea de nota automática cuando hay faltante de recargas. */
export function notaFaltanteRecargasMp(evalResult, usuarioNombre = '—') {
  if (!(evalResult?.faltante > 0)) return '';
  return (
    `FALTANTE RECARGAS MP: $${Number(evalResult.faltante).toFixed(2)} `
    + `(terminal $${Number(evalResult.terminal).toFixed(2)} − POS $${Number(evalResult.pos).toFixed(2)}) `
    + `· a cargo de ${usuarioNombre}`
  );
}
