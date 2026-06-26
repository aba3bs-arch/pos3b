import { consultarVentas } from './ventasQuery.js';
import { rangoDesdePreset, PRESETS_FECHA_PRODUCTO } from './consultasInventario.js';
import { etiquetaTienda } from '../constants/sucursales.js';

export { PRESETS_FECHA_PRODUCTO, rangoDesdePreset };

export const GRANULARIDAD_OPTS = [
  { id: 'dia', label: 'Por día' },
  { id: 'semana', label: 'Por semana' },
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

function toDateStart(ymd) {
  return new Date(`${ymd}T00:00:00`);
}

function toDateEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999`);
}

export function periodoAnterior(desdeYmd, hastaYmd) {
  const ini = toDateStart(desdeYmd);
  const fin = toDateEnd(hastaYmd);
  const ms = fin.getTime() - ini.getTime() + 1;
  const prevFin = new Date(ini.getTime() - 1);
  const prevIni = new Date(prevFin.getTime() - ms + 1);
  const pad = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { desde: pad(prevIni), hasta: pad(prevFin) };
}

export function bucketKey(iso, gran) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (gran === 'anual') return String(d.getFullYear());
  if (gran === 'mes') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (gran === 'semana') {
    const tmp = new Date(d);
    const day = tmp.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    tmp.setDate(tmp.getDate() + diff);
    const y = tmp.getFullYear();
    const m = String(tmp.getMonth() + 1).padStart(2, '0');
    const dd = String(tmp.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function etiquetaBucket(key, gran) {
  if (!key) return '—';
  if (gran === 'anual') return key;
  if (gran === 'mes') {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const [y, m] = key.split('-');
    return `${meses[Number(m) - 1]} ${y}`;
  }
  if (gran === 'semana') return `Sem ${key.slice(5)}`;
  return key.slice(5);
}

export function agruparVentasPorPeriodo(rows, gran) {
  const map = {};
  for (const v of rows || []) {
    const k = bucketKey(v.created_at, gran);
    if (!k) continue;
    map[k] = (map[k] || 0) + (Number(v.total) || 0);
  }
  return Object.keys(map)
    .sort()
    .map((k) => ({ key: k, label: etiquetaBucket(k, gran), total: map[k] }));
}

export function combinarSeriesComparacion(actual, anterior) {
  const keys = [...new Set([...actual.map((x) => x.key), ...anterior.map((x) => x.key)])].sort();
  const mapA = Object.fromEntries(actual.map((x) => [x.key, x]));
  const mapB = Object.fromEntries(anterior.map((x) => [x.key, x]));
  const max = Math.max(...keys.map((k) => Math.max(mapA[k]?.total || 0, mapB[k]?.total || 0)), 1);
  return keys.map((k) => ({
    key: k,
    label: mapA[k]?.label || mapB[k]?.label || etiquetaBucket(k, 'dia'),
    actual: mapA[k]?.total || 0,
    anterior: mapB[k]?.total || 0,
    pctActual: ((mapA[k]?.total || 0) / max) * 100,
    pctAnterior: ((mapB[k]?.total || 0) / max) * 100,
  }));
}

export function agruparVentasPorTienda(rows) {
  const map = {};
  for (const v of rows || []) {
    const t = v.sucursal_id || 'MAIN';
    map[t] = (map[t] || 0) + (Number(v.total) || 0);
  }
  const list = Object.entries(map).map(([id, total]) => ({ id, label: etiquetaTienda(id), total }));
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

export async function cargarDatosEstadisticas(supabase, { desde, hasta, sucursal }) {
  if (!supabase) return { ventas: [], gastos: [], error: 'Sin conexión' };
  const desdeDt = toDateStart(desde);
  const hastaDt = toDateEnd(hasta);

  const ventasRes = await consultarVentas(supabase, {
    columns: 'total,created_at,sucursal_id',
    desde: desdeDt,
    hasta: hastaDt,
    sucursal: sucursal || null,
    limit: 5000,
    orderAsc: true,
  });

  let gastos = [];
  let gastosError = null;
  try {
    let q = supabase
      .from('cortes_contabilidad_gastos')
      .select('monto,created_at,sucursal_id,modulo')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString());
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    const { data, error } = await q.limit(3000);
    if (error) gastosError = error.message;
    else gastos = data || [];
  } catch (e) {
    gastosError = String(e.message || e);
  }

  return {
    ventas: ventasRes.data || [],
    gastos,
    error: ventasRes.error || gastosError || null,
    aviso: ventasRes.aviso,
  };
}
