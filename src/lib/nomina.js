import { marcarGastosDescontadosNomina, gastoCuentaEnNomina } from './nominaGastos.js';
import { aplicarPrestamosNomina } from './nominaPrestamos.js';
import { actualizarSaldosArrastreAlCerrar } from './nominaSaldoArrastre.js';
import { gastosDeduccionPorEmpleado } from './nominaGastos.js';
import { prestamosDeduccionPorEmpleado } from './nominaPrestamos.js';
import {
  empleadoIncluidoEnPagadorFiltro,
  esIndirectoNomina,
  sueldoPorSalarioDia,
  sueldoIndirectoPorVales,
  resolverCortesEmpleado,
  cortesPorEmpleado,
  valesGasolinaPorEmpleado,
  otrosDeudasLinea,
  DIAS_SEMANA_NOMINA,
  pagoNominaLinea,
  saldoPendienteDesdePago,
  sueldoBrutoLinea,
  recalcularLineaNomina,
  normalizarDiasNomina,
} from './nominaCalculos.js';
import {
  asistenciasPorEmpleado,
  calcularDiasDesdeAsistencias,
  resolverAsistenciasEmpleado,
} from './nominaAsistencias.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { leerTurnos } from './turnos.js';

const LS_SUELDOS = 'pos3b_nomina_salario_dia';
const LS_SUELDOS_LEGACY = 'pos3b_nomina_sueldos_default';

export function totalLineaNomina(linea) {
  return pagoNominaLinea(linea);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function leerSueldosDefault() {
  try {
    const raw = localStorage.getItem(LS_SUELDOS);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') return o;
    }
    const leg = localStorage.getItem(LS_SUELDOS_LEGACY);
    if (!leg) return {};
    const old = JSON.parse(leg);
    if (!old || typeof old !== 'object') return {};
    const migrado = {};
    for (const [id, v] of Object.entries(old)) {
      migrado[id] = round2((Number(v) || 0) / DIAS_SEMANA_NOMINA);
    }
    return migrado;
  } catch {
    return {};
  }
}

export function guardarSueldoDefault(usuarioId, salarioDia) {
  const map = leerSueldosDefault();
  map[String(usuarioId)] = round2(salarioDia);
  localStorage.setItem(LS_SUELDOS, JSON.stringify(map));
}

function splitGastosNomina(detalle = []) {
  let inventario = 0;
  let consumos = 0;
  for (const g of detalle) {
    if (!gastoCuentaEnNomina(g)) continue;
    const m = Number(g.monto) || 0;
    const cat = String(g.categoria || '').toUpperCase();
    const sub = String(g.subcategoria || '').toUpperCase();
    if (cat.includes('INVENT') || sub.includes('INVENT')) inventario += m;
    else consumos += m;
  }
  return {
    deduccion_inventario: round2(inventario),
    deduccion_consumos: round2(consumos),
  };
}

function notasDeducciones(gastosEmp, prestEmp, cortes, indirecto, valesGas, faltasGas, asistInfo = null) {
  const notas = [];
  if (indirecto) {
    if (valesGas > 0) notas.push(`Vales cobrados: ${valesGas}`);
    if (faltasGas > 0) notas.push(`Faltas (vale no cobrado): ${faltasGas}`);
  } else {
    if (asistInfo && asistInfo.asistencias > 0) {
      notas.push(
        `Asistencias checador: ${asistInfo.asistencias} · Retardos: ${asistInfo.retardos} · Días pagados: ${asistInfo.diasTrabajados}`,
      );
    }
    if (cortes > 0) notas.push(`Cortes (ref.): ${cortes}`);
  }

  const porSuc = gastosEmp?.porSucursal;
  if (porSuc && Object.keys(porSuc).length) {
    const partes = Object.entries(porSuc)
      .filter(([, m]) => Number(m) > 0)
      .map(([suc, m]) => `${etiquetaTienda(suc)}: $${Number(m).toFixed(2)}`);
    if (partes.length) notas.push(`Consumos (${partes.join(' · ')})`);
  } else if (gastosEmp?.detalle?.length) {
    notas.push(`Consumos: ${gastosEmp.detalle.length} mov.`);
  }

  const inv = splitGastosNomina(gastosEmp?.detalle || []).deduccion_inventario;
  if (inv > 0) {
    const porSucInv = {};
    for (const g of gastosEmp?.detalle || []) {
      if (!gastoCuentaEnNomina(g)) continue;
      const cat = String(g.categoria || '').toUpperCase();
      const sub = String(g.subcategoria || '').toUpperCase();
      if (!cat.includes('INVENT') && !sub.includes('INVENT')) continue;
      const suc = g.sucursal_id || 'MAIN';
      porSucInv[suc] = round2((porSucInv[suc] || 0) + (Number(g.monto) || 0));
    }
    const partes = Object.entries(porSucInv).map(([s, m]) => `${etiquetaTienda(s)}: $${m.toFixed(2)}`);
    notas.push(`Inventario (${partes.join(' · ')})`);
  }

  if (prestEmp?.detalle?.length) {
    const porSuc = prestEmp.porSucursal;
    if (porSuc && Object.keys(porSuc).length) {
      const partes = Object.entries(porSuc)
        .filter(([, m]) => Number(m) > 0)
        .map(([s, m]) => `${etiquetaTienda(s)}: $${Number(m).toFixed(2)}`);
      notas.push(`Préstamos (${partes.join(' · ')})`);
    } else {
      notas.push(`Préstamos: ${prestEmp.detalle.length} activo(s)`);
    }
  }
  return notas.join(' · ');
}

function salarioDiaEmpleado(u, sueldosMap) {
  const map = { ...leerSueldosDefault(), ...sueldosMap };
  return round2(map[u.id] ?? map[String(u.id)] ?? 0);
}

export function lineasDesdeEmpleados(empleados, opts = {}) {
  const {
    sueldosMap = {},
    gastosMap = {},
    prestamosMap = {},
    cortesMap = {},
    valesGasolinaMap = {},
    valesGasolinaNoCobradosMap = {},
    asistenciasMap = {},
    pagadorFiltro = '',
    arrastreMap = {},
  } = opts;

  const turnos = leerTurnos();
  let lista = empleados || [];
  if (pagadorFiltro) {
    lista = lista.filter((u) => empleadoIncluidoEnPagadorFiltro(u, pagadorFiltro));
  }

  return lista.map((u) => {
    const indirecto = esIndirectoNomina(u);
    const salarioDia = salarioDiaEmpleado(u, sueldosMap);
    const gastosEmp = gastosMap[String(u.id)] || { total: 0, detalle: [], porSucursal: {} };
    const prestEmp = prestamosMap[String(u.id)] || { total: 0, detalle: [], porSucursal: {} };
    const { deduccion_inventario, deduccion_consumos } = splitGastosNomina(gastosEmp.detalle);
    const dedGastos = Number(deduccion_consumos) || 0;
    const dedPrestamos = Number(prestEmp.total) || 0;

    const cortes = resolverCortesEmpleado(u, cortesMap);
    const valesGas = Number(valesGasolinaMap[String(u.id)] || 0);
    const faltasGas = Number(valesGasolinaNoCobradosMap[String(u.id)] || 0);
    const entradas = resolverAsistenciasEmpleado(u, asistenciasMap);
    const asistInfo = calcularDiasDesdeAsistencias(u, entradas, { turnos });

    let diasTrabajados = cortes;
    let sueldoBase = 0;
    let dedFaltas = 0;

    if (indirecto) {
      diasTrabajados = valesGas;
      sueldoBase = sueldoIndirectoPorVales(salarioDia, valesGas);
      dedFaltas = sueldoIndirectoPorVales(salarioDia, faltasGas);
    } else if (asistInfo.asistencias > 0) {
      // Automático: días desde reloj checador (retardos cuentan hasta el límite).
      diasTrabajados = asistInfo.diasTrabajados;
      sueldoBase = sueldoPorSalarioDia(salarioDia, diasTrabajados);
    } else {
      // Sin marcajes: respaldo por cierres de corte (Virtual/Abarrotes/Garage).
      diasTrabajados = cortes;
      sueldoBase = sueldoPorSalarioDia(salarioDia, cortes);
    }

    const linea = {
      usuario_id: u.id,
      nombre: u.nombre || '—',
      rol: u.rol || '—',
      sucursal_id: u.sucursal_id || null,
      pagador_nomina: u.nomina_pagador || 'abarrotes',
      es_indirecto: indirecto,
      salario_dia: salarioDia,
      sueldo_tarifa: salarioDia,
      dias_trabajados: diasTrabajados,
      cortes_periodo: cortes,
      asistencias_periodo: asistInfo.asistencias,
      retardos_periodo: asistInfo.retardos,
      vales_gasolina: valesGas,
      faltas_gasolina: faltasGas,
      sueldo_base: sueldoBase,
      bonificacion: 0,
      deduccion_gastos: dedGastos,
      deduccion_inventario,
      deduccion_consumos: dedGastos,
      deduccion_prestamos: dedPrestamos,
      deduccion_faltas: dedFaltas,
      deduccion_arrastre: round2(arrastreMap[String(u.id)] || 0),
      deducciones: 0,
      notas_otros: '',
      notas: notasDeducciones(gastosEmp, prestEmp, cortes, indirecto, valesGas, faltasGas, asistInfo),
      pagador_manual: false,
      dias_manual: false,
      sueldo_manual: false,
      gastos_manual: false,
      inventario_manual: false,
      prestamos_manual: false,
      otros_manual: false,
    };
    return recalcularLineaNomina(linea);
  });
}

export function recalcularSueldoLinea(linea) {
  return recalcularLineaNomina(linea);
}

/** Carga gastos (3 cortes), préstamos, cierres, vales e asistencias del checador. */
export async function cargarDatosNomina(supabase, { desde, hasta, empleados, todasSucursales = true, sucursal }) {
  const opts = { desde, hasta, empleados, todasSucursales, sucursal };
  const [gastosRes, prestRes, cortesRes, valesRes, asistenciasRes] = await Promise.all([
    gastosDeduccionPorEmpleado(supabase, opts),
    prestamosDeduccionPorEmpleado(supabase, opts),
    cortesPorEmpleado(supabase, opts),
    valesGasolinaPorEmpleado(supabase, opts),
    asistenciasPorEmpleado(supabase, opts),
  ]);
  return { gastosRes, prestRes, cortesRes, valesRes, asistenciasRes };
}

export function faltaTablaNomina(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('nomina_periodos') ||
    msg.includes('nomina_lineas') ||
    (msg.includes('schema cache') && msg.includes('nomina'))
  );
}

export const AVISO_FALTA_NOMINA =
  'Faltan tablas de nómina. En Supabase → SQL Editor ejecuta: supabase/fix_contabilidad.sql';

export async function listarPeriodosNomina(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null, soloLocal: true };
  const { sucursal, limit = 30, todasSucursales = true } = opts;
  let q = supabase.from('nomina_periodos').select('*').order('periodo_fin', { ascending: false }).limit(limit);
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error && faltaTablaNomina(error)) {
    return { data: [], error: null, aviso: AVISO_FALTA_NOMINA, soloLocal: true };
  }
  return { data: data || [], error: error?.message || null, soloLocal: false };
}

export async function guardarPeriodoNomina(supabase, payload) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { periodo, lineas, empleados = [], todasSucursales = true } = payload;
  const total = (lineas || []).reduce((a, l) => a + totalLineaNomina(l), 0);

  const { data: per, error: e1 } = await supabase
    .from('nomina_periodos')
    .insert([
      {
        sucursal_id: periodo.sucursal_id,
        periodo_inicio: periodo.periodo_inicio,
        periodo_fin: periodo.periodo_fin,
        estado: periodo.estado || 'cerrado',
        notas: periodo.notas || null,
        pagador_filtro: periodo.pagador_filtro || null,
        total,
        created_by: periodo.created_by || null,
      },
    ])
    .select('id')
    .single();

  if (e1) {
    if (faltaTablaNomina(e1)) return { ok: false, error: AVISO_FALTA_NOMINA };
    return { ok: false, error: e1.message };
  }

  const filas = (lineas || []).map((l) => {
    const calc = recalcularLineaNomina(l);
    return {
    periodo_id: per.id,
    usuario_id: calc.usuario_id || null,
    nombre: calc.nombre,
    rol: calc.rol || null,
    pagador_nomina: calc.pagador_nomina || null,
    sueldo_tarifa: Number(calc.salario_dia ?? calc.sueldo_tarifa) || 0,
    dias_trabajados: normalizarDiasNomina(calc.dias_trabajados),
    cortes_periodo: Number(calc.cortes_periodo) || 0,
    vales_gasolina: Number(calc.vales_gasolina) || 0,
    sueldo_base: Number(calc.sueldo_base) || 0,
    bonificacion: Number(calc.bonificacion) || 0,
    deduccion_gastos: Number(calc.deduccion_gastos) || 0,
    deduccion_inventario: Number(calc.deduccion_inventario) || 0,
    deduccion_prestamos: Number(calc.deduccion_prestamos) || 0,
    deduccion_arrastre: Number(calc.deduccion_arrastre) || 0,
    deducciones: round2(otrosDeudasLinea(calc)),
    total: pagoNominaLinea(calc),
    saldo_pendiente: saldoPendienteDesdePago(calc),
    notas: [calc.notas, calc.notas_otros ? `Otros: ${calc.notas_otros}` : null].filter(Boolean).join(' · ') || calc.notas || null,
  };
  });

  for (const l of lineas || []) {
    if (l.usuario_id) guardarSueldoDefault(l.usuario_id, l.salario_dia ?? l.sueldo_tarifa);
  }

  const { error: e2 } = await supabase.from('nomina_lineas').insert(filas);
  if (e2) {
    const msg = String(e2.message || '');
    if (msg.includes('saldo_pendiente') || msg.includes('deduccion_arrastre')) {
      const legacy = filas.map(({ deduccion_arrastre, saldo_pendiente, ...rest }) => rest);
      const { error: e2b } = await supabase.from('nomina_lineas').insert(legacy);
      if (e2b) return { ok: false, error: e2b.message };
    } else {
      return { ok: false, error: e2.message };
    }
  }

  const listaEmp =
    empleados.length > 0
      ? empleados
      : (lineas || []).map((l) => ({ id: l.usuario_id, nombre: l.nombre })).filter((e) => e.id);

  await marcarGastosDescontadosNomina(supabase, {
    sucursal: periodo.sucursal_id,
    desde: periodo.periodo_inicio,
    hasta: periodo.periodo_fin,
    periodoId: per.id,
    empleados: listaEmp,
    todasSucursales,
  });

  const prestRes = await aplicarPrestamosNomina(supabase, {
    lineas,
    sucursal: periodo.sucursal_id,
    empleados: listaEmp,
    todasSucursales,
  });
  if (!prestRes.ok) return { ok: false, error: prestRes.error };

  actualizarSaldosArrastreAlCerrar(lineas);

  return { ok: true, id: per.id, total, lineas };
}

export async function cargarLineasPeriodo(supabase, periodoId) {
  if (!supabase || !periodoId) return { data: [], error: null };
  const { data, error } = await supabase.from('nomina_lineas').select('*').eq('periodo_id', periodoId).order('nombre');
  const lineas = (data || []).map((l) =>
    recalcularLineaNomina({
      ...l,
      salario_dia: l.sueldo_tarifa,
      deducciones: Number(l.deducciones) || 0,
      deduccion_arrastre: Number(l.deduccion_arrastre) || 0,
      saldo_pendiente: Number(l.saldo_pendiente) || 0,
      deduccion_faltas: 0,
    }),
  );
  return { data: lineas, error: error?.message || null };
}
