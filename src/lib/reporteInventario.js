import { etiquetaTienda, listarSucursales, normalizarCodigoTienda } from '../constants/sucursales.js';
import { leerAjustesInventario } from './conteoDepartamento.js';
import { bucketKey, etiquetaBucket, COLORES_TIENDA } from './estadisticasData.js';
import { toYmd } from './fechas.js';
import { costoUnitarioInventario } from './valorInventario.js';

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
  return Number(ajuste?.resumen?.piezasExistencia) || 0;
}

function etiquetaDeptoAjuste(raw) {
  const d = String(raw || '').trim();
  if (!d) return '—';
  if (/^libre$/i.test(d)) return 'Ajuste libre';
  return d;
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
    departamento: etiquetaDeptoAjuste(ajuste?.departamento),
    auditor: ajuste?.usuario || '—',
    created_at: iso,
    fecha: fmtFecha(iso),
    hora: fmtHora(iso),
    inventarioOperativo: operativo,
    merma,
    pctMerma: Math.round(pctMerma * 100) / 100,
    piezasFaltantes: Number(ajuste?.resumen?.piezasFaltantes) || 0,
    origen: ajuste?.origen || 'local',
  };
}

function folioDesdeMovimiento(m) {
  const meta = m?.meta && typeof m.meta === 'object' ? m.meta : {};
  if (meta.folio) return String(meta.folio);
  const mot = String(m?.motivo || '');
  const hit = mot.match(/AJU-\d{8}-\d+/i);
  return hit ? hit[0].toUpperCase() : null;
}

function mapaCostoPorProducto(inventario) {
  const map = new Map();
  for (const p of inventario || []) {
    map.set(String(p.id), costoUnitarioInventario(p));
  }
  return map;
}

/** Agrupa movimientos nube de conteo en “ajustes” por folio. */
export function ajustesDesdeMovimientosConteo(movimientos, { inventario = [] } = {}) {
  const costos = mapaCostoPorProducto(inventario);
  const map = new Map();

  for (const m of movimientos || []) {
    const modo = String(m.modo || '');
    if (modo !== 'conteo_departamento' && modo !== 'conteo' && modo !== 'libre') continue;
    const folio = folioDesdeMovimiento(m) || `SIN-FOLIO-${m.id}`;
    const suc = normalizarCodigoTienda(m.sucursal_id || m.sucursal) || '—';
    if (!map.has(folio)) {
      map.set(folio, {
        id: `nube_${folio}`,
        folio,
        departamento: m.departamento || '—',
        sucursal: suc,
        usuario: m.usuario || '—',
        created_at: m.created_at,
        origen: 'nube',
        lineas: [],
        resumen: {
          valorFaltante: 0,
          valorSobrante: 0,
          piezasFaltantes: 0,
          piezasSobrantes: 0,
          piezasExistencia: 0,
        },
      });
    }
    const aj = map.get(folio);
    if (new Date(m.created_at || 0) > new Date(aj.created_at || 0)) {
      aj.created_at = m.created_at;
      if (m.usuario) aj.usuario = m.usuario;
    }
    if (m.departamento && (!aj.departamento || aj.departamento === '—')) {
      aj.departamento = m.departamento;
    }
    if (suc && suc !== '—' && (aj.sucursal === '—' || !aj.sucursal)) aj.sucursal = suc;

    const antes = Number(m.stock_antes);
    const despues = Number(m.stock_despues);
    const existencia = Number.isFinite(antes) ? Math.max(0, antes) : 0;
    const contada = Number.isFinite(despues) ? Math.max(0, despues) : existencia;
    const diferencia = Number.isFinite(antes) && Number.isFinite(despues) ? despues - antes : 0;
    const costo = costos.get(String(m.producto_id)) || 0;

    aj.lineas.push({
      codigo: m.producto_id,
      nombre: m.producto_nombre,
      existencia,
      contada,
      diferencia,
      costoUnitario: costo,
      valorDiferencia: Math.abs(diferencia) * costo,
    });
    aj.resumen.piezasExistencia += existencia;
    if (diferencia < 0) {
      aj.resumen.piezasFaltantes += Math.abs(diferencia);
      aj.resumen.valorFaltante += Math.abs(diferencia) * costo;
    } else if (diferencia > 0) {
      aj.resumen.piezasSobrantes += diferencia;
      aj.resumen.valorSobrante += diferencia * costo;
    }
  }

  return [...map.values()].map((aj) => ({
    ...aj,
    resumen: {
      ...aj.resumen,
      valorFaltante: Math.round(aj.resumen.valorFaltante * 100) / 100,
      valorSobrante: Math.round(aj.resumen.valorSobrante * 100) / 100,
    },
  }));
}

async function listarMovimientosConteoNube(supabase, { desdeYmd, hastaYmd } = {}) {
  if (!supabase) return { data: [], error: null };
  const ini = new Date(`${desdeYmd}T00:00:00`);
  const fin = new Date(`${hastaYmd}T23:59:59.999`);
  const iniIso = new Date(ini.getTime() - 12 * 3600e3).toISOString();
  const finIso = new Date(fin.getTime() + 12 * 3600e3).toISOString();
  const { data, error } = await supabase
    .from('movimientos_inventario')
    .select(
      'id,tipo,modo,producto_id,producto_nombre,cantidad,stock_antes,stock_despues,departamento,motivo,usuario,sucursal_id,meta,created_at',
    )
    .eq('modo', 'conteo_departamento')
    .gte('created_at', iniIso)
    .lte('created_at', finIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return { data: [], error: error.message };
  return {
    data: (data || []).filter((m) => enRangoIso(m.created_at, desdeYmd, hastaYmd)),
    error: null,
  };
}

function mergeAjustesPorFolio(locales, nube) {
  const map = new Map();
  for (const a of nube || []) {
    const key = String(a.folio || a.id);
    map.set(key, a);
  }
  for (const a of locales || []) {
    const key = String(a.folio || a.id);
    map.set(key, { ...a, origen: a.origen || 'local' });
  }
  return [...map.values()];
}

/**
 * Filas del reporte filtradas por periodo y opcionalmente tienda (solo local).
 * Preferir {@link cargarFilasReporteInventarioAsync} cuando haya Supabase.
 */
export function cargarFilasReporteInventario(opts = {}) {
  const { preset = 'mes', desde, hasta, sucursal = '' } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const locales = leerAjustesInventario().filter((a) => enRangoIso(a.created_at, rango.desde, rango.hasta));
  const filas = [];
  for (const a of locales) {
    const sid = normalizarCodigoTienda(a.sucursal);
    if (sucFiltro && sid !== sucFiltro) continue;
    filas.push(filaDesdeAjuste(a));
  }
  filas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return { filas, rango, aviso: null };
}

/**
 * Igual que el sync, pero también lee conteos desde movimientos_inventario (nube).
 */
export async function cargarFilasReporteInventarioAsync(opts = {}) {
  const { supabase = null, inventario = [], preset = 'mes', desde, hasta, sucursal = '' } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const locales = leerAjustesInventario().filter((a) => enRangoIso(a.created_at, rango.desde, rango.hasta));

  let aviso = null;
  let nubeAjustes = [];
  if (supabase) {
    const { data, error } = await listarMovimientosConteoNube(supabase, {
      desdeYmd: rango.desde,
      hastaYmd: rango.hasta,
    });
    if (error) aviso = `Nube: ${error}`;
    else nubeAjustes = ajustesDesdeMovimientosConteo(data, { inventario });
  }

  const ajustes = mergeAjustesPorFolio(locales, nubeAjustes);
  const filas = [];
  for (const a of ajustes) {
    const sid = normalizarCodigoTienda(a.sucursal);
    if (sucFiltro && sid !== sucFiltro) continue;
    filas.push(filaDesdeAjuste(a));
  }
  filas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return { filas, rango, aviso };
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
    { label: 'origen', value: (r) => r.origen || '' },
  ];
}
