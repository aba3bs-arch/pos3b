/**
 * Consulta de los cortes generales (CGA) de Abarrotes de todas las tiendas:
 * lista por periodo, impresión por lote y exportación a CSV.
 */
import { equivalentesCodigoTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { round2 } from './corteContabilidad/calc.js';

export const LIMITE_FILAS_CGA = 2000;
export const LIMITE_IMPRESION_LOTE = 60;

const num = (v) => round2(Number(v) || 0);

/** Fila de la lista (acepta la versión ligera con alias o el registro completo). */
export function normalizarFilaCga(r) {
  const d = r?.detalle && typeof r.detalle === 'object' ? r.detalle : {};
  const eg = d.egresos_dia || {};
  const fecha = String(r?.fecha || d.fecha_negocio || '').slice(0, 10);
  const gastos = r?.gastos ?? d.gastos_total;
  const egresosTotal = r?.egresos ?? eg.egresos_total_dia;
  return {
    id: r.id,
    sucursal: normalizarCodigoTienda(r.sucursal_id) || String(r.sucursal_id || ''),
    folio: r.folio || '',
    fecha,
    ventas: num(r.ventas),
    tarjeta: num(r.tarjeta ?? d.tarjeta),
    gastos: num(gastos),
    egresos: num(egresosTotal ?? gastos),
    cajaAnterior: num(r.caja_anterior ?? d.caja_anterior),
    cajaActual: num(r.caja_actual),
    creado: r.created_at || '',
  };
}

export function ordenarCga(filas = []) {
  return [...filas].sort((a, b) => (
    b.fecha.localeCompare(a.fecha)
    || a.sucursal.localeCompare(b.sucursal, 'es', { numeric: true })
  ));
}

/** Agrupa por día de negocio (más reciente primero) con totales. */
export function agruparCgaPorDia(filas = []) {
  const mapa = new Map();
  for (const f of ordenarCga(filas)) {
    if (!mapa.has(f.fecha)) mapa.set(f.fecha, { fecha: f.fecha, filas: [], ventas: 0, gastos: 0, egresos: 0, cajaActual: 0 });
    const g = mapa.get(f.fecha);
    g.filas.push(f);
    g.ventas = round2(g.ventas + f.ventas);
    g.gastos = round2(g.gastos + f.gastos);
    g.egresos = round2(g.egresos + f.egresos);
    g.cajaActual = round2(g.cajaActual + f.cajaActual);
  }
  return [...mapa.values()];
}

const ligero = 'id,sucursal_id,folio,ventas,caja_actual,created_at,fecha:detalle->>fecha_negocio,'
  + 'gastos:detalle->>gastos_total,tarjeta:detalle->>tarjeta,caja_anterior:detalle->>caja_anterior,'
  + 'egresos:detalle->egresos_dia->>egresos_total_dia';

function consultaBase(supabase, columnas, sucursal) {
  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select(columnas)
    .eq('modulo', 'abarrotes')
    .is('deleted_at', null);
  if (sucursal) {
    const vars = equivalentesCodigoTienda(normalizarCodigoTienda(sucursal));
    q = q.in('sucursal_id', vars.length ? vars : [sucursal]);
  }
  return q;
}

/**
 * Cortes generales con fecha de negocio entre desde y hasta (YYYY-MM-DD).
 * Primero consulta columnas ligeras; si el servidor no admite las rutas JSON, usa el registro completo.
 */
export async function listarCortesGenerales(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase || !desde || !hasta) return { data: [], error: null, truncado: false };
  let r = await consultaBase(supabase, ligero, sucursal)
    .eq('detalle->>tipo_cierre', 'cierre_diario')
    .gte('detalle->>fecha_negocio', desde)
    .lte('detalle->>fecha_negocio', hasta)
    .order('created_at', { ascending: false })
    .limit(LIMITE_FILAS_CGA);
  let filas = r.data;
  if (r.error) {
    const margen = new Date(`${desde}T00:00:00Z`);
    margen.setUTCDate(margen.getUTCDate() - 1);
    const fin = new Date(`${hasta}T00:00:00Z`);
    fin.setUTCDate(fin.getUTCDate() + 2);
    r = await consultaBase(supabase, '*', sucursal)
      .gte('created_at', margen.toISOString())
      .lte('created_at', fin.toISOString())
      .order('created_at', { ascending: false })
      .limit(LIMITE_FILAS_CGA);
    if (r.error) return { data: [], error: r.error.message, truncado: false };
    filas = (r.data || []).filter((x) => x?.detalle?.tipo_cierre === 'cierre_diario');
  }
  const lista = (filas || [])
    .map(normalizarFilaCga)
    .filter((f) => f.fecha && f.fecha >= desde && f.fecha <= hasta);
  return { data: ordenarCga(lista), error: null, truncado: (filas || []).length >= LIMITE_FILAS_CGA };
}

/** Registros completos (para imprimir el recibo) por id. */
export async function cargarCortesGeneralesCompletos(supabase, ids = []) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  const filas = [];
  for (let i = 0; i < unicos.length; i += 30) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('cortes_contabilidad_cierres')
      .select('*')
      .in('id', unicos.slice(i, i + 30));
    if (error) return { data: [], error: error.message };
    filas.push(...(data || []));
  }
  return { data: filas, error: null };
}

/** Une varios recibos CGA (documentos HTML completos) en uno solo, un recibo por página. */
export function unirRecibosHtml(htmls = []) {
  const estilo = (String(htmls[0] || '').match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
  const cuerpos = htmls.map((h) => (String(h).match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [])[1] ?? String(h));
  const separador = '<div style="page-break-after:always;break-after:page"></div>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Cortes generales (CGA)</title><style>${estilo}</style></head><body>${cuerpos.join(separador)}</body></html>`;
}

const comillas = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** CSV (con BOM para Excel) de la lista del periodo. */
export function csvCortesGenerales(filas = [], etiquetaTienda = (x) => x) {
  const cab = ['Fecha', 'Tienda', 'Folio', 'Ventas', 'Tarjeta/electrónico', 'Gastos', 'Egresos del día', 'Caja anterior', 'Caja al cierre'];
  const lineas = ordenarCga(filas)
    .reverse()
    .map((f) => [f.fecha, etiquetaTienda(f.sucursal), f.folio, f.ventas, f.tarjeta, f.gastos, f.egresos, f.cajaAnterior, f.cajaActual].map(comillas).join(','));
  return `\uFEFF${[cab.map(comillas).join(','), ...lineas].join('\r\n')}`;
}
