import { round2 } from './nominaGastos.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { abonarPrestamo } from './valesPrestamos.js';

/** Préstamos activos por empleado (match por id o nombre). */
export async function prestamosDeduccionPorEmpleado(supabase, { sucursal, empleados = [] }) {
  if (!supabase) return { map: {}, error: null };
  const indice = indiceEmpleados(empleados);
  const { data, error } = await supabase
    .from('prestamos')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('estado', 'activo')
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code === '42P01') return { map: {}, error: null };
    return { map: {}, error: error.message };
  }

  const map = {};
  for (const p of data || []) {
    const saldo = Number(p.saldo) || 0;
    if (saldo <= 0) continue;
    const clave = resolverClaveEmpleado(p, indice);
    if (!clave) continue;
    if (!map[clave]) map[clave] = { total: 0, detalle: [] };
    map[clave].total = round2(map[clave].total + saldo);
    map[clave].detalle.push(p);
  }
  return { map, error: null };
}

/** Aplica abonos de nómina a préstamos activos del empleado. */
export async function aplicarPrestamosNomina(supabase, { lineas, sucursal, empleados = [] }) {
  if (!supabase) return { ok: true };
  const indice = indiceEmpleados(empleados);
  const { data: todos, error: eList } = await supabase
    .from('prestamos')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('estado', 'activo')
    .order('created_at', { ascending: true });
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
