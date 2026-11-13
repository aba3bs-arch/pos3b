/**
 * Corte de caja general de Abarrotes automático por día calendario (medianoche Nogales),
 * con recibo folio CGA-00001, CGA-00002… (no afecta los cierres del cajero).
 *
 * - Alimenta Libro diario e IE Abarrotes (tipo_cierre = cierre_diario).
 * - Los cierres que hace el cajero pasan a ser solo operativos
 *   (tipo_cierre = cierre_operativo) y ya no entran a contabilidad.
 */

import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  addDaysYmd,
  finDia,
  hoyYmdNogales,
  inicioDia,
  ymdNegocioDesdeIso,
  ymdNogalesFromDate,
} from './corteCaja.js';
import { calcularAbarrotes, round2 } from './corteContabilidad/calc.js';
import { registrarCierreCorte } from './corteContabilidad/store.js';
import { cargarDiaCaja, resumirMovimientosCaja } from './movimientosCaja.js';
import { listarEgresosContVirtual } from './contVirtualEgresos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';

export const TIPO_CIERRE_DIARIO = 'cierre_diario';
export const TIPO_CIERRE_OPERATIVO = 'cierre_operativo';

/**
 * A partir de esta fecha (inclusive) la contabilidad solo usa cortes diarios.
 * Los cierres de cajero anteriores siguen contando como histórico.
 */
export const CUTOVER_CIERRE_DIARIO = '2026-11-13';

export function fechaNegocioCierre(row) {
  const d = row?.detalle && typeof row.detalle === 'object' ? row.detalle : {};
  return ymdNegocioDesdeIso(d.fecha_negocio)
    || ymdNegocioDesdeIso(row?.created_at)
    || '';
}

export function tipoCierreAbarrotes(row) {
  return String(row?.detalle?.tipo_cierre || '').toLowerCase();
}

/** ¿Este cierre alimenta Libro diario / IE / estadísticas? */
export function esCierreContableAbarrotes(row) {
  const t = tipoCierreAbarrotes(row);
  if (t === TIPO_CIERRE_DIARIO) return true;
  if (t === TIPO_CIERRE_OPERATIVO) return false;
  if (t.startsWith('recoleccion') || t === 'actualizacion') return false;
  const fecha = fechaNegocioCierre(row);
  // Histórico de cajero solo antes del cutover.
  if ((!t || t === 'cierre') && fecha && fecha < CUTOVER_CIERRE_DIARIO) return true;
  if ((!t || t === 'cierre') && !fecha) {
    const created = ymdNegocioDesdeIso(row?.created_at);
    return Boolean(created && created < CUTOVER_CIERRE_DIARIO);
  }
  return false;
}

/** Prefijo del recibo de corte de caja general (un corte cada 24 h por tienda). */
export const PREFIJO_CORTE_GENERAL = 'CGA';

export function folioCorteGeneral(n) {
  return `${PREFIJO_CORTE_GENERAL}-${String(Math.max(1, Math.round(Number(n) || 1))).padStart(5, '0')}`;
}

/** «CGA-00012» → 12 (0 si no es un folio de corte general). */
export function numeroFolioCorteGeneral(folio) {
  const m = String(folio || '').trim().match(/^CGA-(\d+)$/i);
  return m ? Number(m[1]) : 0;
}

/** Folio provisional/legado por fecha (solo para pruebas o cortes anteriores al folio CGA). */
export function folioCorteDiario(fechaYmd) {
  const f = String(fechaYmd || '').slice(0, 10).replace(/-/g, '');
  return `ABD-${f || '00000000'}`;
}

/** Siguiente folio CGA-00001, CGA-00002… de la tienda (consecutivo, sin tocar los folios AB- del cajero). */
export async function siguienteFolioCorteGeneral(supabase, { sucursal } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!supabase || !suc) return folioCorteGeneral(1);
  const { equivalentesCodigoTienda } = await import('../constants/sucursales.js');
  const vars = equivalentesCodigoTienda(suc);
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('folio')
    .eq('modulo', 'abarrotes')
    .in('sucursal_id', vars.length ? vars : [suc])
    .ilike('folio', `${PREFIJO_CORTE_GENERAL}-%`)
    .limit(2000);
  if (error) return folioCorteGeneral(1);
  const max = Math.max(0, ...(data || []).map((r) => numeroFolioCorteGeneral(r.folio)));
  return folioCorteGeneral(max + 1);
}

/** Egresos del día para el recibo: gastos del corte, consumos de empleados y egresos de IE (sin duplicar). */
export function resumenEgresosDia({ gastos = [], egresosIe = [] } = {}) {
  const gastosTotal = round2(gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0));
  const consumos = gastos.filter((g) => gastoDescuentaNomina('abarrotes', g.categoria, g.subcategoria));
  const consumosTotal = round2(consumos.reduce((a, g) => a + (Number(g.monto) || 0), 0));
  const ie = egresosIe.filter((e) => e.ref_tabla !== 'cortes_contabilidad_gastos' && Number(e.monto) > 0);
  const ieTotal = round2(ie.reduce((a, e) => a + (Number(e.monto) || 0), 0));
  return {
    gastos_total: gastosTotal,
    consumos_total: consumosTotal,
    egresos_ie: ie.map((e) => ({
      id: e.id,
      categoria: e.categoria_nombre || e.categoria_id || 'Sin categoría',
      subcategoria: e.subcategoria_nombre || '',
      descripcion: e.descripcion || '',
      usuario_nombre: e.usuario_nombre || '',
      monto: round2(e.monto),
    })),
    egresos_ie_total: ieTotal,
    egresos_total_dia: round2(gastosTotal + ieTotal),
  };
}

/**
 * Montos del día desde POS + gastos de abarrotes.
 * venta = total sistema; tarjeta = electrónicos (no efectivo);
 * Los FALTANTE van como gasto EMPLEADO (no hay campo de faltante en el corte).
 */
export function armarEstadoCorteDiario({
  venta = 0,
  tarjeta = 0,
  cajaAnterior = 0,
  fechaNegocio,
  folio = null,
} = {}) {
  return {
    fondo_fijo: 0,
    caja_anterior: round2(cajaAnterior),
    venta: round2(venta),
    tarjeta: round2(tarjeta),
    recoleccion: 0,
    folio: folio || folioCorteDiario(fechaNegocio),
    comentarios: `Corte diario automático · ${fechaNegocio}`,
    fecha_negocio: fechaNegocio,
    venta_pos_por_corte: {},
  };
}

export async function listarGastosAbarrotesDelDia(supabase, { sucursal, fecha } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!supabase || !suc || !fecha) return { data: [], error: null };
  const desdeIso = inicioDia(fecha).toISOString();
  const hastaIso = finDia(fecha).toISOString();
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'abarrotes')
    .eq('sucursal_id', suc)
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) {
    // Variantes de código de tienda
    const { equivalentesCodigoTienda } = await import('../constants/sucursales.js');
    const vars = equivalentesCodigoTienda(suc);
    if (vars.length > 1) {
      const r2 = await supabase
        .from('cortes_contabilidad_gastos')
        .select('*')
        .eq('modulo', 'abarrotes')
        .in('sucursal_id', vars)
        .gte('created_at', desdeIso)
        .lte('created_at', hastaIso)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (r2.error) return { data: [], error: r2.error.message };
      return {
        data: (r2.data || []).filter((g) => {
          const est = g.estado_aprobacion;
          return !est || est === 'aprobado';
        }),
        error: null,
      };
    }
    return { data: [], error: error.message };
  }
  return {
    data: (data || []).filter((g) => {
      const est = g.estado_aprobacion;
      return !est || est === 'aprobado';
    }),
    error: null,
  };
}

export async function buscarCierreDiarioExistente(supabase, { sucursal, fecha } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!supabase || !suc || !fecha) return { data: null, error: null };
  const desdeIso = inicioDia(addDaysYmd(fecha, -1)).toISOString();
  const hastaIso = finDia(addDaysYmd(fecha, 2)).toISOString();
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('modulo', 'abarrotes')
    .eq('sucursal_id', suc)
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return { data: null, error: error.message };
  const hit = (data || []).find((c) => {
    if (c.deleted_at) return false;
    if (tipoCierreAbarrotes(c) !== TIPO_CIERRE_DIARIO) return false;
    return fechaNegocioCierre(c) === fecha;
  });
  return { data: hit || null, error: null };
}

async function cajaAnteriorDesdeDiarioPrevio(supabase, { sucursal, fecha } = {}) {
  const prevFecha = addDaysYmd(fecha, -1);
  const prev = await buscarCierreDiarioExistente(supabase, { sucursal, fecha: prevFecha });
  if (prev.data) return round2(Number(prev.data.caja_actual) || 0);
  return 0;
}

/**
 * Calcula e inserta el corte diario de una tienda/fecha si no existe.
 * No cierra el día en curso (solo fechas < hoy Nogales).
 */
export async function asegurarCorteDiarioAbarrotes(supabase, {
  sucursal,
  fecha,
  now = new Date(),
  forzar = false,
} = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  const ymd = String(fecha || '').slice(0, 10);
  const hoy = hoyYmdNogales(now);
  if (!supabase || !suc || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ok: false, skipped: true, error: 'Parámetros inválidos.' };
  }
  if (ymd >= hoy) {
    return { ok: true, skipped: true, reason: 'dia_en_curso' };
  }
  if (ymd < CUTOVER_CIERRE_DIARIO) {
    return { ok: true, skipped: true, reason: 'antes_cutover' };
  }

  const existente = await buscarCierreDiarioExistente(supabase, { sucursal: suc, fecha: ymd });
  if (existente.data && !forzar) {
    return { ok: true, skipped: true, reason: 'ya_existe', data: existente.data };
  }

  const dia = await cargarDiaCaja(supabase, { sucursal: suc, fecha: ymd, turno: null });
  const resumen = resumirMovimientosCaja(dia?.ventas || [], dia?.cancelaciones || []);
  const venta = round2(resumen.total || 0);
  // Pagos que no entran a efectivo de caja (tarjeta + transfer + QR + otros).
  const tarjeta = round2(Number(resumen.electronico) || 0);

  const gas = await listarGastosAbarrotesDelDia(supabase, { sucursal: suc, fecha: ymd });
  const gastos = gas.data || [];
  const cajaAnterior = await cajaAnteriorDesdeDiarioPrevio(supabase, { sucursal: suc, fecha: ymd });

  // Todo lo que egresó ese día (consumos y cargos a empleados incluidos) para el recibo del corte general.
  const ie = await listarEgresosContVirtual(supabase, { desde: ymd, hasta: ymd, sucursal: suc, cuenta: 'abarrotes' });
  const egresosDia = resumenEgresosDia({ gastos, egresosIe: ie?.data || [] });

  const folio = existente.data?.folio && numeroFolioCorteGeneral(existente.data.folio)
    ? existente.data.folio
    : await siguienteFolioCorteGeneral(supabase, { sucursal: suc });

  const estado = armarEstadoCorteDiario({
    venta,
    tarjeta,
    cajaAnterior,
    fechaNegocio: ymd,
    folio,
  });
  const calc = calcularAbarrotes(estado, gastos);
  const gastosIds = gastos.map((g) => g.id).filter(Boolean);
  const gastosTotal = round2(calc.gastosTotal);

  // created_at al fin del día de negocio para ordenar bien en IE/libro.
  const createdAt = finDia(ymd).toISOString();

  const payload = {
    sucursal_id: suc,
    modulo: 'abarrotes',
    folio: estado.folio,
    turno: 'Corte general',
    usuario_id: null,
    usuario_nombre: 'Sistema · corte general',
    caja_actual: calc.cajaActual ?? 0,
    ventas: calc.venta ?? 0,
    created_at: createdAt,
    detalle: {
      ...estado,
      gastos,
      gastos_ids: gastosIds,
      gastos_total: gastosTotal,
      subtotal: calc.subtotal,
      tipo_cierre: TIPO_CIERRE_DIARIO,
      automatico: true,
      corte_general: true,
      fecha_negocio: ymd,
      egresos_dia: egresosDia,
      origen: 'medianoche',
      resumen_pos: {
        tickets: resumen.ticketsBruto || resumen.tickets || 0,
        cancelaciones: resumen.cancelaciones || 0,
        efectivo: round2(resumen.grupos?.efectivo || 0),
        electronico: tarjeta,
      },
    },
  };

  const res = await registrarCierreCorte(supabase, payload);
  if (!res.ok) return { ok: false, error: res.error || 'No se pudo guardar el corte diario.' };
  return { ok: true, created: true, data: res.data, fecha: ymd, sucursal: suc };
}

/**
 * Asegura cortes diarios faltantes para una o todas las tiendas.
 * Por defecto: desde cutover (o `desde`) hasta ayer.
 */
export async function asegurarCortesDiariosAbarrotes(supabase, {
  sucursal = null,
  desde = null,
  hasta = null,
  now = new Date(),
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', creados: 0 };

  const hoy = ymdNogalesFromDate(now) || hoyYmdNogales();
  const fin = hasta && hasta < hoy ? hasta : addDaysYmd(hoy, -1);
  let ini = desde && desde >= CUTOVER_CIERRE_DIARIO ? desde : CUTOVER_CIERRE_DIARIO;
  if (ini > fin) return { ok: true, creados: 0, revisados: 0, resultados: [] };

  // Tope de 45 días por corrida para no saturar.
  const minIni = addDaysYmd(fin, -44);
  if (ini < minIni) ini = minIni;

  const tiendas = sucursal
    ? [normalizarCodigoTienda(sucursal)].filter(Boolean)
    : listarSucursalesOperativas();

  const resultados = [];
  let creados = 0;
  let revisados = 0;

  for (const suc of tiendas) {
    for (let f = ini; f && f <= fin; f = addDaysYmd(f, 1)) {
      revisados += 1;
      const r = await asegurarCorteDiarioAbarrotes(supabase, {
        sucursal: suc,
        fecha: f,
        now,
      });
      resultados.push({ sucursal: suc, fecha: f, ...r });
      if (r.created) creados += 1;
    }
  }

  return { ok: true, creados, revisados, resultados };
}
