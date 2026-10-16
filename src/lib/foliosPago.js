/**
 * Sufijos de folio por forma de pago (Compras CMP-… y Venta en Ruta VR-…).
 *
 *   Efectivo  → …-E
 *   Crédito   → …-C
 *   Mixto     → …-M   (ticket / operación padre)
 *               …-ME  (parte efectivo)
 *               …-MC  (parte crédito)
 *
 * Compat: folios viejos sin sufijo siguen válidos.
 */

const SUFIJOS = new Set(['E', 'C', 'M', 'ME', 'MC']);

/** Normaliza metodo_pago → efectivo | credito | mixto | ''. */
export function normalizarMetodoPagoFolio(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s) return '';
  if (s.includes('mixto')) return 'mixto';
  if (s.includes('credito')) return 'credito';
  if (s.includes('efectivo') || s === 'cash') return 'efectivo';
  return '';
}

/** Sufijo de la operación principal: E | C | M | ''. */
export function sufijoFolioPago(metodo) {
  const m = normalizarMetodoPagoFolio(metodo);
  if (m === 'efectivo') return 'E';
  if (m === 'credito') return 'C';
  if (m === 'mixto') return 'M';
  return '';
}

/** Quita -E/-C/-M/-ME/-MC del final (si existe). */
export function quitarSufijoPagoFolio(folio) {
  const s = String(folio || '').trim();
  if (!s) return '';
  const m = s.match(/^(.*)-([ECM]|ME|MC)$/i);
  if (!m) return s;
  if (!SUFIJOS.has(m[2].toUpperCase())) return s;
  return m[1];
}

/** Lee el sufijo de pago o ''. */
export function leerSufijoPagoFolio(folio) {
  const s = String(folio || '').trim();
  const m = s.match(/-([ECM]|ME|MC)$/i);
  if (!m) return '';
  const suf = m[1].toUpperCase();
  return SUFIJOS.has(suf) ? suf : '';
}

/**
 * Añade el sufijo de pago al folio base.
 * Si ya trae sufijo, lo reemplaza según el método.
 */
export function folioConSufijoPago(folioBase, metodo) {
  const base = quitarSufijoPagoFolio(folioBase);
  if (!base) return '';
  const suf = sufijoFolioPago(metodo);
  return suf ? `${base}-${suf}` : base;
}

/**
 * Folios de una operación mixta a partir del folio padre (…-M o base).
 * @returns {{ operacion: string, efectivo: string, credito: string, base: string }}
 */
export function foliosPagoMixto(folioBaseOPadre) {
  const base = quitarSufijoPagoFolio(folioBaseOPadre);
  return {
    base,
    operacion: base ? `${base}-M` : '',
    efectivo: base ? `${base}-ME` : '',
    credito: base ? `${base}-MC` : '',
  };
}

/**
 * Familia de folios según método.
 * - efectivo → { operacion: …-E, efectivo: …-E, credito: '' }
 * - credito  → { operacion: …-C, efectivo: '', credito: …-C }
 * - mixto    → { operacion: …-M, efectivo: …-ME, credito: …-MC }
 */
export function familiaFoliosPago(folioBase, metodo) {
  const base = quitarSufijoPagoFolio(folioBase);
  const m = normalizarMetodoPagoFolio(metodo);
  if (!base) {
    return { base: '', operacion: '', efectivo: '', credito: '', metodo: m || '' };
  }
  if (m === 'mixto') {
    const mix = foliosPagoMixto(base);
    return { ...mix, metodo: 'mixto' };
  }
  if (m === 'credito') {
    const op = `${base}-C`;
    return { base, operacion: op, efectivo: '', credito: op, metodo: 'credito' };
  }
  if (m === 'efectivo') {
    const op = `${base}-E`;
    return { base, operacion: op, efectivo: op, credito: '', metodo: 'efectivo' };
  }
  return { base, operacion: base, efectivo: '', credito: '', metodo: m || '' };
}

/** ¿Dos folios son la misma operación (ignorando sufijo de pago)? */
export function mismosFoliosBase(a, b) {
  const x = quitarSufijoPagoFolio(a).toUpperCase();
  const y = quitarSufijoPagoFolio(b).toUpperCase();
  return Boolean(x) && x === y;
}
