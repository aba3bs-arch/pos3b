/**
 * Faltante de inventario (Reportes) → nómina.
 * Se descuenta el faltante neto (campo 2 − bonificación), dividido entre 3,
 * a cada empleado de tienda de esa sucursal.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esEmpleadoIndirectoOMain, resolverTipoEmpleado } from './empleadosVisibles.js';
import { round2 } from './nominaGastos.js';

/** Cuántas partes del faltante: 2 empleados de tienda + 1 CT (cubre turnos). */
export const DIVISOR_FALTANTE_INVENTARIO_NOMINA = 3;

/**
 * Monto a repartir en nómina: faltante neto = faltante bruto − bonificación.
 * Nunca descuenta la bonificación (solo el faltante que queda después de restarla).
 */
export function faltanteNetoParaNomina(reg) {
  if (!reg) return 0;
  const netoDirecto = Number(reg.valor_faltante_neto);
  if (Number.isFinite(netoDirecto)) return round2(Math.max(0, netoDirecto));

  const bruto = Number(reg.valor_faltante);
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  const bon = Math.max(0, Number(reg.valor_bonificacion) || 0);
  return round2(Math.max(0, bruto - bon));
}

export function cuotaFaltanteInventarioNomina(faltante) {
  const n = Number(faltante);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(n / DIVISOR_FALTANTE_INVENTARIO_NOMINA);
}

export function notaCuotaFaltanteInventario(sucursal, faltanteNeto, cuota, { bruto = null, bonificacion = 0 } = {}) {
  const suc = etiquetaTienda(sucursal);
  const bon = Math.max(0, Number(bonificacion) || 0);
  const base = `Inventario ${suc}: neto $${Number(faltanteNeto).toFixed(2)} ÷ ${DIVISOR_FALTANTE_INVENTARIO_NOMINA} = $${Number(cuota).toFixed(2)}`;
  if (bon > 0 && bruto != null && Number.isFinite(Number(bruto))) {
    return `${base} (bruto $${Number(bruto).toFixed(2)} − bonif $${bon.toFixed(2)})`;
  }
  return base;
}

/** ¿El resultado de inventario aplica a esta semana de nómina? */
export function registroFaltanteAplicaASemana(reg, inicio, fin) {
  if (!reg?.desde || !reg?.hasta || !inicio || !fin) return false;
  if (reg.hasta < inicio || reg.desde > fin) return false;
  if (faltanteNetoParaNomina(reg) > 0) return true;
  const bruto = Number(reg.valor_faltante);
  return Number.isFinite(bruto) && bruto > 0;
}

function scoreRegistroSemana(reg, inicio, fin) {
  let s = 0;
  if (reg.hasta >= inicio && reg.hasta <= fin) s += 100;
  if (reg.desde >= inicio && reg.desde <= fin) s += 20;
  if (reg.desde === inicio && reg.hasta === fin) s += 50;
  return s;
}

/** Un registro por tienda: el que mejor cubre la semana de nómina. */
export function registroFaltantePorTienda(registros, sucursal, inicio, fin) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return null;
  const cands = (registros || []).filter(
    (r) => normalizarCodigoTienda(r.sucursal_id) === suc && registroFaltanteAplicaASemana(r, inicio, fin),
  );
  if (!cands.length) return null;
  cands.sort(
    (a, b) =>
      scoreRegistroSemana(b, inicio, fin) - scoreRegistroSemana(a, inicio, fin)
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
  );
  return cands[0];
}

export function empleadoRecibeCuotaFaltante(empleado) {
  if (!empleado || empleado.activo === false) return false;
  if (esEmpleadoIndirectoOMain(empleado)) return false;
  return resolverTipoEmpleado(empleado) === 'tienda';
}

/**
 * Mapa usuario_id → { sucursal_id, faltante, cuota, nota, … }.
 * `faltante` = neto (sin bonificación). Solo empleados de tienda de esa sucursal.
 */
export function mapaCuotasFaltantePorEmpleado({ registros = [], empleados = [], desde, hasta } = {}) {
  const porSuc = new Map();
  for (const e of empleados || []) {
    if (!empleadoRecibeCuotaFaltante(e)) continue;
    const suc = normalizarCodigoTienda(e.sucursal_id);
    if (!suc || suc === 'MAIN' || suc === 'CEDIS') continue;
    if (!porSuc.has(suc)) porSuc.set(suc, []);
    porSuc.get(suc).push(e);
  }

  const out = {};
  for (const [suc, list] of porSuc) {
    const reg = registroFaltantePorTienda(registros, suc, desde, hasta);
    if (!reg) continue;
    const faltante = faltanteNetoParaNomina(reg);
    const cuota = cuotaFaltanteInventarioNomina(faltante);
    if (!(cuota > 0)) continue;
    const bruto = Number(reg.valor_faltante);
    const bonificacion = Math.max(0, Number(reg.valor_bonificacion) || 0);
    const nota = notaCuotaFaltanteInventario(suc, faltante, cuota, {
      bruto: Number.isFinite(bruto) ? bruto : null,
      bonificacion,
    });
    for (const e of list) {
      const id = String(e.id);
      out[id] = {
        sucursal_id: suc,
        faltante,
        faltante_bruto: Number.isFinite(bruto) ? round2(bruto) : faltante,
        bonificacion,
        cuota,
        nota,
        desde: reg.desde,
        hasta: reg.hasta,
      };
    }
  }
  return out;
}

export function combinarDeduccionInventario(corteInventario, cuotaReporte) {
  return round2((Number(corteInventario) || 0) + (Number(cuotaReporte) || 0));
}
