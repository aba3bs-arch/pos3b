import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { normalizarNombreEmpleado, indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { round2 } from './nominaGastos.js';

export const DIAS_SEMANA_NOMINA = 7;

function totalLineaNominaImport(l) {
  const base = Number(l.sueldo_base) || 0;
  const bon = Number(l.bonificacion) || 0;
  const ded = (Number(l.deducciones) || 0) + (Number(l.deduccion_faltas) || 0);
  return Math.max(
    0,
    round2(
      base +
        bon -
        (Number(l.deduccion_gastos) || 0) -
        (Number(l.deduccion_inventario) || 0) -
        (Number(l.deduccion_prestamos) || 0) -
        ded,
    ),
  );
}

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

/** Sueldo = salario por día × días trabajados. */
export function sueldoPorSalarioDia(salarioDia, dias) {
  const sd = Number(salarioDia) || 0;
  const d = Math.max(0, Number(dias) || 0);
  return round2(sd * d);
}

export function sueldoIndirectoPorVales(salarioDia, cantidad) {
  return sueldoPorSalarioDia(salarioDia, cantidad);
}

/** Otras deudas visibles = manuales + faltas gasolina. */
export function otrasDeudasLinea(linea) {
  return round2((Number(linea.deducciones) || 0) + (Number(linea.deduccion_faltas) || 0));
}

/** Cuenta cierres de cortes contabilidad por cajero en el periodo. */
export async function cortesPorEmpleado(supabase, { sucursal, desde, hasta, todasSucursales = true }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select('usuario_id, usuario_nombre, sucursal_id, created_at')
    .gte('created_at', desde)
    .lte('created_at', finTs);
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');
  const { data, error } = await q;

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

/** Cuenta vales de gasolina aprobados por empleado: cobrados = día laboral; no cobrados = falta. */
export async function valesGasolinaPorEmpleado(supabase, { sucursal, desde, hasta, empleados = [], todasSucursales = true }) {
  if (!supabase) return { map: {}, mapNoCobrados: {}, error: null };
  const indice = indiceEmpleados(empleados);

  let q = supabase
    .from('vales')
    .select('id, usuario_id, nombre_empleado, categoria, estado_aprobacion, cobrado, fecha, sucursal_id, created_at')
    .eq('categoria', 'gasolina')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal);

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return { map: {}, mapNoCobrados: {}, error: null };
    return { map: {}, mapNoCobrados: {}, error: error.message };
  }

  const map = {};
  const mapNoCobrados = {};
  for (const v of data || []) {
    if (v.estado_aprobacion && v.estado_aprobacion !== 'aprobado') continue;
    const clave = resolverClaveEmpleado(v, indice);
    if (!clave) continue;
    if (v.cobrado) map[clave] = (map[clave] || 0) + 1;
    else mapNoCobrados[clave] = (mapNoCobrados[clave] || 0) + 1;
  }
  return { map, mapNoCobrados, error: null };
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
      merged.faltas_gasolina = ant.faltas_gasolina ?? nueva.faltas_gasolina;
      merged.deduccion_faltas = ant.deduccion_faltas ?? nueva.deduccion_faltas;
    }
    if (ant.sueldo_manual) {
      merged.sueldo_base = ant.sueldo_base;
      merged.salario_dia = ant.salario_dia ?? ant.sueldo_tarifa ?? nueva.salario_dia;
      merged.sueldo_tarifa = merged.salario_dia;
    } else if (!ant.dias_manual && ant.sueldo_base > 0 && nueva.sueldo_base === 0) {
      merged.sueldo_base = ant.sueldo_base;
    }
    if (ant.salario_dia != null && ant.sueldo_manual) merged.salario_dia = ant.salario_dia;
    if (ant.gastos_manual) merged.deduccion_gastos = ant.deduccion_gastos;
    if (ant.inventario_manual) merged.deduccion_inventario = ant.deduccion_inventario;
    if (ant.prestamos_manual) merged.deduccion_prestamos = ant.deduccion_prestamos;

    merged.bonificacion = ant.bonificacion ?? nueva.bonificacion;
    merged.deducciones = ant.deducciones ?? nueva.deducciones;
    merged.deduccion_faltas = ant.deduccion_faltas ?? nueva.deduccion_faltas;
    merged.notas = [ant.notas, nueva.notas].filter(Boolean).join(' · ') || nueva.notas;

    merged.total = totalLineaNominaImport(merged);

    merged.pagador_manual = ant.pagador_manual;
    merged.dias_manual = ant.dias_manual;
    merged.sueldo_manual = ant.sueldo_manual;
    merged.gastos_manual = ant.gastos_manual;
    merged.inventario_manual = ant.inventario_manual;
    merged.prestamos_manual = ant.prestamos_manual;

    return merged;
  });
}
