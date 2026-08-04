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

/** Una fila de detalle por producto dentro de un conteo aplicado. */
export function lineaProductoReporte(ajuste, linea, preciosMap = new Map()) {
  const teorico = Math.max(0, Number(linea.existencia) || 0);
  const contadoRaw = linea.contada ?? linea.contadaNum;
  const contado =
    contadoRaw != null && contadoRaw !== '' && !Number.isNaN(Number(contadoRaw))
      ? Math.max(0, Number(contadoRaw))
      : null;
  const diferencia =
    linea.diferencia != null && linea.diferencia !== '' && !Number.isNaN(Number(linea.diferencia))
      ? Number(linea.diferencia)
      : contado != null
        ? contado - teorico
        : null;
  const codigo = String(linea.codigo || linea.productoId || '—');
  const precio =
    Number(linea.precioVenta) ||
    preciosMap.get(codigo) ||
    (diferencia && diferencia !== 0 && linea.valorDiferencia
      ? Number(linea.valorDiferencia) / Math.abs(diferencia)
      : 0);
  const valorTeorico = Math.round(teorico * precio * 100) / 100;
  let valorDiferencia = Number(linea.valorDiferencia) || 0;
  if (!valorDiferencia && diferencia != null && diferencia !== 0) {
    valorDiferencia = Math.round(Math.abs(diferencia) * precio * 100) / 100;
  }
  const pctMerma =
    diferencia != null && diferencia < 0 && valorTeorico > 0
      ? Math.round((valorDiferencia / valorTeorico) * 10000) / 100
      : 0;

  const suc = normalizarCodigoTienda(ajuste.sucursal) || '—';
  return {
    id: `${ajuste.folio || ajuste.id}_${codigo}`,
    codigo,
    nombre: linea.nombre || '—',
    teorico,
    contado,
    diferencia,
    pctMerma,
    valorDiferencia,
    valorTeorico,
    folio: ajuste.folio || '—',
    sucursal: suc,
    tienda: etiquetaTienda(suc),
    departamento: etiquetaDeptoAjuste(ajuste.departamento),
    fecha: fmtFecha(ajuste.created_at),
    hora: fmtHora(ajuste.created_at),
    created_at: ajuste.created_at,
    auditor: ajuste.usuario || '—',
  };
}

/** Aplana líneas de producto con diferencia distinta de cero. */
export function lineasProductoDesdeAjustes(ajustes, { inventario = [], sucFiltro = '' } = {}) {
  const precios = mapaPrecioPorProducto(inventario);
  const out = [];
  for (const a of ajustes || []) {
    const sid = normalizarCodigoTienda(a.sucursal);
    if (sucFiltro && sid !== sucFiltro) continue;
    for (const l of a.lineas || []) {
      const row = lineaProductoReporte(a, l, precios);
      if (row.diferencia == null || row.diferencia === 0) continue;
      out.push(row);
    }
  }
  out.sort(
    (a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      String(a.codigo).localeCompare(String(b.codigo), 'es'),
  );
  return out;
}

export function totalesLineasProducto(lineas = []) {
  let valorTeorico = 0;
  let valorFaltante = 0;
  let valorSobrante = 0;
  let negativos = 0;
  let positivos = 0;
  for (const l of lineas) {
    valorTeorico += Number(l.valorTeorico) || 0;
    if (Number(l.diferencia) < 0) {
      valorFaltante += Number(l.valorDiferencia) || 0;
      negativos += 1;
    } else if (Number(l.diferencia) > 0) {
      valorSobrante += Number(l.valorDiferencia) || 0;
      positivos += 1;
    }
  }
  const pctMerma = valorTeorico > 0 ? (valorFaltante / valorTeorico) * 100 : valorFaltante > 0 ? 100 : 0;
  return {
    articulos: lineas.length,
    negativos,
    positivos,
    valorTeorico: Math.round(valorTeorico * 100) / 100,
    valorFaltante: Math.round(valorFaltante * 100) / 100,
    valorSobrante: Math.round(valorSobrante * 100) / 100,
    pctMerma: Math.round(pctMerma * 100) / 100,
  };
}

export function columnasImprimirProductoInventario() {
  return [
    { label: 'Código', key: 'codigo' },
    { label: 'Producto', key: 'nombre' },
    { label: 'Inv. teórico', key: 'teorico', align: 'right' },
    { label: 'Contado', key: 'contado', align: 'right', fmt: (r) => (r.contado == null ? '—' : r.contado) },
    {
      label: 'Diferencia',
      key: 'diferencia',
      align: 'right',
      fmt: (r) => (r.diferencia > 0 ? `+${r.diferencia}` : String(r.diferencia)),
    },
    {
      label: '% merma',
      key: 'pctMerma',
      align: 'right',
      fmt: (r) => (Number(r.diferencia) < 0 ? fmtPctReporte(r.pctMerma) : '—'),
    },
  ];
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

function mapaPrecioPorProducto(inventario) {
  const map = new Map();
  for (const p of inventario || []) {
    map.set(String(p.id), Number(p.precio) || 0);
  }
  return map;
}

/** Agrupa movimientos nube de conteo en “ajustes” por folio. */
export function ajustesDesdeMovimientosConteo(movimientos, { inventario = [] } = {}) {
  const costos = mapaCostoPorProducto(inventario);
  const precios = mapaPrecioPorProducto(inventario);
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
    const precio = precios.get(String(m.producto_id)) || 0;

    aj.lineas.push({
      codigo: m.producto_id,
      nombre: m.producto_nombre,
      existencia,
      contada,
      diferencia,
      costoUnitario: costo,
      precioVenta: precio,
      valorDiferencia: Math.abs(diferencia) * precio,
    });
    aj.resumen.piezasExistencia += existencia;
    if (diferencia < 0) {
      aj.resumen.piezasFaltantes += Math.abs(diferencia);
      aj.resumen.valorFaltante += Math.abs(diferencia) * precio;
    } else if (diferencia > 0) {
      aj.resumen.piezasSobrantes += diferencia;
      aj.resumen.valorSobrante += diferencia * precio;
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
    .in('modo', ['conteo_departamento', 'libre', 'conteo'])
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
  const { preset = 'mes', desde, hasta, sucursal = '', inventario = [] } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const locales = leerAjustesInventario().filter((a) => enRangoIso(a.created_at, rango.desde, rango.hasta));
  const lineasProducto = lineasProductoDesdeAjustes(locales, { inventario, sucFiltro });
  return { lineasProducto, rango, aviso: null };
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
  const lineasProducto = lineasProductoDesdeAjustes(ajustes, { inventario, sucFiltro });
  return { lineasProducto, rango, aviso };
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

export function tiendasParaFiltroInventario(sucursalActual, sucursalesLista = null) {
  const set = new Set();
  const catalogo = Array.isArray(sucursalesLista) && sucursalesLista.length
    ? sucursalesLista
    : listarSucursales();
  for (const s of catalogo) {
    const n = normalizarCodigoTienda(s);
    if (n) set.add(n);
  }
  const cur = normalizarCodigoTienda(sucursalActual);
  if (cur) set.add(cur);
  for (const a of leerAjustesInventario()) {
    const s = normalizarCodigoTienda(a.sucursal);
    if (s) set.add(s);
  }
  // Orden: operativas numéricas / código, MAIN al final.
  return [...set].sort((a, b) => {
    if (a === 'MAIN') return 1;
    if (b === 'MAIN') return -1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
}

/** Una fila por tienda del catálogo (incluye ceros si no hubo conteo). */
export function resumenPorTiendaReporte(filas = [], tiendasCatalogo = []) {
  const map = new Map();
  for (const s of tiendasCatalogo || []) {
    const suc = normalizarCodigoTienda(s);
    if (!suc) continue;
    map.set(suc, {
      sucursal: suc,
      tienda: etiquetaTienda(suc),
      conteos: 0,
      merma: 0,
      inventarioOperativo: 0,
      piezasFaltantes: 0,
    });
  }
  for (const f of filas || []) {
    const suc = normalizarCodigoTienda(f.sucursal);
    if (!suc || suc === '—') continue;
    if (!map.has(suc)) {
      map.set(suc, {
        sucursal: suc,
        tienda: etiquetaTienda(suc),
        conteos: 0,
        merma: 0,
        inventarioOperativo: 0,
        piezasFaltantes: 0,
      });
    }
    const row = map.get(suc);
    row.conteos += 1;
    row.merma += Number(f.merma) || 0;
    row.inventarioOperativo += Number(f.inventarioOperativo) || 0;
    row.piezasFaltantes += Number(f.piezasFaltantes) || 0;
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      merma: Math.round(r.merma * 100) / 100,
      inventarioOperativo: Math.round(r.inventarioOperativo * 100) / 100,
      pctMerma:
        r.inventarioOperativo > 0
          ? Math.round((r.merma / r.inventarioOperativo) * 10000) / 100
          : r.merma > 0
            ? 100
            : 0,
    }))
    .sort((a, b) => {
      if (a.sucursal === 'MAIN') return 1;
      if (b.sucursal === 'MAIN') return -1;
      return a.sucursal.localeCompare(b.sucursal, 'es', { numeric: true });
    });
}

export function columnasCsvInventario() {
  return [
    { label: 'codigo', value: (r) => r.codigo },
    { label: 'producto', value: (r) => r.nombre },
    { label: 'inv_teorico', value: (r) => r.teorico },
    { label: 'contado', value: (r) => r.contado ?? '' },
    { label: 'diferencia', value: (r) => r.diferencia },
    { label: 'pct_merma', value: (r) => (Number(r.diferencia) < 0 ? r.pctMerma : '') },
    { label: 'valor_diferencia', value: (r) => r.valorDiferencia },
    { label: 'tienda', value: (r) => r.sucursal },
    { label: 'folio', value: (r) => r.folio },
    { label: 'fecha', value: (r) => r.fecha },
    { label: 'departamento', value: (r) => r.departamento },
  ];
}
