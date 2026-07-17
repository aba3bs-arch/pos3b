import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { periodoSemanaNomina } from './semanaNomina.js';
import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';
import { listarCatalogoContVirtual } from './contVirtualCatalogo.js';
import {
  listarEgresosContVirtual,
  sincronizarValesContVirtual,
  unificarEgresosParaPanel,
} from './contVirtualEgresos.js';

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoEnRango(iso, desde, hasta) {
  const f = String(iso || '').slice(0, 10);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
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

function tipoCierre(row) {
  return String(row?.detalle?.tipo_cierre || row?.turno || '').toLowerCase();
}

function esCierreTurno(row) {
  const t = tipoCierre(row);
  return t !== 'recoleccion' && t !== 'actualizacion';
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

  const desdeIso = `${desde}T00:00:00`;
  const hastaIso = `${hasta}T23:59:59.999`;

  await sincronizarValesContVirtual(supabase);

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

  const [cierresRes, gastosRes, prestamosRes, catalogoRes, egresosLibroRes] = await Promise.all([
    qCierres,
    qGastos,
    qPrestamos,
    listarCatalogoContVirtual(supabase),
    listarEgresosContVirtual(supabase, { desde, hasta, sucursal }),
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
  const recolecciones = todosCierres.filter((c) => tipoCierre(c) === 'recoleccion');
  const gastos = (gastosRes.data || []).filter((g) => {
    if (sucursal && g.sucursal_id !== sucursal) return false;
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
    const venta = Number(c.ventas) || Number(c.detalle?.venta) || 0;
    if (!(venta > 0)) {
      porCuenta[mod].cierres += 1;
      ingresosPorTienda[t].cierres += 1;
      continue;
    }
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + venta);
    ingresosPorTienda[t].cierres += 1;
    ingresosTotal = round2(ingresosTotal + venta);
    porCuenta[mod].ingresos = round2(porCuenta[mod].ingresos + venta);
    porCuenta[mod].cierres += 1;
    const f = String(c.created_at || '').slice(0, 10);
    if (f) {
      ingresosItems.push({
        id: `cierre-${c.id}`,
        fecha: f,
        monto: round2(venta),
        comentario: `Cierre ${etiquetaCuenta(mod)} · ${etiquetaTienda(t)} · ${c.folio || ''}`.trim(),
        cuenta: mod,
        tienda: t,
        tipo_mov: 'cierre',
      });
    }
  }

  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = r.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const mod = String(r.modulo || 'virtual').toLowerCase() === 'garage' ? 'garage' : 'virtual';
    const monto = Number(r.detalle?.recoleccion || r.detalle?.recoleccion_turno) || 0;
    if (!(monto > 0)) continue;
    recoleccionTotal = round2(recoleccionTotal + monto);
    ingresosTotal = round2(ingresosTotal + monto);
    porCuenta[mod].ingresos = round2(porCuenta[mod].ingresos + monto);
    porCuenta[mod].recolecciones = round2(porCuenta[mod].recolecciones + monto);
    if (ingresosPorTienda[t]) {
      ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + monto);
      ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + monto);
    }
    const f = String(r.created_at || '').slice(0, 10);
    const iny = Number(r.detalle?.moneda_inyectar) || 0;
    ingresosItems.push({
      id: `rec-${r.id}`,
      fecha: f || desde,
      monto: round2(monto),
      comentario: `Recolección ${etiquetaCuenta(mod)} · ${etiquetaTienda(t)}${iny > 0 ? ` · inyectar ${iny}` : ''} · ${r.folio || ''}`.trim(),
      cuenta: mod,
      tienda: t,
      tipo_mov: 'recoleccion',
    });
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
    avisoCatalogo: catalogoRes.aviso || egresosLibroRes.aviso || null,
    cierresCount: cierres.length,
    recoleccionesCount: recolecciones.length,
    cuotasNomina,
    cuotasNominaTotal,
    cuotaMinima: CUOTA_SEMANAL_MINIMA,
  };
}
