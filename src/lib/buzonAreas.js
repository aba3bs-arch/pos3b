import { AREAS_CONTABILIDAD, ETIQUETA_AREA, normalizarAreaCorte } from './contabilidadConstants.js';
import { TIPOS_NOTIF } from './contabilidadNotificaciones.js';

export { AREAS_CONTABILIDAD, ETIQUETA_AREA };

export const BUZONES_AREA = AREAS_CONTABILIDAD.map((id) => ({
  id,
  label: ETIQUETA_AREA[id] || id,
}));

/** Buzón legacy id (ahora vive en Contabilidad → RC Virtual). */
export const BUZON_R_VIRTUAL = { id: 'r_virtual', label: 'RC Virtual' };

/** Categorías de incidencia que pertenecen a un buzón de área. */
const CATS_AREA = new Set(AREAS_CONTABILIDAD);

/**
 * Resuelve a qué buzón (virtual|abarrotes|garage) va un ítem.
 * - Incidencias virtual/abarrotes/garage → ese buzón
 * - Recolecciones del repartidor → abarrotes
 * - Vales/préstamos → área del beneficiario / corte
 */
export function resolverAreaBuzon({
  area_buzon,
  tipo,
  categoria,
  area,
  modulo,
  mensaje,
  titulo,
} = {}) {
  const directa = String(area_buzon || area || modulo || '').toLowerCase().trim();
  if (CATS_AREA.has(directa)) return directa;

  const cat = String(categoria || '').toLowerCase().trim();
  if (CATS_AREA.has(cat)) return cat;

  const t = String(tipo || '');
  if (
    t === TIPOS_NOTIF.RECOLECCION_POST_LIQ ||
    t === TIPOS_NOTIF.RECOLECCION_CORTE_IE ||
    t === 'recoleccion_repartidor'
  ) {
    return 'abarrotes';
  }

  const blob = `${mensaje || ''} ${titulo || ''}`.toLowerCase();
  if (/\babarrotes\b/.test(blob)) return 'abarrotes';
  if (/\bvirtual\b/.test(blob)) return 'virtual';
  if (/\bgarage\b|\bgara[gj]e\b/.test(blob)) return 'garage';

  if (t === TIPOS_NOTIF.INCIDENCIA) {
    // Sin categoría de área: no forzar; el filtro "todos" lo muestra.
    return null;
  }

  if (t === TIPOS_NOTIF.VALE_PENDIENTE || t === TIPOS_NOTIF.CONSUMO_CORTE) {
    return null; // se completa con area_buzon al crear
  }

  if (
    t === TIPOS_NOTIF.PRESTAMO_ADMIN ||
    t === TIPOS_NOTIF.PRESTAMO_SOCIO ||
    t === TIPOS_NOTIF.PRESTAMO_INTERAREA ||
    t === TIPOS_NOTIF.PRESTAMO_SUCURSAL
  ) {
    return null;
  }

  if (t === TIPOS_NOTIF.INVERSION_OFICINA) return 'virtual';

  return null;
}

export function notificacionPerteneceABuzon(notif, areaBuzon, opts = {}) {
  if (!areaBuzon || areaBuzon === 'todos') return true;
  const area = resolverAreaBuzon({
    ...notif,
    categoria: opts.categoria || notif.categoria,
  });
  if (!area) {
    // Sin área clara: visible en todos los buzones para no perder avisos.
    return true;
  }
  return area === areaBuzon;
}

export function incidenciaPerteneceABuzon(inc, areaBuzon) {
  if (!areaBuzon || areaBuzon === 'todos') return true;
  // Campo explícito del reporte (prioridad)
  const area = String(inc?.area || '').toLowerCase();
  if (CATS_AREA.has(area)) return area === areaBuzon;
  // Legado: categoría = área
  const cat = String(inc?.categoria || '').toLowerCase();
  if (CATS_AREA.has(cat)) return cat === areaBuzon;
  // Sin área: no forzar ocultar en un buzón concreto
  return true;
}

export function etiquetaBuzon(area) {
  if (!area || area === 'todos') return 'Todos';
  if (area === BUZON_R_VIRTUAL.id) return BUZON_R_VIRTUAL.label;
  return ETIQUETA_AREA[normalizarAreaCorte(area, area)] || area;
}
