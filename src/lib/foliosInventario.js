/**
 * Folios de inventario por sucursal.
 * Ingresos: ING-{suc}-{DDMM}-####   (3B5 → ING-5-0509-0001)
 * Retiros:  RET-{suc}-{DDMM}-####
 * Compras:  CMP-{suc}-XXXXXXXX  (o ING al recibir, mismo consecutivo que ingresos)
 * Traspasos: trp-{suc}-####
 *
 * El consecutivo #### es continuo por sucursal (NO reinicia cada día):
 * si hoy llegaste a 0004, mañana sigue en 0005. Así se puede usar en gastos.
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

/** Lee el último consecutivo guardado en localStorage (sin incrementar). */
function peekSeqLocal(lsKey) {
  try {
    const raw = localStorage.getItem(lsKey);
    const prev = raw ? JSON.parse(raw) : {};
    return Math.max(0, Number(prev.seq) || 0);
  } catch {
    return 0;
  }
}

/** Fija el consecutivo local a al menos `minSeq` (sin consumir el siguiente). */
function fijarSeqMinimo(lsKey, minSeq) {
  const n = Math.max(0, Math.floor(Number(minSeq) || 0));
  if (n <= 0) return;
  try {
    const actual = peekSeqLocal(lsKey);
    if (n > actual) {
      localStorage.setItem(lsKey, JSON.stringify({ seq: n }));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Consecutivo continuo por llave (sin reinicio diario).
 * Antes los ingresos/retiros reiniciaban con resetKey=fecha; eso hacía
 * 0001/0002/0003 todos los días y no servían como referencia en gastos.
 */
function leerSeqLocal(lsKey) {
  let seq = 1;
  try {
    const actual = peekSeqLocal(lsKey);
    seq = actual + 1;
    localStorage.setItem(lsKey, JSON.stringify({ seq }));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1;
  }
  return seq;
}

/** Extrae el número consecutivo de un folio ING/RET/trp (ignora DDMM). */
export function seqDesdeFolioInventario(folio) {
  const s = String(folio || '').trim();
  if (!s) return 0;
  const mIng = s.match(/^(ING|RET)-(?:[A-Z0-9]+-)?(?:\d{4}|\d{8})-(\d{1,8})$/i);
  if (mIng) return Math.max(0, parseInt(mIng[2], 10) || 0);
  const mTrp = s.match(/^trp-(?:[A-Za-z0-9]+-)?(\d{1,8})$/i);
  if (mTrp) return Math.max(0, parseInt(mTrp[1], 10) || 0);
  return 0;
}

/**
 * Busca en la nube el mayor consecutivo ya usado para ING o RET de esa sucursal.
 * Así otra caja / caché limpia no vuelve a emitir 0001.
 */
async function maxSeqMovimientoNube(supabase, prefix, token) {
  if (!supabase || !prefix || !token) return 0;
  let max = 0;
  const likes = [`${prefix}-${token}-%`, `${prefix}-%`];
  for (const like of likes) {
    try {
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('meta')
        .filter('meta->>folio', 'ilike', like)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) continue;
      for (const row of data || []) {
        const folio = String(row?.meta?.folio || '');
        if (!folio) continue;
        const up = folio.toUpperCase();
        const conSuc = up.match(new RegExp(`^${prefix}-${token}-(\\d{4}|\\d{8})-(\\d+)$`, 'i'));
        if (conSuc) {
          max = Math.max(max, parseInt(conSuc[2], 10) || 0);
          continue;
        }
        // Formato viejo sin sucursal: ING-DDMM-#### (solo si no trae token de otra tienda)
        const viejo = up.match(new RegExp(`^${prefix}-(\\d{4}|\\d{8})-(\\d+)$`, 'i'));
        if (viejo) max = Math.max(max, parseInt(viejo[2], 10) || 0);
      }
    } catch {
      /* ignore */
    }
  }
  return max;
}

async function maxSeqTraspasoNube(supabase, token) {
  if (!supabase || !token) return 0;
  let max = 0;
  const tok = String(token).toLowerCase();
  try {
    const { data, error } = await supabase
      .from('inventario_traspasos')
      .select('folio')
      .ilike('folio', 'trp-%')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return 0;
    for (const row of data) {
      const folio = String(row?.folio || '');
      const low = folio.toLowerCase();
      const conSuc = low.match(new RegExp(`^trp-${tok}-(\\d+)$`, 'i'));
      if (conSuc) {
        max = Math.max(max, parseInt(conSuc[1], 10) || 0);
        continue;
      }
      const viejo = low.match(/^trp-(\d+)$/i);
      if (viejo) max = Math.max(max, parseInt(viejo[1], 10) || 0);
    }
  } catch {
    /* ignore */
  }
  return max;
}

/**
 * Folio único de ingreso/retiro. Incluye el número de sucursal.
 * Formato: ING-5-DDMM-0003 / RET-FUS-DDMM-0003 (día de negocio Hermosillo).
 * El #### es continuo (no reinicia al cambiar de día).
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
  const seq = leerSeqLocal(`${baseKey}:${token}`);
  return `${prefix}-${token}-${fechaCorta || todayKey.slice(4) || '0000'}-${padSeq(seq)}`;
}

/**
 * Igual que generarFolioMovimiento, pero primero alinea el consecutivo
 * con lo ya guardado en la nube (y evita repetir 0001 en otra caja).
 */
export async function siguienteFolioMovimiento(supabase, tipo = 'entrada', sucursal = '') {
  const esRetiro = String(tipo || '').toLowerCase() === 'retiro';
  const prefix = esRetiro ? 'RET' : 'ING';
  const token = tokenFolioSucursal(sucursal);
  const baseKey = esRetiro ? LS_FOLIO_RET : LS_FOLIO_ING;
  const lsKey = `${baseKey}:${token}`;
  const maxNube = await maxSeqMovimientoNube(supabase, prefix, token);
  fijarSeqMinimo(lsKey, maxNube);
  return generarFolioMovimiento(tipo, sucursal);
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
 * Consecutivo continuo (no reinicia por día).
 */
export function generarFolioTrp(sucursal = '') {
  const token = tokenFolioSucursal(sucursal);
  const seq = leerSeqLocal(`${LS_FOLIO_TRP}:${token}`);
  return `trp-${token}-${padSeq(seq)}`;
}

/** Alinea el consecutivo de traspaso con la nube y emite el siguiente. */
export async function siguienteFolioTrp(supabase, sucursal = '') {
  const token = tokenFolioSucursal(sucursal);
  const lsKey = `${LS_FOLIO_TRP}:${token}`;
  const maxNube = await maxSeqTraspasoNube(supabase, token);
  fijarSeqMinimo(lsKey, maxNube);
  return generarFolioTrp(sucursal);
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

function addUniq(out, v) {
  const s = String(v || '').trim();
  if (s && !out.includes(s)) out.push(s);
}

/**
 * Formas equivalentes de un folio (con y sin número de sucursal).
 * ING-5-0309-0001 ↔ ING-0309-0001 · trp-5-0020 ↔ trp-0020 · CMP-5-AABBCCDD ↔ CMP-AABBCCDD
 */
export function variantesFolioInventario(raw, sucursal = '') {
  const n = normalizarFolioInventario(raw);
  const token = tokenFolioSucursal(sucursal);
  const out = [];
  addUniq(out, n);
  addUniq(out, String(raw || '').trim());

  const mIngNew = n.match(/^(ING|RET)-([A-Z0-9]+)-(\d{4}|\d{8})-(\d+)$/i);
  if (mIngNew) addUniq(out, `${mIngNew[1].toUpperCase()}-${mIngNew[3]}-${mIngNew[4]}`);

  const mIngOld = n.match(/^(ING|RET)-(\d{4}|\d{8})-(\d+)$/i);
  if (mIngOld && token && token !== 'X') {
    addUniq(out, `${mIngOld[1].toUpperCase()}-${token}-${mIngOld[2]}-${mIngOld[3]}`);
  }

  const mTrpNew = n.match(/^trp-([A-Za-z0-9]+)-(\d+)$/i);
  if (mTrpNew) addUniq(out, `trp-${padSeq(mTrpNew[2])}`);

  const mTrpOld = n.match(/^trp-(\d+)$/i);
  if (mTrpOld && token && token !== 'X') {
    addUniq(out, `trp-${token}-${padSeq(mTrpOld[1])}`);
  }

  const mCmpNew = n.match(/^CMP-([A-Z0-9]+)-([A-F0-9]{6,})$/i);
  if (mCmpNew) addUniq(out, `CMP-${mCmpNew[2].toUpperCase()}`);

  const mCmpOld = n.match(/^CMP-([A-F0-9]{6,})$/i);
  if (mCmpOld && token && token !== 'X') {
    addUniq(out, `CMP-${token}-${mCmpOld[1].toUpperCase()}`);
  }

  return out;
}

/** Si el folio es el formato viejo (sin sucursal), le pone el número de tienda. */
export function sugerirFolioConSucursal(raw, sucursal) {
  const n = normalizarFolioInventario(raw);
  const token = tokenFolioSucursal(sucursal);
  if (!n || !token || token === 'X') return n;
  const mIng = n.match(/^(ING|RET)-(\d{4}|\d{8})-(\d+)$/i);
  if (mIng) return `${mIng[1].toUpperCase()}-${token}-${mIng[2]}-${mIng[3]}`;
  const mTrp = n.match(/^trp-(\d+)$/i);
  if (mTrp) return `trp-${token}-${padSeq(mTrp[1])}`;
  const mCmp = n.match(/^CMP-([A-F0-9]{6,})$/i);
  if (mCmp) return `CMP-${token}-${mCmp[1].toUpperCase()}`;
  return n;
}

export function folioInvDesdeNotas(notas) {
  return (String(notas || '').match(/Folio inv\s+([A-Z0-9-]+)/i) || [])[1] || '';
}

export function notasConFolioInv(notas, folioNuevo) {
  const folio = String(folioNuevo || '').trim();
  const s = String(notas || '').trim();
  if (!folio) return s;
  if (/Folio inv\s+[A-Z0-9-]+/i.test(s)) {
    return s.replace(/Folio inv\s+[A-Z0-9-]+/gi, `Folio inv ${folio}`);
  }
  return s ? `${s} · Folio inv ${folio}` : `Folio inv ${folio}`;
}

export function folioVisibleCompra(compra) {
  const fromNotas = folioInvDesdeNotas(compra?.notas);
  if (fromNotas) return fromNotas;
  return folioDesdeCompraId(compra?.id, compra?.sucursal_id || compra?.sucursal);
}
