/**
 * Folios de inventario por sucursal.
 * Ingresos: ING-{suc}-{DDMM}-####   (3B5 → ING-5-0509-0001)
 * Retiros:  RET-{suc}-{DDMM}-####
 * Compras:  CMP-{suc}-XXXXXXXX
 * Traspasos: trp-{suc}-####
 *
 * Compat: se siguen reconociendo los formatos viejos sin sucursal
 * (ING-DDMM-####, CMP-XXXXXXXX, trp-####).
 */
import { tokenFolioSucursal } from '../constants/sucursales.js';
import { hoyYmdNogales } from './corteCaja.js';

const LS_FOLIO_ING = 'pos3b_folio_ingreso_seq';
const LS_FOLIO_RET = 'pos3b_folio_retiro_seq';
const LS_FOLIO_TRP = 'pos3b_folio_traspaso_seq';

export { tokenFolioSucursal };

function padSeq(n, min = 4) {
  const s = String(Math.max(1, Number(n) || 1));
  return s.length >= min ? s : s.padStart(min, '0');
}

function leerSeqLocal(lsKey, { resetKey = null } = {}) {
  let seq = 1;
  try {
    const raw = localStorage.getItem(lsKey);
    const prev = raw ? JSON.parse(raw) : {};
    if (resetKey != null) {
      if (String(prev.fecha || '') === String(resetKey)) seq = (Number(prev.seq) || 0) + 1;
    } else {
      seq = Math.max(1, (Number(prev.seq) || 0) + 1);
    }
    const payload = resetKey != null ? { fecha: resetKey, seq } : { seq };
    localStorage.setItem(lsKey, JSON.stringify(payload));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1;
  }
  return seq;
}

/**
 * Folio único de ingreso/retiro. Incluye el número de sucursal.
 * Formato: ING-5-DDMM-0003 / RET-FUS-DDMM-0003 (día de negocio Hermosillo).
 */
export function generarFolioMovimiento(tipo = 'entrada', sucursal = '') {
  const esRetiro = String(tipo || '').toLowerCase() === 'retiro';
  const prefix = esRetiro ? 'RET' : 'ING';
  const token = tokenFolioSucursal(sucursal);
  const baseKey = esRetiro ? LS_FOLIO_RET : LS_FOLIO_ING;
  const ymd = hoyYmdNogales(); // YYYY-MM-DD
  const todayKey = String(ymd || '').replace(/-/g, '');
  const parts = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mes = parts?.[2] || '';
  const dia = parts?.[3] || '';
  const fechaCorta = `${dia}${mes}`;
  const seq = leerSeqLocal(`${baseKey}:${token}`, { resetKey: todayKey });
  return `${prefix}-${token}-${fechaCorta || todayKey.slice(4) || '0000'}-${padSeq(seq)}`;
}

/** Folio estable ligado a una compra (misma recepción = mismo folio), distinto por sucursal. */
export function folioDesdeCompraId(compraId, sucursal = '') {
  const raw = String(compraId || '').replace(/-/g, '').trim();
  if (!raw) return generarFolioMovimiento('entrada', sucursal);
  const hex = raw.slice(0, 8).toUpperCase();
  const token = tokenFolioSucursal(sucursal);
  if (!sucursal) return `CMP-${hex}`;
  return `CMP-${token}-${hex}`;
}

/** ¿El folio tecleado corresponde a esta compra? Acepta CMP viejo y CMP-{suc}-hex. */
export function coincideFolioCompra(compra, folio) {
  if (!compra?.id) return false;
  const fUp = String(folio || '').trim().toUpperCase();
  if (!fUp) return false;
  if (folioDesdeCompraId(compra.id).toUpperCase() === fUp) return true;
  if (folioDesdeCompraId(compra.id, compra.sucursal_id).toUpperCase() === fUp) return true;
  const hex = String(compra.id).replace(/-/g, '').slice(0, 8).toUpperCase();
  const mNew = fUp.match(/^CMP-([A-Z0-9]+)-([A-F0-9]{6,12})$/i);
  if (mNew) {
    const token = tokenFolioSucursal(compra.sucursal_id);
    if (mNew[1].toUpperCase() !== String(token).toUpperCase()) return false;
    return hex.startsWith(mNew[2].toUpperCase());
  }
  const mOld = fUp.match(/^CMP-([A-F0-9]{6,12})$/i);
  if (mOld && hex.startsWith(mOld[1].toUpperCase())) return true;
  return false;
}

/**
 * Folio de traspaso. Incluye el número de la sucursal que lo genera.
 * trp-5-0001 · trp-FUS-0001 · trp-10-0001
 */
export function generarFolioTrp(sucursal = '') {
  const token = tokenFolioSucursal(sucursal);
  const seq = leerSeqLocal(`${LS_FOLIO_TRP}:${token}`);
  return `trp-${token}-${padSeq(seq)}`;
}

/** Normaliza trp-5-20 / trp-20 / 20 → forma canónica. */
export function normalizarFolioTrp(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  const mNew = s.match(/^trp-([a-z0-9]+)-(\d+)$/i);
  if (mNew) {
    const tok = /[a-z]/i.test(mNew[1]) ? mNew[1].toUpperCase() : mNew[1];
    return `trp-${tok}-${padSeq(mNew[2])}`;
  }
  const mOld = s.match(/^trp-?(\d+)$/i);
  if (mOld) return `trp-${padSeq(mOld[1])}`;
  const mBare = s.match(/^([a-z0-9]+)-(\d+)$/i);
  if (mBare && !/^(ing|ret|cmp)$/i.test(mBare[1])) {
    const tok = /[a-z]/i.test(mBare[1]) ? mBare[1].toUpperCase() : mBare[1];
    return `trp-${tok}-${padSeq(mBare[2])}`;
  }
  if (/^\d+$/.test(s)) return `trp-${padSeq(s)}`;
  return s.startsWith('trp-') ? s : `trp-${s}`;
}

/** ING/RET con o sin sucursal; pad del consecutivo a 4. */
export function normalizarFolioIngRet(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  const mNew = s.match(/^(ING|RET)-([A-Z0-9]+)-(\d{4}|\d{8})-(\d{1,6})$/i);
  if (mNew) {
    return `${mNew[1].toUpperCase()}-${mNew[2].toUpperCase()}-${mNew[3]}-${padSeq(mNew[4])}`;
  }
  const mOld = s.match(/^(ING|RET)-(\d{4}|\d{8})-(\d{1,6})$/i);
  if (mOld) {
    return `${mOld[1].toUpperCase()}-${mOld[2]}-${padSeq(mOld[3])}`;
  }
  if (/^(ING|RET)-/i.test(s)) return s.toUpperCase();
  return '';
}

export function normalizarFolioCmp(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, '');
  if (!s || !/^CMP-/i.test(s)) return '';
  const mNew = s.match(/^CMP-([A-Z0-9]+)-([A-F0-9]{6,})$/i);
  if (mNew) return `CMP-${mNew[1].toUpperCase()}-${mNew[2].toUpperCase()}`;
  const mOld = s.match(/^CMP-([A-F0-9]{6,})$/i);
  if (mOld) return `CMP-${mOld[1].toUpperCase()}`;
  return s.toUpperCase();
}

/** Folio de sustento Smoking / gastos: ING, RET, CMP, trp (viejos y con sucursal). */
export function normalizarFolioInventario(raw) {
  const s0 = String(raw || '').trim();
  if (!s0) return '';
  const s = s0.replace(/\s+/g, '');
  if (/^trp/i.test(s)) return normalizarFolioTrp(s);
  const ing = normalizarFolioIngRet(s);
  if (ing) return ing;
  const cmp = normalizarFolioCmp(s);
  if (cmp) return cmp;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  if (/^[0-9a-f]{8,32}$/i.test(s) && !/^(ing|cmp|ret|trp)/i.test(s)) {
    return s.toLowerCase();
  }
  if (/^\d+$/.test(s)) return normalizarFolioTrp(s);
  return s.toUpperCase();
}
