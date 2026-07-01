import { round2 } from './nominaGastos.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { abonarPrestamo } from './valesPrestamos.js';
import { cuotaSemanalPrestamo } from './contabilidadConstants.js';

function cuotaDeducible(p) {
  const saldo = Number(p.saldo) || 0;
  if (saldo <= 0) return 0;
  const cuota = Number(p.cuota_semanal) || 0;
  if (cuota > 0) return Math.min(saldo, cuota);
  return cuotaSemanalPrestamo(saldo);
}

/** Préstamos activos por empleado — cuota semanal (mín. $500). */
export async function prestamosDeduccionPorEmpleado(supabase, { sucursal, empleados = [], todasSucursales = true }) {
  if (!supabase) return { map: {}, error: null };
  const indice = indiceEmpleados(empleados);

  let q = supabase.from('prestamos').select('*').eq('estado', 'activo').order('created_at', { ascending: true });
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');

  const { data, error } = await q;

  if (error) {
    if (error.code === '42P01') return { map: {}, error: null };
    return { map: {}, error: error.message };
  }

  const map = {};
  for (const p of data || []) {
    const ded = cuotaDeducible(p);
    if (ded <= 0) continue;
    const clave = resolverClaveEmpleado(p, indice);
    if (!clave) continue;
    if (!map[clave]) map[clave] = { total: 0, detalle: [], porSucursal: {} };
    map[clave].total = round2(map[clave].total + ded);
    map[clave].detalle.push({ ...p, cuota_esta_semana: ded });
    const suc = p.sucursal_id || 'MAIN';
    map[clave].porSucursal[suc] = round2((map[clave].porSucursal[suc] || 0) + ded);
  }
  return { map, error: null };
}

/** Aplica abonos semanales de nómina a préstamos activos del empleado. */
export async function aplicarPrestamosNomina(supabase, { lineas, sucursal, empleados = [], todasSucursales = true }) {
  if (!supabase) return { ok: true };
  const indice = indiceEmpleados(empleados);

  let q = supabase.from('prestamos').select('*').eq('estado', 'activo').order('created_at', { ascending: true });
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
      const abono = Math.min(restante, saldo);
      const res = await abonarPrestamo(supabase, p, abono);
      if (!res.ok) return res;
      p.saldo = res.saldo;
      restante = round2(restante - abono);
    }
  }
  return { ok: true };
}
