import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';
import { periodoSemanaNomina, ymdLocal } from './semanaNomina.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function sumarDiasYmd(ymd, dias) {
  const d = parseYmd(ymd);
  if (!d) return '';
  d.setDate(d.getDate() + dias);
  return ymdLocal(d);
}

/** Cuotas por defecto: $500 por semana (la última lleva el resto). */
export function numCuotasPorDefecto(monto) {
  const m = Number(monto) || 0;
  if (!(m > 0)) return 1;
  return Math.max(1, Math.ceil(m / CUOTA_SEMANAL_MINIMA - 1e-9));
}

/**
 * Primer cobro por defecto: la nómina de la semana siguiente a la fecha del préstamo
 * (se muestra el viernes que cierra esa semana de nómina sáb–vie).
 */
export function primerCobroPorDefecto(fecha = new Date()) {
  const base = fecha instanceof Date ? fecha : parseYmd(fecha) || new Date();
  const semana = periodoSemanaNomina(base);
  return sumarDiasYmd(semana.fin, 7);
}

/** Calendario del préstamo, o null si es un préstamo anterior sin calendario. */
export function cronogramaPrestamo(p) {
  const n = Math.floor(Number(p?.num_cuotas));
  const primer = String(p?.primer_cobro || '').slice(0, 10);
  if (!(n > 0) || !parseYmd(primer)) return null;
  return { numCuotas: n, primerCobro: primer };
}

/** Cuota normal (todas menos la última, que liquida el saldo). */
export function cuotaProgramada(p) {
  const cr = cronogramaPrestamo(p);
  if (!cr) return CUOTA_SEMANAL_MINIMA;
  const monto = Number(p?.monto_original) || 0;
  if (cr.numCuotas === numCuotasPorDefecto(monto)) return CUOTA_SEMANAL_MINIMA;
  return round2(monto / cr.numCuotas);
}

/** Número de cuota (1..n) que toca en el periodo de nómina; fuera de rango puede ser <1 o >n. */
export function numeroCuotaEnPeriodo(p, periodoInicio) {
  const cr = cronogramaPrestamo(p);
  const ini = parseYmd(periodoInicio);
  if (!cr || !ini) return null;
  const semanaPrimer = periodoSemanaNomina(parseYmd(cr.primerCobro)).inicio;
  const dias = Math.round((ini.getTime() - parseYmd(semanaPrimer).getTime()) / 86400000);
  return Math.floor(dias / 7) + 1;
}

/**
 * Cuota de un préstamo con calendario en un periodo de nómina.
 * @returns {{ monto: number, numero: number|null, total: number|null, estado: 'cobrar'|'aun_no'|'terminado'|'sin_calendario' }}
 */
export function cuotaEnPeriodo(p, periodo = {}) {
  const saldo = Number(p?.saldo) || 0;
  const cr = cronogramaPrestamo(p);
  if (!cr) return { monto: 0, numero: null, total: null, estado: 'sin_calendario' };
  if (!(saldo > 0)) return { monto: 0, numero: null, total: cr.numCuotas, estado: 'terminado' };
  const numero = numeroCuotaEnPeriodo(p, periodo.inicio);
  if (numero == null) return { monto: 0, numero: null, total: cr.numCuotas, estado: 'sin_calendario' };
  if (numero < 1) return { monto: 0, numero, total: cr.numCuotas, estado: 'aun_no' };
  if (numero > cr.numCuotas) return { monto: 0, numero, total: cr.numCuotas, estado: 'terminado' };
  const monto = numero === cr.numCuotas ? round2(saldo) : round2(Math.min(saldo, cuotaProgramada(p)));
  return { monto, numero, total: cr.numCuotas, estado: 'cobrar' };
}

export function textoCuotaPrestamo(p) {
  const cr = cronogramaPrestamo(p);
  if (!cr) return '';
  return `${cr.numCuotas} cuota${cr.numCuotas === 1 ? '' : 's'} · 1.º cobro ${cr.primerCobro}`;
}
