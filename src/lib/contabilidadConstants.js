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
  {
    id: 'luis-enrique',
    nombre: 'Luis Enrique',
    etiqueta: 'Luis Enrique Mada Osuna',
    area: 'abarrotes',
    patrones: ['luis enrique mada osuna', 'luis enrique mada', 'luis enrique'],
  },
  { id: 'misael', nombre: 'Misael', etiqueta: 'Misael', area: 'virtual', patrones: ['misael'] },
  { id: 'gonzalo', nombre: 'Gonzalo', etiqueta: 'Gonzalo', area: 'virtual', patrones: ['gonzalo'] },
];

/**
 * Pueden generar (autoaprobar) y aprobar vales de gasolina además de admin/gerente.
 * Incluye a Luis Enrique Mada Osuna.
 */
export const APROBADORES_VALES_GASOLINA = [
  {
    id: 'luis-enrique',
    etiqueta: 'Luis Enrique Mada Osuna',
    patrones: ['luis enrique mada osuna', 'luis enrique mada', 'luis enrique'],
  },
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

export function etiquetaBeneficiarioVale(b) {
  if (!b) return '—';
  return b.etiqueta || b.nombre || '—';
}

export function beneficiarioValePermitido(nombre, area) {
  const n = String(nombre || '').trim();
  if (!n) return false;
  return BENEFICIARIOS_VALES.some((b) => {
    if (b.area !== area) return false;
    const patrones = b.patrones?.length ? b.patrones : [b.nombre];
    return nombreCoincidePatrones(n, patrones);
  });
}

export function esAprobadorValeGasolina(nombre) {
  return APROBADORES_VALES_GASOLINA.some((s) => nombreCoincidePatrones(nombre, s.patrones));
}

export function areaCorteValida(area) {
  return AREAS_CONTABILIDAD.includes(String(area || '').toLowerCase());
}

export function normalizarAreaCorte(area, fallback = 'virtual') {
  const a = String(area || '').toLowerCase();
  return areaCorteValida(a) ? a : fallback;
}

/** Hora límite por defecto: antes de esta hora, gasolina/herramienta/accesorios sin admin. */
export const HORA_LIMITE_VALE_DEFAULT_ETIQUETA = '09:00';
export const HORA_LIMITE_VALE_DEFAULT_MINUTOS = 9 * 60;
/** @deprecated usar HORA_LIMITE_VALE_DEFAULT_ETIQUETA / leerHoraLimiteVale() */
export const HORA_LIMITE_VALE_DEFAULT = 9;
/** Compat numérica (hora entera). Preferir etiquetaHoraLimiteVale(). */
export const HORA_LIMITE_VALE = HORA_LIMITE_VALE_DEFAULT;

const LS_HORA_LIMITE_VALE = 'pos3b_hora_limite_vale';
export const EVENTO_HORA_LIMITE_VALE = 'pos3b-hora-limite-vale-updated';

const CUARTOS = [0, 15, 30, 45];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function snapCuarto(minuto) {
  const m = Number(minuto) || 0;
  return CUARTOS.reduce((best, q) => (Math.abs(q - m) < Math.abs(best - m) ? q : best), 0);
}

/** Opciones cada 15 min (00:00 … 23:45) para el selector. */
export function opcionesHoraLimiteValeCuartos() {
  const out = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of CUARTOS) {
      const etiqueta = `${pad2(h)}:${pad2(m)}`;
      out.push({ etiqueta, minutos: h * 60 + m });
    }
  }
  return out;
}

/**
 * Normaliza "10:15", "9", 9 o minutos (>23) → { etiqueta, minutos }.
 */
export function normalizarHoraLimiteVale(raw) {
  if (raw == null || raw === '') {
    return { etiqueta: HORA_LIMITE_VALE_DEFAULT_ETIQUETA, minutos: HORA_LIMITE_VALE_DEFAULT_MINUTOS };
  }
  const s = String(raw).trim();
  const hm = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hm) {
    const h = Math.min(23, Math.max(0, Number(hm[1])));
    const m = snapCuarto(Number(hm[2]));
    return { etiqueta: `${pad2(h)}:${pad2(m)}`, minutos: h * 60 + m };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return { etiqueta: HORA_LIMITE_VALE_DEFAULT_ETIQUETA, minutos: HORA_LIMITE_VALE_DEFAULT_MINUTOS };
  }
  // Valor legado: hora entera 0–23
  if (n >= 0 && n <= 23 && Number.isInteger(n)) {
    return { etiqueta: `${pad2(n)}:00`, minutos: n * 60 };
  }
  // Minutos desde medianoche
  const mins = Math.min(23 * 60 + 45, Math.max(0, Math.round(n / 15) * 15));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { etiqueta: `${pad2(h)}:${pad2(m)}`, minutos: h * 60 + m };
}

/** Minutos desde medianoche (Sonora) a partir de los cuales se exige admin. */
export function leerHoraLimiteVale() {
  try {
    const raw = localStorage.getItem(LS_HORA_LIMITE_VALE);
    if (raw != null && raw !== '') return normalizarHoraLimiteVale(raw).minutos;
  } catch {
    /* ignore */
  }
  return HORA_LIMITE_VALE_DEFAULT_MINUTOS;
}

/** Etiqueta HH:MM vigente (cuartos de hora). */
export function etiquetaHoraLimiteVale() {
  try {
    const raw = localStorage.getItem(LS_HORA_LIMITE_VALE);
    if (raw != null && raw !== '') return normalizarHoraLimiteVale(raw).etiqueta;
  } catch {
    /* ignore */
  }
  return HORA_LIMITE_VALE_DEFAULT_ETIQUETA;
}

/** Guarda "10:15" / hora entera / minutos. Devuelve etiqueta HH:MM. */
export function guardarHoraLimiteVale(hora) {
  const { etiqueta, minutos } = normalizarHoraLimiteVale(hora);
  localStorage.setItem(LS_HORA_LIMITE_VALE, etiqueta);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_HORA_LIMITE_VALE, { detail: { etiqueta, minutos } }));
  }
  return etiqueta;
}

function minutosLocalSonora(fecha = new Date()) {
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Hermosillo',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(d);
    let h = Number(parts.find((p) => p.type === 'hour')?.value);
    let m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (h === 24) h = 0;
    if (!Number.isFinite(h)) h = d.getHours();
    if (!Number.isFinite(m)) m = d.getMinutes();
    return h * 60 + m;
  } catch {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** Consumos (y tipos con descuentaNomina) siempre requieren admin; otras categorías después de la hora límite. */
export function valeRequiereAutorizacionAdmin(fecha = new Date(), categoria = 'consumo') {
  if (valeDescuentaNomina(categoria)) return true;
  return minutosLocalSonora(fecha) >= leerHoraLimiteVale();
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

/**
 * ¿El gasto de corte ya puede verse en IE?
 * - Liberado por recolección aprobada (Virtual/Garage) vía gastos_ids.
 * - Legado: antes de LEGACY_GASTOS_CORTE_IE_HASTA.
 * - Abarrotes: no tiene flujo de recolección; entra a IE ABARROTES con el corte
 *   (si no, agosto/meses posteriores quedarían vacíos).
 */
export function gastoCorteLiberadoParaIe(gasto, idsLiberados) {
  if (!gasto) return false;
  const id = gasto.id != null ? String(gasto.id) : '';
  if (id && idsLiberados instanceof Set && idsLiberados.has(id)) return true;
  if (String(gasto.modulo || '').toLowerCase() === 'abarrotes') return true;
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
  // Recibo disponible cuando está en recuperación o ya recuperado.
  return (
    p.estado === 'activo'
    || p.estado === 'recuperar'
    || p.estado === 'por_recolectar'
    || p.estado === 'liquidado'
    || p.estado === 'recuperado'
  );
}

export function etiquetaEstadoVale(v) {
  const e = v?.estado_aprobacion || 'aprobado';
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  return 'Aprobado';
}

/** Estados abiertos de préstamo entre áreas (recuperación automática por negativo). */
export const ESTADOS_PRESTAMO_INTERAREA_ABIERTOS = new Set([
  'recuperar',
  'activo',
  'por_recolectar',
]);

/** Estados cerrados de préstamo entre áreas. */
export const ESTADOS_PRESTAMO_INTERAREA_CERRADOS = new Set([
  'recuperado',
  'liquidado',
  'cancelado',
]);

export function prestamoInterareaEstaAbierto(p) {
  const e = String(p?.estado || 'recuperar');
  return ESTADOS_PRESTAMO_INTERAREA_ABIERTOS.has(e);
}

export function etiquetaEstadoPrestamo(p) {
  const e = p?.estado;
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'pendiente_socio') return 'Pendiente socio (+$1,000)';
  if (e === 'pendiente_cobro') return 'Pendiente de cobro';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  if (e === 'liquidado' || e === 'recuperado') return e === 'recuperado' ? 'Recuperado' : 'Liquidado';
  if (e === 'recuperar') return 'Recuperar';
  if (e === 'por_recolectar') return 'Por recolectar';
  if (e === 'activo') return 'Activo';
  return e || '—';
}

/** Usuario y sucursal desde donde se liquidó/recuperó un préstamo entre áreas. */
export function etiquetaLiquidacionPrestamo(p) {
  const est = String(p?.estado || '');
  if (est !== 'liquidado' && est !== 'recuperado') return '';
  const quien = String(p?.liquidado_por || '').trim();
  const donde = String(p?.liquidado_sucursal || '').trim();
  if (!quien && !donde) return '';
  if (quien && donde) return `${quien} · ${donde}`;
  return quien || donde;
}

/** Quién recolectó el corte donde el préstamo área/sucursal quedó como gasto. */
export function etiquetaColectaPrestamo(p) {
  const partes = [];
  if (p?.colectado_por) {
    const dia = String(p.colectado_at || '').slice(0, 10);
    const folio = p.colectado_folio ? ` · ${p.colectado_folio}` : '';
    const area = p.colectado_modulo || p.origen || p.area_corte || '';
    const areaLbl = ETIQUETA_AREA[area] || area;
    partes.push(`${p.colectado_por}${dia ? ` · ${dia}` : ''}${areaLbl ? ` · ${areaLbl}` : ''}${folio}`);
  } else if (p?.omitir_corte) {
    partes.push('Solo nómina (sin corte)');
  } else if (p?.cargado_corte) {
    partes.push('En corte · pendiente recolección');
  }
  if (p?.rc_recibido_por) {
    const diaRc = String(p.rc_recibido_at || '').slice(0, 10);
    const monRc = Number(p.rc_monto);
    const monLbl = Number.isFinite(monRc) && monRc > 0
      ? ` · $${monRc.toFixed(2)}`
      : '';
    partes.push(`RC · ${p.rc_recibido_por}${diaRc ? ` · ${diaRc}` : ''}${monLbl}`);
  }
  if (!partes.length) return '—';
  return partes.join(' → ');
}

/**
 * Tras recolectar el corte afectado (estado por_recolectar o ya colectado_por),
 * el préstamo puede enviarse a RC Virtual desde Préstamos área.
 */
export function prestamoInterareaPuedeRecolectarRc(p) {
  if (!prestamoInterareaEstaAbierto(p)) return false;
  const saldo = p?.saldo != null ? Number(p.saldo) : Number(p?.monto) || 0;
  if (!(saldo > 0.001)) return false;
  const est = String(p?.estado || '');
  return est === 'por_recolectar' || Boolean(p?.colectado_por);
}

/** Préstamo a empleado MAIN/indirecto: no va a corte. */
export function prestamoOmiteCorte(p) {
  return Boolean(p?.omitir_corte);
}
