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
 * Panel Cont Virtual: ingresos (cierres virtual) + egresos por categoría/subcategoría.
 */
export async function cargarContVirtual(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const tiendas = listarSucursalesOperativas();
  const tiendasFiltro = sucursal ? [sucursal] : tiendas;

  const desdeIso = `${desde}T00:00:00`;
  const hastaIso = `${hasta}T23:59:59.999`;

  await sincronizarValesContVirtual(supabase);

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

  const cierres = (cierresRes.data || []).filter((c) => esCierreTurno(c));
  const gastos = gastosRes.data || [];
  const catalogo = (catalogoRes.data || []).filter((c) => c.activo !== false);

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

  const recolecciones = (cierresRes.data || []).filter((c) => tipoCierre(c) === 'recoleccion');
  let recoleccionTotal = 0;
  for (const r of recolecciones) {
    const t = r.sucursal_id || 'MAIN';
    if (sucursal && t !== sucursal) continue;
    const monto = Number(r.detalle?.recoleccion || r.detalle?.recoleccion_turno) || 0;
    recoleccionTotal = round2(recoleccionTotal + monto);
    if (ingresosPorTienda[t]) ingresosPorTienda[t].recolecciones = round2((ingresosPorTienda[t].recolecciones || 0) + monto);
  }

  const prestamosAll = prestamosRes.error ? [] : prestamosRes.data || [];
  const prestamosPeriodo = prestamosAll.filter((p) => {
    if (['rechazado', 'pendiente_admin'].includes(String(p.estado))) return false;
    const area = String(p.area_corte || 'virtual').toLowerCase();
    if (area !== 'virtual') return false;
    if (!isoEnRango(p.created_at || p.aprobado_admin_at, desde, hasta)) return false;
    if (p.cargado_corte) return false;
    return true;
  });

  const unificado = unificarEgresosParaPanel({
    egresosLibro: egresosLibroRes.data || [],
    gastosCorte: gastos.filter((g) => !sucursal || g.sucursal_id === sucursal),
    prestamos: prestamosPeriodo,
    catalogo,
  });

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
    detalleGastos: unificado.detalle.slice(0, 400),
    pastelCategorias: unificado.pastelCategorias,
    pastelSubcategorias: unificado.pastelSubcategorias,
    catalogo,
    avisoCatalogo: catalogoRes.aviso || egresosLibroRes.aviso || null,
    cierresCount: cierres.length,
    cuotasNomina,
    cuotasNominaTotal,
    cuotaMinima: CUOTA_SEMANAL_MINIMA,
  };
}
