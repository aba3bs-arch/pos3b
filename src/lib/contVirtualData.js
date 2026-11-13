import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
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
import { finDia, inicioDia, hoyYmdNogales, ymdNogalesFromDate, ymdNegocioDesdeIso } from './corteCaja.js';
import { CUTOVER_CIERRE_DIARIO, esCierreContableAbarrotes } from './corteAbarrotesDiario.js';

function toYmd(d) {
  return ymdNogalesFromDate(d) || hoyYmdNogales();
}

/** Día calendario Sonora 00:00–24:00 (no UTC). */
function ymdNegocio(isoOrDate) {
  return ymdNegocioDesdeIso(isoOrDate);
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
  // Preferir fecha_negocio guardada; si no, día Sonora desde created_at (nunca slice UTC).
  const f = ymdNegocio(detalle.fecha_negocio)
    || ymdNegocio(r.created_at)
    || desde;
  return {
    id: `rec-${r.id}`,
    cierre_id: r.id,
    folio: r.folio || '',
    fecha: f || desde,
    created_at: r.created_at || null,
    monto: round2(monto),
    efectivo,
    gastos_total: gastosEmb,
    gastos,
    comentario: (() => {
      const base = `Recolección ${cuentaLbl} · ${etiquetaTienda(t)} · ${r.folio || ''}`.trim();
      if (String(detalle.formula_recoleccion_ie || '') === 'socio_3b_ganancia_60') {
        return `${base} · ganancia 60% a IE`.trim();
      }
      return `${base}${
        gastosEmb > 0 ? ` · bruto (efectivo ${efectivo.toFixed(2)} + gastos ${gastosEmb.toFixed(2)})` : ''
      }`.trim();
    })(),
    cuenta: mod === 'garage' ? 'garage' : mod === 'abarrotes' ? 'abarrotes' : 'virtual',
    tienda: t,
    tipo_mov: 'recoleccion',
    empleado: r.usuario_nombre || null,
    turno: r.turno || detalle.turno_sesion || null,
  };
}

/** Monto de venta en efectivo de un cierre abarrotes (descuenta pago con tarjeta). */
export function montoVentaCierreAbarrotes(c) {
  const detalle = c?.detalle && typeof c.detalle === 'object' ? c.detalle : {};
  const ventaTotal = round2(
    Number(c?.ventas)
    || Number(detalle.venta)
    || Number(detalle.venta_neta)
    || Number(detalle.venta_efectivo)
    || Number(detalle.subtotal)
    || 0,
  );
  // El libro diario mide flujo de efectivo; el pago con tarjeta no entra a la caja.
  const tarjeta = round2(Number(detalle.tarjeta) || 0);
  return round2(ventaTotal - tarjeta);
}

/**
 * Ingreso IE ABARROTES desde cierre de turno: la venta del corte
 * (no requiere recolección; la recolección es solo retiro de efectivo).
 */
function itemIngresoVentaCierreAbarrotes(c, { desde } = {}) {
  const detalle = c?.detalle && typeof c.detalle === 'object' ? c.detalle : {};
  const venta = montoVentaCierreAbarrotes(c);
  const t = normalizarCodigoTienda(c?.sucursal_id) || 'MAIN';
  const f = ymdNegocio(detalle.fecha_negocio)
    || ymdNegocio(c?.created_at)
    || desde;
  const gastosEmb = round2(Number(detalle.gastos_total) || 0);
  return {
    id: `venta-cierre-${c.id}`,
    cierre_id: c.id,
    folio: c.folio || '',
    fecha: f || desde,
    created_at: c.created_at || null,
    monto: venta,
    efectivo: venta,
    gastos_total: gastosEmb,
    gastos: [],
    comentario: (
      String(detalle.tipo_cierre || '').toLowerCase() === 'cierre_diario'
        ? `Corte diario · ${etiquetaTienda(t)} · ${c.folio || ''}`
        : `Ventas Abarrotes · ${etiquetaTienda(t)} · ${c.folio || ''}`
    ).trim(),
    cuenta: 'abarrotes',
    tienda: t,
    tipo_mov: 'venta_cierre',
    empleado: c.usuario_nombre || null,
    turno: c.turno || detalle.turno_sesion || null,
  };
}

function tipoCierre(row) {
  // Solo detalle.tipo_cierre: no usar `turno` ("Turno diurno", etc.) como tipo.
  return String(row?.detalle?.tipo_cierre || '').toLowerCase();
}

function esCierreTurno(row) {
  // Contabilidad / libro diario: solo corte diario automático (y legado pre-cutover).
  // Los cierres del cajero (cierre_operativo) ya no entran.
  return esCierreContableAbarrotes(row);
}

/** Recolección definitiva aprobable para IE (Garage: solo con máquinas en cero). */
function esRecoleccionParaIe(row) {
  if (tipoCierre(row) !== 'recoleccion') return false;
  const mod = String(row?.modulo || '').toLowerCase();
  if (mod === 'garage' && row?.detalle?.maquinas_en_cero === false) return false;
  return true;
}

/** Evita N+1 de backfill en cada apertura de IE (vales / CUBRE legado). */
const IE_SYNC_TTL_MS = 10 * 60 * 1000;
const ieSyncLastAt = { virtual: 0, abarrotes: 0 };

/**
 * Backfill en segundo plano: no bloquea la primera pintura del panel.
 * Cuello de botella histórico: sincronizarVales + CUBRE hacían 1 insert/check por fila
 * antes de leer cierres/gastos.
 */
function dispararSyncIeFondo(supabase, panel) {
  if (!supabase) return;
  const key = panel === 'abarrotes' ? 'abarrotes' : 'virtual';
  const now = Date.now();
  if (now - (ieSyncLastAt[key] || 0) < IE_SYNC_TTL_MS) return;
  ieSyncLastAt[key] = now;
  const tareas = key === 'abarrotes'
    ? [sincronizarGastosCubreTaxiContVirtual(supabase)]
    : [sincronizarValesContVirtual(supabase), sincronizarGastosCubreTaxiContVirtual(supabase)];
  void Promise.all(tareas).catch(() => {});
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

  // Sync legado en fondo (antes bloqueaba 5–30s con N+1 por vale/gasto).
  dispararSyncIeFondo(supabase, 'virtual');

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
    // Soft-delete: no reaparecer en IE tras eliminar desde el panel.
    if (c.deleted_at) return false;
    if (!cuentaFiltro) return true;
    return String(c.modulo || '').toLowerCase() === cuentaFiltro;
  });
  const cierres = todosCierres.filter((c) => esCierreTurno(c));
  const recoleccionesTodas = todosCierres.filter((c) => esRecoleccionParaIe(c));
  const recolecciones = recoleccionesTodas.filter((c) => recoleccionAprobadaParaIe(c));
  const idsGastosLiberados = idsGastosLiberadosPorRecolecciones(recoleccionesTodas);
  const gastosRaw = gastosRes.data || [];
  // Históricos RT Francisco mal etiquetados como virtual → se filtran ya; write en fondo.
  void reclasificarGastosRtFranciscoAAbarrotes(supabase, gastosRaw);

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
    clientes: {},
  };

  const asegurarClienteCuenta = (sucursalId) => {
    const sid = String(sucursalId || '');
    if (!sid.toUpperCase().startsWith('CE-')) return null;
    const key = sid.toUpperCase();
    if (!porCuenta.clientes[key]) {
      const slug = key.slice(3).toLowerCase();
      porCuenta.clientes[key] = {
        id: key,
        slug,
        label: `Socio 3B · ${slug}`,
        ingresos: 0,
        egresos: 0,
        neto: 0,
        recolecciones: 0,
        cierres: 0,
      };
    }
    return porCuenta.clientes[key];
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
    const cli = asegurarClienteCuenta(t);
    if (cli) cli.cierres += 1;
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
    const cli = asegurarClienteCuenta(t);
    if (cli) {
      cli.ingresos = round2(cli.ingresos + item.monto);
      cli.recolecciones = round2(cli.recolecciones + item.monto);
      item.cuentaCliente = cli.id;
      item.labelCuenta = cli.label;
    }
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
    const cli = asegurarClienteCuenta(t);
    if (cli) {
      cli.ingresos = round2(cli.ingresos + item.monto);
      item.labelCuenta = cli.label;
    }
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
    const cli = asegurarClienteCuenta(d.tienda);
    if (cli) cli.egresos = round2(cli.egresos + d.monto);
  }
  porCuenta.virtual.neto = round2(porCuenta.virtual.ingresos - porCuenta.virtual.egresos);
  porCuenta.garage.neto = round2(porCuenta.garage.ingresos - porCuenta.garage.egresos);
  for (const cli of Object.values(porCuenta.clientes)) {
    cli.neto = round2((cli.ingresos || 0) - (cli.egresos || 0));
  }

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

  const panorama = construirPanoramaVirtual({
    ingresosItems,
    egresosTotal: unificado.egresosTotal,
    porCuenta,
    recoleccionesCount: recolecciones.length,
  });

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
    panorama,
    totalesNegocio: panorama.totales,
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
 * Panorama IE VIRTUAL (Antonio): recolecciones → efectivo vs gastos en tienda → egresos → neto.
 * El ingreso a IE es la recolección bruta (efectivo + gastos embebidos del corte).
 */
export function construirPanoramaVirtual({
  ingresosItems = [],
  egresosTotal = 0,
  porCuenta = {},
  recoleccionesCount = 0,
} = {}) {
  let recoleccionesBruto = 0;
  let efectivo = 0;
  let gastosEnRecoleccion = 0;
  let ingresosManual = 0;
  let nRec = 0;

  for (const it of ingresosItems || []) {
    const monto = round2(it.monto);
    if (!(monto > 0)) continue;
    if (it.tipo_mov === 'recoleccion') {
      nRec += 1;
      recoleccionesBruto = round2(recoleccionesBruto + monto);
      efectivo = round2(efectivo + (Number(it.efectivo) || 0));
      gastosEnRecoleccion = round2(gastosEnRecoleccion + (Number(it.gastos_total) || 0));
    } else {
      ingresosManual = round2(ingresosManual + monto);
    }
  }

  const ingresosTotal = round2(recoleccionesBruto + ingresosManual);
  const egresos = round2(egresosTotal);
  const neto = round2(ingresosTotal - egresos);
  const virtual = porCuenta?.virtual || {};
  const garage = porCuenta?.garage || {};

  const pctEfectivo = recoleccionesBruto > 0
    ? round2((efectivo / recoleccionesBruto) * 100)
    : 0;
  const pctGastosEnRec = recoleccionesBruto > 0
    ? round2((gastosEnRecoleccion / recoleccionesBruto) * 100)
    : 0;
  const pctEgresosSobreRec = recoleccionesBruto > 0
    ? round2((egresos / recoleccionesBruto) * 100)
    : (egresos > 0 ? 100 : 0);
  const pctNetoSobreRec = recoleccionesBruto > 0
    ? round2((neto / recoleccionesBruto) * 100)
    : 0;

  const countRec = recoleccionesCount || nRec;

  const totales = {
    recolecciones: recoleccionesBruto,
    efectivo,
    gastos_en_recoleccion: gastosEnRecoleccion,
    ingresos_manual: ingresosManual,
    ingresos_total: ingresosTotal,
    egresos,
    neto,
    recolecciones_count: countRec,
    virtual_ingresos: round2(virtual.ingresos || 0),
    virtual_egresos: round2(virtual.egresos || 0),
    virtual_neto: round2(virtual.neto || 0),
    garage_ingresos: round2(garage.ingresos || 0),
    garage_egresos: round2(garage.egresos || 0),
    garage_neto: round2(garage.neto || 0),
    pct_efectivo: pctEfectivo,
    pct_gastos_en_recoleccion: pctGastosEnRec,
    pct_egresos_sobre_recolecciones: pctEgresosSobreRec,
    pct_neto_sobre_recolecciones: pctNetoSobreRec,
  };

  return {
    ...totales,
    totales,
    resumen: [
      countRec > 0
        ? `${countRec} ${countRec === 1 ? 'recolección aprobada' : 'recolecciones aprobadas'} · bruto ${fmtMoneyPlain(recoleccionesBruto)}.`
        : 'Sin recolecciones aprobadas en el periodo.',
      recoleccionesBruto > 0
        ? `De cada $100 recolectados (bruto), ~$${pctEfectivo.toFixed(0)} llega en efectivo y ~$${pctGastosEnRec.toFixed(0)} ya salió como gasto en tienda.`
        : '',
      recoleccionesBruto > 0
        ? `Los egresos de IE consumen ~${pctEgresosSobreRec.toFixed(0)}% de las recolecciones brutas.`
        : (egresos > 0 ? 'Hay egresos aunque no haya recolecciones en el periodo.' : ''),
      `Resultado neto: ${neto >= 0 ? '' : '−'}$${Math.abs(neto).toFixed(2)}${
        recoleccionesBruto > 0 ? ` (${pctNetoSobreRec}% de las recolecciones).` : '.'
      }`,
      (virtual.ingresos || garage.ingresos)
        ? `Virtual ${fmtMoneyPlain(virtual.neto || 0)} · Garage ${fmtMoneyPlain(garage.neto || 0)}.`
        : '',
    ].filter(Boolean),
  };
}

function fmtMoneyPlain(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '−' : '';
  return `${sign}$${Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addDaysYmdSimple(ymd, dias) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(ymd || '').slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

function idsGastosDeCierre(c) {
  const det = c?.detalle && typeof c.detalle === 'object' ? c.detalle : {};
  const ids = new Set();
  for (const id of Array.isArray(det.gastos_ids) ? det.gastos_ids : []) {
    if (id != null && id !== '') ids.add(String(id));
  }
  for (const g of Array.isArray(det.gastos) ? det.gastos : []) {
    if (g?.id != null && g.id !== '') ids.add(String(g.id));
  }
  return ids;
}

/**
 * Datos del libro diario que deben cuadrar con el ticket del corte:
 * - cortes: cada cierre de turno con su caja chica (anterior → actual) y TODOS sus gastos tal como los guardó el corte.
 * - enCurso: gastos del turno abierto (aún sin corte); no cuentan hasta que se cierre.
 * - otros: egresos de IE que no pasan por la caja del corte (vales, evidencias, préstamos, capturas manuales).
 */
export function armarLibroCajaAbarrotes({
  cierres = [],
  todosCierres = [],
  gastosTabla = [],
  gastosAprobados = [],
  detalleUnificado = [],
  desde = null,
  posTarjeta = null,
} = {}) {
  // Tarjeta registrada en las ventas del POS por tienda y día (cortes de caja), para repartir
  // lo que el cajero capturó como «pago tarjeta» entre PCT ABA (venta POS) y PCT VIRTUAL (la diferencia).
  const bolsaPos = new Map();
  if (Array.isArray(posTarjeta)) {
    for (const r of posTarjeta) {
      const k = `${r.tienda}|${r.fecha}`;
      bolsaPos.set(k, round2((bolsaPos.get(k) || 0) + (Number(r.monto) || 0)));
    }
  }
  const porId = new Map((gastosTabla || []).map((g) => [String(g.id), g]));
  // Un gasto deja de estar «en curso» cuando entra a un corte contable (corte general o cierre
  // de cajero anterior al cutover). Los cierres operativos del cajero no cuentan.
  const idsCerrados = new Set();
  for (const c of cierres || []) {
    for (const id of idsGastosDeCierre(c)) idsCerrados.add(id);
  }

  const cortes = [];
  const cierresOrdenados = [...(cierres || [])].sort((a, b) =>
    String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
  for (const c of cierresOrdenados) {
    const det = c?.detalle && typeof c.detalle === 'object' ? c.detalle : {};
    const item = itemIngresoVentaCierreAbarrotes(c, { desde });
    const tienda = item.tienda;
    const ventaTotal = round2(
      Number(c?.ventas) || Number(det.venta) || Number(det.venta_neta) || Number(det.venta_efectivo) || Number(det.subtotal) || 0,
    );
    const tarjeta = round2(Number(det.tarjeta) || 0);
    const gastosTotal = round2(Number(det.gastos_total) || 0);

    let origen = Array.isArray(det.gastos) ? det.gastos : [];
    if (!origen.length) {
      origen = [...idsGastosDeCierre(c)].map((id) => porId.get(id)).filter(Boolean);
    }
    const gastos = origen
      .map((g, i) => ({
        id: `cg-${c.id}-${g.id ?? i}`,
        fecha: item.fecha,
        created_at: g.created_at || null,
        categoria: g.categoria || 'Sin categoría',
        subcategoria: g.subcategoria || '',
        comentario: g.comentario || '',
        empleado: g.usuario_nombre || g.solicitado_por || '',
        monto: round2(g.monto),
        tienda,
        folio_corte: c.folio || '',
      }))
      .filter((g) => g.monto > 0);
    const suma = round2(gastos.reduce((a, g) => a + g.monto, 0));
    if (gastosTotal - suma > 0.5) {
      gastos.push({
        id: `cg-${c.id}-resto`,
        fecha: item.fecha,
        created_at: c.created_at || null,
        categoria: 'Gastos del corte',
        subcategoria: 'sin detalle',
        comentario: 'El corte guardó este monto sin el detalle de cada gasto.',
        empleado: '',
        monto: round2(gastosTotal - suma),
        tienda,
        folio_corte: c.folio || '',
      });
    }

    let pctAba = tarjeta;
    let pctVirtual = 0;
    if (Array.isArray(posTarjeta)) {
      const k = `${tienda}|${item.fecha}`;
      const disponible = bolsaPos.get(k) || 0;
      pctAba = round2(Math.min(tarjeta, disponible));
      pctVirtual = round2(tarjeta - pctAba);
      bolsaPos.set(k, round2(disponible - pctAba));
    }

    cortes.push({
      id: c.id,
      folio: c.folio || '',
      fecha: item.fecha,
      created_at: c.created_at || null,
      turno: item.turno || '',
      cajero: c.usuario_nombre || '',
      tienda,
      ventaTotal,
      tarjeta,
      pctAba,
      pctVirtual,
      posDisponible: Array.isArray(posTarjeta),
      ventaEfectivo: round2(ventaTotal - tarjeta),
      gastosTotal: round2(gastos.reduce((a, g) => a + g.monto, 0)),
      cajaAnterior: round2(Number(det.caja_anterior) || 0),
      cajaActual: round2(Number(c.caja_actual) || 0),
      gastos,
    });
  }

  const enCurso = [];
  for (const g of gastosAprobados || []) {
    const fechaGasto = ymdNegocio(g.created_at) || desde;
    // Antes del cutover el cajero cierra la contabilidad: un gasto ya cerrado sin cierre no se muestra.
    if (g.cerrado === true && fechaGasto && fechaGasto < CUTOVER_CIERRE_DIARIO) continue;
    if (idsCerrados.has(String(g.id))) continue;
    const monto = round2(g.monto);
    if (!(monto > 0)) continue;
    enCurso.push({
      id: `ec-${g.id}`,
      fecha: fechaGasto,
      created_at: g.created_at || null,
      categoria: g.categoria || 'Sin categoría',
      subcategoria: g.subcategoria || '',
      comentario: g.comentario || '',
      empleado: g.usuario_nombre || g.solicitado_por || '',
      monto,
      tienda: normalizarCodigoTienda(g.sucursal_id) || 'MAIN',
    });
  }

  const otros = (detalleUnificado || []).filter((d) => {
    if (String(d.id || '').startsWith('corte-')) return false;
    return d.ref_tabla !== 'cortes_contabilidad_gastos';
  });

  return { cortes, enCurso, otros };
}

/**
 * Panel IE ABARROTES (Francisco): ingresos/egresos solo de Abarrotes.
 * Ingresos = ventas de cierres de corte (aunque no se recolecte) + capturas manuales.
 * Independiente de Virtual/Garage (Antonio).
 */
export async function cargarContAbarrotes(supabase, { desde, hasta, sucursal = null, limiteDetalle = 500 } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const tiendas = listarSucursalesOperativas();
  const tiendasFiltro = sucFiltro ? [sucFiltro] : tiendas;
  const { desdeIso, hastaIso } = rangoIsoNogales(desde, hasta);

  // Genera cortes diarios faltantes (medianoche Nogales) antes de armar IE / libro.
  try {
    const { asegurarCortesDiariosAbarrotes } = await import('./corteAbarrotesDiario.js');
    await asegurarCortesDiariosAbarrotes(supabase, {
      sucursal: sucFiltro || null,
      desde,
      hasta,
    });
  } catch {
    /* no tumbar el panel si falla el auto-corte */
  }

  // Sync CUBRE legado en fondo (no bloquear lectura del panel).
  dispararSyncIeFondo(supabase, 'abarrotes');

  let qCierres = supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('modulo', 'abarrotes')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(3000);
  // No .eq sucursal aquí: filtramos con normalizarCodigoTienda (FUSION vs Fusion).

  let qGastos = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'abarrotes')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(5000);

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

  let qPrestamos = supabase.from('prestamos').select('*').order('created_at', { ascending: false }).limit(1000);

  const [cierresRes, gastosRes, gastosLegacyRes, prestamosRes, catalogoRes, egresosLibroRes, refsPrestElimRes, ingresosManualRes] = await Promise.all([
    qCierres,
    qGastos,
    qGastosRtLegacy,
    qPrestamos,
    listarCatalogoContVirtual(supabase),
    listarEgresosContVirtual(supabase, { desde, hasta, sucursal: sucFiltro, cuenta: 'abarrotes' }),
    listarRefsEgresosEliminadosIe(supabase, 'prestamos'),
    listarIngresosContVirtual(supabase, { desde, hasta, sucursal: sucFiltro, cuenta: 'abarrotes' }),
  ]);

  if (cierresRes.error && cierresRes.error.code !== '42P01') {
    return { ok: false, error: cierresRes.error.message };
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    return { ok: false, error: gastosRes.error.message };
  }

  const legacyFrancisco = (gastosLegacyRes.error ? [] : gastosLegacyRes.data || []).filter(gastoEsCuentaRtFrancisco);
  void reclasificarGastosRtFranciscoAAbarrotes(supabase, legacyFrancisco);

  // Soft-delete: no contar cierres en papelera (si la columna no existe, deleted_at viene undefined).
  const todosCierres = (cierresRes.data || []).filter((c) => {
    if (c.deleted_at) return false;
    if (sucFiltro && normalizarCodigoTienda(c.sucursal_id) !== sucFiltro) return false;
    return true;
  });
  const cierres = todosCierres.filter((c) => esCierreTurno(c));
  const recoleccionesTodas = todosCierres.filter((c) => esRecoleccionParaIe(c));
  const recolecciones = recoleccionesTodas.filter((c) => recoleccionAprobadaParaIe(c));
  // Abarrotes libera por cierre de turno (no hay recolección); Virtual/Garage por recolección.
  const idsGastosLiberados = idsGastosLiberadosPorRecolecciones([
    ...recoleccionesTodas,
    ...cierres,
  ]);
  const gastos = [...(gastosRes.data || []), ...legacyFrancisco].filter((g) => {
    if (sucFiltro && normalizarCodigoTienda(g.sucursal_id) !== sucFiltro) return false;
    const est = g.estado_aprobacion;
    return !est || est === 'aprobado';
  });
  const prestamosAllRaw = prestamosRes.error ? [] : prestamosRes.data || [];
  const prestamosAll = sucFiltro
    ? prestamosAllRaw.filter((p) => normalizarCodigoTienda(p.sucursal_id) === sucFiltro)
    : prestamosAllRaw;
  const catalogo = (catalogoRes.data || []).filter((c) => c.activo !== false);

  const ingresosPorTienda = {};
  for (const t of tiendasFiltro) {
    ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
  }

  const porCuenta = {
    abarrotes: {
      id: 'abarrotes',
      label: 'Abarrotes',
      ingresos: 0,
      egresos: 0,
      neto: 0,
      recolecciones: 0,
      ventas: 0,
      cierres: 0,
    },
  };

  let ingresosTotal = 0;
  const ingresosItems = [];

  let ventasCierresTotal = 0;
  for (const c of cierres) {
    const t = normalizarCodigoTienda(c.sucursal_id) || 'MAIN';
    if (sucFiltro && t !== sucFiltro) continue;
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    // Ingresos IE = ventas del corte (aunque no se recolecte efectivo).
    porCuenta.abarrotes.cierres += 1;
    ingresosPorTienda[t].cierres += 1;
    const item = itemIngresoVentaCierreAbarrotes(c, { desde });
    if (!(item.monto > 0)) continue;
    ventasCierresTotal = round2(ventasCierresTotal + item.monto);
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta.abarrotes.ingresos = round2(porCuenta.abarrotes.ingresos + item.monto);
    porCuenta.abarrotes.ventas = round2(porCuenta.abarrotes.ventas + item.monto);
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    ingresosItems.push(item);
  }

  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = normalizarCodigoTienda(r.sucursal_id) || 'MAIN';
    if (sucFiltro && t !== sucFiltro) continue;
    const item = itemIngresoRecoleccion(r, {
      desde,
      etiquetaCuentaFn: () => 'Abarrotes',
    });
    item.cuenta = 'abarrotes';
    item.tienda = t;
    if (!(item.monto > 0)) continue;
    // Solo contador de efectivo recolectado; no suma otra vez a ingresos
    // (las ventas del cierre ya son el ingreso).
    recoleccionTotal = round2(recoleccionTotal + item.monto);
    porCuenta.abarrotes.recolecciones = round2(porCuenta.abarrotes.recolecciones + item.monto);
    if (ingresosPorTienda[t]) {
      ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + item.monto);
    }
  }

  // Ingresos capturados a mano (Admin) en Abarrotes
  for (const row of ingresosManualRes.data || []) {
    const item = itemIngresoManualDesdeFila({ ...row, cuenta: 'abarrotes' });
    if (!(item.monto > 0)) continue;
    const t = normalizarCodigoTienda(item.tienda) || 'MAIN';
    if (sucFiltro && t !== sucFiltro) continue;
    ingresosTotal = round2(ingresosTotal + item.monto);
    porCuenta.abarrotes.ingresos = round2(porCuenta.abarrotes.ingresos + item.monto);
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + item.monto);
    item.tienda = t;
    ingresosItems.push(item);
  }

  // Créditos cobrados: cada gasto CREDITO/CREDITO RUTA representa efectivo
  // recibido del cliente que luego sale a tránsito del recolector.
  // Se registra también como ENTRADA para que el libro diario muestre el flujo completo
  // (entrada del cliente + salida al recolector = neto cero, que es lo correcto).
  for (const g of gastos) {
    const catUpper = String(g.categoria || '').toUpperCase();
    if (catUpper !== 'CREDITO' && catUpper !== 'CREDITO RUTA') continue;
    const monto = round2(g.monto);
    if (!(monto > 0)) continue;
    const t = normalizarCodigoTienda(g.sucursal_id) || 'MAIN';
    if (sucFiltro && t !== sucFiltro) continue;
    const f = ymdNegocio(g.created_at) || desde;
    // comentario del gasto: "CREDITO COBRADO · folio · cajero"
    const partes = (g.comentario || '').split(' · ');
    const folio = partes[1] ? partes[1].trim() : '';
    ingresosTotal = round2(ingresosTotal + monto);
    porCuenta.abarrotes.ingresos = round2(porCuenta.abarrotes.ingresos + monto);
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + monto);
    ingresosItems.push({
      id: `cxc-cobro-${g.id}`,
      fecha: f,
      created_at: g.created_at,
      folio,
      monto,
      comentario: `Cobro de crédito${folio ? ` · ${folio}` : ''}`,
      empleado: g.usuario_nombre || '',
      turno: '',
      tipo_mov: 'cobro_credito',
      tienda: t,
      cuenta: 'abarrotes',
    });
  }

  const ingresosPorDia = ingresosItems.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

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

  let posTarjeta = null;
  try {
    const d0 = addDaysYmdSimple(desde, -1);
    const d1 = addDaysYmdSimple(hasta, 1);
    const { data: cajasPos, error: errPos } = await supabase
      .from('cortes_caja')
      .select('sucursal_id,fecha,grupos')
      .gte('fecha', d0)
      .lte('fecha', d1)
      .limit(5000);
    if (!errPos) {
      posTarjeta = (cajasPos || [])
        .filter((r) => !sucFiltro || normalizarCodigoTienda(r.sucursal_id) === sucFiltro)
        .map((r) => ({
          tienda: normalizarCodigoTienda(r.sucursal_id) || 'MAIN',
          fecha: String(r.fecha || '').slice(0, 10),
          monto: round2(Number(r?.grupos?.tarjeta) || 0),
        }));
    }
  } catch {
    posTarjeta = null;
  }

  const libroCajas = armarLibroCajaAbarrotes({
    cierres,
    todosCierres,
    gastosTabla: [...(gastosRes.data || []), ...legacyFrancisco],
    gastosAprobados: gastos,
    detalleUnificado: unificado.detalle,
    desde,
    posTarjeta,
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
    ventasCierresTotal,
    egresosPorCat,
    ingresosPorTienda: Object.values(ingresosPorTienda).sort((a, b) => b.ingresos - a.ingresos),
    egresosPorTienda: Object.values(egresosPorTienda).sort((a, b) => b.total - a.total),
    detalleGastos: unificado.detalle.slice(0, Math.max(1, Number(limiteDetalle) || 500)),
    ingresosPorDia,
    cortesLibro: libroCajas.cortes,
    gastosEnCurso: libroCajas.enCurso,
    egresosOtrosIe: libroCajas.otros,
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
