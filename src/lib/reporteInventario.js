import { etiquetaTienda, listarSucursales, normalizarCodigoTienda } from '../constants/sucursales.js';
import { leerAjustesInventario } from './conteoDepartamento.js';
import { bucketKey, etiquetaBucket, COLORES_TIENDA } from './estadisticasData.js';
import { toYmd } from './fechas.js';

/** Filtros rápidos del reporte de inventario. */
export const PRESETS_REPORTE_INVENTARIO = [
  { id: 'hoy', label: 'Día (hoy)' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' },
  { id: 'rango', label: 'Rango de fechas' },
];

function padYmd(d) {
  return toYmd(d);
}

/** Rango YMD según preset del reporte. */
export function rangoReporteInventario(preset, desdeCustom, hastaCustom) {
  const hoy = new Date();
  const hasta = padYmd(hoy);
  if (preset === 'hoy') return { desde: hasta, hasta };
  if (preset === 'semana') {
    const d = new Date(hoy);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return { desde: padYmd(d), hasta };
  }
  if (preset === 'mes') {
    return { desde: padYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  }
  if (preset === 'anio') {
    return { desde: `${hoy.getFullYear()}-01-01`, hasta };
  }
  if (preset === 'rango' && desdeCustom && hastaCustom) {
    return { desde: desdeCustom, hasta: hastaCustom };
  }
  return { desde: padYmd(new Date(hoy.getTime() - 30 * 864e5)), hasta };
}

function enRangoIso(iso, desdeYmd, hastaYmd) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const ini = new Date(`${desdeYmd}T00:00:00`).getTime();
  const fin = new Date(`${hastaYmd}T23:59:59.999`).getTime();
  return t >= ini && t <= fin;
}

function fmtFecha(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function fmtHora(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export function fmtMxnReporte(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export function fmtPctReporte(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)}%`;
}

/**
 * Valor del inventario operativo al momento del conteo (existencia × costo).
 * Si no hay líneas, usa piezas × estimado 0.
 */
function inventarioOperativoDeAjuste(ajuste) {
  const lineas = ajuste?.lineas || [];
  let valor = 0;
  for (const l of lineas) {
    const existencia = Math.max(0, Number(l.existencia) || 0);
    const costo = Number(l.costoUnitario) || 0;
    valor += existencia * costo;
  }
  if (valor > 0) return Math.round(valor * 100) / 100;
  // Fallback: piezas de existencia (sin valorizar)
  return Number(ajuste?.resumen?.piezasExistencia) || 0;
}

/** Una fila de reporte a partir de un ajuste guardado. */
export function filaDesdeAjuste(ajuste) {
  const merma = Number(ajuste?.resumen?.valorFaltante) || 0;
  const operativo = inventarioOperativoDeAjuste(ajuste);
  const pctMerma = operativo > 0 ? (merma / operativo) * 100 : merma > 0 ? 100 : 0;
  const iso = ajuste?.created_at || null;
  const suc = normalizarCodigoTienda(ajuste?.sucursal) || '—';
  return {
    id: ajuste?.id || ajuste?.folio || `${suc}-${iso}`,
    folio: ajuste?.folio || '—',
    sucursal: suc,
    tienda: etiquetaTienda(suc),
    departamento: ajuste?.departamento || '—',
    auditor: ajuste?.usuario || '—',
    created_at: iso,
    fecha: fmtFecha(iso),
    hora: fmtHora(iso),
    inventarioOperativo: operativo,
    merma,
    pctMerma: Math.round(pctMerma * 100) / 100,
    piezasFaltantes: Number(ajuste?.resumen?.piezasFaltantes) || 0,
  };
}

/**
 * Filas del reporte filtradas por periodo y opcionalmente tienda.
 * @param {{ preset?: string, desde?: string, hasta?: string, sucursal?: string|null }} opts
 */
export function cargarFilasReporteInventario(opts = {}) {
  const { preset = 'mes', desde, hasta, sucursal = '' } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const ajustes = leerAjustesInventario();
  const filas = [];
  for (const a of ajustes) {
    if (!enRangoIso(a.created_at, rango.desde, rango.hasta)) continue;
    const sid = normalizarCodigoTienda(a.sucursal);
    if (sucFiltro && sid !== sucFiltro) continue;
    filas.push(filaDesdeAjuste(a));
  }
  filas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return { filas, rango };
}

export function totalesReporteInventario(filas = []) {
  let operativo = 0;
  let merma = 0;
  for (const f of filas) {
    operativo += Number(f.inventarioOperativo) || 0;
    merma += Number(f.merma) || 0;
  }
  const pct = operativo > 0 ? (merma / operativo) * 100 : merma > 0 ? 100 : 0;
  return {
    conteos: filas.length,
    inventarioOperativo: Math.round(operativo * 100) / 100,
    merma: Math.round(merma * 100) / 100,
    pctMerma: Math.round(pct * 100) / 100,
  };
}

/**
 * Pareto de merma agrupado por semana (ordenado mayor → menor).
 * También serie cronológica para ver comportamiento.
 */
export function paretoMermaPorSemana(filas = []) {
  const map = {};
  for (const f of filas) {
    const k = bucketKey(f.created_at, 'semana');
    if (!k) continue;
    if (!map[k]) map[k] = { key: k, merma: 0, operativo: 0, conteos: 0 };
    map[k].merma += Number(f.merma) || 0;
    map[k].operativo += Number(f.inventarioOperativo) || 0;
    map[k].conteos += 1;
  }

  const cronologico = Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((x) => ({
      ...x,
      label: etiquetaBucket(x.key, 'semana'),
      pctMerma: x.operativo > 0 ? (x.merma / x.operativo) * 100 : x.merma > 0 ? 100 : 0,
    }));

  const porValor = [...cronologico].sort((a, b) => b.merma - a.merma);
  const sum = porValor.reduce((a, x) => a + x.merma, 0) || 1;
  let acum = 0;
  const pareto = porValor.map((x, i) => {
    acum += x.merma;
    return {
      ...x,
      pct: (x.merma / sum) * 100,
      acumPct: (acum / sum) * 100,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });

  return { pareto, cronologico };
}

export function tiendasParaFiltroInventario(sucursalActual) {
  const set = new Set(listarSucursales());
  const cur = normalizarCodigoTienda(sucursalActual);
  if (cur) set.add(cur);
  for (const a of leerAjustesInventario()) {
    const s = normalizarCodigoTienda(a.sucursal);
    if (s) set.add(s);
  }
  return [...set].sort();
}

export function columnasCsvInventario() {
  return [
    { label: 'folio', value: (r) => r.folio },
    { label: 'tienda', value: (r) => r.sucursal },
    { label: 'fecha', value: (r) => r.fecha },
    { label: 'hora', value: (r) => r.hora },
    { label: 'auditor', value: (r) => r.auditor },
    { label: 'departamento', value: (r) => r.departamento },
    { label: 'inventario_operativo', value: (r) => r.inventarioOperativo },
    { label: 'merma', value: (r) => r.merma },
    { label: 'pct_merma', value: (r) => r.pctMerma },
    { label: 'piezas_faltantes', value: (r) => r.piezasFaltantes },
  ];
}
