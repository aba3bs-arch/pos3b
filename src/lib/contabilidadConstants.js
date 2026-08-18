import {
  CATEGORIAS_VALE,
  CATEGORIAS_VALE_FIJAS,
  listarCategoriasVale,
  categoriaValePorId,
  valeDescuentaNomina,
  etiquetaCategoriaVale,
} from './valesCategorias.js';

export {
  CATEGORIAS_VALE,
  CATEGORIAS_VALE_FIJAS,
  listarCategoriasVale,
  categoriaValePorId,
  valeDescuentaNomina,
  etiquetaCategoriaVale,
};

export const AREAS_CONTABILIDAD = ['virtual', 'abarrotes', 'garage'];

export const PAGADORES_NOMINA = ['virtual', 'abarrotes', 'garage', 'ambos'];

export const ETIQUETA_AREA = {
  virtual: 'Virtual',
  abarrotes: 'Abarrotes',
  garage: 'Garage',
  ambos: 'Abarrotes y Virtual',
};

/** Únicos beneficiarios permitidos para vales. El área define a qué corte va el vale. */
export const BENEFICIARIOS_VALES = [
  { id: 'luis-enrique', nombre: 'Luis Enrique', area: 'abarrotes' },
  { id: 'misael', nombre: 'Misael', area: 'virtual' },
  { id: 'gonzalo', nombre: 'Gonzalo', area: 'virtual' },
];

export const MONTO_PRESTAMO_REQUIERE_SOCIO = 1000;
export const CUOTA_SEMANAL_MINIMA = 500;

/** Socios que autorizan préstamos mayores a $1,000 (PIN en usuarios). */
export const SOCIOS_APROBADORES_PRESTAMO = [
  { id: 'antonio', etiqueta: 'Antonio', patrones: ['antonio'] },
  { id: 'francisco', etiqueta: 'Francisco', patrones: ['francisco'] },
  { id: 'jose-luis', etiqueta: 'José Luis', patrones: ['jose luis', 'josé luis', 'jose luis'] },
];

/**
 * ABB / FJBB / JLBB: aprueban recolecciones de corte hacia IE (y autoaprueban si ellos recolectan).
 * Patrones incluyen iniciales y nombres habituales.
 */
export const APROBADORES_RECOLECCION_IE = [
  { id: 'abb', etiqueta: 'ABB', patrones: ['abb', 'antonio'] },
  { id: 'fjbb', etiqueta: 'FJBB', patrones: ['fjbb', 'francisco'] },
  { id: 'jlbb', etiqueta: 'JLBB', patrones: ['jlbb', 'jose luis', 'josé luis'] },
];

/** Si recolectan ellos, la transferencia a IE queda pendiente hasta ABB/FJBB/JLBB. */
export const RECOLECTORES_REQUIEREN_APROBACION_IE = [
  { id: 'luis-enrique', etiqueta: 'Luis Enrique Mada Osuna', patrones: ['luis enrique mada osuna', 'luis enrique mada', 'luis enrique'] },
  { id: 'amr', etiqueta: 'AMR', patrones: ['amr'] },
];

/** Gastos de corte anteriores a esta fecha siguen contando en IE por fecha (legado). */
export const LEGACY_GASTOS_CORTE_IE_HASTA = '2026-07-25';

export const ESTADOS_VALE_APROBADO = new Set(['aprobado']);
export const ESTADOS_PRESTAMO_ACTIVO = new Set(['activo']);
export const ESTADOS_PRESTAMO_PENDIENTE = new Set(['pendiente_admin', 'pendiente_socio']);

export function beneficiarioValePorId(id) {
  return BENEFICIARIOS_VALES.find((b) => b.id === id) || null;
}

export function beneficiarioValePermitido(nombre, area) {
  const n = String(nombre || '').trim().toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === n && b.area === area);
}

export function areaCorteValida(area) {
  return AREAS_CONTABILIDAD.includes(String(area || '').toLowerCase());
}

export function normalizarAreaCorte(area, fallback = 'virtual') {
  const a = String(area || '').toLowerCase();
  return areaCorteValida(a) ? a : fallback;
}

/** Hora límite por defecto: antes de esta hora, gasolina/herramienta/accesorios sin admin. */
export const HORA_LIMITE_VALE_DEFAULT = 9;
/** Compat: valor por defecto (usar leerHoraLimiteVale() para el valor vigente). */
export const HORA_LIMITE_VALE = HORA_LIMITE_VALE_DEFAULT;

const LS_HORA_LIMITE_VALE = 'pos3b_hora_limite_vale';
export const EVENTO_HORA_LIMITE_VALE = 'pos3b-hora-limite-vale-updated';

function clampHoraLimiteVale(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return HORA_LIMITE_VALE_DEFAULT;
  return Math.min(23, Math.max(0, Math.floor(v)));
}

/** Hora (0–23) a partir de la cual los vales no-nómina requieren admin. Persistida en este equipo. */
export function leerHoraLimiteVale() {
  try {
    const raw = localStorage.getItem(LS_HORA_LIMITE_VALE);
    if (raw != null && raw !== '') return clampHoraLimiteVale(raw);
  } catch {
    /* ignore */
  }
  return HORA_LIMITE_VALE_DEFAULT;
}

export function guardarHoraLimiteVale(hora) {
  const h = clampHoraLimiteVale(hora);
  localStorage.setItem(LS_HORA_LIMITE_VALE, String(h));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_HORA_LIMITE_VALE, { detail: { hora: h } }));
  }
  return h;
}

function horaLocalSonora(fecha = new Date()) {
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Hermosillo',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(d);
    let h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (h === 24) h = 0;
    return Number.isFinite(h) ? h : d.getHours();
  } catch {
    return fecha instanceof Date ? fecha.getHours() : new Date(fecha).getHours();
  }
}

/** Consumos (y tipos con descuentaNomina) siempre requieren admin; otras categorías después de la hora límite. */
export function valeRequiereAutorizacionAdmin(fecha = new Date(), categoria = 'consumo') {
  if (valeDescuentaNomina(categoria)) return true;
  return horaLocalSonora(fecha) >= leerHoraLimiteVale();
}

/** Cuota semanal fija $500; si el saldo es menor, cobra el remanente (última semana). */
export function cuotaSemanalPrestamo(saldo, _cuotaPropuesta) {
  const s = Math.max(0, Number(saldo) || 0);
  if (s <= 0) return 0;
  return Math.min(s, CUOTA_SEMANAL_MINIMA);
}

export function prestamoRequiereSocio(monto) {
  return (Number(monto) || 0) > MONTO_PRESTAMO_REQUIERE_SOCIO;
}

export function normalizarNombreMatch(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function nombreCoincidePatrones(nombre, patrones = []) {
  const n = normalizarNombreMatch(nombre);
  if (!n) return false;
  const tokens = n.split(' ').filter(Boolean);
  return (patrones || []).some((p) => {
    const pn = normalizarNombreMatch(p).replace(/í/g, 'i');
    if (!pn) return false;
    if (pn.length <= 4) {
      return n === pn || tokens.includes(pn);
    }
    return n.includes(pn) || pn.includes(n);
  });
}

export function esSocioAprobadorPrestamo(nombre) {
  return SOCIOS_APROBADORES_PRESTAMO.some((s) => nombreCoincidePatrones(nombre, s.patrones));
}

/** ABB, FJBB o JLBB (o Antonio / Francisco / José Luis). */
export function esAprobadorRecoleccionIe(nombre) {
  return APROBADORES_RECOLECCION_IE.some((s) => nombreCoincidePatrones(nombre, s.patrones));
}

/** Antonio / ABB: destino final de R Virtual. */
export function esAbb(nombre) {
  const abb = APROBADORES_RECOLECCION_IE.find((s) => s.id === 'abb');
  return nombreCoincidePatrones(nombre, abb?.patrones || ['abb', 'antonio']);
}

/** Luis Enrique Mada Osuna o AMR: requieren aprobación de ABB/FJBB/JLBB. */
export function recolectorRequiereAprobacionIe(nombre) {
  return RECOLECTORES_REQUIEREN_APROBACION_IE.some((s) => nombreCoincidePatrones(nombre, s.patrones));
}

/**
 * Estado inicial de la recolección hacia IE:
 * - ABB/FJBB/JLBB (u otros no listados) → aprobado
 * - Luis Enrique / AMR → pendiente_admin
 */
export function estadoAprobacionRecoleccionInicial(nombreRecolector) {
  if (esAprobadorRecoleccionIe(nombreRecolector)) return 'aprobado';
  if (recolectorRequiereAprobacionIe(nombreRecolector)) return 'pendiente_admin';
  return 'aprobado';
}

export function recoleccionAprobadaParaIe(cierre) {
  if (!cierre) return false;
  const raw = cierre?.detalle?.estado_aprobacion ?? cierre?.estado_aprobacion;
  if (raw == null || raw === '') return true; // legado sin campo = ya en IE
  return String(raw).toLowerCase() === 'aprobado';
}

export function gastoCorteLiberadoParaIe(gasto, idsLiberados) {
  if (!gasto) return false;
  const id = gasto.id != null ? String(gasto.id) : '';
  if (id && idsLiberados instanceof Set && idsLiberados.has(id)) return true;
  const f = String(gasto.created_at || gasto.fecha || '').slice(0, 10);
  return Boolean(f && f < LEGACY_GASTOS_CORTE_IE_HASTA);
}

export function idsGastosLiberadosPorRecolecciones(recolecciones = []) {
  const ids = new Set();
  for (const r of recolecciones || []) {
    if (!recoleccionAprobadaParaIe(r)) continue;
    const list = r?.detalle?.gastos_ids;
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      if (id != null && id !== '') ids.add(String(id));
    }
  }
  return ids;
}

export function valePuedeImprimir(vale) {
  if (!vale) return false;
  const est = vale.estado_aprobacion || 'aprobado';
  if (est === 'cancelado' || est === 'rechazado') return false;
  return ESTADOS_VALE_APROBADO.has(est);
}

export function valePuedeCancelar(vale) {
  if (!vale) return false;
  const est = vale.estado_aprobacion || 'aprobado';
  return est === 'pendiente_admin' || est === 'aprobado';
}

export function prestamoPuedeImprimir(p) {
  if (!p) return false;
  // Recibo disponible cuando ya está autorizado (activo) o liquidado.
  return p.estado === 'activo' || p.estado === 'liquidado';
}

export function etiquetaEstadoVale(v) {
  const e = v?.estado_aprobacion || 'aprobado';
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  return 'Aprobado';
}

export function etiquetaEstadoPrestamo(p) {
  const e = p?.estado;
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'pendiente_socio') return 'Pendiente socio (+$1,000)';
  if (e === 'pendiente_cobro') return 'Pendiente de cobro';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  if (e === 'liquidado') return 'Liquidado';
  if (e === 'activo') return 'Activo';
  return e || '—';
}

/** Usuario y sucursal desde donde se liquidó un préstamo entre áreas. */
export function etiquetaLiquidacionPrestamo(p) {
  if (String(p?.estado || '') !== 'liquidado') return '';
  const quien = String(p?.liquidado_por || '').trim();
  const donde = String(p?.liquidado_sucursal || '').trim();
  if (!quien && !donde) return '';
  if (quien && donde) return `${quien} · ${donde}`;
  return quien || donde;
}

/** Quién recolectó el corte donde el préstamo área/sucursal quedó como gasto. */
export function etiquetaColectaPrestamo(p) {
  if (p?.colectado_por) {
    const dia = String(p.colectado_at || '').slice(0, 10);
    const folio = p.colectado_folio ? ` · ${p.colectado_folio}` : '';
    const area = p.colectado_modulo || p.origen || p.area_corte || '';
    const areaLbl = ETIQUETA_AREA[area] || area;
    return `${p.colectado_por}${dia ? ` · ${dia}` : ''}${areaLbl ? ` · ${areaLbl}` : ''}${folio}`;
  }
  if (p?.cargado_corte) return 'En corte · pendiente recolección';
  return '—';
}
