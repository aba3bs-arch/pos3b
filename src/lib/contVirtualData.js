import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { periodoSemanaNomina } from './semanaNomina.js';
import { filtrarValesPorPeriodo, fechaEfectivaVale, valeEstaAprobado } from './valesPrestamos.js';
import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdEnRango(ymd, desde, hasta) {
  const f = String(ymd || '').slice(0, 10);
  if (!f) return false;
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

function isoEnRango(iso, desde, hasta) {
  return ymdEnRango(String(iso || '').slice(0, 10), desde, hasta);
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

function clasificarGasto(g) {
  const cat = String(g.categoria || '').toUpperCase();
  if (cat === 'CONSUMO') return 'consumo';
  if (cat === 'VALES') return 'vales';
  if (cat === 'PRESTAMOS') return 'prestamos';
  return 'operativos';
}

/**
 * Panel Cont Virtual: ingresos (cierres virtual) + egresos (gastos corte, vales, préstamos).
 * No mezcla Resumen operativo / abarrotes.
 */
export async function cargarContVirtual(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const tiendas = listarSucursalesOperativas();
  const tiendasFiltro = sucursal ? [sucursal] : tiendas;

  const desdeIso = `${desde}T00:00:00`;
  const hastaIso = `${hasta}T23:59:59.999`;

  let qCierres = supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('modulo', 'virtual')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (sucursal) qCierres = qCierres.eq('sucursal_id', sucursal);

  let qGastos = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('modulo', 'virtual')
    .gte('created_at', desdeIso)
    .lte('created_at', hastaIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (sucursal) qGastos = qGastos.eq('sucursal_id', sucursal);

  let qVales = supabase
    .from('vales')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(2000);
  if (sucursal) qVales = qVales.eq('sucursal_id', sucursal);

  let qPrestamos = supabase
    .from('prestamos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (sucursal) qPrestamos = qPrestamos.eq('sucursal_id', sucursal);

  const [cierresRes, gastosRes, valesRes, prestamosRes] = await Promise.all([qCierres, qGastos, qVales, qPrestamos]);

  if (cierresRes.error && cierresRes.error.code !== '42P01') {
    return { ok: false, error: cierresRes.error.message };
  }
  if (gastosRes.error && gastosRes.error.code !== '42P01') {
    return { ok: false, error: gastosRes.error.message };
  }

  const cierres = (cierresRes.data || []).filter((c) => esCierreTurno(c));
  const gastos = gastosRes.data || [];

  const ingresosPorTienda = {};
  for (const t of tiendasFiltro) {
    ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
  }
  let ingresosTotal = 0;
  for (const c of cierres) {
    const t = c.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    if (!ingresosPorTienda[t]) {
      ingresosPorTienda[t] = { id: t, label: etiquetaTienda(t), ingresos: 0, cierres: 0, recolecciones: 0 };
    }
    const venta = Number(c.ventas) || Number(c.detalle?.venta) || 0;
    ingresosPorTienda[t].ingresos = round2(ingresosPorTienda[t].ingresos + venta);
    ingresosPorTienda[t].cierres += 1;
    ingresosTotal = round2(ingresosTotal + venta);
  }

  // Recolecciones (informativo, no suma a ingresos de venta)
  const recolecciones = (cierresRes.data || []).filter((c) => tipoCierre(c) === 'recoleccion');
  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = r.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const monto = Number(r.detalle?.recoleccion || r.detalle?.recoleccion_turno) || 0;
    recoleccionTotal = round2(recoleccionTotal + monto);
    if (ingresosPorTienda[t]) ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + monto);
  }

  const egresosPorCat = { consumo: 0, vales: 0, prestamos: 0, operativos: 0 };
  const egresosPorTienda = {};
  for (const t of tiendasFiltro) {
    egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0, consumo: 0, vales: 0, prestamos: 0, operativos: 0 };
  }

  const detalleGastos = [];
  for (const g of gastos) {
    const t = g.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const monto = round2(g.monto);
    const bucket = clasificarGasto(g);
    egresosPorCat[bucket] = round2(egresosPorCat[bucket] + monto);
    if (!egresosPorTienda[t]) {
      egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0, consumo: 0, vales: 0, prestamos: 0, operativos: 0 };
    }
    egresosPorTienda[t][bucket] = round2(egresosPorTienda[t][bucket] + monto);
    egresosPorTienda[t].total = round2(egresosPorTienda[t].total + monto);
    detalleGastos.push({
      fuente: 'corte',
      id: g.id,
      fecha: String(g.created_at || '').slice(0, 10),
      tienda: t,
      categoria: g.categoria,
      subcategoria: g.subcategoria,
      comentario: g.comentario,
      empleado: g.usuario_nombre,
      monto,
      bucket,
    });
  }

  // Vales virtual no cargados aún al corte (evitar doble conteo si cargado_corte)
  const valesAll = valesRes.error ? [] : valesRes.data || [];
  const valesVirtual = filtrarValesPorPeriodo(valesAll, desde, hasta).filter((v) => {
    if (!valeEstaAprobado(v)) return false;
    const area = String(v.area || 'virtual').toLowerCase();
    if (area !== 'virtual') return false;
    if (v.cargado_corte) return false;
    return true;
  });
  for (const v of valesVirtual) {
    const t = v.sucursal_id || 'MAIN';
    const monto = round2(v.monto);
    egresosPorCat.vales = round2(egresosPorCat.vales + monto);
    if (!egresosPorTienda[t]) {
      egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0, consumo: 0, vales: 0, prestamos: 0, operativos: 0 };
    }
    egresosPorTienda[t].vales = round2(egresosPorTienda[t].vales + monto);
    egresosPorTienda[t].total = round2(egresosPorTienda[t].total + monto);
    detalleGastos.push({
      fuente: 'vale',
      id: v.id,
      fecha: fechaEfectivaVale(v),
      tienda: t,
      categoria: 'VALES',
      subcategoria: v.categoria,
      comentario: v.folio || '',
      empleado: v.nombre_empleado,
      monto,
      bucket: 'vales',
    });
  }

  // Préstamos: desembolsos en periodo (si no están en gastos de corte)
  const prestamosAll = prestamosRes.error ? [] : prestamosRes.data || [];
  const prestamosPeriodo = prestamosAll.filter((p) => {
    if (['rechazado', 'pendiente_admin'].includes(String(p.estado))) return false;
    const area = String(p.area_corte || 'virtual').toLowerCase();
    if (area !== 'virtual') return false;
    if (!isoEnRango(p.created_at || p.aprobado_admin_at, desde, hasta)) return false;
    if (p.cargado_corte) return false;
    return true;
  });

  for (const p of prestamosPeriodo) {
    const t = p.sucursal_id || 'MAIN';
    const monto = round2(p.monto_original);
    egresosPorCat.prestamos = round2(egresosPorCat.prestamos + monto);
    if (!egresosPorTienda[t]) {
      egresosPorTienda[t] = { id: t, label: etiquetaTienda(t), total: 0, consumo: 0, vales: 0, prestamos: 0, operativos: 0 };
    }
    egresosPorTienda[t].prestamos = round2(egresosPorTienda[t].prestamos + monto);
    egresosPorTienda[t].total = round2(egresosPorTienda[t].total + monto);
    detalleGastos.push({
      fuente: 'prestamo',
      id: p.id,
      fecha: String(p.created_at || '').slice(0, 10),
      tienda: t,
      categoria: 'PRESTAMOS',
      subcategoria: 'DESEMBOLSO',
      comentario: p.nombre_empleado,
      empleado: p.nombre_empleado,
      monto,
      bucket: 'prestamos',
    });
  }

  // Préstamos activos: cuotas semanales esperadas en nómina (informativo)
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

  const egresosTotal = round2(Object.values(egresosPorCat).reduce((s, n) => s + n, 0));
  const neto = round2(ingresosTotal - egresosTotal);

  detalleGastos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  return {
    ok: true,
    desde,
    hasta,
    ingresosTotal,
    egresosTotal,
    neto,
    recoleccionTotal,
    egresosPorCat,
    ingresosPorTienda: Object.values(ingresosPorTienda).sort((a, b) => b.ingresos - a.ingresos),
    egresosPorTienda: Object.values(egresosPorTienda).sort((a, b) => b.total - a.total),
    detalleGastos: detalleGastos.slice(0, 300),
    cierresCount: cierres.length,
    cuotasNomina,
    cuotasNominaTotal,
    cuotaMinima: CUOTA_SEMANAL_MINIMA,
  };
}
