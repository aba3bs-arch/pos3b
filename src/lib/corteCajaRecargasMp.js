/**
 * Candado de cierre: conciliar recargas Mercado Pago (terminal) vs POS.
 * Si terminal > POS: aceptar faltante del cajero/CT **o** registrar la venta faltante en el POS.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function esErrorDeRedLocal(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('fetch failed')
    || msg.includes('err_internet_disconnected')
    || msg.includes('err_connection')
    || msg.includes('timeout')
    || msg.includes('timed out')
  );
}

function etiquetaTurnoLocal(turno) {
  if (!turno) return null;
  if (turno.nombre) return String(turno.nombre);
  if (turno.id) return String(turno.id);
  return null;
}

function encolarVentaAjusteLocal(payload) {
  try {
    const key = 'pos3b_ventas_offline_cola';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const cola = raw ? JSON.parse(raw) : [];
    const lista = Array.isArray(cola) ? cola : [];
    const id = `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      ...payload,
      sucursal_id: normalizarCodigoTienda(payload.sucursal_id) || payload.sucursal_id,
    };
    lista.unshift(row);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(lista.slice(0, 200)));
    }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo guardar la venta offline.' };
  }
}

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

export const ACCION_FALTANTE = 'faltante';
export const ACCION_REGISTRAR_VENTA = 'registrar_venta';

/**
 * Evalúa el candado.
 * @param {object} opts
 * @param {'faltante'|'registrar_venta'|''} [opts.accionResolucion]
 *   Cuando terminal > POS: faltante a cargo del cajero, o registrar venta en POS.
 */
export function evaluarCandadoRecargasMp({
  terminalRaw,
  pos = 0,
  aceptoFaltante = false,
  aceptoRevision = false,
  accionResolucion = '',
} = {}) {
  const posN = round2(pos);
  if (terminalRaw === '' || terminalRaw == null) {
    return {
      ok: false,
      terminal: null,
      pos: posN,
      diferencia: null,
      faltante: 0,
      montoVenta: 0,
      accion: null,
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
      montoVenta: 0,
      accion: null,
      requiereAceptarFaltante: false,
      requiereAceptarRevision: false,
      error: 'El monto de la terminal no es válido.',
    };
  }

  const diferencia = round2(terminal - posN);
  const terminalMayor = diferencia > 0.009;
  const requiereAceptarRevision = diferencia < -0.009;
  const accion = String(accionResolucion || '').trim();

  // Compat: checkbox antiguo «aceptoFaltante» = elegir faltante.
  const eligioFaltante = accion === ACCION_FALTANTE || (!accion && aceptoFaltante);
  const eligioRegistrar = accion === ACCION_REGISTRAR_VENTA;

  if (terminalMayor && !eligioFaltante && !eligioRegistrar) {
    return {
      ok: false,
      terminal,
      pos: posN,
      diferencia,
      faltante: diferencia,
      montoVenta: diferencia,
      accion: null,
      requiereAceptarFaltante: true,
      requiereAceptarRevision: false,
      error:
        `La terminal reporta $${diferencia.toFixed(2)} más que el POS. `
        + 'Elige registrar la venta en el POS o aceptar el faltante a cargo del cajero/CT.',
    };
  }

  if (requiereAceptarRevision && !aceptoRevision) {
    return {
      ok: false,
      terminal,
      pos: posN,
      diferencia,
      faltante: 0,
      montoVenta: 0,
      accion: null,
      requiereAceptarFaltante: false,
      requiereAceptarRevision: true,
      error: `El POS tiene $${Math.abs(diferencia).toFixed(2)} más en recargas que la terminal. Revisa e indica que ya verificaste.`,
    };
  }

  if (terminalMayor && eligioRegistrar) {
    return {
      ok: true,
      terminal,
      pos: posN,
      diferencia,
      faltante: 0,
      montoVenta: diferencia,
      accion: ACCION_REGISTRAR_VENTA,
      requiereAceptarFaltante: true,
      requiereAceptarRevision: false,
    };
  }

  // Faltante: también registra la recarga en POS/venta (si no, la venta baja
  // por el gasto y queda un sobrante artificial de la misma diferencia).
  return {
    ok: true,
    terminal,
    pos: posN,
    diferencia,
    faltante: terminalMayor ? diferencia : 0,
    montoVenta: terminalMayor ? diferencia : 0,
    accion: terminalMayor ? ACCION_FALTANTE : null,
    requiereAceptarFaltante: terminalMayor,
    requiereAceptarRevision,
  };
}

/** Payload para guardar dentro de corroboracion.recargas_mp */
export function payloadRecargasMpCorroboracion(evalResult, { usuarioNombre = null, usuarioId = null } = {}) {
  const accion = evalResult.accion || null;
  const faltante = evalResult.faltante || 0;
  return {
    terminal: evalResult.terminal,
    pos: evalResult.pos,
    diferencia: evalResult.diferencia,
    faltante,
    monto_venta_registrada: (evalResult.montoVenta || 0) > 0.009 ? (evalResult.montoVenta || 0) : 0,
    accion,
    aceptado_faltante: faltante > 0,
    venta_registrada: (evalResult.montoVenta || 0) > 0.009,
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
    + `+ venta/recarga registrada en POS `
    + `(terminal $${Number(evalResult.terminal).toFixed(2)} − POS $${Number(evalResult.pos).toFixed(2)}) `
    + `· a cargo de ${usuarioNombre}`
  );
}

/** Nota cuando se registró la venta faltante en el POS (opción 1 o junto al faltante). */
export function notaVentaRegistradaRecargasMp(evalResult, usuarioNombre = '—') {
  const monto = Number(evalResult?.montoVenta) || 0;
  if (!(monto > 0)) return '';
  if (evalResult?.accion === ACCION_FALTANTE) {
    // La nota de faltante ya menciona la venta registrada.
    return '';
  }
  return (
    `VENTA RECARGAS MP REGISTRADA EN POS: $${monto.toFixed(2)} `
    + `(terminal $${Number(evalResult.terminal).toFixed(2)} − POS $${Number(evalResult.pos).toFixed(2)}) `
    + `· por ${usuarioNombre}`
  );
}

/**
 * Suma el ajuste de recargas MP a la venta capturada del corte abarrotes.
 * (La venta del corte es manual; no se toma sola de la tabla ventas del POS.)
 */
export function ventaCorteTrasAjusteRecargasMp(ventaActual, montoAjuste) {
  return round2((Number(ventaActual) || 0) + (Number(montoAjuste) || 0));
}

/**
 * Inserta (o encola offline) la venta de recarga faltante para cuadrar terminal vs POS.
 * No descuenta inventario: es un ajuste de recarga TAE / Mercado Pago.
 */
export async function registrarVentaRecargaMpAjuste(supabase, {
  monto,
  sucursal,
  user,
  turno = null,
} = {}) {
  const total = round2(monto);
  if (!(total > 0.009)) return { ok: false, error: 'Monto de venta inválido.' };
  const tienda = normalizarCodigoTienda(sucursal) || sucursal;
  if (!tienda) return { ok: false, error: 'Sin sucursal.' };

  const articulos = [{
    id: 'recarga-mp-ajuste-candado',
    nombre: 'Recarga Mercado Pago (ajuste candado)',
    precio: total,
    qty: 1,
  }];

  const ventaPayload = {
    vendedor: user?.nombre || 'Cajero',
    usuario_id: user?.id || null,
    sucursal_id: tienda,
    total,
    metodo_pago: 'Recarga Mercado Pago',
    articulos,
    turno_id: turno?.id || null,
    turno_nombre: etiquetaTurnoLocal(turno),
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    const r = encolarVentaAjusteLocal(ventaPayload);
    return r.ok
      ? { ok: true, offline: true, id: r.id, venta: ventaPayload }
      : { ok: false, error: r.error || 'No se pudo guardar offline.' };
  }

  try {
    const { data, error } = await supabase.from('ventas').insert([{
      vendedor: ventaPayload.vendedor,
      usuario_id: ventaPayload.usuario_id,
      sucursal_id: ventaPayload.sucursal_id,
      total: ventaPayload.total,
      metodo_pago: ventaPayload.metodo_pago,
      articulos: ventaPayload.articulos,
      turno_id: ventaPayload.turno_id,
      turno_nombre: ventaPayload.turno_nombre,
    }]).select('id').maybeSingle();
    if (error) {
      if (esErrorDeRedLocal(error)) {
        const r = encolarVentaAjusteLocal(ventaPayload);
        return r.ok
          ? { ok: true, offline: true, id: r.id, venta: ventaPayload }
          : { ok: false, error: r.error || error.message };
      }
      return { ok: false, error: error.message || String(error) };
    }
    return { ok: true, id: data?.id || null, venta: ventaPayload };
  } catch (e) {
    if (esErrorDeRedLocal(e)) {
      const r = encolarVentaAjusteLocal(ventaPayload);
      return r.ok
        ? { ok: true, offline: true, id: r.id, venta: ventaPayload }
        : { ok: false, error: r.error || e?.message };
    }
    return { ok: false, error: e?.message || String(e) };
  }
}
