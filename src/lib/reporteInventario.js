import { etiquetaTienda, listarSucursales, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  claveCorreccionLinea,
  corregirLineaConteoInventario,
  leerAjustesInventario,
  leerCorreccionesLineasInventario,
} from './conteoDepartamento.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from './departamentos.js';
import { bucketKey, etiquetaBucket, COLORES_TIENDA } from './estadisticasData.js';
import { toYmd } from './fechas.js';
import { inventarioParaSucursal } from './inventarioMultitienda.js';
import { costoUnitarioInventario, resumirValorInventario } from './valorInventario.js';

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

function mapaPrecioPorProducto(inventario) {
  const map = new Map();
  for (const p of inventario || []) {
    map.set(String(p.id), Number(p.precio) || 0);
  }
  return map;
}

function mapaDepartamentoPorProducto(inventario) {
  const map = new Map();
  for (const p of inventario || []) {
    map.set(String(p.id), normalizarDepartamento(p.cat || 'GENERAL'));
  }
  return map;
}

function departamentoLineaReporte(ajuste, codigo, deptMap = new Map()) {
  const deptAjuste = String(ajuste?.departamento || '').trim();
  const esLibre = /^libre$/i.test(deptAjuste) || /^ajuste libre$/i.test(deptAjuste);
  const deptProducto = deptMap.get(String(codigo)) || 'GENERAL';
  const key = esLibre ? deptProducto : normalizarDepartamento(deptAjuste) || deptProducto || 'GENERAL';
  return { departamentoKey: key, departamento: etiquetaDepartamento(key) };
}

/** Una fila de detalle por producto dentro de un conteo aplicado. */
export function lineaProductoReporte(ajuste, linea, preciosMap = new Map(), deptMap = new Map()) {
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
  const { departamentoKey, departamento } = departamentoLineaReporte(ajuste, codigo, deptMap);
  const numeroAjuste = ajuste.folio || '—';
  return {
    id: `${numeroAjuste}_${codigo}`,
    codigo,
    nombre: linea.nombre || '—',
    teorico,
    contado,
    diferencia,
    pctMerma,
    valorDiferencia,
    valorTeorico,
    precioVenta: precio,
    folio: numeroAjuste,
    numeroAjuste,
    departamentoKey,
    departamento,
    sucursal: suc,
    tienda: etiquetaTienda(suc),
    fecha: fmtFecha(ajuste.created_at),
    hora: fmtHora(ajuste.created_at),
    created_at: ajuste.created_at,
    auditor: ajuste.usuario || '—',
  };
}

/** Todas las líneas contadas de los ajustes (incluye diferencia cero). */
export function lineasProductoDesdeAjustes(
  ajustes,
  { inventario = [], sucFiltro = '', deptFiltro = '', deduplicar = false } = {},
) {
  const precios = mapaPrecioPorProducto(inventario);
  const deptos = mapaDepartamentoPorProducto(inventario);
  const out = [];
  for (const a of ajustes || []) {
    const sid = normalizarCodigoTienda(a.sucursal);
    if (sucFiltro && sid !== sucFiltro) continue;
    for (const l of a.lineas || []) {
      const row = lineaProductoReporte(a, l, precios, deptos);
      if (row.contado == null && !row.nombre) continue;
      if (deptFiltro && row.departamentoKey !== deptFiltro) continue;
      out.push(row);
    }
  }
  out.sort(
    (a, b) =>
      a.departamentoKey.localeCompare(b.departamentoKey, 'es') ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      String(a.numeroAjuste).localeCompare(String(b.numeroAjuste)) ||
      String(a.codigo).localeCompare(String(b.codigo), 'es'),
  );
  return deduplicar ? deduplicarLineasConteo(out) : out;
}

/** Aplica correcciones guardadas en este equipo sobre las líneas del reporte. */
export function aplicarCorreccionesGuardadasALineas(lineas = [], inventario = []) {
  const map = leerCorreccionesLineasInventario();
  if (!Object.keys(map).length) return lineas;
  const precios = mapaPrecioPorProducto(inventario);
  const deptos = mapaDepartamentoPorProducto(inventario);
  return lineas.map((l) => {
    const key = claveCorreccionLinea(l.numeroAjuste, l.sucursal, l.codigo);
    const c = map[key];
    if (!c) return l;
    const ajusteFake = {
      folio: l.numeroAjuste,
      sucursal: l.sucursal,
      departamento: l.departamentoKey,
      created_at: l.created_at,
      usuario: c.corregido_por || l.auditor,
    };
    return {
      ...lineaProductoReporte(ajusteFake, c, precios, deptos),
      corregido: true,
      corregido_at: c.updated_at,
      folio_correccion: c.folio_correccion,
      nota_correccion: c.nota || '',
    };
  });
}

/** Corrige cantidad contada desde el reporte y devuelve la fila actualizada. */
export async function corregirLineaReporteInventario(supabase, opts = {}) {
  const { linea, nuevaContada, usuario, nota, inventario = [] } = opts;
  const r = await corregirLineaConteoInventario(supabase, { linea, nuevaContada, usuario, nota, sucursal: linea?.sucursal });
  if (!r.ok) return r;
  const precios = mapaPrecioPorProducto(inventario);
  const deptos = mapaDepartamentoPorProducto(inventario);
  const ajusteFake = {
    folio: linea.numeroAjuste,
    sucursal: r.sucursal,
    departamento: r.departamento,
    created_at: r.created_at,
    usuario: usuario || '—',
  };
  return {
    ...r,
    linea: {
      ...lineaProductoReporte(ajusteFake, r.lineaPatch, precios, deptos),
      corregido: true,
      corregido_at: new Date().toISOString(),
      folio_correccion: r.folio,
      nota_correccion: nota || '',
    },
  };
}

/**
 * Un SKU por tienda: conserva el conteo más reciente (evita duplicar al recontar).
 */
export function deduplicarLineasConteo(lineas = []) {
  const map = new Map();
  for (const l of lineas) {
    const key = `${normalizarCodigoTienda(l.sucursal) || '—'}_${String(l.codigo)}`;
    const prev = map.get(key);
    if (!prev || String(l.created_at || '').localeCompare(String(prev.created_at || '')) > 0) {
      map.set(key, l);
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      a.departamentoKey.localeCompare(b.departamentoKey, 'es') ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      String(a.numeroAjuste).localeCompare(String(b.numeroAjuste)) ||
      String(a.codigo).localeCompare(String(b.codigo), 'es'),
  );
}

/** Agrupa líneas del reporte por departamento con totales y folios. */
export function agruparReportePorDepartamento(lineas = []) {
  const map = new Map();
  for (const l of lineas) {
    const key = l.departamentoKey || 'GENERAL';
    if (!map.has(key)) {
      map.set(key, {
        departamentoKey: key,
        departamento: l.departamento || etiquetaDepartamento(key),
        lineas: [],
        folios: new Set(),
      });
    }
    const g = map.get(key);
    g.lineas.push(l);
    if (l.numeroAjuste && l.numeroAjuste !== '—') g.folios.add(l.numeroAjuste);
  }
  return [...map.values()]
    .map((g) => ({
      departamentoKey: g.departamentoKey,
      departamento: g.departamento,
      lineas: g.lineas,
      folios: [...g.folios].sort(),
      totales: totalesLineasProducto(g.lineas),
    }))
    .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es'));
}

export function foliosDesdeAjustes(ajustes = []) {
  return [...new Set(ajustes.map((a) => a.folio).filter(Boolean))].sort();
}

export function totalesLineasProducto(lineas = []) {
  let valorTeoricoContado = 0;
  let valorContado = 0;
  let valorFaltante = 0;
  let valorSobrante = 0;
  let piezasTeoricas = 0;
  let piezasContadas = 0;
  let piezasFaltantes = 0;
  let piezasSobrantes = 0;
  let negativos = 0;
  let positivos = 0;
  for (const l of lineas) {
    const teorico = Number(l.teorico) || 0;
    const contado = l.contado != null ? Number(l.contado) : null;
    const dif = Number(l.diferencia);
    valorTeoricoContado += Number(l.valorTeorico) || 0;
    if (contado != null) {
      piezasTeoricas += teorico;
      piezasContadas += contado;
      valorContado += contado * (Number(l.precioVenta) || (teorico > 0 ? (Number(l.valorTeorico) || 0) / teorico : 0));
    }
    if (dif < 0) {
      valorFaltante += Number(l.valorDiferencia) || 0;
      piezasFaltantes += Math.abs(dif);
      negativos += 1;
    } else if (dif > 0) {
      valorSobrante += Number(l.valorDiferencia) || 0;
      piezasSobrantes += dif;
      positivos += 1;
    }
  }
  const pctMerma =
    valorTeoricoContado > 0 ? (valorFaltante / valorTeoricoContado) * 100 : valorFaltante > 0 ? 100 : 0;
  const folios = new Set(lineas.map((l) => l.numeroAjuste).filter((f) => f && f !== '—'));
  const skusUnicos = deduplicarLineasConteo(lineas).length;
  return {
    articulos: lineas.length,
    skusUnicos,
    negativos,
    positivos,
    sinDiferencia: lineas.length - negativos - positivos,
    ajustes: folios.size,
    /** Suma teórica solo de SKUs ya contados (no es el inventario total de tienda). */
    valorTeoricoContado: Math.round(valorTeoricoContado * 100) / 100,
    /** Alias legacy usado en CSV/impresión. */
    valorTeorico: Math.round(valorTeoricoContado * 100) / 100,
    valorContado: Math.round(valorContado * 100) / 100,
    valorFaltante: Math.round(valorFaltante * 100) / 100,
    valorSobrante: Math.round(valorSobrante * 100) / 100,
    piezasTeoricas,
    piezasContadas,
    piezasFaltantes,
    piezasSobrantes,
    pctMerma: Math.round(pctMerma * 100) / 100,
  };
}

/** Valor de inventario en sistema para la tienda filtrada (referencia vs lo contado). */
export function referenciaInventarioReporte(inventarioCompleto = [], sucursal = '', deptFiltro = '') {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc || !Array.isArray(inventarioCompleto) || !inventarioCompleto.length) {
    return {
      sucursal: suc || '',
      valorSistema: 0,
      piezasSistema: 0,
      skusConStock: 0,
      pctCoberturaValor: null,
      pctCoberturaSkus: null,
    };
  }
  let items = inventarioParaSucursal(inventarioCompleto, suc);
  if (deptFiltro) {
    const dept = normalizarDepartamento(deptFiltro);
    items = items.filter((p) => normalizarDepartamento(p.cat) === dept);
  }
  const res = resumirValorInventario(items);
  return {
    sucursal: suc,
    valorSistema: res.valorVenta,
    piezasSistema: res.unidades,
    skusConStock: res.skusConStock,
    skusSinPrecio: res.skusSinPrecio,
    pctCoberturaValor: null,
    pctCoberturaSkus: null,
  };
}

export function enriquecerTotalesConReferencia(totales, referencia) {
  if (!referencia?.valorSistema) return { ...totales, referencia };
  const pctCoberturaValor =
    referencia.valorSistema > 0
      ? Math.round((totales.valorTeoricoContado / referencia.valorSistema) * 10000) / 100
      : null;
  const pctCoberturaSkus =
    referencia.skusConStock > 0
      ? Math.round(((totales.skusUnicos ?? totales.articulos) / referencia.skusConStock) * 10000) / 100
      : null;
  return {
    ...totales,
    referencia: {
      ...referencia,
      pctCoberturaValor,
      pctCoberturaSkus,
    },
  };
}

export function columnasImprimirProductoInventario({ incluirDepartamento = false } = {}) {
  const cols = [
    { label: 'No. ajuste', key: 'numeroAjuste' },
    { label: 'Código', key: 'codigo' },
    { label: 'Producto', key: 'nombre' },
    { label: 'Inv. teórico', key: 'teorico', align: 'right' },
    { label: 'Contado', key: 'contado', align: 'right', fmt: (r) => (r.contado == null ? '—' : r.contado) },
    {
      label: 'Diferencia',
      key: 'diferencia',
      align: 'right',
      fmt: (r) => {
        if (r.diferencia == null) return '—';
        if (r.diferencia === 0) return '0';
        return r.diferencia > 0 ? `+${r.diferencia}` : String(r.diferencia);
      },
    },
    {
      label: '% merma',
      key: 'pctMerma',
      align: 'right',
      fmt: (r) => (Number(r.diferencia) < 0 ? fmtPctReporte(r.pctMerma) : '—'),
    },
  ];
  if (incluirDepartamento) {
    cols.splice(1, 0, { label: 'Departamento', key: 'departamento' });
  }
  return cols;
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

/** Reconstruye ajustes completos desde snapshots en nube (incluye líneas sin diferencia). */
export function ajustesDesdeSnapshotsConteo(movimientos = []) {
  const map = new Map();
  for (const m of movimientos || []) {
    if (String(m.modo || '') !== 'conteo_snapshot') continue;
    const meta = m?.meta && typeof m.meta === 'object' ? m.meta : {};
    const snap = meta.ajuste_snapshot || meta.snapshot;
    if (!snap?.lineas?.length) continue;
    const folio = String(meta.folio || snap.folio || folioDesdeMovimiento(m) || `SIN-FOLIO-${m.id}`);
    const suc = normalizarCodigoTienda(snap.sucursal || m.sucursal_id || m.sucursal) || '—';
    const created = snap.created_at || m.created_at;
    const prev = map.get(folio);
    if (prev && String(prev.created_at || '') >= String(created || '')) continue;
    map.set(folio, {
      id: `snap_${folio}`,
      folio,
      departamento: snap.departamento || m.departamento || '—',
      sucursal: suc,
      usuario: snap.usuario || m.usuario || '—',
      created_at: created,
      origen: 'nube_snapshot',
      lineas: snap.lineas,
      resumen: snap.resumen || {},
    });
  }
  return [...map.values()];
}

/** Agrupa movimientos nube de conteo en “ajustes” por folio (solo líneas con diferencia). */
export function ajustesDesdeMovimientosConteo(movimientos, { inventario = [], excluirFolios = new Set() } = {}) {
  const costos = mapaCostoPorProducto(inventario);
  const precios = mapaPrecioPorProducto(inventario);
  const map = new Map();

  for (const m of movimientos || []) {
    const modo = String(m.modo || '');
    if (modo === 'conteo_snapshot') continue;
    if (modo !== 'conteo_departamento' && modo !== 'conteo' && modo !== 'libre') continue;
    const folio = folioDesdeMovimiento(m) || `SIN-FOLIO-${m.id}`;
    if (excluirFolios.has(folio)) continue;
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
      valorDiferencia: diferencia === 0 ? 0 : Math.abs(diferencia) * precio,
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
    .in('modo', ['conteo_departamento', 'libre', 'conteo', 'conteo_snapshot'])
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
function filtrarAjustes(ajustes, sucFiltro) {
  return (ajustes || []).filter((a) => {
    if (!sucFiltro) return true;
    return normalizarCodigoTienda(a.sucursal) === sucFiltro;
  });
}

export function cargarFilasReporteInventario(opts = {}) {
  const {
    preset = 'mes',
    desde,
    hasta,
    sucursal = '',
    inventario = [],
    inventarioCompleto = [],
    departamento = '',
    sucursalActual = '',
  } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const deptFiltro = departamento ? normalizarDepartamento(departamento) : '';
  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;
  const locales = leerAjustesInventario().filter((a) => enRangoIso(a.created_at, rango.desde, rango.hasta));
  const ajustes = filtrarAjustes(locales, sucFiltro);
  const lineasProducto = aplicarCorreccionesGuardadasALineas(
    lineasProductoDesdeAjustes(locales, { inventario: catalogo, sucFiltro, deptFiltro }),
    catalogo,
  );
  const sucRef = sucFiltro || normalizarCodigoTienda(sucursalActual) || '';
  const referencia = referenciaInventarioReporte(catalogo, sucRef, deptFiltro);
  return { lineasProducto, ajustes, rango, aviso: null, referencia };
}

/**
 * Igual que el sync, pero también lee conteos desde movimientos_inventario (nube).
 */
export async function cargarFilasReporteInventarioAsync(opts = {}) {
  const {
    supabase = null,
    inventario = [],
    inventarioCompleto = [],
    preset = 'mes',
    desde,
    hasta,
    sucursal = '',
    sucursalActual = '',
    departamento = '',
  } = opts;
  const rango = rangoReporteInventario(preset, desde, hasta);
  const sucFiltro = sucursal ? normalizarCodigoTienda(sucursal) : '';
  const deptFiltro = departamento ? normalizarDepartamento(departamento) : '';
  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;
  const locales = leerAjustesInventario().filter((a) => enRangoIso(a.created_at, rango.desde, rango.hasta));
  const sucRef = sucFiltro || normalizarCodigoTienda(sucursalActual) || '';

  let aviso = null;
  let nubeAjustes = [];
  if (supabase) {
    const { data, error } = await listarMovimientosConteoNube(supabase, {
      desdeYmd: rango.desde,
      hastaYmd: rango.hasta,
    });
    if (error) aviso = `Nube: ${error}`;
    else {
      const snapshots = ajustesDesdeSnapshotsConteo(data);
      const foliosSnapshot = new Set(snapshots.map((a) => a.folio));
      const parciales = ajustesDesdeMovimientosConteo(data, {
        inventario: catalogo,
        excluirFolios: foliosSnapshot,
      });
      nubeAjustes = [...snapshots, ...parciales];
      const soloParciales = parciales.filter((a) => !foliosSnapshot.has(a.folio));
      if (soloParciales.length && !snapshots.length) {
        aviso =
          (aviso ? `${aviso} · ` : '') +
          'Conteos en nube sin snapshot completo: solo artículos con diferencia. Los totales pueden ser menores al conteo real.';
      }
    }
  }

  const merged = mergeAjustesPorFolio(locales, nubeAjustes);
  const ajustes = filtrarAjustes(merged, sucFiltro);
  const lineasProducto = aplicarCorreccionesGuardadasALineas(
    lineasProductoDesdeAjustes(merged, {
      inventario: catalogo,
      sucFiltro,
      deptFiltro,
    }),
    catalogo,
  );
  const referencia = referenciaInventarioReporte(catalogo, sucRef, deptFiltro);
  return { lineasProducto, ajustes, rango, aviso, referencia };
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
    { label: 'no_ajuste', value: (r) => r.numeroAjuste },
    { label: 'departamento', value: (r) => r.departamento },
    { label: 'codigo', value: (r) => r.codigo },
    { label: 'producto', value: (r) => r.nombre },
    { label: 'inv_teorico', value: (r) => r.teorico },
    { label: 'contado', value: (r) => r.contado ?? '' },
    { label: 'diferencia', value: (r) => r.diferencia ?? '' },
    { label: 'pct_merma', value: (r) => (Number(r.diferencia) < 0 ? r.pctMerma : '') },
    { label: 'valor_faltante', value: (r) => (Number(r.diferencia) < 0 ? r.valorDiferencia : '') },
    { label: 'valor_sobrante', value: (r) => (Number(r.diferencia) > 0 ? r.valorDiferencia : '') },
    { label: 'valor_diferencia', value: (r) => r.valorDiferencia },
    { label: 'tienda', value: (r) => r.sucursal },
    { label: 'fecha', value: (r) => r.fecha },
  ];
}

export function departamentosEnReporte(inventario = [], lineas = []) {
  const set = new Set(listarDepartamentos(inventario));
  for (const l of lineas) {
    if (l.departamentoKey) set.add(l.departamentoKey);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}
