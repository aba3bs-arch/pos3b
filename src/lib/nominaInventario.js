/**
 * Faltante de inventario (Reportes → campo 2) → nómina.
 * Se divide entre 3 y se descuenta a cada empleado de tienda de esa sucursal.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esEmpleadoIndirectoOMain, resolverTipoEmpleado } from './empleadosVisibles.js';
import { round2 } from './nominaGastos.js';

/** Cuántas partes del faltante: 2 empleados de tienda + 1 CT (cubre turnos). */
export const DIVISOR_FALTANTE_INVENTARIO_NOMINA = 3;

export function cuotaFaltanteInventarioNomina(faltante) {
  const n = Number(faltante);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(n / DIVISOR_FALTANTE_INVENTARIO_NOMINA);
}

export function notaCuotaFaltanteInventario(sucursal, faltante, cuota) {
  const suc = etiquetaTienda(sucursal);
  return `Inventario ${suc}: $${Number(faltante).toFixed(2)} ÷ ${DIVISOR_FALTANTE_INVENTARIO_NOMINA} = $${Number(cuota).toFixed(2)}`;
}

/** ¿El resultado de inventario aplica a esta semana de nómina? */
export function registroFaltanteAplicaASemana(reg, inicio, fin) {
  if (!reg?.desde || !reg?.hasta || !inicio || !fin) return false;
  if (reg.hasta < inicio || reg.desde > fin) return false;
  const fal = Number(reg.valor_faltante);
  if (!Number.isFinite(fal) || fal <= 0) return false;
  return true;
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
 * Mapa usuario_id → { sucursal_id, faltante, cuota, nota }.
 * Solo empleados de tienda de la sucursal del conteo.
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
    const faltante = round2(Number(reg.valor_faltante) || 0);
    const cuota = cuotaFaltanteInventarioNomina(faltante);
    if (!(cuota > 0)) continue;
    const nota = notaCuotaFaltanteInventario(suc, faltante, cuota);
    for (const e of list) {
      const id = String(e.id);
      out[id] = { sucursal_id: suc, faltante, cuota, nota, desde: reg.desde, hasta: reg.hasta };
    }
  }
  return out;
}

export function combinarDeduccionInventario(corteInventario, cuotaReporte) {
  return round2((Number(corteInventario) || 0) + (Number(cuotaReporte) || 0));
}
