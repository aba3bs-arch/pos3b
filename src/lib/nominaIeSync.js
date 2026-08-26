/**
 * Nómina → IE VIRTUAL / IE ABARROTES sin duplicar:
 * - Reportado en corte (EMPLEADO › NOMINA EMPLEADO) → egreso `nom_corte` (vía unificar).
 * - Solo en cierre de nómina → egreso `payroll` al cerrar el periodo.
 */
import { esGastoNominaEmpleadoCorte, resolverNombresCatalogo, listarCatalogoContVirtual } from './contVirtualCatalogo.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { indiceEmpleados, resolverClaveEmpleado, normalizarNombreEmpleado } from './nominaMatch.js';
import { MODULOS_CORTE_NOMINA, round2 } from './nominaGastos.js';
import { pagoNominaLinea } from './nominaCalculos.js';

export const FUENTE_NOM_CORTE = 'nom_corte';
export const FUENTE_PAYROLL = 'payroll';

/** Cuenta IE según pagador de nómina. */
export function cuentaIeDesdePagadorNomina(pagador) {
  const p = String(pagador || 'abarrotes').toLowerCase();
  if (p === 'virtual' || p === 'garage' || p === 'abarrotes') return p;
  // «ambos»: por defecto Abarrotes (mismo default de nomina_pagador).
  return 'abarrotes';
}

function gastoAprobado(g) {
  const est = g?.estado_aprobacion || 'aprobado';
  return est === 'aprobado';
}

/**
 * Empleados que ya reportaron sueldo en corte en el periodo (usuario_id y/o nombre).
 * @returns {{ porId: Set<string>, porNombre: Set<string>, gastos: object[] }}
 */
export async function listarEmpleadosNominaEnCorte(supabase, { desde, hasta, todasSucursales = true, sucursal = null } = {}) {
  const vacio = { porId: new Set(), porNombre: new Set(), gastos: [] };
  if (!supabase || !desde || !hasta) return vacio;

  const iniTs = `${String(desde).slice(0, 10)}T00:00:00`;
  const finTs = `${String(hasta).slice(0, 10)}T23:59:59`;
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('id, usuario_id, usuario_nombre, monto, categoria, subcategoria, modulo, sucursal_id, created_at, estado_aprobacion, fecha')
    .in('modulo', MODULOS_CORTE_NOMINA)
    .gte('created_at', iniTs)
    .lte('created_at', finTs)
    .limit(3000);
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal);

  const { data, error } = await q;
  if (error) return vacio;

  const porId = new Set();
  const porNombre = new Set();
  const gastos = [];
  for (const g of data || []) {
    if (!gastoAprobado(g)) continue;
    if (!esGastoNominaEmpleadoCorte(g)) continue;
    gastos.push(g);
    if (g.usuario_id != null && String(g.usuario_id)) porId.add(String(g.usuario_id));
    const nom = normalizarNombreEmpleado(g.usuario_nombre);
    if (nom) porNombre.add(nom);
  }
  return { porId, porNombre, gastos };
}

/** True si la línea de nómina ya tiene gasto NOMINA EMPLEADO en corte. */
export function lineaNominaYaEnCorte(linea, empleadosEnCorte, indice = null) {
  if (!linea || !empleadosEnCorte) return false;
  const uid = linea.usuario_id != null ? String(linea.usuario_id) : '';
  if (uid && empleadosEnCorte.porId?.has(uid)) return true;
  if (indice && uid) {
    const clave = resolverClaveEmpleado({ usuario_id: uid, usuario_nombre: linea.nombre }, indice);
    if (clave && empleadosEnCorte.porId?.has(String(clave))) return true;
  }
  const nom = normalizarNombreEmpleado(linea.nombre);
  if (nom && empleadosEnCorte.porNombre?.has(nom)) return true;
  return false;
}

/**
 * Al cerrar nómina: crea egresos IE `payroll` solo para quien NO reportó en corte.
 * Monto = neto pagado (total de la línea).
 */
export async function sincronizarEgresosPayrollNomina(supabase, {
  periodo,
  lineasInsertadas = [],
  empleados = [],
  todasSucursales = true,
} = {}) {
  if (!supabase || !periodo?.id) return { ok: true, count: 0, omitidosCorte: 0 };
  const desde = periodo.periodo_inicio;
  const hasta = periodo.periodo_fin;
  if (!desde || !hasta) return { ok: false, error: 'Periodo sin fechas.' };

  const enCorte = await listarEmpleadosNominaEnCorte(supabase, {
    desde,
    hasta,
    todasSucursales,
    sucursal: periodo.sucursal_id,
  });
  const indice = indiceEmpleados(empleados);

  const catRes = await listarCatalogoContVirtual(supabase);
  const nombres = resolverNombresCatalogo(catRes.data, 'empleado', 'empleado-nomina');

  let count = 0;
  let omitidosCorte = 0;
  const avisos = [];

  for (const l of lineasInsertadas || []) {
    const monto = round2(Number(l.total) || pagoNominaLinea(l) || 0);
    if (!(monto > 0.001)) continue;
    if (!l.id) continue;

    if (lineaNominaYaEnCorte(l, enCorte, indice)) {
      omitidosCorte += 1;
      continue;
    }

    const cuenta = cuentaIeDesdePagadorNomina(l.pagador_nomina);
    const res = await registrarEgresoContVirtual(supabase, {
      sucursal_id: periodo.sucursal_id || 'MAIN',
      fecha: String(hasta).slice(0, 10),
      categoria_id: 'empleado',
      categoria_nombre: nombres.categoria_nombre || 'Empleado',
      subcategoria_id: 'empleado-nomina',
      subcategoria_nombre: 'Payroll',
      monto,
      descripcion: `PAYROLL · ${l.nombre || 'Empleado'} · ${desde}→${hasta}`.trim(),
      fuente: FUENTE_PAYROLL,
      ref_tabla: 'nomina_lineas',
      ref_id: String(l.id),
      usuario_nombre: l.nombre || null,
      cuenta,
    });
    if (!res.ok) {
      avisos.push(res.error || `No se pudo registrar payroll de ${l.nombre}`);
      continue;
    }
    if (res.aviso) avisos.push(res.aviso);
    if (!res.yaExiste && !res.omitido) count += 1;
  }

  return {
    ok: true,
    count,
    omitidosCorte,
    aviso: avisos[0] || null,
  };
}

/** Soft-delete egresos IE con fuente payroll del periodo (por líneas). */
export async function revertirEgresosPayrollNomina(supabase, lineas = []) {
  if (!supabase) return { ok: true, count: 0 };
  const ids = (lineas || []).map((l) => l?.id).filter(Boolean).map(String);
  if (!ids.length) return { ok: true, count: 0 };

  let count = 0;
  // Chunk por si hay muchas líneas
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const { data, error } = await supabase
      .from('cont_virtual_egresos')
      .update({
        fuente: 'eliminado',
        monto: 0,
        descripcion: '[Eliminado · nómina reabierta]',
      })
      .eq('ref_tabla', 'nomina_lineas')
      .in('ref_id', chunk)
      .select('id');
    if (error) {
      // Fallback: borrar duro si no admite update
      const hard = await supabase
        .from('cont_virtual_egresos')
        .delete()
        .eq('ref_tabla', 'nomina_lineas')
        .in('ref_id', chunk)
        .select('id');
      if (hard.error) return { ok: false, error: hard.error.message };
      count += (hard.data || []).length;
      continue;
    }
    count += (data || []).length;
  }
  return { ok: true, count };
}
