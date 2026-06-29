import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { normalizarNombreEmpleado, indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { round2 } from './nominaGastos.js';

export const DIAS_SEMANA_NOMINA = 7;

export function esIndirectoNomina(empleado) {
  const n = normalizarNombreEmpleado(empleado?.nombre);
  if (!n) return false;
  return BENEFICIARIOS_VALES.some((b) => normalizarNombreEmpleado(b.nombre) === n);
}

/** Incluye empleado según pagador del usuario y filtro activo en nómina. */
export function empleadoIncluidoEnPagadorFiltro(empleado, filtro) {
  if (!filtro) return true;
  const pag = empleado?.nomina_pagador || 'abarrotes';
  if (pag === 'ambos') return filtro === 'virtual' || filtro === 'abarrotes' || filtro === 'ambos';
  if (filtro === 'ambos') return pag === 'ambos' || pag === 'virtual' || pag === 'abarrotes';
  return pag === filtro;
}

export function sueldoProporcionalDias(tarifaSemanal, dias) {
  const t = Number(tarifaSemanal) || 0;
  const d = Math.max(0, Math.min(DIAS_SEMANA_NOMINA, Number(dias) || 0));
  return round2((t * d) / DIAS_SEMANA_NOMINA);
}

export function sueldoIndirectoPorVales(tarifaPorVale, cantidad) {
  return round2((Number(tarifaPorVale) || 0) * Math.max(0, Number(cantidad) || 0));
}

/** Cuenta cierres de cortes contabilidad por cajero en el periodo. */
export async function cortesPorEmpleado(supabase, { sucursal, desde, hasta }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('usuario_id, usuario_nombre, created_at')
    .eq('sucursal_id', sucursal || 'MAIN')
    .gte('created_at', desde)
    .lte('created_at', finTs);

  if (error) {
    if (error.code === '42P01') return { map: {}, error: null };
    return { map: {}, error: error.message };
  }

  const map = {};
  for (const c of data || []) {
    const uid = c.usuario_id != null ? String(c.usuario_id) : '';
    const nom = normalizarNombreEmpleado(c.usuario_nombre);
    const clave = uid || (nom ? `nom:${nom}` : null);
    if (!clave) continue;
    map[clave] = (map[clave] || 0) + 1;
  }
  return { map, error: null };
}

export function resolverCortesEmpleado(empleado, mapCortes) {
  const id = String(empleado?.id || '');
  if (id && mapCortes[id] != null) return mapCortes[id];
  const nom = normalizarNombreEmpleado(empleado?.nombre);
  if (nom && mapCortes[`nom:${nom}`] != null) return mapCortes[`nom:${nom}`];
  return 0;
}

/** Cuenta vales de gasolina aprobados por empleado indirecto en el periodo. */
export async function valesGasolinaPorEmpleado(supabase, { sucursal, desde, hasta, empleados = [] }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  const indice = indiceEmpleados(empleados);

  let q = supabase
    .from('vales')
    .select('usuario_id, nombre_empleado, categoria, estado_aprobacion, fecha, created_at')
    .eq('categoria', 'gasolina')
    .gte('created_at', desde)
    .lte('created_at', finTs);

  if (sucursal) q = q.eq('sucursal_id', sucursal);

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return { map: {}, error: null };
    return { map: {}, error: error.message };
  }

  const map = {};
  for (const v of data || []) {
    if (v.estado_aprobacion && v.estado_aprobacion !== 'aprobado') continue;
    const clave = resolverClaveEmpleado(v, indice);
    if (!clave) continue;
    map[clave] = (map[clave] || 0) + 1;
  }
  return { map, error: null };
}

/** Conserva ajustes manuales al recalcular gastos / datos automáticos. */
export function fusionarLineasNomina(anteriores, nuevas) {
  const porId = {};
  for (const l of anteriores || []) {
    if (l.usuario_id) porId[String(l.usuario_id)] = l;
  }

  return (nuevas || []).map((nueva) => {
    const ant = porId[String(nueva.usuario_id)];
    if (!ant) return nueva;

    const merged = { ...nueva };

    if (ant.pagador_manual) merged.pagador_nomina = ant.pagador_nomina;
    if (ant.dias_manual) {
      merged.dias_trabajados = ant.dias_trabajados;
      merged.cortes_periodo = ant.cortes_periodo ?? nueva.cortes_periodo;
      merged.vales_gasolina = ant.vales_gasolina ?? nueva.vales_gasolina;
    }
    if (ant.sueldo_manual) {
      merged.sueldo_base = ant.sueldo_base;
      merged.sueldo_tarifa = ant.sueldo_tarifa ?? nueva.sueldo_tarifa;
    } else if (!ant.dias_manual && ant.sueldo_base > 0 && nueva.sueldo_base === 0) {
      merged.sueldo_base = ant.sueldo_base;
    }
    if (ant.gastos_manual) merged.deduccion_gastos = ant.deduccion_gastos;
    if (ant.inventario_manual) merged.deduccion_inventario = ant.deduccion_inventario;
    if (ant.prestamos_manual) merged.deduccion_prestamos = ant.deduccion_prestamos;

    merged.bonificacion = ant.bonificacion ?? nueva.bonificacion;
    merged.deducciones = ant.deducciones ?? nueva.deducciones;
    merged.notas = [ant.notas, nueva.notas].filter(Boolean).join(' · ') || nueva.notas;

    merged.pagador_manual = ant.pagador_manual;
    merged.dias_manual = ant.dias_manual;
    merged.sueldo_manual = ant.sueldo_manual;
    merged.gastos_manual = ant.gastos_manual;
    merged.inventario_manual = ant.inventario_manual;
    merged.prestamos_manual = ant.prestamos_manual;

    return merged;
  });
}
