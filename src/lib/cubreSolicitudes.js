/**
 * Sistema de coberturas CT (v1 / base).
 * - Catálogo: rh_empleados tipo cubre_turno (independiente de planta).
 * - Disponibilidad: verde disponible / rojo cubriendo ese día o hold.
 * - Un CT con cobertura en otro día sí puede solicitarse para la fecha pedida.
 * - Tienda solicita CT para un descanso → CT acepta → PIN temporal.
 * - Si acepta y no cumple → hold 7 días → liberación automática.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion } from './contabilidadNotificaciones.js';
import { generarPinCubreTurnoAleatorio, normalizarPinComparacion } from './cubreTurno.js';

export const AVISO_FALTA_CUBRE_SOLICITUDES =
  'Falta la tabla de coberturas CT. Ejecuta supabase/fix_cubre_solicitudes.sql en Supabase.';

export const DIAS_HOLD_CT_MS = 7 * 24 * 60 * 60 * 1000;

export const ESTADOS_SOLICITUD_CT = {
  solicitada: 'Solicitada',
  aceptada: 'Aceptada (PIN activo)',
  rechazada: 'Rechazada',
  cumplida: 'Cumplida',
  no_show: 'No cumplió',
  retenida: 'En hold',
  liberada: 'Hold liberado',
  cancelada: 'Cancelada',
};

const ESTADOS_OCUPAN_CT = new Set(['solicitada', 'aceptada']);

function roundPin4() {
  return generarPinCubreTurnoAleatorio();
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || (msg.includes('pos_cubre_solicitudes') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

function nombreRh(e) {
  if (e?.nombre_completo) return String(e.nombre_completo).trim();
  return [e?.nombre, e?.apellidos].filter(Boolean).join(' ').trim();
}

function extrasCt(e) {
  const x = e?.extras && typeof e.extras === 'object' ? e.extras : {};
  return x;
}

/** Tiendas habilitadas del CT (vacío/null = las 7 / legado). */
export function ctSucursalesHabilitadas(extras = {}) {
  const lista = Array.isArray(extras?.ct_sucursales) ? extras.ct_sucursales : null;
  if (!lista || !lista.length) return null;
  return [...new Set(lista.map((s) => normalizarCodigoTienda(s)).filter(Boolean))];
}

export function ctPuedeCubrirSucursal(extras, sucursalId) {
  const hab = ctSucursalesHabilitadas(extras);
  if (!hab) return true;
  const suc = normalizarCodigoTienda(sucursalId);
  return Boolean(suc && hab.includes(suc));
}

/** true si el turno es nocturno. */
export function turnoEsNocturno(turnoId) {
  const id = String(turnoId || '').toLowerCase();
  return /nocturno|noche/.test(id);
}

export function ctPuedeCubrirTurno(extras, turnoId) {
  if (!extras?.ct_solo_dia) return true;
  return !turnoEsNocturno(turnoId);
}

export function ctPuedeCubrirEn(extras, { sucursal_id, turno_id } = {}) {
  if (sucursal_id && !ctPuedeCubrirSucursal(extras, sucursal_id)) return false;
  if (turno_id != null && turno_id !== '' && !ctPuedeCubrirTurno(extras, turno_id)) return false;
  return true;
}

/** Libera holds vencidos en extras RH (best-effort). */
export async function liberarHoldsCtVencidos(supabase) {
  if (!supabase) return { ok: true, liberados: 0 };
  const ahora = Date.now();
  const { data, error } = await supabase
    .from('rh_empleados')
    .select('id, extras, nombre_completo, nombre, apellidos')
    .eq('tipo_empleado', 'cubre_turno')
    .eq('estado', 'activo')
    .limit(300);
  if (error) return { ok: false, error: error.message, liberados: 0 };
  let liberados = 0;
  for (const e of data || []) {
    const ex = extrasCt(e);
    const until = ex.ct_hold_until ? Date.parse(ex.ct_hold_until) : NaN;
    if (!Number.isFinite(until) || until > ahora) continue;
    const nextExtras = { ...ex, ct_disponibilidad: 'disponible' };
    delete nextExtras.ct_hold_until;
    const { error: upErr } = await supabase
      .from('rh_empleados')
      .update({ extras: nextExtras, updated_at: new Date().toISOString() })
      .eq('id', e.id);
    if (!upErr) liberados += 1;
  }
  // Solicitudes retenidas vencidas → liberada
  try {
    await supabase
      .from('pos_cubre_solicitudes')
      .update({ estado: 'liberada', updated_at: new Date().toISOString() })
      .eq('estado', 'retenida')
      .lt('hold_until', new Date().toISOString());
  } catch {
    /* ignore */
  }
  return { ok: true, liberados };
}

/** Fechas (YYYY-MM-DD) con solicitud activa (solicitada/aceptada) de un CT. */
export function fechasOcupadasCt(rhId, solicitudesActivas = []) {
  const id = String(rhId || '');
  if (!id) return [];
  const set = new Set();
  for (const s of solicitudesActivas || []) {
    if (String(s.ct_rh_id) !== id) continue;
    if (!ESTADOS_OCUPAN_CT.has(String(s.estado || ''))) continue;
    const ymd = String(s.fecha || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) set.add(ymd);
  }
  return [...set].sort();
}

/**
 * Estado visual del CT.
 * Si se pasa `opts.fecha`, solo cuenta como «cubriendo» una cobertura ese mismo día
 * (puede elegirse el mismo CT para otro día).
 * @returns {'disponible'|'cubriendo'|'hold'|'baja'|'no_disponible'}
 */
export function estadoDisponibilidadCt(empleadoRh, solicitudesActivas = [], opts = {}) {
  if (!empleadoRh || empleadoRh.estado === 'baja') return 'baja';
  const ex = extrasCt(empleadoRh);
  const until = ex.ct_hold_until ? Date.parse(ex.ct_hold_until) : NaN;
  if (Number.isFinite(until) && until > Date.now()) return 'hold';
  if (String(ex.ct_disponibilidad || '').toLowerCase() === 'no_disponible') return 'no_disponible';
  const id = String(empleadoRh.id);
  const fechaRef = opts.fecha ? String(opts.fecha).slice(0, 10) : null;
  const ocupado = (solicitudesActivas || []).some((s) => {
    if (String(s.ct_rh_id) !== id) return false;
    if (!ESTADOS_OCUPAN_CT.has(String(s.estado || ''))) return false;
    if (fechaRef) return String(s.fecha || '').slice(0, 10) === fechaRef;
    return true;
  });
  if (ocupado) return 'cubriendo';
  return 'disponible';
}

/**
 * ¿Puede pedirse este CT para `fecha`?
 * Hold / baja / no_disponible bloquean siempre; cobertura solo bloquea el mismo día.
 */
export function ctPuedeSolicitarseEnFecha(empleadoOCatalogo, solicitudesActivas = [], fecha) {
  const ymd = String(fecha || '').slice(0, 10);
  // Fila de catálogo ya resuelta
  if (empleadoOCatalogo && empleadoOCatalogo.fechas_ocupadas != null) {
    const estado = empleadoOCatalogo.disponibilidad;
    if (estado === 'hold' || estado === 'baja' || estado === 'no_disponible') return false;
    if (!ymd) return ctPuedeSerSolicitado(estado);
    return !(empleadoOCatalogo.fechas_ocupadas || []).includes(ymd);
  }
  const estado = estadoDisponibilidadCt(empleadoOCatalogo, solicitudesActivas, { fecha: ymd || undefined });
  return ctPuedeSerSolicitado(estado);
}

export function etiquetaDisponibilidadCt(estado) {
  const map = {
    disponible: 'Disponible',
    cubriendo: 'Cubriendo / solicitado',
    hold: 'Hold (incumplimiento)',
    no_disponible: 'No disponible',
    baja: 'Baja',
  };
  return map[estado] || estado || '—';
}

export function colorDisponibilidadCt(estado) {
  if (estado === 'disponible') return '#2e7d32';
  if (estado === 'cubriendo') return '#c62828';
  if (estado === 'hold') return '#b71c1c';
  if (estado === 'no_disponible') return '#c62828';
  return '#9e9e9e';
}

export function ctPuedeSerSolicitado(estado) {
  return estado === 'disponible';
}

/** Lista CT RH activos con semáforo (solo catálogo cubre_turno, no planta). */
export async function listarCatalogoCt(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  await liberarHoldsCtVencidos(supabase);
  const { data, error } = await supabase
    .from('rh_empleados')
    .select('id, nombre, apellidos, nombre_completo, telefono, sucursal_id, estado, extras, created_at')
    .eq('tipo_empleado', 'cubre_turno')
    .order('nombre_completo', { ascending: true })
    .limit(opts.limit || 200);
  if (error) return { ok: false, error: error.message, data: [] };

  let solicitudes = [];
  const solRes = await listarSolicitudesCt(supabase, {
    estados: ['solicitada', 'aceptada'],
    limit: 300,
  });
  if (solRes.ok) solicitudes = solRes.data || [];

  const fechaOpts = opts.fecha ? String(opts.fecha).slice(0, 10) : null;

  const rows = (data || [])
    .filter((e) => opts.incluirBajas || e.estado !== 'baja')
    .map((e) => {
      const ex = extrasCt(e);
      const ocupadas = fechasOcupadasCt(e.id, solicitudes);
      const estadoDisp = estadoDisponibilidadCt(e, solicitudes, { fecha: fechaOpts || undefined });
      const sucursales = ctSucursalesHabilitadas(ex);
      return {
        id: `rh:${e.id}`,
        rh_id: e.id,
        nombre: nombreRh(e),
        telefono: String(e.telefono || '').replace(/\D/g, '') || null,
        sucursal_id: e.sucursal_id || null,
        estado_rh: e.estado,
        disponibilidad: estadoDisp,
        disponibilidad_label: etiquetaDisponibilidadCt(estadoDisp),
        color: colorDisponibilidadCt(estadoDisp),
        puede_solicitar: ctPuedeSerSolicitado(estadoDisp),
        fechas_ocupadas: ocupadas,
        hold_until: ex.ct_hold_until || null,
        ct_sucursales: sucursales,
        ct_solo_dia: Boolean(ex.ct_solo_dia),
        origen: 'rh',
        extras: ex,
        raw: e,
      };
    })
    .filter((r) => {
      if (opts.sucursal_id && !ctPuedeCubrirSucursal(r.extras, opts.sucursal_id)) return false;
      if (opts.turno_id != null && opts.turno_id !== '' && !ctPuedeCubrirTurno(r.extras, opts.turno_id)) {
        return false;
      }
      return true;
    });

  if (opts.soloDisponibles) {
    return { ok: true, data: rows.filter((r) => r.puede_solicitar) };
  }
  return { ok: true, data: rows };
}

export async function setDisponibilidadManualCt(supabase, rhId, disponible, opts = {}) {
  if (!supabase || !rhId) return { ok: false, error: 'CT inválido.' };
  const { data: prev, error } = await supabase
    .from('rh_empleados')
    .select('id, extras')
    .eq('id', rhId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prev) return { ok: false, error: 'CT no encontrado.' };
  const ex = extrasCt(prev);
  const next = {
    ...ex,
    ct_disponibilidad: disponible ? 'disponible' : 'no_disponible',
  };
  if (disponible) delete next.ct_hold_until;
  const { error: upErr } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: new Date().toISOString() })
    .eq('id', rhId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function listarSolicitudesCt(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  let q = supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(opts.limit) || 100, 1), 400));
  if (opts.sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(opts.sucursal));
  if (opts.ctRhId) q = q.eq('ct_rh_id', opts.ctRhId);
  if (opts.fecha) q = q.eq('fecha', opts.fecha);
  if (opts.estados?.length) q = q.in('estado', opts.estados);
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, data: [], faltaTabla: true };
    return { ok: false, error: error.message, data: [] };
  }
  return { ok: true, data: data || [] };
}

/** Gracia tras fin de turno: el PIN temporal se cierra 60 min después. */
export const GRACIA_PIN_TEMPORAL_CT_MIN = 60;

/** Operación en Sonora (sin DST): anclar ventanas de PIN a -07:00. */
const TZ_PIN_CT = '-07:00';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD estable (evita corrimientos por Date/ISO de Postgres). */
export function normalizarFechaYmd(fecha) {
  if (!fecha) return '';
  if (typeof fecha === 'string') {
    const m = fecha.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const t = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(t.getTime())) return '';
  return ymdHermosillo(t);
}

/** Día civil en America/Hermosillo. */
export function ymdHermosillo(date = new Date()) {
  const t = date instanceof Date ? date : new Date(date);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Hermosillo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(t);
  } catch {
    // Fallback -07:00
    const ms = t.getTime() - 7 * 60 * 60 * 1000;
    const u = new Date(ms);
    return `${u.getUTCFullYear()}-${pad2(u.getUTCMonth() + 1)}-${pad2(u.getUTCDate())}`;
  }
}

function sumarDiasYmd(ymd, dias) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Estima hora de fin del turno a partir de id/etiqueta.
 * Diurno/mañana/tarde → mismo día; nocturno cruza medianoche.
 * Siempre en horario Sonora (-07:00), no en la zona del navegador/servidor.
 */
export function estimarFinTurnoCt(fechaYmd, turnoId, turnoEtiqueta) {
  const base = normalizarFechaYmd(fechaYmd);
  const id = String(turnoId || '').toLowerCase();
  const et = String(turnoEtiqueta || '').toLowerCase();
  const rango = String(turnoEtiqueta || '').match(
    /(\d{1,2}):(\d{2})\s*[–\-aà]\s*(\d{1,2}):(\d{2})/i,
  );
  let hFin = 22;
  let mFin = 0;
  let nextDay = false;
  if (rango) {
    hFin = Number(rango[3]);
    mFin = Number(rango[4]);
    const ini = Number(rango[1]) * 60 + Number(rango[2]);
    const fin = hFin * 60 + mFin;
    nextDay = fin <= ini;
  } else if (
    id.includes('noche') || id.includes('nocturn')
    || et.includes('noche') || et.includes('nocturn')
  ) {
    hFin = 6;
    mFin = 0;
    nextDay = true;
  } else if (id.includes('manana') || id.includes('mañana') || et.includes('mañana') || et.includes('manana')) {
    hFin = 14;
    mFin = 0;
  } else if (id.includes('tarde') || et.includes('tarde')) {
    hFin = 22;
    mFin = 0;
  } else if (id.includes('diurn') || et.includes('diurn')) {
    hFin = 22;
    mFin = 0;
  }
  const ymdFin = nextDay ? sumarDiasYmd(base, 1) : base;
  return new Date(`${ymdFin}T${pad2(hFin)}:${pad2(mFin)}:00${TZ_PIN_CT}`);
}

/** Ventana del PIN temporal: desde 00:00 del día → fin de turno + 60 min (Sonora). */
export function ventanaPinParaFecha(fechaYmd, turnoId, turnoEtiqueta) {
  const base = normalizarFechaYmd(fechaYmd);
  const desde = new Date(`${base}T00:00:00${TZ_PIN_CT}`);
  const finTurno = estimarFinTurnoCt(base, turnoId, turnoEtiqueta);
  const hasta = new Date(finTurno.getTime() + GRACIA_PIN_TEMPORAL_CT_MIN * 60 * 1000);
  return {
    pin_valido_desde: desde.toISOString(),
    pin_valido_hasta: hasta.toISOString(),
    turno_id: turnoId || null,
  };
}

/** @deprecated usar ymdHermosillo */
function ymdLocal(date) {
  return ymdHermosillo(date);
}

/**
 * true si el PIN debe verse en la sesión del CT (pantalla).
 * Desde que acepta hasta el cierre del turno (+ gracia), aunque la fecha sea futura.
 * Así el CT puede leer/anotar el NIP apenas acepta.
 */
export function pinTemporalCtVisible(solicitud, ahora = new Date()) {
  if (!solicitud) return false;
  const est = String(solicitud.estado || '');
  if (est !== 'aceptada' && est !== 'cumplida') return false;
  const pin = String(solicitud.pin_temporal || '').trim();
  if (!pin) return false;
  const t = ahora instanceof Date ? ahora : new Date(ahora);
  if (solicitud.pin_valido_hasta && new Date(solicitud.pin_valido_hasta) < t) return false;
  if (!solicitud.pin_valido_hasta && solicitud.fecha) {
    const fin = estimarFinTurnoCt(solicitud.fecha, solicitud.turno_id, solicitud.turno_etiqueta);
    if (t.getTime() > fin.getTime() + GRACIA_PIN_TEMPORAL_CT_MIN * 60 * 1000) return false;
  }
  return true;
}

/**
 * true si el PIN aún sirve para entrar a caja.
 * Usa pin_valido_desde/hasta si existen; si no, el día de cobertura (Sonora).
 */
export function pinTemporalCtActivo(solicitud, ahora = new Date()) {
  if (!pinTemporalCtVisible(solicitud, ahora)) return false;
  const t = ahora instanceof Date ? ahora : new Date(ahora);
  if (solicitud.pin_valido_desde) {
    if (new Date(solicitud.pin_valido_desde) > t) return false;
    return true;
  }
  const dia = normalizarFechaYmd(solicitud.fecha);
  if (dia && dia > ymdHermosillo(t)) return false;
  return true;
}


/**
 * Cancela solicitudes activas (solicitada/aceptada) de una celda del plan horario.
 * Sirve para cambiar de CT o para quitar la cobertura si el empleado decide trabajar su descanso.
 */
export async function cancelarSolicitudesActivasCelda(supabase, {
  plan_fila_id,
  plan_dia,
  fecha,
  sucursal_id,
  exceptoId = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', canceladas: 0 };
  const suc = normalizarCodigoTienda(sucursal_id);
  const ymd = String(fecha || '').slice(0, 10);
  if (!plan_fila_id || plan_dia == null || !ymd) {
    return { ok: false, error: 'Falta celda/fecha del plan.', canceladas: 0 };
  }
  let q = supabase
    .from('pos_cubre_solicitudes')
    .select('id, estado, ct_nombre, pin_temporal')
    .eq('plan_fila_id', plan_fila_id)
    .eq('plan_dia', Number(plan_dia))
    .eq('fecha', ymd)
    .in('estado', ['solicitada', 'aceptada']);
  if (suc) q = q.eq('sucursal_id', suc);
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true, canceladas: 0 };
    return { ok: false, error: error.message, canceladas: 0 };
  }
  const ids = (data || [])
    .map((r) => r.id)
    .filter((id) => !exceptoId || String(id) !== String(exceptoId));
  if (!ids.length) return { ok: true, canceladas: 0, data: [] };
  const ahora = new Date().toISOString();
  const { data: upd, error: upErr } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'cancelada',
      pin_temporal: null,
      updated_at: ahora,
      notas: 'Cancelada desde plan horario (cambio de CT o se quitó la cobertura).',
    })
    .in('id', ids)
    .select('id, ct_nombre, estado');
  if (upErr) return { ok: false, error: upErr.message, canceladas: 0 };
  return { ok: true, canceladas: (upd || []).length, data: upd || [] };
}

/** Quitar cobertura CT: cancela solicitudes de la celda (el UI además quita el descanso). */
export async function quitarCoberturaCtPlan(supabase, celda = {}) {
  const res = await cancelarSolicitudesActivasCelda(supabase, celda);
  if (!res.ok) return res;
  return {
    ok: true,
    canceladas: res.canceladas,
    mensaje: res.canceladas
      ? `Se canceló${res.canceladas === 1 ? '' : 'ron'} ${res.canceladas} solicitud(es) de CT. El descanso queda libre para trabajarlo o pedir otro CT.`
      : 'No había solicitudes activas de CT en esa celda.',
  };
}

/**
 * Cajero/tienda solicita un CT disponible para cubrir un descanso.
 */
export async function solicitarCt(supabase, payload = {}, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const sucursal_id = normalizarCodigoTienda(payload.sucursal_id || payload.sucursal);
  if (!sucursal_id) return { ok: false, error: 'Sucursal requerida.' };
  const fecha = String(payload.fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'Fecha inválida.' };
  const ctRhId = payload.ct_rh_id || String(payload.ctId || '').replace(/^rh:/, '');
  if (!ctRhId) return { ok: false, error: 'Elige un CT del catálogo.' };

  // Si ya había CT en esta celda, cancelar antes de validar disponibilidad
  // (permite re-solicitar o cambiar CT en la misma celda).
  let canceladasPrevias = 0;
  if (payload.plan_fila_id != null && payload.plan_dia != null) {
    const cancel = await cancelarSolicitudesActivasCelda(supabase, {
      plan_fila_id: payload.plan_fila_id,
      plan_dia: payload.plan_dia,
      fecha,
      sucursal_id,
    });
    canceladasPrevias = cancel.canceladas || 0;
  }

  // Disponibilidad por fecha: cobertura en otro día no bloquea.
  const catalogo = await listarCatalogoCt(supabase, { fecha });
  const ct = (catalogo.data || []).find((c) => String(c.rh_id) === String(ctRhId));
  if (!ct) return { ok: false, error: 'CT no encontrado en el catálogo.' };
  if (!ct.puede_solicitar) {
    return {
      ok: false,
      error: (
        ct.disponibilidad === 'cubriendo'
          ? `${ct.nombre} ya cubre o está solicitado ese mismo día (${fecha}). Elige otro CT o otra fecha.`
          : `Ese CT no está disponible (${ct.disponibilidad_label}). Elige otro en verde.`
      ),
    };
  }
  if (!ctPuedeCubrirSucursal(ct.extras, sucursal_id)) {
    return {
      ok: false,
      error: `${ct.nombre} no está habilitado para cubrir en ${etiquetaTienda(sucursal_id)}.`,
    };
  }
  if (!ctPuedeCubrirTurno(ct.extras, payload.turno_id)) {
    return {
      ok: false,
      error: `${ct.nombre} solo cubre turnos de día (no nocturno).`,
    };
  }

  const ventana = ventanaPinParaFecha(fecha, payload.turno_id, payload.turno_etiqueta);
  const row = {
    sucursal_id,
    fecha,
    turno_id: payload.turno_id || null,
    turno_etiqueta: payload.turno_etiqueta || null,
    empleado_planta_id: payload.empleado_planta_id || null,
    empleado_planta_nombre: payload.empleado_planta_nombre || null,
    plan_fila_id: payload.plan_fila_id || null,
    plan_dia: payload.plan_dia != null ? Number(payload.plan_dia) : null,
    ct_rh_id: ctRhId,
    ct_nombre: ct.nombre,
    ct_telefono: ct.telefono,
    solicitado_por_id: opts.user?.id ? String(opts.user.id) : null,
    solicitado_por_nombre: opts.user?.nombre || opts.nombreActor || null,
    estado: 'solicitada',
    pin_temporal: null,
    pin_valido_desde: ventana.pin_valido_desde,
    pin_valido_hasta: ventana.pin_valido_hasta,
    notas: payload.notas || null,
  };

  const { data, error } = await supabase.from('pos_cubre_solicitudes').insert([row]).select('*').single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id,
    tipo: 'ct_solicitud',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT solicitado · ${etiquetaTienda(sucursal_id)}`,
    mensaje: (
      `${ct.nombre}: te solicitan cubrir ${fecha}`
      + (payload.turno_etiqueta ? ` (${payload.turno_etiqueta})` : '')
      + ` en ${etiquetaTienda(sucursal_id)}. `
      + `Solicitó: ${row.solicitado_por_nombre || 'caja'}.`
    ),
  });

  return {
    ok: true,
    solicitud: data,
    canceladasPrevias,
    mensaje: (
      (canceladasPrevias
        ? `Se canceló la solicitud anterior. Nueva solicitud a ${ct.nombre}`
        : `Solicitud enviada a ${ct.nombre}`)
      + ` para ${etiquetaTienda(sucursal_id)} · ${fecha}. `
      + 'El CT la ve en su celular (PIN móvil). Al aceptar se genera PIN temporal solo para esa tienda/fecha.'
    ),
  };
}

/** CT acepta → PIN temporal exclusivo tienda/fecha/turno. */
export async function aceptarSolicitudCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(prev.estado) !== 'solicitada') {
    return { ok: false, error: `La solicitud ya está en estado «${prev.estado}».` };
  }

  let pin = roundPin4();
  try {
    const { pinUsuarioOcupadoEnSucursal } = await import('./usuariosAuth.js');
    for (let i = 0; i < 10; i += 1) {
      const choque = await pinUsuarioOcupadoEnSucursal(supabase, pin, prev.sucursal_id);
      if (!choque.ocupado) break;
      pin = roundPin4();
    }
  } catch {
    /* ignore */
  }

  const ahora = new Date().toISOString();
  const ventana = ventanaPinParaFecha(prev.fecha, prev.turno_id, prev.turno_etiqueta);
  const payloadFull = {
    estado: 'aceptada',
    pin_temporal: pin,
    pin_valido_desde: ventana.pin_valido_desde,
    pin_valido_hasta: ventana.pin_valido_hasta,
    aceptada_at: ahora,
    updated_at: ahora,
  };
  let { data, error: upErr } = await supabase
    .from('pos_cubre_solicitudes')
    .update(payloadFull)
    .eq('id', solicitudId)
    .select('*')
    .single();
  // Si faltan columnas de ventana, guardar al menos el PIN.
  if (upErr && /pin_valido|column|schema cache/i.test(String(upErr.message || ''))) {
    ({ data, error: upErr } = await supabase
      .from('pos_cubre_solicitudes')
      .update({
        estado: 'aceptada',
        pin_temporal: pin,
        aceptada_at: ahora,
        updated_at: ahora,
      })
      .eq('id', solicitudId)
      .select('*')
      .single());
  }
  if (upErr) return { ok: false, error: upErr.message };
  // Garantizar PIN en la respuesta aunque el select no lo traiga.
  if (data && !data.pin_temporal) data = { ...data, pin_temporal: pin, ...ventana };

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_aceptada',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT aceptó · ${etiquetaTienda(prev.sucursal_id)}`,
    mensaje: (
      `${prev.ct_nombre} aceptó cubrir ${prev.fecha} en ${etiquetaTienda(prev.sucursal_id)}. `
      + `PIN temporal: ${pin} (solo esa tienda/fecha; se cierra 60 min después del turno).`
    ),
  });

  return {
    ok: true,
    solicitud: data,
    pin,
    mensaje: (
      `Aceptado. PIN temporal ${pin} para ${etiquetaTienda(prev.sucursal_id)} · ${prev.fecha}. `
      + 'Válido ese día/turno; se cierra 60 min después del fin del turno.'
    ),
  };
}

export async function rechazarSolicitudCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error: prevErr } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (prevErr) {
    if (faltaTabla(prevErr)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: prevErr.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(prev.estado) !== 'solicitada') {
    return { ok: false, error: `La solicitud ya está en estado «${prev.estado}».` };
  }

  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'rechazada',
      rechazo_motivo: opts.motivo || null,
      updated_at: ahora,
    })
    .eq('id', solicitudId)
    .eq('estado', 'solicitada')
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_rechazada',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT rechazó · ${etiquetaTienda(prev.sucursal_id)}`,
    mensaje: (
      `${prev.ct_nombre} NO aceptó cubrir ${prev.fecha}`
      + (prev.empleado_planta_nombre ? ` (descanso de ${prev.empleado_planta_nombre})` : '')
      + ` en ${etiquetaTienda(prev.sucursal_id)}. `
      + 'Pide otro CT o cancela el descanso. Esta alerta permanece hasta que la atiendas.'
    ),
  });

  return {
    ok: true,
    solicitud: data,
    mensaje: 'Solicitud rechazada. Se alertó a la tienda para que pida otro CT.',
  };
}

export async function cancelarSolicitudCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error: prevErr } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (prevErr) {
    if (faltaTabla(prevErr)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: prevErr.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (!['solicitada', 'aceptada'].includes(String(prev.estado))) {
    return { ok: false, error: `No se puede cancelar en estado «${prev.estado}».` };
  }

  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'cancelada',
      pin_temporal: null,
      updated_at: new Date().toISOString(),
      notas: [prev.notas, opts.motivo || 'Cancelada desde POS (cajero/admin).'].filter(Boolean).join(' · '),
    })
    .eq('id', solicitudId)
    .in('estado', ['solicitada', 'aceptada'])
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_cancelada',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT cancelado · ${etiquetaTienda(prev.sucursal_id)}`,
    mensaje: (
      `La tienda canceló la solicitud a ${prev.ct_nombre} para ${prev.fecha} `
      + `en ${etiquetaTienda(prev.sucursal_id)}.`
      + (opts.user?.nombre ? ` Canceló: ${opts.user.nombre}.` : '')
    ),
  });

  return {
    ok: true,
    solicitud: data,
    mensaje: `Solicitud a ${prev.ct_nombre} cancelada.`,
  };
}

/**
 * Incumplimiento: aceptó y no cubrió → hold 7 días.
 */
export async function marcarNoShowCt(supabase, solicitudId, opts = {}) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const { data: prev, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  if (!prev) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(prev.estado) !== 'aceptada') {
    return { ok: false, error: 'Solo se marca no-show en coberturas aceptadas.' };
  }

  const holdUntil = new Date(Date.now() + DIAS_HOLD_CT_MS).toISOString();
  const ahora = new Date().toISOString();
  const { data, error: upErr } = await supabase
    .from('pos_cubre_solicitudes')
    .update({
      estado: 'retenida',
      hold_until: holdUntil,
      updated_at: ahora,
      notas: [prev.notas, opts.notas || 'No cumplió la cobertura aceptada'].filter(Boolean).join(' · '),
    })
    .eq('id', solicitudId)
    .select('*')
    .single();
  if (upErr) return { ok: false, error: upErr.message };

  if (prev.ct_rh_id) {
    const { data: emp } = await supabase
      .from('rh_empleados')
      .select('id, extras')
      .eq('id', prev.ct_rh_id)
      .maybeSingle();
    if (emp) {
      const ex = extrasCt(emp);
      await supabase
        .from('rh_empleados')
        .update({
          extras: {
            ...ex,
            ct_disponibilidad: 'no_disponible',
            ct_hold_until: holdUntil,
          },
          updated_at: ahora,
        })
        .eq('id', emp.id);
    }
  }

  await crearNotificacion(supabase, {
    sucursal_id: prev.sucursal_id,
    tipo: 'ct_hold',
    ref_tabla: 'pos_cubre_solicitudes',
    ref_id: data.id,
    titulo: `CT en hold · ${prev.ct_nombre}`,
    mensaje: (
      `${prev.ct_nombre} no cubrió ${prev.fecha} en ${etiquetaTienda(prev.sucursal_id)}. `
      + 'Queda en hold 7 días (no podrá aceptar coberturas). Liberación automática al vencer.'
    ),
  });

  return {
    ok: true,
    solicitud: data,
    hold_until: holdUntil,
    mensaje: `${prev.ct_nombre} pasó a hold hasta ${new Date(holdUntil).toLocaleString('es-MX')}.`,
  };
}

export async function marcarCumplidaCt(supabase, solicitudId) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  // No borrar pin_temporal: el CT lo necesita en su sesión hasta el cierre del turno.
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .update({ estado: 'cumplida', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)
    .eq('estado', 'aceptada')
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, solicitud: data };
}

/**
 * Valida PIN temporal activo para una sucursal (login en caja).
 * Devuelve errores claros si el PIN existe pero no aplica (otra tienda, otro día, vencido).
 * @returns {{ ok: true, solicitud } | { ok: false, error?: string, razon?: string, faltaTabla?: boolean }}
 */
export async function validarPinTemporalCt(supabase, pin, sucursal) {
  if (!supabase) return { ok: false };
  const p = normalizarPinComparacion(pin);
  const suc = normalizarCodigoTienda(sucursal);
  if (!p || !suc) return { ok: false };
  const ahora = new Date();

  // Buscar por PIN sin filtrar tienda/estado para poder diagnosticar.
  const { data, error } = await supabase
    .from('pos_cubre_solicitudes')
    .select('*')
    .eq('pin_temporal', p)
    .in('estado', ['aceptada', 'cumplida'])
    .order('aceptada_at', { ascending: false })
    .limit(10);

  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true, razon: 'falta_tabla' };
    }
    // Columna aceptada_at puede faltar: reintentar sin order
    const retry = await supabase
      .from('pos_cubre_solicitudes')
      .select('*')
      .eq('pin_temporal', p)
      .in('estado', ['aceptada', 'cumplida'])
      .limit(10);
    if (retry.error) {
      if (faltaTabla(retry.error)) {
        return { ok: false, error: AVISO_FALTA_CUBRE_SOLICITUDES, faltaTabla: true, razon: 'falta_tabla' };
      }
      return { ok: false };
    }
    if (!retry.data?.length) return { ok: false };
    return resolverPinTemporalEncontrado(retry.data, suc, ahora);
  }

  if (!data?.length) return { ok: false };
  return resolverPinTemporalEncontrado(data, suc, ahora);
}

function resolverPinTemporalEncontrado(rows, sucursalLogin, ahora) {
  const mismaTienda = (rows || []).filter(
    (s) => normalizarCodigoTienda(s.sucursal_id) === sucursalLogin,
  );
  const candidatas = mismaTienda.length ? mismaTienda : (rows || []);

  const activa = mismaTienda.find((s) => pinTemporalCtActivo(s, ahora));
  if (activa) return { ok: true, solicitud: activa };

  // Misma tienda pero aún no es el día / ya venció
  if (mismaTienda.length) {
    const s = mismaTienda[0];
    const dia = normalizarFechaYmd(s.fecha);
    const hoy = ymdHermosillo(ahora);
    if (dia && dia > hoy) {
      return {
        ok: false,
        razon: 'fecha_futura',
        error: (
          `Ese PIN temporal es para el ${dia} en ${etiquetaTienda(sucursalLogin)}. `
          + 'Hoy aún no se puede usar en caja (sí puedes verlo en tu celular).'
        ),
      };
    }
    if (s.pin_valido_hasta && new Date(s.pin_valido_hasta) < ahora) {
      return {
        ok: false,
        razon: 'vencido',
        error: (
          `Ese PIN temporal ya venció (válido hasta el cierre del turno + ${GRACIA_PIN_TEMPORAL_CT_MIN} min). `
          + 'Pide una nueva cobertura o usa el PIN de tienda.'
        ),
      };
    }
    if (!pinTemporalCtVisible(s, ahora)) {
      return {
        ok: false,
        razon: 'inactivo',
        error: 'Ese PIN temporal ya no está activo para esta cobertura.',
      };
    }
  }

  // PIN de otra tienda
  const otra = candidatas[0];
  if (otra && normalizarCodigoTienda(otra.sucursal_id) !== sucursalLogin) {
    return {
      ok: false,
      razon: 'otra_tienda',
      error: (
        `Ese PIN temporal es para ${etiquetaTienda(otra.sucursal_id)}`
        + (otra.fecha ? ` · ${normalizarFechaYmd(otra.fecha)}` : '')
        + `. En esta caja (${etiquetaTienda(sucursalLogin)}) no aplica.`
      ),
    };
  }

  return { ok: false };
}

export function construirUsuarioDesdeSolicitudCt(solicitud) {
  const suc = normalizarCodigoTienda(solicitud?.sucursal_id) || 'MAIN';
  return {
    id: null,
    nombre: String(solicitud?.ct_nombre || 'Cubre turno').trim(),
    telefono: String(solicitud?.ct_telefono || '').replace(/\D/g, ''),
    rol: 'Cajero',
    sucursal_id: suc,
    esCubreTurno: true,
    cubreSolicitudId: solicitud?.id || null,
    cubreFecha: solicitud?.fecha || null,
    turno_id: solicitud?.turno_id || null,
    turno_horario: null,
    dispositivo_id: null,
  };
}
