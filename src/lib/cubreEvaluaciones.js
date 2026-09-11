/**
 * Evaluaciones de planta sobre el CT (cubre turno).
 * El cajero / empleado de planta reporta cómo trabajó el CT:
 * consume mucho, faltantes, quejas de cliente, etc.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion } from './contabilidadNotificaciones.js';

export const AVISO_FALTA_CUBRE_EVALUACIONES =
  'Falta la tabla de evaluaciones CT. Ejecuta supabase/fix_cubre_evaluaciones.sql en Supabase.';

/** Criterios negativos (true = hubo el problema). Ids = columnas SQL. */
export const CRITERIOS_EVALUACION_CT = [
  { id: 'consume_mucho', label: 'Consume mucho (productos / bebidas)' },
  { id: 'faltante_cigarro', label: 'Faltante de cigarro' },
  { id: 'faltante_dinero', label: 'Faltante de dinero' },
  { id: 'quejas_cliente', label: 'Quejas del cliente' },
  { id: 'llego_tarde', label: 'Llegó tarde / se fue temprano' },
  { id: 'trato_malo', label: 'Mal trato (compañeros o clientes)' },
  { id: 'desorden_caja', label: 'Desorden / mal cierre de caja' },
  { id: 'otro_problema', label: 'Otro problema' },
];

export const CALIFICACIONES_CT = [
  { valor: 5, label: '5 · Excelente' },
  { valor: 4, label: '4 · Bien' },
  { valor: 3, label: '3 · Regular' },
  { valor: 2, label: '2 · Mal' },
  { valor: 1, label: '1 · Muy mal' },
];

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || (msg.includes('pos_cubre_evaluaciones') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

export function criteriosVacios() {
  const o = {};
  for (const c of CRITERIOS_EVALUACION_CT) o[c.id] = false;
  return o;
}

export function contarProblemasEvaluacion(evalRow = {}) {
  return CRITERIOS_EVALUACION_CT.filter((c) => Boolean(evalRow[c.id])).length;
}

export function resumenCriteriosEvaluacion(evalRow = {}) {
  return CRITERIOS_EVALUACION_CT
    .filter((c) => Boolean(evalRow[c.id]))
    .map((c) => c.label);
}

export function etiquetaCalificacionCt(n) {
  const v = Number(n);
  const hit = CALIFICACIONES_CT.find((c) => c.valor === v);
  return hit ? hit.label : (v ? String(v) : '—');
}

export function formEvaluacionCtVacio() {
  return {
    ...criteriosVacios(),
    calificacion: 4,
    comentario: '',
  };
}

export function normalizarPayloadEvaluacionCt(raw = {}) {
  const criterios = {};
  for (const c of CRITERIOS_EVALUACION_CT) {
    criterios[c.id] = Boolean(raw[c.id]);
  }
  let calificacion = raw.calificacion == null || raw.calificacion === ''
    ? null
    : Number(raw.calificacion);
  if (calificacion != null && (!Number.isFinite(calificacion) || calificacion < 1 || calificacion > 5)) {
    calificacion = null;
  }
  const comentario = String(raw.comentario || '').trim() || null;
  return { ...criterios, calificacion, comentario };
}

export async function obtenerEvaluacionPorSolicitud(supabase, solicitudId) {
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.', data: null };
  const { data, error } = await supabase
    .from('pos_cubre_evaluaciones')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_EVALUACIONES, faltaTabla: true, data: null };
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, data: data || null };
}

export async function listarEvaluacionesCt(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  let q = supabase
    .from('pos_cubre_evaluaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(opts.limit) || 80, 1), 300));
  if (opts.sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(opts.sucursal));
  if (opts.ctRhId) q = q.eq('ct_rh_id', opts.ctRhId);
  if (opts.desde) q = q.gte('fecha', String(opts.desde).slice(0, 10));
  if (opts.hasta) q = q.lte('fecha', String(opts.hasta).slice(0, 10));
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_EVALUACIONES, data: [], faltaTabla: true };
    return { ok: false, error: error.message, data: [] };
  }
  return { ok: true, data: data || [] };
}

/** Mapa solicitud_id → evaluación (para botones del panel). */
export async function mapaEvaluacionesPorSolicitudes(supabase, solicitudIds = []) {
  const ids = [...new Set((solicitudIds || []).map(String).filter(Boolean))];
  if (!supabase || !ids.length) return { ok: true, mapa: {} };
  const { data, error } = await supabase
    .from('pos_cubre_evaluaciones')
    .select('*')
    .in('solicitud_id', ids);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_EVALUACIONES, faltaTabla: true, mapa: {} };
    return { ok: false, error: error.message, mapa: {} };
  }
  const mapa = {};
  for (const row of data || []) mapa[String(row.solicitud_id)] = row;
  return { ok: true, mapa };
}

/**
 * Guarda (upsert) la evaluación de planta.
 * Si la solicitud sigue en «aceptada», también la marca cumplida.
 */
export async function guardarEvaluacionCt(supabase, solicitud, form = {}, opts = {}) {
  if (!supabase || !solicitud?.id) return { ok: false, error: 'Solicitud inválida.' };
  const estado = String(solicitud.estado || '');
  if (!['aceptada', 'cumplida'].includes(estado)) {
    return { ok: false, error: 'Solo se evalúa una cobertura aceptada o ya cumplida.' };
  }

  const norm = normalizarPayloadEvaluacionCt(form);
  const ahora = new Date().toISOString();
  const row = {
    solicitud_id: solicitud.id,
    sucursal_id: normalizarCodigoTienda(solicitud.sucursal_id) || String(solicitud.sucursal_id || ''),
    fecha: String(solicitud.fecha || '').slice(0, 10),
    ct_rh_id: solicitud.ct_rh_id || null,
    ct_nombre: solicitud.ct_nombre || 'CT',
    evaluado_por_id: opts.user?.id ? String(opts.user.id) : null,
    evaluado_por_nombre: opts.user?.nombre || opts.nombreActor || null,
    ...norm,
    updated_at: ahora,
  };

  const { data, error } = await supabase
    .from('pos_cubre_evaluaciones')
    .upsert([row], { onConflict: 'solicitud_id' })
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CUBRE_EVALUACIONES, faltaTabla: true };
    return { ok: false, error: error.message };
  }

  let solicitudActualizada = solicitud;
  if (estado === 'aceptada') {
    const { marcarCumplidaCt } = await import('./cubreSolicitudes.js');
    const cum = await marcarCumplidaCt(supabase, solicitud.id);
    if (cum.ok) solicitudActualizada = cum.solicitud || solicitudActualizada;
  }

  const problemas = resumenCriteriosEvaluacion(data);
  if (problemas.length) {
    await crearNotificacion(supabase, {
      sucursal_id: row.sucursal_id,
      tipo: 'ct_evaluacion_alerta',
      ref_tabla: 'pos_cubre_evaluaciones',
      ref_id: data.id,
      titulo: `Alerta evaluación CT · ${row.ct_nombre}`,
      mensaje: (
        `${row.ct_nombre} en ${etiquetaTienda(row.sucursal_id)} · ${row.fecha}: `
        + problemas.join('; ')
        + (norm.comentario ? `. Comentario: ${norm.comentario}` : '')
        + `. Evaluó: ${row.evaluado_por_nombre || 'planta'}.`
      ),
    });
  }

  let bloqueoApp = null;
  if (row.ct_rh_id) {
    try {
      const { sincronizarBloqueoAceptacionCt } = await import('./cubreAceptacionCt.js');
      bloqueoApp = await sincronizarBloqueoAceptacionCt(supabase, row.ct_rh_id);
      if (bloqueoApp?.bloqueado && bloqueoApp?.cambio) {
        await crearNotificacion(supabase, {
          sucursal_id: row.sucursal_id,
          tipo: 'ct_acceso_app_bloqueado',
          ref_tabla: 'rh_empleados',
          ref_id: row.ct_rh_id,
          titulo: `App CT bloqueada · ${row.ct_nombre}`,
          mensaje: (
            `${row.ct_nombre}: aceptación ${bloqueoApp.resumen?.pct ?? '—'}% `
            + `(mínimo ${bloqueoApp.resumen?.umbral ?? 60}%). `
            + 'Solo un Administrador puede desbloquear en RH ABA3B.'
          ),
        });
      }
    } catch {
      /* best-effort */
    }
  }

  const avisoBloqueo = bloqueoApp?.bloqueado && bloqueoApp?.cambio
    ? ` Acceso a la app del CT bloqueado (aceptación ${bloqueoApp.resumen?.pct}%).`
    : '';

  return {
    ok: true,
    evaluacion: data,
    solicitud: solicitudActualizada,
    problemas,
    bloqueoApp,
    mensaje: (
      (problemas.length
        ? `Evaluación guardada con ${problemas.length} alerta(s). Se notificó a administración.`
        : 'Evaluación guardada. Sin alertas de problemas.')
      + avisoBloqueo
    ),
  };
}
