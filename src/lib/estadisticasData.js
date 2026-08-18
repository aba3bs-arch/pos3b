import { rangoDesdePreset as rangoDesdePresetBase, PRESETS_FECHA_PRODUCTO, cargarReporteMovimientosInventario } from './consultasInventario.js';
import { etiquetaTienda, esAlmacenCentral, listarSucursalesOperativas } from '../constants/sucursales.js';
import { costoUnitarioInventario, resumirValorInventario } from './valorInventario.js';
import { inventarioParaSucursal } from './inventarioMultitienda.js';

export { PRESETS_FECHA_PRODUCTO };

/** Desde la última semana de julio 2026 (arranque operativo). */
export const FECHA_INICIO_ESTADISTICAS = '2026-07-25';

/** Todas las tiendas operativas (sin MAIN). */
export function tiendasEstadisticas() {
  return listarSucursalesOperativas();
}

/** Compat: alias de tiendas operativas (ya no solo 3B2/3B5). */
export const TIENDAS_FOCO_ESTADISTICAS = listarSucursalesOperativas();

export const AREAS_ESTADISTICA = {
  abarrotes: {
    id: 'abarrotes',
    moduloVista: 'Estadísticas Abarrotes',
    label: 'Abarrotes',
    color: '#b5a642',
    desc: 'Ventas de corte Abarrotes, gastos, inventario y mermas',
  },
  virtual: {
    id: 'virtual',
    moduloVista: 'Estadísticas Virtual',
    label: 'Virtual',
    color: '#8e44ad',
    desc: 'Ventas de corte Virtual, gastos, recolección e inyección',
  },
  garage: {
    id: 'garage',
    moduloVista: 'Estadísticas Garage',
    label: 'Garage',
    color: '#7f8c8d',
    desc: 'Ventas de corte Garage, gastos y recolecciones',
  },
};

export const GRANULARIDAD_OPTS = [
  { id: 'dia', label: 'Por día' },
  { id: 'semana', label: 'Por semana (sáb–vie)' },
  { id: 'mes', label: 'Por mes' },
  { id: 'anual', label: 'Por año' },
];

export const COLORES_TIENDA = [
  '#2980b9',
  '#e67e22',
  '#27ae60',
  '#8e44ad',
  '#c0392b',
  '#16a085',
  '#f39c12',
  '#2c3e50',
  '#d35400',
  '#7f8c8d',
];

/** Solo 2 turnos operativos (12×12). */
export const COLORES_TURNO = {
  Diurno: '#3498db',
  Nocturno: '#2c3e50',
};

function toDateStart(ymd) {
  return new Date(`${ymd}T00:00:00`);
}

function toDateEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999`);
}

function padYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inicio de semana operativa: sábado (cierra viernes). */
export function inicioSemanaSabado(fecha = new Date()) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=dom … 6=sáb
  const diasDesdeSabado = (day + 1) % 7;
  d.setDate(d.getDate() - diasDesdeSabado);
  return d;
}

export function hoyYmdEstadisticas() {
  return padYmd(new Date());
}

/** Presets con semana sáb–vie. */
export function rangoDesdePreset(preset) {
  if (preset === 'semana') {
    const hasta = hoyYmdEstadisticas();
    const ini = inicioSemanaSabado(new Date());
    return { desde: padYmd(ini), hasta };
  }
  return rangoDesdePresetBase(preset);
}

/** Asegura que el rango no empiece antes del arranque operativo. */
export function acotarDesdeOperativo(desdeYmd) {
  if (!desdeYmd) return FECHA_INICIO_ESTADISTICAS;
  return desdeYmd < FECHA_INICIO_ESTADISTICAS ? FECHA_INICIO_ESTADISTICAS : desdeYmd;
}

export function periodoAnterior(desdeYmd, hastaYmd) {
  const ini = toDateStart(desdeYmd);
  const fin = toDateEnd(hastaYmd);
  const ms = fin.getTime() - ini.getTime() + 1;
  const prevFin = new Date(ini.getTime() - 1);
  const prevIni = new Date(prevFin.getTime() - ms + 1);
  return { desde: padYmd(prevIni), hasta: padYmd(prevFin) };
}

function excluirAlmacenCentral(rows, campo = 'sucursal_id') {
  return (rows || []).filter((r) => !esAlmacenCentral(r[campo]));
}

/** Gastos irreales de prueba: $10,000 exactos o texto test/prueba. */
export function esGastoPrueba(g) {
  const monto = Math.abs(Number(g?.monto) || 0);
  if (monto === 10000) return true;
  const blob = `${g?.comentario || ''} ${g?.categoria || ''} ${g?.subcategoria || ''} ${g?.usuario_nombre || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(test|prueba|testing|dummy|fake)\b/.test(blob);
}

export function depurarGastos(rows) {
  return (rows || []).filter((g) => !esGastoPrueba(g));
}

export function bucketKey(iso, gran) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (gran === 'anual') return String(d.getFullYear());
  if (gran === 'mes') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (gran === 'semana') {
    // Semana operativa: sábado → viernes
    return padYmd(inicioSemanaSabado(d));
  }
  return padYmd(d);
}

export function etiquetaBucket(key, gran) {
  if (!key) return '—';
  if (gran === 'anual') return key;
  if (gran === 'mes') {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [y, m] = key.split('-');
    return `${meses[Number(m) - 1]} ${y}`;
  }
  if (gran === 'semana') {
    // key = sábado de inicio
    const [y, m, d] = key.split('-');
    return `Sem sáb ${d}/${m}`;
  }
  return key.slice(5);
}

/**
 * Turno diurno 07:00–19:00 / nocturno 19:00–07:00 (horario 12×12).
 * Si el cierre trae nombre de turno, se respeta.
 */
export function turnoDesdeHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Diurno';
  const h = d.getHours();
  if (h >= 7 && h < 19) return 'Diurno';
  return 'Nocturno';
}

export function turnoDesdeVentaOCierre(row) {
  const raw = String(row?.turno || row?.turno_sesion || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/nocturn|noche/.test(raw)) return 'Nocturno';
  if (/diurn|matutin|dia\b/.test(raw)) return 'Diurno';
  return turnoDesdeHora(row?.created_at);
}

export function etiquetaTurno(id) {
  if (id === 'Diurno') return 'Turno diurno';
  if (id === 'Nocturno') return 'Turno nocturno';
  return id || '—';
}

export function agruparPorPeriodo(rows, gran, campoMonto = 'total', campoFecha = 'created_at') {
  const map = {};
  for (const v of rows || []) {
    const k = bucketKey(v[campoFecha], gran);
    if (!k) continue;
    map[k] = (map[k] || 0) + (Number(v[campoMonto]) || 0);
  }
  return Object.keys(map)
    .sort()
    .map((k) => ({ key: k, label: etiquetaBucket(k, gran), total: map[k] }));
}

export function agruparVentasPorPeriodo(rows, gran) {
  return agruparPorPeriodo(rows, gran, 'total', 'created_at');
}

export function combinarSeriesComparacion(actual, anterior) {
  const keys = [...new Set([...actual.map((x) => x.key), ...anterior.map((x) => x.key)])].sort();
  const mapA = Object.fromEntries(actual.map((x) => [x.key, x]));
  const mapB = Object.fromEntries(anterior.map((x) => [x.key, x]));
  const max = Math.max(...keys.map((k) => Math.max(mapA[k]?.total || 0, mapB[k]?.total || 0)), 1);
  return keys.map((k) => {
    const a = mapA[k]?.total || 0;
    const b = mapB[k]?.total || 0;
    return {
      key: k,
      label: mapA[k]?.label || mapB[k]?.label || etiquetaBucket(k, 'dia'),
      actual: a,
      anterior: b,
      delta: a - b,
      pctCambio: pctCambio(a, b),
      pctActual: (a / max) * 100,
      pctAnterior: (b / max) * 100,
    };
  });
}

function paretoDesdeMapa(map, labelFn) {
  const list = Object.entries(map).map(([id, total]) => ({
    id,
    label: labelFn(id),
    total: Number(total) || 0,
  }));
  list.sort((a, b) => b.total - a.total);
  const sum = list.reduce((a, x) => a + x.total, 0) || 1;
  let acum = 0;
  return list.map((x, i) => {
    acum += x.total;
    return {
      ...x,
      pct: (x.total / sum) * 100,
      acumPct: (acum / sum) * 100,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });
}

export function agruparVentasPorTienda(rows) {
  const map = {};
  for (const v of rows || []) {
    const t = v.sucursal_id || 'MAIN';
    map[t] = (map[t] || 0) + (Number(v.total) || 0);
  }
  return paretoDesdeMapa(map, (id) => etiquetaTienda(id));
}

export function agruparGastosPorTienda(rows) {
  const map = {};
  for (const g of rows || []) {
    const t = g.sucursal_id || 'MAIN';
    map[t] = (map[t] || 0) + (Number(g.monto) || 0);
  }
  const list = Object.entries(map).map(([id, total]) => ({ id, label: etiquetaTienda(id), total }));
  list.sort((a, b) => b.total - a.total);
  const sum = list.reduce((a, x) => a + x.total, 0) || 1;
  let start = 0;
  return list.map((x, i) => {
    const pct = (x.total / sum) * 100;
    const slice = { ...x, pct, color: COLORES_TIENDA[i % COLORES_TIENDA.length], pieStart: start, pieEnd: start + pct };
    start += pct;
    return slice;
  });
}

export function agruparGastosPorCategoria(rows) {
  const map = {};
  for (const g of rows || []) {
    const cat = String(g.categoria || 'Sin categoría').trim() || 'Sin categoría';
    map[cat] = (map[cat] || 0) + (Number(g.monto) || 0);
  }
  return paretoDesdeMapa(map, (id) => id);
}

export function pastelDesdePareto(pareto) {
  let start = 0;
  return (pareto || []).map((x) => {
    const slice = { ...x, pieStart: start, pieEnd: start + x.pct };
    start += x.pct;
    return slice;
  });
}

export function agruparPorTurno(rows, campoMonto = 'total') {
  const map = { Diurno: 0, Nocturno: 0 };
  for (const v of rows || []) {
    const t = turnoDesdeVentaOCierre(v);
    map[t] = (map[t] || 0) + (Number(v[campoMonto]) || 0);
  }
  const sum = Object.values(map).reduce((a, n) => a + n, 0) || 1;
  let start = 0;
  return ['Diurno', 'Nocturno']
    .filter((id) => map[id] > 0)
    .map((id) => {
      const total = map[id];
      const pct = (total / sum) * 100;
      const slice = {
        id,
        label: etiquetaTurno(id),
        total,
        pct,
        color: COLORES_TURNO[id] || '#95a5a6',
        pieStart: start,
        pieEnd: start + pct,
      };
      start += pct;
      return slice;
    });
}

export function estiloPastel(sliceList) {
  if (!sliceList?.length) return { background: 'var(--surface)' };
  const parts = sliceList.map((s) => `${s.color} ${s.pieStart}% ${s.pieEnd}%`);
  return { background: `conic-gradient(${parts.join(', ')})` };
}

export function sumaVentas(rows) {
  return (rows || []).reduce((a, v) => a + (Number(v.total) || 0), 0);
}

export function sumaGastos(rows) {
  return (rows || []).reduce((a, g) => a + (Number(g.monto) || 0), 0);
}

export function pctCambio(actual, anterior) {
  if (!anterior) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

export function ticketPromedio(rows) {
  const n = (rows || []).length;
  if (!n) return 0;
  return sumaVentas(rows) / n;
}

function montoVentaCierre(row) {
  const d = row?.detalle || {};
  return Number(row?.ventas ?? d.venta ?? d.venta_efectivo ?? d.subtotal ?? 0) || 0;
}

function ventasDesdeCierres(cierres) {
  return (cierres || [])
    .filter((c) => {
      const tipo = String(c?.detalle?.tipo_cierre || '').toLowerCase();
      return tipo !== 'recoleccion' && tipo !== 'recoleccion_temporal';
    })
    .map((c) => ({
      id: c.id,
      total: montoVentaCierre(c),
      created_at: c.created_at,
      sucursal_id: c.sucursal_id,
      folio: c.folio,
      turno: c.turno || c.detalle?.turno_sesion || '',
      origen: 'cierre',
    }))
    .filter((v) => v.total > 0);
}

function resumirMerma(movimientos, inventario, tiendas) {
  const cat = Object.fromEntries((inventario || []).map((p) => [String(p.id), p]));
  const porTienda = {};
  for (const t of tiendas) porTienda[t] = { id: t, label: etiquetaTienda(t), unidades: 0, valor: 0 };

  for (const m of movimientos || []) {
    if (String(m.tipo || '').toLowerCase() !== 'retiro') continue;
    const motivo = `${m.motivo || ''} ${m.modo || ''}`.toLowerCase();
    const esMerma = /merma|faltante|caduc|roto|dano|daño|quebrant|ajuste/.test(motivo)
      || String(m.modo || '').includes('conteo')
      || String(m.modo || '') === 'libre';
    if (!esMerma && !/retiro/.test(String(m.tipo))) {
      // Ya filtramos tipo=retiro; conteos y libre cuentan como merma operativa
    }
    const suc = m.sucursal_id || m.sucursal || m.sucursal_operacion;
    if (!suc || !porTienda[suc]) continue;
    const qty = Math.abs(Number(m.cantidad) || 0);
    const prod = cat[String(m.producto_id)];
    const costo = prod ? costoUnitarioInventario(prod) : 0;
    porTienda[suc].unidades += qty;
    porTienda[suc].valor += qty * costo;
  }

  const list = Object.values(porTienda).filter((r) => r.unidades > 0 || r.valor > 0);
  list.sort((a, b) => b.valor - a.valor);
  const sum = list.reduce((a, x) => a + x.valor, 0) || 1;
  let acum = 0;
  let start = 0;
  return list.map((x, i) => {
    acum += x.valor;
    const pct = (x.valor / sum) * 100;
    const slice = {
      ...x,
      total: x.valor,
      pct,
      acumPct: (acum / sum) * 100,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
      pieStart: start,
      pieEnd: start + pct,
    };
    start += pct;
    return slice;
  });
}

function inventarioResumen(inventario, tiendas) {
  return tiendas.map((suc, i) => {
    const items = inventarioParaSucursal(inventario, suc);
    const res = resumirValorInventario(items);
    return {
      id: suc,
      label: etiquetaTienda(suc),
      total: res.valorCosto || 0,
      skus: res.skus || items.length,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });
}

async function cargarGastosArea(supabase, { desdeDt, hastaDt, sucursal, area }) {
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('id,monto,created_at,sucursal_id,modulo,categoria,subcategoria,comentario,usuario_nombre,estado_aprobacion')
    .eq('modulo', area)
    .gte('created_at', desdeDt.toISOString())
    .lte('created_at', hastaDt.toISOString());
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q.limit(8000);
  if (error) return { data: [], error: error.message };
  return { data: depurarGastos(excluirAlmacenCentral(data || [])), error: null };
}

async function cargarCierresArea(supabase, { desdeDt, hastaDt, sucursal, area }) {
  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select('id,sucursal_id,folio,turno,ventas,caja_actual,created_at,detalle,modulo,usuario_nombre')
    .eq('modulo', area)
    .gte('created_at', desdeDt.toISOString())
    .lte('created_at', hastaDt.toISOString())
    .order('created_at', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q.limit(5000);
  if (error) return { data: [], error: error.message };
  return { data: excluirAlmacenCentral(data || []), error: null };
}

/**
 * Carga datos completos de un área (abarrotes | virtual | garage).
 * Ventas siempre desde cierres de corte. Depura gastos de prueba.
 * Sin filtro de tienda: todas las sucursales operativas.
 */
export async function cargarDatosEstadisticasArea(supabase, {
  area = 'abarrotes',
  desde,
  hasta,
  sucursal,
  inventario = [],
} = {}) {
  if (!supabase) {
    return {
      ventas: [],
      gastos: [],
      cierres: [],
      merma: [],
      inventario: [],
      error: 'Sin conexión',
      avisos: [],
    };
  }

  const desdeAcotado = acotarDesdeOperativo(desde);
  const desdeDt = toDateStart(desdeAcotado);
  const hastaDt = toDateEnd(hasta);
  const tiendas = sucursal ? [sucursal] : tiendasEstadisticas();
  const avisos = [];
  if (desde && desde < FECHA_INICIO_ESTADISTICAS) {
    avisos.push(`Datos desde ${FECHA_INICIO_ESTADISTICAS} (arranque operativo).`);
  }

  const [gastosRes, cierresRes] = await Promise.all([
    cargarGastosArea(supabase, { desdeDt, hastaDt, sucursal, area }),
    cargarCierresArea(supabase, { desdeDt, hastaDt, sucursal, area }),
  ]);

  // Ventas de las 3 áreas salen de cortes_contabilidad_cierres (más completo que POS).
  const ventas = ventasDesdeCierres(cierresRes.data || []);
  const ventasError = cierresRes.error || null;

  let movimientos = [];
  try {
    const movRes = await cargarReporteMovimientosInventario(supabase, {
      desde: desdeAcotado,
      hasta,
      sucursal: sucursal || undefined,
    });
    movimientos = movRes?.movimientos || movRes?.data || [];
    if (sucursal && Array.isArray(movimientos)) {
      movimientos = movimientos.filter((m) => {
        const s = m.sucursal_id || m.sucursal || m.sucursal_operacion;
        return s === sucursal;
      });
    } else if (Array.isArray(movimientos)) {
      const setTiendas = new Set(tiendas);
      movimientos = movimientos.filter((m) => {
        const s = m.sucursal_id || m.sucursal || m.sucursal_operacion;
        return setTiendas.has(s);
      });
    }
  } catch {
    movimientos = [];
  }

  if (!movimientos.length) {
    try {
      let q = supabase
        .from('movimientos_inventario')
        .select('id,tipo,modo,cantidad,producto_id,motivo,sucursal_id,created_at')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .limit(5000);
      if (sucursal) q = q.eq('sucursal_id', sucursal);
      const { data } = await q;
      movimientos = excluirAlmacenCentral(data || []);
    } catch {
      movimientos = [];
    }
  }

  const merma = resumirMerma(movimientos, inventario, tiendas);
  const inv = inventarioResumen(inventario, tiendas);

  if (gastosRes.error) avisos.push(`Gastos: ${gastosRes.error}`);
  if (cierresRes.error) avisos.push(`Cierres: ${cierresRes.error}`);

  return {
    ventas,
    gastos: gastosRes.data || [],
    cierres: cierresRes.data || [],
    merma,
    inventario: inv,
    tiendas,
    area,
    desde: desdeAcotado,
    hasta,
    error: ventasError || null,
    avisos,
    meta: {
      tickets: ventas.length,
      fuenteVentas: 'cortes',
    },
  };
}

/** Compatibilidad con la pantalla anterior (todas las áreas). */
export async function cargarDatosEstadisticas(supabase, { desde, hasta, sucursal }) {
  const res = await cargarDatosEstadisticasArea(supabase, {
    area: 'abarrotes',
    desde,
    hasta,
    sucursal,
  });
  return {
    ventas: res.ventas,
    gastos: res.gastos,
    error: res.error,
    aviso: (res.avisos || []).join(' · ') || null,
  };
}

export function construirInsightCambio(cambio) {
  if (cambio > 5) return { tipo: 'alza', texto: `Incremento de ventas ${cambio.toFixed(1)}% vs periodo anterior`, color: '#27ae60' };
  if (cambio < -5) return { tipo: 'baja', texto: `Descenso de ventas ${Math.abs(cambio).toFixed(1)}% vs periodo anterior`, color: '#c0392b' };
  return { tipo: 'estable', texto: `Ventas estables (${cambio >= 0 ? '+' : ''}${cambio.toFixed(1)}%)`, color: '#7f8c8d' };
}
