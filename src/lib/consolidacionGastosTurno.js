/**
 * Consolidación de gastos por turno (Contabilidad).
 * Un área a la vez: virtual | abarrotes | garage — independientes.
 * Fuente: cierres en cortes_contabilidad_cierres (detalle.gastos + turno).
 */

import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { ETIQUETA_AREA, AREAS_CONTABILIDAD } from './contabilidadConstants.js';
import { etiquetaTurno, turnoDesdeVentaOCierre } from './estadisticasData.js';

export { AREAS_CONTABILIDAD as AREAS_CONSOLIDACION };
export const ETIQUETA_AREA_CONSOLIDACION = ETIQUETA_AREA;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function fmtMonto(n) {
  return `$${round2(n).toFixed(2)}`;
}

function ymdFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function esRecoleccion(cierre) {
  const tipo = String(cierre?.detalle?.tipo_cierre || '').toLowerCase();
  if (tipo === 'recoleccion' || tipo === 'recolección') return true;
  const turno = String(cierre?.turno || '').toUpperCase();
  return !tipo && turno.includes('RECOLEC');
}

function fechaNegocioCierre(cierre) {
  const dn = String(cierre?.detalle?.fecha_negocio || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dn)) return dn;
  return ymdFromIso(cierre?.created_at);
}

function enRangoYmd(ymd, desde, hasta) {
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

/** Normaliza un gasto embebido en un cierre a fila de consolidación. */
export function filaGastoConsolidacion(g, cierre, area) {
  const categoria = String(g?.categoria || '').trim();
  const subcategoria = String(g?.subcategoria || '').trim();
  const nombre = String(g?.comentario || '').trim() || subcategoria || categoria || '—';
  const concepto = [categoria, subcategoria].filter(Boolean).join(' · ') || '—';
  const turnoRaw = cierre?.turno || cierre?.detalle?.turno_sesion || '';
  const turnoId = turnoDesdeVentaOCierre({
    turno: turnoRaw,
    turno_sesion: cierre?.detalle?.turno_sesion,
    created_at: g?.created_at || cierre?.created_at,
  });
  const gid = g?.id != null && g?.id !== '' ? String(g.id) : null;
  return {
    id: gid || `tmp:${cierre?.id || ''}|${g?.created_at || ''}|${g?.monto}|${categoria}|${nombre}`,
    gasto_id: gid,
    cierre_id: cierre?.id || null,
    folio: cierre?.folio || '—',
    area,
    area_label: ETIQUETA_AREA[area] || area,
    tienda_id: cierre?.sucursal_id || g?.sucursal_id || 'MAIN',
    tienda: etiquetaTienda(cierre?.sucursal_id || g?.sucursal_id),
    turno_id: turnoId,
    turno_label: etiquetaTurno(turnoId),
    turno_raw: turnoRaw || '—',
    fecha_negocio: fechaNegocioCierre(cierre),
    fecha: g?.created_at || cierre?.created_at || null,
    fecha_corta: ymdFromIso(g?.created_at || cierre?.created_at),
    empleado: String(g?.usuario_nombre || '').trim() || '—',
    categoria: categoria || '—',
    subcategoria,
    concepto,
    nombre,
    monto: round2(g?.monto),
    tipo_cierre: cierre?.detalle?.tipo_cierre || 'cierre',
    es_recoleccion: esRecoleccion(cierre),
    cajero_cierre: cierre?.usuario_nombre || '—',
  };
}

/**
 * Carga cierres del área en el rango y aplana gastos por turno.
 * Cada área se consulta sola (independiente).
 */
export async function cargarConsolidacionGastosTurno(
  supabase,
  { area = 'virtual', desde, hasta, sucursal = '', incluirRecolecciones = false } = {},
) {
  if (!supabase) return { filas: [], cierres: [], error: 'Sin conexión.' };
  const modulo = String(area || '').toLowerCase();
  if (!AREAS_CONTABILIDAD.includes(modulo)) {
    return { filas: [], cierres: [], error: 'Área inválida. Elige Abarrotes, Virtual o Garage.' };
  }
  if (!desde || !hasta) return { filas: [], cierres: [], error: 'Indica el periodo.' };

  // Margen de un día por posibles desfases de zona / fecha_negocio.
  const ini = `${desde}T00:00:00`;
  const finPad = new Date(`${hasta}T00:00:00`);
  finPad.setDate(finPad.getDate() + 1);
  const finYmd = `${finPad.getFullYear()}-${String(finPad.getMonth() + 1).padStart(2, '0')}-${String(finPad.getDate()).padStart(2, '0')}`;
  const fin = `${finYmd}T00:00:00`;

  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select('id, sucursal_id, modulo, folio, turno, usuario_nombre, ventas, caja_actual, detalle, created_at, deleted_at')
    .eq('modulo', modulo)
    .gte('created_at', ini)
    .lt('created_at', fin)
    .order('created_at', { ascending: false })
    .limit(800);

  if (sucursal) q = q.eq('sucursal_id', sucursal);

  let { data, error } = await q;
  if (error && /deleted_at/i.test(String(error.message || ''))) {
    let q2 = supabase
      .from('cortes_contabilidad_cierres')
      .select('id, sucursal_id, modulo, folio, turno, usuario_nombre, ventas, caja_actual, detalle, created_at')
      .eq('modulo', modulo)
      .gte('created_at', ini)
      .lt('created_at', fin)
      .order('created_at', { ascending: false })
      .limit(800);
    if (sucursal) q2 = q2.eq('sucursal_id', sucursal);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
  }
  if (error) {
    if (error.code === '42P01') {
      return { filas: [], cierres: [], error: null, aviso: 'Tabla de cierres no disponible.' };
    }
    return { filas: [], cierres: [], error: error.message };
  }

  const cierres = (data || []).filter((c) => {
    if (c.deleted_at) return false;
    const fn = fechaNegocioCierre(c);
    if (!enRangoYmd(fn, desde, hasta) && !enRangoYmd(ymdFromIso(c.created_at), desde, hasta)) {
      return false;
    }
    if (!incluirRecolecciones && esRecoleccion(c)) return false;
    return true;
  });

  const filas = [];
  for (const cierre of cierres) {
    const embebidos = Array.isArray(cierre?.detalle?.gastos) ? cierre.detalle.gastos : [];
    if (!embebidos.length) continue;
    for (const g of embebidos) {
      filas.push(filaGastoConsolidacion(g, cierre, modulo));
    }
  }

  return { filas, cierres, error: null };
}

export function totalMontoFilas(filas) {
  return round2((filas || []).reduce((a, f) => a + (Number(f.monto) || 0), 0));
}

/** Agrupa filas por turno (Diurno / Nocturno). */
export function agruparPorTurnoConsolidacion(filas) {
  const map = new Map();
  for (const f of filas || []) {
    const id = f.turno_id || 'Diurno';
    if (!map.has(id)) {
      map.set(id, {
        id,
        label: f.turno_label || etiquetaTurno(id),
        filas: [],
        total: 0,
        cierres: new Set(),
        tiendas: new Set(),
      });
    }
    const g = map.get(id);
    g.filas.push(f);
    g.total = round2(g.total + (Number(f.monto) || 0));
    if (f.cierre_id) g.cierres.add(String(f.cierre_id));
    if (f.tienda_id) g.tiendas.add(String(f.tienda_id));
  }
  const orden = ['Diurno', 'Nocturno'];
  return [...map.values()]
    .sort((a, b) => {
      const ia = orden.indexOf(a.id);
      const ib = orden.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.label.localeCompare(b.label, 'es');
    })
    .map((g) => ({
      id: g.id,
      label: g.label,
      filas: g.filas,
      total: g.total,
      n_gastos: g.filas.length,
      n_cierres: g.cierres.size,
      n_tiendas: g.tiendas.size,
    }));
}

/** Agrupa por cierre (folio / turno de sesión). */
export function agruparPorCierre(filas) {
  const map = new Map();
  for (const f of filas || []) {
    const id = String(f.cierre_id || f.folio || 'sin-cierre');
    if (!map.has(id)) {
      map.set(id, {
        id,
        folio: f.folio || '—',
        turno_label: f.turno_label,
        turno_raw: f.turno_raw,
        tienda: f.tienda,
        tienda_id: f.tienda_id,
        fecha_negocio: f.fecha_negocio,
        cajero_cierre: f.cajero_cierre,
        filas: [],
        total: 0,
      });
    }
    const g = map.get(id);
    g.filas.push(f);
    g.total = round2(g.total + (Number(f.monto) || 0));
  }
  return [...map.values()].sort((a, b) => String(b.fecha_negocio).localeCompare(String(a.fecha_negocio)));
}

/** Agrupa por tienda. */
export function agruparPorTiendaConsolidacion(filas) {
  const map = new Map();
  for (const f of filas || []) {
    const id = f.tienda_id || 'MAIN';
    if (!map.has(id)) {
      map.set(id, { id, label: f.tienda || etiquetaTienda(id), filas: [], total: 0 });
    }
    const g = map.get(id);
    g.filas.push(f);
    g.total = round2(g.total + (Number(f.monto) || 0));
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function tiendasFiltroConsolidacion() {
  return [{ id: '', label: 'Todas las tiendas' }, ...listarSucursalesOperativas().map((id) => ({ id, label: etiquetaTienda(id) }))];
}

export function columnasCsvConsolidacion() {
  return [
    { label: 'Área', value: (r) => r.area_label },
    { label: 'Fecha negocio', value: (r) => r.fecha_negocio },
    { label: 'Fecha gasto', value: (r) => r.fecha_corta },
    { label: 'Tienda', value: (r) => r.tienda },
    { label: 'Turno', value: (r) => r.turno_label },
    { label: 'Turno raw', value: (r) => r.turno_raw },
    { label: 'Folio cierre', value: (r) => r.folio },
    { label: 'Cajero cierre', value: (r) => r.cajero_cierre },
    { label: 'Empleado', value: (r) => r.empleado },
    { label: 'Concepto', value: (r) => r.concepto },
    { label: 'Nombre', value: (r) => r.nombre },
    { label: 'Monto', value: (r) => Number(r.monto) || 0 },
  ];
}
