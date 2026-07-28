import { esAlmacenCentral, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { addDaysYmd, dateFromNogales } from './corteCaja.js';

const LS_CAL = 'pos3b_calendario_inventario';
const TZ = 'America/Hermosillo';

/** 0=dom … 6=sáb (igual que Date.getDay / weekday en Nogales). */
export const DIAS_INVENTARIO = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' },
];

/** Calendario fijo semanal por sucursal (día de la semana). */
export const CALENDARIO_INVENTARIO_BASE = {
  '3B5': 1,
  '3B2': 2,
  FUSION: 4,
  '3B6': 5,
  '3B7': 5,
  '3B9': 6,
  '3B10': 6,
};

export const EVENTO_CALENDARIO_INVENTARIO = 'pos3b-calendario-inventario';

function hoyYmdNogales(date = new Date()) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: TZ });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function weekdayNogales(ymd) {
  // Mediodía Nogales evita bordes de día al calcular weekday.
  const d = dateFromNogales(ymd, 12, 0, 0, 0);
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd] ?? d.getUTCDay();
  } catch {
    return d.getUTCDay();
  }
}

function leerOverrides() {
  try {
    const raw = localStorage.getItem(LS_CAL);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const codigo = normalizarCodigoTienda(k);
      const dia = Number(v);
      if (!codigo || esAlmacenCentral(codigo)) continue;
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
      out[codigo] = dia;
    }
    return out;
  } catch {
    return {};
  }
}

function guardarOverrides(map) {
  localStorage.setItem(LS_CAL, JSON.stringify(map));
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_CALENDARIO_INVENTARIO));
  } catch {
    /* ignore */
  }
}

/** Mapa completo: base + overrides (sucursales nuevas o cambios de día). */
export function leerCalendarioInventario() {
  return { ...CALENDARIO_INVENTARIO_BASE, ...leerOverrides() };
}

export function diaInventarioDeSucursal(sucursal) {
  const c = normalizarCodigoTienda(sucursal);
  if (!c || esAlmacenCentral(c)) return null;
  const cal = leerCalendarioInventario();
  return Object.prototype.hasOwnProperty.call(cal, c) ? cal[c] : null;
}

export function etiquetaDiaInventario(dia) {
  const row = DIAS_INVENTARIO.find((d) => d.id === dia);
  return row?.label || '—';
}

/**
 * Asigna o cambia el día de inventario de una sucursal.
 * Las base también se pueden sobrescribir vía override.
 */
export function asignarDiaInventarioSucursal(sucursal, diaSemana) {
  const c = normalizarCodigoTienda(sucursal);
  if (!c || esAlmacenCentral(c)) {
    return { ok: false, error: 'Indica una sucursal de venta (no MAIN).' };
  }
  const dia = Number(diaSemana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    return { ok: false, error: 'Elige un día de la semana válido.' };
  }
  const next = { ...leerOverrides(), [c]: dia };
  try {
    guardarOverrides(next);
  } catch {
    return { ok: false, error: 'No se pudo guardar el calendario en este navegador.' };
  }
  return { ok: true, codigo: c, dia };
}

export function quitarDiaInventarioOverride(sucursal) {
  const c = normalizarCodigoTienda(sucursal);
  if (!c) return { ok: false, error: 'Código vacío.' };
  const next = { ...leerOverrides() };
  if (!Object.prototype.hasOwnProperty.call(next, c)) return { ok: true };
  delete next[c];
  try {
    guardarOverrides(next);
  } catch {
    return { ok: false, error: 'No se pudo actualizar.' };
  }
  return { ok: true };
}

/** Lista operativa con día asignado (o null si aún no tiene). */
export function listarCalendarioInventarioUI() {
  const cal = leerCalendarioInventario();
  const codes = new Set([...listarSucursalesOperativas(), ...Object.keys(cal)]);
  return [...codes]
    .filter((c) => !esAlmacenCentral(c))
    .sort()
    .map((codigo) => ({
      codigo,
      dia: Object.prototype.hasOwnProperty.call(cal, codigo) ? cal[codigo] : null,
      etiquetaDia: Object.prototype.hasOwnProperty.call(cal, codigo)
        ? etiquetaDiaInventario(cal[codigo])
        : 'Sin día',
      esBase: Object.prototype.hasOwnProperty.call(CALENDARIO_INVENTARIO_BASE, codigo),
    }));
}

/**
 * Último día de inventario de la sucursal (incluye hoy si es día de inventario).
 * @returns {{ ymd: string, proximoYmd: string, diaCiclo: number, diasRestantes: number } | null}
 */
export function cicloInventarioSucursal(sucursal, ahora = new Date()) {
  const diaMeta = diaInventarioDeSucursal(sucursal);
  if (diaMeta == null) return null;

  const hoy = hoyYmdNogales(ahora);
  let ymd = hoy;
  for (let i = 0; i < 8; i += 1) {
    if (weekdayNogales(ymd) === diaMeta) break;
    ymd = addDaysYmd(ymd, -1);
  }
  if (weekdayNogales(ymd) !== diaMeta) return null;

  const proximoYmd = addDaysYmd(ymd, 7);
  const diaCiclo = Math.max(0, Math.round((dateFromNogales(hoy, 12).getTime() - dateFromNogales(ymd, 12).getTime()) / 86400000));
  const diasRestantes = Math.max(0, Math.round((dateFromNogales(proximoYmd, 12).getTime() - dateFromNogales(hoy, 12).getTime()) / 86400000));

  return {
    ymd,
    proximoYmd,
    diaCiclo: Math.min(7, diaCiclo),
    diasRestantes,
    diaSemana: diaMeta,
    etiquetaDia: etiquetaDiaInventario(diaMeta),
    esHoyInventario: hoy === ymd,
  };
}
