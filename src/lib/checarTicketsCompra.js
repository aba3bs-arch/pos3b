/**
 * Tablero para checar tickets de compra:
 * proveedor | gasto ingresado | una columna por día del rango.
 * Reutiliza las filas de consolidación (compra ↔ inventario ↔ gasto PROVEEDORES).
 */
import { esEventoCreditoSinGastoEsperado } from './consolidacionComprasInventario.js';

export const MAX_DIAS_CHECAR = 31;

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ymdValido(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function sumarDia(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  if (Number.isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function ymdLocal(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Lunes a domingo de la semana que contiene `hoy` (incluye días que todavía no llegan). */
export function rangoSemanaCompleta(hoy = new Date()) {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const ini = new Date(base);
  ini.setDate(base.getDate() + diff);
  const fin = new Date(ini);
  fin.setDate(ini.getDate() + 6);
  return { desde: ymdLocal(ini), hasta: ymdLocal(fin) };
}

export function enumerarDias(desde, hasta, max = MAX_DIAS_CHECAR) {
  const a = String(desde || '').slice(0, 10);
  const b = String(hasta || '').slice(0, 10);
  const tope = Math.max(1, Number(max) || MAX_DIAS_CHECAR);
  if (!ymdValido(a) || !ymdValido(b) || a > b) return { dias: [], truncado: false };
  const dias = [];
  let cur = a;
  let truncado = false;
  while (cur && cur <= b) {
    if (dias.length >= tope) {
      truncado = true;
      break;
    }
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = DOW[dt.getDay()] || '';
    dias.push({ ymd: cur, etiqueta: `${dow} ${d}`, dow, dia: d });
    const next = sumarDia(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return { dias, truncado };
}

function piezasDe(lineas) {
  const n = (lineas || []).reduce((a, l) => a + Math.abs(Number(l?.qty ?? l?.cantidad) || 0), 0);
  return round2(n);
}

/** Compra, ingreso de proveedor o gasto de proveedor. Los traspasos no entran. */
export function incluirEnChecarTickets(fila) {
  if (!fila || fila.tipo === 'traspaso' || fila.origen === 'traspaso') return false;
  if (fila.origen === 'gasto_huerfano' || fila.tipo === 'gasto') return true;
  if (fila.tipo === 'compra' || fila.origen === 'compra' || fila.compra_id) return true;
  if ((fila.lineas_ticket || []).length > 0) return true;
  const tieneGasto = (fila.gastos || []).length > 0 || Number(fila.monto_gasto) > 0;
  const proveedor = String(fila.proveedor || '').trim();
  if (tieneGasto && proveedor) return true;
  if (fila.origen === 'ingreso' && proveedor) return true;
  return false;
}

function esSoloGasto(fila, tieneLineas) {
  return (fila.origen === 'gasto_huerfano' || fila.tipo === 'gasto')
    && !tieneLineas
    && !(Number(fila.monto_ticket) > 0);
}

function armarFila(fila, ymds) {
  const ymd = String(fila.fecha_ymd || '').slice(0, 10);
  const piezasInv = piezasDe(fila.lineas_inventario);
  const piezasTicket = piezasDe(fila.lineas_ticket);
  const tieneInv = (fila.lineas_inventario || []).length > 0;
  const piezas = tieneInv ? piezasInv : 0;
  const tieneLineas = (fila.lineas_ticket || []).length > 0 || (fila.lineas_inventario || []).length > 0;
  const tieneTicket = !esSoloGasto(fila, tieneLineas) && (
    tieneLineas
    || Number(fila.monto_ticket) > 0
    || fila.origen === 'compra'
    || fila.tipo === 'compra'
    || fila.origen === 'ingreso'
  );
  const montoGasto = round2(fila.monto_gasto);
  const nGastos = (fila.gastos || []).length;
  const credito = esEventoCreditoSinGastoEsperado(fila);
  let gastoEstado = 'sin_gasto';
  if (montoGasto > 0 && nGastos > 1) gastoEstado = 'duplicado';
  else if (montoGasto > 0 || nGastos > 0) gastoEstado = 'ingresado';
  else if (credito) gastoEstado = 'credito';

  const celda = tieneTicket
    ? {
      piezas,
      piezasTicket,
      piezasInventario: piezasInv,
      monto: round2(Number(fila.monto_ticket) || Number(fila.monto_inventario) || 0),
      folio: fila.folio || '',
    }
    : null;
  const enDia = Boolean(celda && ymds.has(ymd));

  return {
    id: fila.id || `${fila.proveedor || 'prov'}|${ymd}|${fila.folio || ''}`,
    proveedor: String(fila.proveedor || '').trim() || 'Sin proveedor',
    tienda: fila.tienda || '',
    sucursal_id: fila.sucursal_id || '',
    folio: fila.folio || '',
    fecha_ymd: ymd,
    tieneTicket,
    piezas,
    piezasTicket,
    piezasInventario: piezasInv,
    montoTicket: round2(fila.monto_ticket),
    montoGasto,
    nGastos,
    gastoEstado,
    gastos: fila.gastos || [],
    celdas: enDia ? { [ymd]: celda } : {},
    ticketFuera: Boolean(celda && !enDia),
    fuente: fila,
  };
}

export function sumarPiezasPorDia(rows, dias) {
  const map = {};
  for (const d of dias || []) map[d.ymd] = 0;
  for (const r of rows || []) {
    for (const [ymd, celda] of Object.entries(r.celdas || {})) {
      if (map[ymd] == null) continue;
      map[ymd] = round2(map[ymd] + (Number(celda.piezas) || 0));
    }
  }
  return map;
}

/**
 * Una fila por ticket o por gasto. El mismo proveedor puede repetirse.
 * La columna de gasto no se parte por día: el ticket cae en la columna de su fecha.
 */
export function armarTableroChecarTickets(filas, { desde, hasta } = {}) {
  const { dias, truncado } = enumerarDias(desde, hasta);
  const ymds = new Set(dias.map((d) => d.ymd));
  const rows = (filas || []).filter(incluirEnChecarTickets).map((f) => armarFila(f, ymds));
  rows.sort((a, b) => {
    const p = String(a.proveedor).localeCompare(String(b.proveedor), 'es', { sensitivity: 'base' });
    if (p) return p;
    const f = String(a.fecha_ymd).localeCompare(String(b.fecha_ymd));
    if (f) return f;
    return String(a.folio).localeCompare(String(b.folio), 'es');
  });
  const resumen = {
    registros: rows.length,
    tickets: rows.filter((r) => r.tieneTicket).length,
    piezas: round2(rows.reduce((a, r) => a + (Number(r.piezas) || 0), 0)),
    gastos: rows.filter((r) => r.gastoEstado === 'ingresado' || r.gastoEstado === 'duplicado').length,
    montoGasto: round2(rows.reduce((a, r) => a + (Number(r.montoGasto) || 0), 0)),
    sinGasto: rows.filter((r) => r.gastoEstado === 'sin_gasto').length,
    sinTicket: rows.filter((r) => !r.tieneTicket).length,
    credito: rows.filter((r) => r.gastoEstado === 'credito').length,
  };
  return { dias, truncado, rows, resumen, piezasPorDia: sumarPiezasPorDia(rows, dias) };
}
