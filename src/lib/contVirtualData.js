import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { periodoSemanaNomina } from './semanaNomina.js';
import {
  CUOTA_SEMANAL_MINIMA,
  idsGastosLiberadosPorRecolecciones,
  recoleccionAprobadaParaIe,
} from './contabilidadConstants.js';
import { listarCatalogoContVirtual } from './contVirtualCatalogo.js';
import { montoRecoleccionParaContabilidad } from './corteContabilidad/calc.js';
import {
  listarEgresosContVirtual,
  listarIngresosContVirtual,
  itemIngresoManualDesdeFila,
  listarRefsEgresosEliminadosIe,
  sincronizarGastosCubreTaxiContVirtual,
  sincronizarValesContVirtual,
  unificarEgresosParaPanel,
} from './contVirtualEgresos.js';
import {
  gastoEsCuentaRtFrancisco,
  reclasificarGastosRtFranciscoAAbarrotes,
} from './contabilidadDepartamentos.js';
import { finDia, inicioDia, hoyYmdNogales, ymdNogalesFromDate } from './corteCaja.js';

function toYmd(d) {
  return ymdNogalesFromDate(d) || hoyYmdNogales();
}

/** Día calendario Sonora 00:00–24:00 (no UTC). */
function ymdNegocio(isoOrDate) {
  if (!isoOrDate) return '';
  if (typeof isoOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate.trim())) {
    return isoOrDate.trim();
  }
  return ymdNogalesFromDate(isoOrDate);
}

function isoEnRango(iso, desde, hasta) {
  const f = ymdNegocio(iso);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

/** Límites ISO del periodo en hora Sonora (día 0–24h). */
function rangoIsoNogales(desde, hasta) {
  return {
    desdeIso: inicioDia(desde).toISOString(),
    hastaIso: finDia(hasta).toISOString(),
  };
}

export const PRESETS_CONT_VIRTUAL = [
  { id: 'hoy', label: 'Día (hoy)' },
  { id: 'semana', label: 'Semana (sáb–vie nómina)' },
  { id: 'mes', label: 'Mes actual' },
  { id: 'ano', label: 'Año actual' },
  { id: 'rango', label: 'Rango de fechas' },
];

export function rangoDesdePresetContVirtual(preset) {
  const hoy = new Date();
  const hasta = toYmd(hoy);
  if (preset === 'hoy') return { desde: hasta, hasta };
  if (preset === 'semana') {
    const s = periodoSemanaNomina(hoy);
    return { desde: s.inicio, hasta: s.fin };
  }
  if (preset === 'mes') return { desde: toYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  if (preset === 'ano') return { desde: `${hoy.getFullYear()}-01-01`, hasta };
  return null;
}

/** Rango completo de un mes (1 → último día). mes = 0–11. */
export function rangoMesContVirtual(anio, mes) {
  const desde = toYmd(new Date(anio, mes, 1));
  const hasta = toYmd(new Date(anio, mes + 1, 0));
  return { desde, hasta };
}

/** Rango completo de un año. */
export function rangoAnioContVirtual(anio) {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

export const MESES_CORTO_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Agrupa egresos e ingresos por día YYYY-MM-DD. */
export function agruparMovimientosPorDia({ detalleGastos = [], ingresosPorDia = [] } = {}) {
  const map = {};
  for (const g of detalleGastos || []) {
    const f = String(g.fecha || '').slice(0, 10);
    if (!f) continue;
    if (!map[f]) map[f] = { fecha: f, ingresos: 0, gastos: 0, items: [] };
    map[f].gastos = round2(map[f].gastos + (Number(g.monto) || 0));
    map[f].items.push({ ...g, tipo: 'gasto' });
  }
  for (const i of ingresosPorDia || []) {
    const f = String(i.fecha || '').slice(0, 10);
    if (!f) continue;
    if (!map[f]) map[f] = { fecha: f, ingresos: 0, gastos: 0, items: [] };
    map[f].ingresos = round2(map[f].ingresos + (Number(i.monto) || 0));
    map[f].items.push({ ...i, tipo: 'ingreso' });
  }
  return Object.values(map).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/** Semanas del mes (sáb–vie alineado a nómina) con totales. */
export function semanasDelMesContVirtual(anio, mes, porDia = []) {
  const { desde, hasta } = rangoMesContVirtual(anio, mes);
  const dias = [];
  let cur = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  while (cur <= fin) {
    dias.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const byFecha = Object.fromEntries((porDia || []).map((d) => [d.fecha, d]));
  const semanas = [];
  let i = 0;
  while (i < dias.length) {
    const start = dias[i];
    const d0 = new Date(`${start}T12:00:00`);
    const day = d0.getDay();
    const daysSinceSat = (day + 1) % 7;
    // Semana nómina: sáb–vie; si el mes no empieza en sáb, primer tramo hasta vie
    let endIdx = i;
    const endTarget = new Date(d0);
    if (daysSinceSat === 0) {
      endTarget.setDate(d0.getDate() + 6);
    } else {
      endTarget.setDate(d0.getDate() + (6 - daysSinceSat));
    }
    const endYmd = toYmd(endTarget);
    while (endIdx < dias.length - 1 && dias[endIdx] < endYmd) endIdx += 1;
    if (dias[endIdx] > endYmd) {
      while (endIdx > i && dias[endIdx] > endYmd) endIdx -= 1;
    }
    const slice = dias.slice(i, endIdx + 1);
    let ingresos = 0;
    let gastos = 0;
    for (const f of slice) {
      ingresos += Number(byFecha[f]?.ingresos) || 0;
      gastos += Number(byFecha[f]?.gastos) || 0;
    }
    semanas.push({
      desde: slice[0],
      hasta: slice[slice.length - 1],
      ingresos: round2(ingresos),
      gastos: round2(gastos),
      balance: round2(ingresos - gastos),
    });
    i = endIdx + 1;
  }
  return semanas;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Lista de gastos embebidos en una recolección (para desglose en IE). */
export function gastosDeRecoleccionDetalle(detalle = {}) {
  const list = Array.isArray(detalle?.gastos) ? detalle.gastos : [];
  return list
    .map((g, i) => ({
      id: g.id != null ? String(g.id) : `g-${i}`,
      categoria: String(g.categoria || '').trim() || '—',
      subcategoria: String(g.subcategoria || '').trim(),
      comentario: String(g.comentario || '').trim(),
      empleado: String(g.usuario_nombre || g.solicitado_por || '').trim(),
      monto: round2(g.monto),
    }))
    .filter((g) => g.monto > 0 || g.categoria !== '—');
}

function itemIngresoRecoleccion(r, { desde, etiquetaCuentaFn } = {}) {
  const detalle = r.detalle || {};
  const monto = montoRecoleccionParaContabilidad(detalle);
  const efectivo = round2(Number(detalle.recoleccion ?? detalle.recoleccion_turno) || 0);
  const gastosEmb = round2(Number(detalle.gastos_total) || 0);
  const gastos = gastosDeRecoleccionDetalle(detalle);
  const t = r.sucursal_id || 'MAIN';
  const mod = String(r.modulo || 'virtual').toLowerCase();
  const cuentaLbl = typeof etiquetaCuentaFn === 'function'
    ? etiquetaCuentaFn(mod)
    : (mod === 'garage' ? 'Garage' : mod === 'abarrotes' ? 'Abarrotes' : 'Virtual');
  const f = ymdNegocio(r.created_at) || desde;
  return {
    id: `rec-${r.id}`,
    cierre_id: r.id,
    folio: r.folio || '',
    fecha: f || desde,
    monto: round2(monto),
    efectivo,
    gastos_total: gastosEmb,
    gastos,
    comentario: `Recolección ${cuentaLbl} · ${etiquetaTienda(t)} · ${r.folio || ''}${
      gastosEmb > 0 ? ` · bruto (efectivo ${efectivo.toFixed(2)} + gastos ${gastosEmb.toFixed(2)})` : ''
    }`.trim(),
    cuenta: mod === 'garage' ? 'garage' : mod === 'abarrotes' ? 'abarrotes' : 'virtual',
    tienda: t,
    tipo_mov: 'recoleccion',
  };
}

function tipoCierre(row) {
  return String(row?.detalle?.tipo_cierre || row?.turno || '').toLowerCase();
}

function esCierreTurno(row) {
  const t = tipoCierre(row);
  // Excluye recolección definitiva y temporal (no son cierres de cajero).
  return !t.startsWith('recoleccion') && t !== 'actualizacion';
}

/** Recolección definitiva aprobable para IE (Garage: solo con máquinas en cero). */
function esRecoleccionParaIe(row) {
  if (tipoCierre(row) !== 'recoleccion') return false;
  const mod = String(row?.modulo || '').toLowerCase();
  if (mod === 'garage' && row?.detalle?.maquinas_en_cero === false) return false;
  return true;
}

/**
 * Panel IE VIRTUAL: ingresos/egresos de Virtual + Garage (cuentas separadas).
 * Incluye cierres de turno y recolecciones.
 */
export async function cargarContVirtual(supabase, { desde, hasta, sucursal = null, cuenta = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const cuentaFiltro = cuenta === 'virtual' || cuenta === 'garage' ? cuenta : null;
  const tiendas = listarSucursalesOperativas();
  const tiendasFiltro = sucursal ? [sucursal] : tiendas;

  const { desdeIso, hastaIso } = rangoIsoNogales(desde, hasta);

  await Promise.all([
    sincronizarValesContVirtual(supabase),
    sincronizarGastosCubreTaxiContVirtual(supabase),
  ]);

  let qCierres = supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .in('modulo', ['virtual', 'garage'])
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(3000);
  if (sucursal) qCierres = qCierres.eq('sucursal_id', sucursal);

  let qGastos = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .in('modulo', ['virtual', 'garage'])
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (sucursal) qGastos = qGastos.eq('sucursal_id', sucursal);

  let qPrestamos = supabase
    .from('prestamos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (sucursal) qPrestamos = qPrestamos.eq('sucursal_id', sucursal);

  const [cierresRes, gastosRes, prestamosRes, catalogoRes, egresosLibroRes, refsPrestElimRes, ingresosManualRes] = await Promise.all([
    qCierres,
    qGastos,
    qPrestamos,
    listarCatalogoContVirtual(supabase),
    listarEgresosContVirtual(supabase, { desde, hasta, sucursal }),
    listarRefsEgresosEliminadosIe(supabase, 'prestamos'),
    listarIngresosContVirtual(supabase, { desde, hasta, sucursal }),
  ]);

  if (cierresRes.error && cierresRes.error.code !== '42P01') {
    return { ok: false, error: cierresRes.error.message };
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    return { ok: false, error: gastosRes.error.message };
  }

  const todosCierres = (cierresRes.data || []).filter((c) => {
    if (!cuentaFiltro) return true;
    return String(c.modulo || '').toLowerCase() === cuentaFiltro;
  });
  const cierres = todosCierres.filter((c) => esCierreTurno(c));
  const recoleccionesTodas = todosCierres.filter((c) => esRecoleccionParaIe(c));
  const recolecciones = recoleccionesTodas.filter((c) => recoleccionAprobadaParaIe(c));
  const idsGastosLiberados = idsGastosLiberadosPorRecolecciones(recoleccionesTodas);
  const gastosRaw = gastosRes.data || [];
  // Históricos RT Francisco mal etiquetados como virtual → no deben verse en IE VIRTUAL
  await reclasificarGastosRtFranciscoAAbarrotes(supabase, gastosRaw);

  const gastos = gastosRaw.filter((g) => {
    if (sucursal && g.sucursal_id !== sucursal) return false;
    if (gastoEsCuentaRtFrancisco(g)) return false;
    if (!cuentaFiltro) return true;
    return String(g.modulo || '').toLowerCase() === cuentaFiltro;
  });
  const catalogo = (catalogoRes.data || []).filter((c) => c.activo !== false);

  const etiquetaCuenta = (mod) => (String(mod).toLowerCase() === 'garage' ? 'Garage' : 'Virtual');

  const ingresosPorTienda = {};
  for (const t of tiendasFiltro) {
    ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
  }

  const porCuenta = {
    virtual: { id: 'virtual', label: 'Virtual', ingresos: 0, egresos: 0, neto: 0, recolecciones: 0, cierres: 0 },
    garage: { id: 'garage', label: 'Garage', ingresos: 0, egresos: 0, neto: 0, recolecciones: 0, cierres: 0 },
  };

  let ingresosTotal = 0;
  const ingresosItems = [];

  for (const c of cierres) {
    const t = c.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const mod = String(c.modulo || 'virtual').toLowerCase() === 'garage' ? 'garage' : 'virtual';
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    // Cierres Virtual/Garage: solo contadores. El ingreso a IE es la recolección (bruta).
    porCuenta[mod].cierres += 1;
    ingresosPorTienda[t].cierres += 1;
  }

  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = r.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const mod = String(r.modulo || 'virtual').toLowerCase() === 'garage' ? 'garage' : 'virtual';
    const item = itemIngresoRecoleccion(r, { desde, etiquetaCuentaFn: etiquetaCuenta });
    if (!(item.monto > 0)) continue;
    recoleccionTotal = round2(recoleccionTotal + item.monto);
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta[mod].ingresos = round2(porCuenta[mod].ingresos + item.monto);
    porCuenta[mod].recolecciones = round2(porCuenta[mod].recolecciones + item.monto);
    if (ingresosPorTienda[t]) {
      ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + item.monto);
      ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    }
    ingresosItems.push(item);
  }

  // Ingresos capturados a mano (Admin) en Virtual / Garage
  let ingresosManual = ingresosManualRes.data || [];
  ingresosManual = ingresosManual.filter((e) => {
    const c = String(e.cuenta || 'virtual').toLowerCase();
    return c === 'virtual' || c === 'garage';
  });
  if (cuentaFiltro) {
    ingresosManual = ingresosManual.filter((e) => {
      const c = String(e.cuenta || 'virtual').toLowerCase();
      return (c === 'garage' ? 'garage' : 'virtual') === cuentaFiltro;
    });
  }
  for (const row of ingresosManual) {
    const item = itemIngresoManualDesdeFila(row);
    if (!(item.monto > 0)) continue;
    const mod = item.cuenta === 'garage' ? 'garage' : 'virtual';
    const t = item.tienda || 'MAIN';
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta[mod].ingresos = round2(porCuenta[mod].ingresos + item.monto);
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    ingresosItems.push(item);
  }

  const ingresosPorDia = ingresosItems.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const prestamosAll = prestamosRes.error ? [] : prestamosRes.data || [];
  const prestamosPeriodo = prestamosAll.filter((p) => {
    if (['rechazado', 'pendiente_admin'].includes(String(p.estado))) return false;
    const area = String(p.area_corte || 'virtual').toLowerCase();
    if (area !== 'virtual' && area !== 'garage') return false;
    if (cuentaFiltro && area !== cuentaFiltro) return false;
    if (!isoEnRango(p.created_at || p.aprobado_admin_at, desde, hasta)) return false;
    if (p.cargado_corte) return false;
    return true;
  });

  let egresosLibro = egresosLibroRes.data || [];
  // IE VIRTUAL (Antonio): nunca mezclar egresos de Abarrotes (Francisco)
  egresosLibro = egresosLibro.filter((e) => {
    const c = String(e.cuenta || 'virtual').toLowerCase();
    return c === 'virtual' || c === 'garage';
  });
  if (cuentaFiltro) {
    egresosLibro = egresosLibro.filter((e) => {
      const c = String(e.cuenta || 'virtual').toLowerCase();
      return (c === 'garage' ? 'garage' : 'virtual') === cuentaFiltro;
    });
  }

  const unificado = unificarEgresosParaPanel({
    egresosLibro,
    gastosCorte: gastos,
    prestamos: prestamosPeriodo,
    catalogo,
    refsPrestamosEliminados: new Set(refsPrestElimRes.data || []),
    idsGastosLiberados,
  });

  for (const d of unificado.detalle) {
    const mod = String(d.cuenta || 'virtual').toLowerCase() === 'garage' ? 'garage' : 'virtual';
    porCuenta[mod].egresos = round2(porCuenta[mod].egresos + d.monto);
  }
  porCuenta.virtual.neto = round2(porCuenta.virtual.ingresos - porCuenta.virtual.egresos);
  porCuenta.garage.neto = round2(porCuenta.garage.ingresos - porCuenta.garage.egresos);

  const egresosPorTienda = {};
  for (const t of tiendasFiltro) {
    egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0 };
  }
  for (const d of unificado.detalle) {
    const t = d.tienda || 'MAIN';
    if (!egresosPorTienda[t]) egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0 };
    egresosPorTienda[t].total = round2(egresosPorTienda[t].total + d.monto);
  }

  const egresosPorCat = {};
  for (const [catId, total] of Object.entries(unificado.porCategoria || {})) {
    const nombre = catalogo.find((c) => c.id === catId)?.nombre || catId;
    egresosPorCat[nombre] = total;
  }

  const prestamosActivos = prestamosAll.filter((p) => p.estado === 'activo' && (Number(p.saldo) || 0) > 0);
  const cuotasNomina = prestamosActivos.map((p) => {
    const saldo = Number(p.saldo) || 0;
    const cuotaCfg = Number(p.cuota_semanal) || 0;
    const cuota = cuotaCfg >= CUOTA_SEMANAL_MINIMA ? Math.min(saldo, cuotaCfg) : Math.min(saldo, CUOTA_SEMANAL_MINIMA);
    return {
      id: p.id,
      empleado: p.nombre_empleado,
      tienda: p.sucursal_id,
      saldo,
      cuota_semanal: cuota,
      minimo: CUOTA_SEMANAL_MINIMA,
    };
  });
  const cuotasNominaTotal = round2(cuotasNomina.reduce((s, x) => s + x.cuota_semanal, 0));

  const neto = round2(ingresosTotal - unificado.egresosTotal);

  return {
    ok: true,
    desde,
    hasta,
    ingresosTotal,
    egresosTotal: unificado.egresosTotal,
    neto,
    recoleccionTotal,
    egresosPorCat,
    ingresosPorTienda: Object.values(ingresosPorTienda).sort((a, b) => b.ingresos - a.ingresos),
    egresosPorTienda: Object.values(egresosPorTienda).sort((a, b) => b.total - a.total),
    detalleGastos: unificado.detalle.slice(0, 500),
    ingresosPorDia,
    porCuenta,
    pastelCategorias: unificado.pastelCategorias,
    pastelSubcategorias: unificado.pastelSubcategorias,
    catalogo,
    avisoCatalogo: catalogoRes.aviso || egresosLibroRes.aviso || ingresosManualRes.aviso || null,
    cierresCount: cierres.length,
    recoleccionesCount: recolecciones.length,
    cuotasNomina,
    cuotasNominaTotal,
    cuotaMinima: CUOTA_SEMANAL_MINIMA,
  };
}

/**
 * Panel IE ABARROTES (Francisco): ingresos/egresos solo de Abarrotes.
 * Independiente de Virtual/Garage (Antonio).
 */
export async function cargarContAbarrotes(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const tiendas = listarSucursalesOperativas();
  const tiendasFiltro = sucursal ? [sucursal] : tiendas;
  const { desdeIso, hastaIso } = rangoIsoNogales(desde, hasta);

  await sincronizarGastosCubreTaxiContVirtual(supabase);

  let qCierres = supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('modulo', 'abarrotes')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(3000);
  if (sucursal) qCierres = qCierres.eq('sucursal_id', sucursal);

  let qGastos = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'abarrotes')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (sucursal) qGastos = qGastos.eq('sucursal_id', sucursal);

  // Legacy: gastos RT Francisco que aún aparecen con modulo=virtual
  let qGastosRtLegacy = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'virtual')
    .ilike('subcategoria', '%CUENTA RT%')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (sucursal) qGastosRtLegacy = qGastosRtLegacy.eq('sucursal_id', sucursal);

  let qPrestamos = supabase.from('prestamos').select('*').order('created_at', { ascending: false }).limit(1000);
  if (sucursal) qPrestamos = qPrestamos.eq('sucursal_id', sucursal);

  const [cierresRes, gastosRes, gastosLegacyRes, prestamosRes, catalogoRes, egresosLibroRes, refsPrestElimRes, ingresosManualRes] = await Promise.all([
    qCierres,
    qGastos,
    qGastosRtLegacy,
    qPrestamos,
    listarCatalogoContVirtual(supabase),
    listarEgresosContVirtual(supabase, { desde, hasta, sucursal, cuenta: 'abarrotes' }),
    listarRefsEgresosEliminadosIe(supabase, 'prestamos'),
    listarIngresosContVirtual(supabase, { desde, hasta, sucursal, cuenta: 'abarrotes' }),
  ]);

  if (cierresRes.error && cierresRes.error.code !== '42P01') {
    return { ok: false, error: cierresRes.error.message };
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    return { ok: false, error: gastosRes.error.message };
  }

  const legacyFrancisco = (gastosLegacyRes.error ? [] : gastosLegacyRes.data || []).filter(gastoEsCuentaRtFrancisco);
  await reclasificarGastosRtFranciscoAAbarrotes(supabase, legacyFrancisco);

  const todosCierres = cierresRes.data || [];
  const cierres = todosCierres.filter((c) => esCierreTurno(c));
  const recoleccionesTodas = todosCierres.filter((c) => esRecoleccionParaIe(c));
  const recolecciones = recoleccionesTodas.filter((c) => recoleccionAprobadaParaIe(c));
  const idsGastosLiberados = idsGastosLiberadosPorRecolecciones(recoleccionesTodas);
  const gastos = [...(gastosRes.data || []), ...legacyFrancisco].filter((g) => {
    if (sucursal && g.sucursal_id !== sucursal) return false;
    const est = g.estado_aprobacion;
    return !est || est === 'aprobado';
  });
  const catalogo = (catalogoRes.data || []).filter((c) => c.activo !== false);

  const ingresosPorTienda = {};
  for (const t of tiendasFiltro) {
    ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
  }

  const porCuenta = {
    abarrotes: { id: 'abarrotes', label: 'Abarrotes', ingresos: 0, egresos: 0, neto: 0, recolecciones: 0, cierres: 0 },
  };

  let ingresosTotal = 0;
  const ingresosItems = [];

  for (const c of cierres) {
    const t = c.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    // Cierres Abarrotes: solo contadores. El ingreso a IE es la recolección (bruta).
    porCuenta.abarrotes.cierres += 1;
    ingresosPorTienda[t].cierres += 1;
  }

  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = r.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const item = itemIngresoRecoleccion(r, {
      desde,
      etiquetaCuentaFn: () => 'Abarrotes',
    });
    item.cuenta = 'abarrotes';
    if (!(item.monto > 0)) continue;
    recoleccionTotal = round2(recoleccionTotal + item.monto);
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta.abarrotes.ingresos = round2(porCuenta.abarrotes.ingresos + item.monto);
    porCuenta.abarrotes.recolecciones = round2(porCuenta.abarrotes.recolecciones + item.monto);
    if (ingresosPorTienda[t]) {
      ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + item.monto);
      ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    }
    ingresosItems.push(item);
  }

  // Ingresos capturados a mano (Admin) en Abarrotes
  for (const row of ingresosManualRes.data || []) {
    const item = itemIngresoManualDesdeFila({ ...row, cuenta: 'abarrotes' });
    if (!(item.monto > 0)) continue;
    const t = item.tienda || 'MAIN';
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta.abarrotes.ingresos = round2(porCuenta.abarrotes.ingresos + item.monto);
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    ingresosItems.push(item);
  }

  const ingresosPorDia = ingresosItems.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const prestamosAll = prestamosRes.error ? [] : prestamosRes.data || [];
  const prestamosPeriodo = prestamosAll.filter((p) => {
    if (['rechazado', 'pendiente_admin'].includes(String(p.estado))) return false;
    const area = String(p.area_corte || '').toLowerCase();
    if (area !== 'abarrotes') return false;
    if (!isoEnRango(p.created_at || p.aprobado_admin_at, desde, hasta)) return false;
    if (p.cargado_corte) return false;
    return true;
  });

  let egresosLibro = (egresosLibroRes.data || []).filter((e) => String(e.cuenta || '').toLowerCase() === 'abarrotes');

  const unificado = unificarEgresosParaPanel({
    egresosLibro,
    gastosCorte: gastos.map((g) => ({ ...g, modulo: 'abarrotes' })),
    prestamos: prestamosPeriodo,
    catalogo,
    refsPrestamosEliminados: new Set(refsPrestElimRes.data || []),
    idsGastosLiberados,
  });

  // Forzar cuenta abarrotes en detalle unificado (mapearCorte usa virtual por defecto)
  for (const d of unificado.detalle) {
    d.cuenta = 'abarrotes';
    porCuenta.abarrotes.egresos = round2(porCuenta.abarrotes.egresos + d.monto);
  }
  porCuenta.abarrotes.neto = round2(porCuenta.abarrotes.ingresos - porCuenta.abarrotes.egresos);

  const egresosPorTienda = {};
  for (const t of tiendasFiltro) {
    egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0 };
  }
  for (const d of unificado.detalle) {
    const t = d.tienda || 'MAIN';
    if (!egresosPorTienda[t]) egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0 };
    egresosPorTienda[t].total = round2(egresosPorTienda[t].total + d.monto);
  }

  const egresosPorCat = {};
  for (const [catId, total] of Object.entries(unificado.porCategoria || {})) {
    const nombre = catalogo.find((c) => c.id === catId)?.nombre || catId;
    egresosPorCat[nombre] = total;
  }

  const neto = round2(ingresosTotal - unificado.egresosTotal);

  return {
    ok: true,
    desde,
    hasta,
    propietario: 'francisco',
    ingresosTotal,
    egresosTotal: unificado.egresosTotal,
    neto,
    recoleccionTotal,
    egresosPorCat,
    ingresosPorTienda: Object.values(ingresosPorTienda).sort((a, b) => b.ingresos - a.ingresos),
    egresosPorTienda: Object.values(egresosPorTienda).sort((a, b) => b.total - a.total),
    detalleGastos: unificado.detalle.slice(0, 500),
    ingresosPorDia,
    porCuenta,
    pastelCategorias: unificado.pastelCategorias,
    pastelSubcategorias: unificado.pastelSubcategorias,
    catalogo,
    avisoCatalogo: catalogoRes.aviso || egresosLibroRes.aviso || ingresosManualRes.aviso || null,
    cierresCount: cierres.length,
    recoleccionesCount: recolecciones.length,
    cuotasNomina: [],
    cuotasNominaTotal: 0,
    cuotaMinima: CUOTA_SEMANAL_MINIMA,
  };
}
