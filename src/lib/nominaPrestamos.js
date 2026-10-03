import { round2 } from './nominaGastos.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { abonarPrestamo } from './valesPrestamos.js';
import { CUOTA_SEMANAL_MINIMA, cuotaSemanalPrestamo } from './contabilidadConstants.js';

/**
 * Estados que generan cuota en nómina:
 * — activo: aprobado (y socio si aplica)
 * — pendiente_socio: ya aprobó admin (>$1,000); la cuota semanal aplica
 *   aunque falte el PIN de socio para cargar a corte
 */
export const ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA = ['activo', 'pendiente_socio'];

export function prestamoDeducibleEnNomina(p) {
  if (!p) return false;
  if (!ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA.includes(String(p.estado || ''))) return false;
  return (Number(p.saldo) || 0) > 0;
}

/**
 * Cuota a descontar esta semana en nómina:
 * — $500 semanales mientras el saldo sea ≥ 500
 * — el remanente en la última semana hasta liquidar
 */
export function cuotaDeducibleNomina(p) {
  const saldo = Number(p?.saldo) || 0;
  if (saldo <= 0) return 0;
  // Sin estado (tests / saldo suelto): calcular por saldo.
  // Con estado: solo activo o pendiente_socio (admin ya aprobó).
  if (p?.estado != null && p.estado !== '' && !ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA.includes(String(p.estado))) {
    return 0;
  }
  // Ignora cuotas custom > 500: el descuento automático es fijo $500/sem.
  return cuotaSemanalPrestamo(saldo, CUOTA_SEMANAL_MINIMA);
}

/** @deprecated usar cuotaDeducibleNomina */
function cuotaDeducible(p) {
  return cuotaDeducibleNomina(p);
}

/** Préstamos con saldo por empleado — cuota semanal fija $500 (o remanente). */
export async function prestamosDeduccionPorEmpleado(supabase, { sucursal, empleados = [], todasSucursales = true }) {
  if (!supabase) return { map: {}, error: null, avisos: [] };
  const indice = indiceEmpleados(empleados);

  let q = supabase
    .from('prestamos')
    .select('*')
    .in('estado', ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA)
    .gt('saldo', 0)
    .order('created_at', { ascending: true });
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');

  const { data, error } = await q;

  if (error) {
    if (error.code === '42P01') return { map: {}, error: null, avisos: [] };
    return { map: {}, error: error.message, avisos: [] };
  }

  const map = {};
  const avisos = [];
  const sinMatch = [];

  for (const p of data || []) {
    if (!prestamoDeducibleEnNomina(p)) continue;
    const ded = cuotaDeducibleNomina(p);
    if (ded <= 0) continue;
    const clave = resolverClaveEmpleado(p, indice);
    if (!clave) {
      sinMatch.push(p.nombre_empleado || p.id);
      continue;
    }
    if (!map[clave]) map[clave] = { total: 0, detalle: [], porSucursal: {} };
    map[clave].total = round2(map[clave].total + ded);
    map[clave].detalle.push({
      ...p,
      cuota_esta_semana: ded,
      cuota_semanal: CUOTA_SEMANAL_MINIMA,
    });
    const suc = p.sucursal_id || 'MAIN';
    map[clave].porSucursal[suc] = round2((map[clave].porSucursal[suc] || 0) + ded);
    if (p.estado === 'pendiente_socio') {
      avisos.push(
        `${p.nombre_empleado || 'Empleado'}: cuota $${ded.toFixed(2)} (préstamo aún pendiente de socio; se descuenta en nómina)`,
      );
    }
  }

  if (sinMatch.length) {
    avisos.push(
      `Préstamos sin empleado en nómina (revisar nombre/usuario): ${[...new Set(sinMatch)].join(', ')}`,
    );
  }

  return { map, error: null, avisos };
}

/** Aplica abonos semanales de nómina a préstamos deducibles del empleado. */
export async function aplicarPrestamosNomina(supabase, { lineas, sucursal, empleados = [], todasSucursales = true }) {
  if (!supabase) return { ok: true };
  const indice = indiceEmpleados(empleados);

  let q = supabase
    .from('prestamos')
    .select('*')
    .in('estado', ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA)
    .gt('saldo', 0)
    .order('created_at', { ascending: true });
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');

  const { data: todos, error: eList } = await q;
  if (eList) return { ok: false, error: eList.message };

  for (const l of lineas || []) {
    const ded = Number(l.deduccion_prestamos) || 0;
    if (ded <= 0) continue;
    const clave = l.usuario_id ? String(l.usuario_id) : null;
    if (!clave) continue;
    const prestamos = (todos || []).filter((p) => resolverClaveEmpleado(p, indice) === clave);
    let restante = ded;
    for (const p of prestamos) {
      if (restante <= 0) break;
      const saldo = Number(p.saldo) || 0;
      if (saldo <= 0) continue;
      // Por préstamo: máx. $500 esta semana (o el saldo si es menor).
      const topeSemana = cuotaDeducibleNomina(p);
      const abono = Math.min(restante, saldo, topeSemana);
      if (!(abono > 0)) continue;
      const res = await abonarPrestamo(supabase, p, abono);
      if (!res.ok) return res;
      p.saldo = res.saldo;
      p.estado = res.saldo <= 0 ? 'liquidado' : 'activo';
      restante = round2(restante - abono);
    }
  }
  return { ok: true };
}

export { cuotaDeducible };
