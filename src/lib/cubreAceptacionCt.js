/**
 * Nivel de aceptación del CT según calificaciones de planta (1–5 → %).
 * Si baja del umbral, se bloquea el acceso a la app móvil; solo un Administrador
 * puede desbloquearlo desde RH ABA3B.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { listarEvaluacionesCt } from './cubreEvaluaciones.js';

/** Por debajo de esto se bloquea la app del CT. */
export const UMBRAL_ACEPTACION_CT = 60;

/** Mínimo de calificaciones numéricas para aplicar bloqueo automático. */
export const MIN_EVALS_BLOQUEO_CT = 1;

function extrasDe(emp) {
  return emp?.extras && typeof emp.extras === 'object' ? { ...emp.extras } : {};
}

/** Promedio de calificaciones 1–5 (ignora null). */
export function promedioCalificacionCt(evals = []) {
  const nums = (evals || [])
    .map((e) => Number(e?.calificacion))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** (promedio / 5) * 100, redondeado a 1 decimal. */
export function aceptacionPctDesdeEvals(evals = []) {
  const avg = promedioCalificacionCt(evals);
  if (avg == null) return null;
  return Math.round((avg / 5) * 1000) / 10;
}

export function aceptacionPorSucursal(evals = []) {
  const by = new Map();
  for (const row of evals || []) {
    const cal = Number(row?.calificacion);
    if (!Number.isFinite(cal) || cal < 1 || cal > 5) continue;
    const suc = normalizarCodigoTienda(row.sucursal_id) || String(row.sucursal_id || '—');
    if (!by.has(suc)) by.set(suc, []);
    by.get(suc).push(cal);
  }
  return [...by.entries()]
    .map(([sucursal_id, nums]) => {
      const promedio = nums.reduce((a, b) => a + b, 0) / nums.length;
      const pct = Math.round((promedio / 5) * 1000) / 10;
      return {
        sucursal_id,
        tienda: etiquetaTienda(sucursal_id),
        n: nums.length,
        promedio: Math.round(promedio * 10) / 10,
        pct,
      };
    })
    .sort((a, b) => a.tienda.localeCompare(b.tienda, 'es'));
}

export function construirResumenAceptacionCt(evals = []) {
  const conCal = (evals || []).filter((e) => {
    const n = Number(e?.calificacion);
    return Number.isFinite(n) && n >= 1 && n <= 5;
  });
  const pct = aceptacionPctDesdeEvals(conCal);
  const promedio = promedioCalificacionCt(conCal);
  return {
    n: conCal.length,
    promedio,
    pct,
    porSucursal: aceptacionPorSucursal(conCal),
    bajoUmbral: pct != null && conCal.length >= MIN_EVALS_BLOQUEO_CT && pct < UMBRAL_ACEPTACION_CT,
    umbral: UMBRAL_ACEPTACION_CT,
  };
}

export async function resumenAceptacionCt(supabase, ctRhId, opts = {}) {
  if (!supabase || !ctRhId) {
    return { ok: false, error: 'CT inválido.', ...construirResumenAceptacionCt([]) };
  }
  const list = await listarEvaluacionesCt(supabase, {
    ctRhId,
    limit: opts.limit || 300,
    desde: opts.desde,
    hasta: opts.hasta,
  });
  if (!list.ok && list.faltaTabla) {
    return {
      ok: false,
      error: list.error,
      faltaTabla: true,
      ...construirResumenAceptacionCt([]),
    };
  }
  if (!list.ok) {
    return { ok: false, error: list.error, ...construirResumenAceptacionCt([]) };
  }
  return { ok: true, ...construirResumenAceptacionCt(list.data || []) };
}

export function esAccesoAppCtBloqueado(extras = {}) {
  return Boolean(extras?.ct_acceso_app_bloqueado);
}

export function etiquetaNivelAceptacionCt(pct) {
  if (pct == null) return 'Sin calificaciones';
  if (pct >= 80) return 'Alto';
  if (pct >= UMBRAL_ACEPTACION_CT) return 'Aceptable';
  return 'Bajo · acceso bloqueado';
}

export function colorNivelAceptacionCt(pct) {
  if (pct == null) return '#64748b';
  if (pct >= 80) return '#2e7d32';
  if (pct >= UMBRAL_ACEPTACION_CT) return '#f59e0b';
  return '#c62828';
}

/**
 * Tras una evaluación: si el % baja del umbral, marca bloqueo en extras RH.
 * Si sube de nuevo, limpia el bloqueo automático (salvo que quede flag explícito — se limpia igual).
 */
export async function sincronizarBloqueoAceptacionCt(supabase, ctRhId) {
  if (!supabase || !ctRhId) return { ok: false, error: 'CT inválido.' };
  const resumen = await resumenAceptacionCt(supabase, ctRhId);
  if (!resumen.ok && resumen.faltaTabla) return { ok: true, omitido: true, resumen };
  if (!resumen.ok) return { ok: false, error: resumen.error, resumen };

  const { data: prev, error } = await supabase
    .from('rh_empleados')
    .select('id, extras')
    .eq('id', ctRhId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, resumen };
  if (!prev) return { ok: false, error: 'CT no encontrado.', resumen };

  const ex = extrasDe(prev);
  const ahora = new Date().toISOString();
  let next = { ...ex };
  let cambio = false;

  if (resumen.bajoUmbral) {
    if (!ex.ct_acceso_app_bloqueado) {
      next = {
        ...next,
        ct_acceso_app_bloqueado: true,
        ct_acceso_app_bloqueado_at: ahora,
        ct_acceso_app_bloqueado_motivo: `Aceptación ${resumen.pct}% < ${UMBRAL_ACEPTACION_CT}%`,
        ct_acceso_app_aceptacion_pct: resumen.pct,
      };
      delete next.ct_acceso_app_desbloqueo_gracia;
      cambio = true;
    } else {
      next.ct_acceso_app_aceptacion_pct = resumen.pct;
      if (next.ct_acceso_app_aceptacion_pct !== ex.ct_acceso_app_aceptacion_pct) cambio = true;
    }
  } else if (ex.ct_acceso_app_bloqueado && !ex.ct_acceso_app_desbloqueo_gracia) {
    // Solo auto-desbloquea si ya no está bajo el umbral (admin gracia se limpia al superar umbral).
    delete next.ct_acceso_app_bloqueado;
    delete next.ct_acceso_app_bloqueado_at;
    delete next.ct_acceso_app_bloqueado_motivo;
    delete next.ct_acceso_app_aceptacion_pct;
    delete next.ct_acceso_app_desbloqueo_gracia;
    cambio = true;
  } else if (!resumen.bajoUmbral && ex.ct_acceso_app_desbloqueo_gracia) {
    delete next.ct_acceso_app_bloqueado;
    delete next.ct_acceso_app_bloqueado_at;
    delete next.ct_acceso_app_bloqueado_motivo;
    delete next.ct_acceso_app_aceptacion_pct;
    delete next.ct_acceso_app_desbloqueo_gracia;
    cambio = true;
  }

  if (!cambio) return { ok: true, cambio: false, bloqueado: Boolean(next.ct_acceso_app_bloqueado), resumen };

  const { error: upErr } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: ahora })
    .eq('id', ctRhId);
  if (upErr) return { ok: false, error: upErr.message, resumen };

  return {
    ok: true,
    cambio: true,
    bloqueado: Boolean(next.ct_acceso_app_bloqueado),
    resumen,
    extras: next,
  };
}

/**
 * Administrador desbloquea acceso a la app aunque el % siga bajo.
 * La gracia dura hasta la siguiente evaluación que vuelva a sincronizar el bloqueo.
 */
export async function desbloquearAccesoAppCt(supabase, rhId, opts = {}) {
  if (!supabase || !rhId) return { ok: false, error: 'CT inválido.' };
  const { data: prev, error } = await supabase
    .from('rh_empleados')
    .select('id, extras, tipo_empleado')
    .eq('id', rhId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prev) return { ok: false, error: 'CT no encontrado.' };
  if (prev.tipo_empleado !== 'cubre_turno') {
    return { ok: false, error: 'Solo aplica a Cubre turnos.' };
  }
  const ex = extrasDe(prev);
  const ahora = new Date().toISOString();
  const next = {
    ...ex,
    ct_acceso_app_bloqueado: false,
    ct_acceso_app_desbloqueo_gracia: true,
    ct_acceso_app_desbloqueado_at: ahora,
    ct_acceso_app_desbloqueado_por: opts.user?.nombre || opts.nombreActor || 'Administrador',
    ct_acceso_app_desbloqueado_por_id: opts.user?.id != null ? String(opts.user.id) : null,
  };
  delete next.ct_acceso_app_bloqueado_at;
  delete next.ct_acceso_app_bloqueado_motivo;

  const { error: upErr } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: ahora })
    .eq('id', rhId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, extras: next };
}

/**
 * En login: si hay flag de bloqueo (sin gracia activa), deniega.
 * Si no hay flag pero el % está bajo, aplica bloqueo y deniega.
 */
export async function verificarAccesoAppCtEnLogin(supabase, empleado) {
  if (!empleado?.id) return { ok: true };
  const ex = extrasDe(empleado);
  if (ex.ct_acceso_app_bloqueado && !ex.ct_acceso_app_desbloqueo_gracia) {
    const pct = ex.ct_acceso_app_aceptacion_pct;
    return {
      ok: false,
      accesoBloqueado: true,
      pinCt: true,
      error:
        'Tu acceso a la app está bloqueado: el nivel de aceptación de las tiendas '
        + `bajó del ${UMBRAL_ACEPTACION_CT}%`
        + (pct != null ? ` (actual: ${pct}%)` : '')
        + '. Solo un Administrador puede desbloquearte desde RH ABA3B.',
    };
  }
  // Si hay gracia de admin, permitir aunque el % siga bajo.
  if (ex.ct_acceso_app_desbloqueo_gracia) return { ok: true, gracia: true };

  const resumen = await resumenAceptacionCt(supabase, empleado.id);
  if (!resumen.ok) return { ok: true }; // no bloquear por fallo de red/tabla
  if (resumen.bajoUmbral) {
    await sincronizarBloqueoAceptacionCt(supabase, empleado.id);
    return {
      ok: false,
      accesoBloqueado: true,
      pinCt: true,
      error:
        `Tu acceso a la app está bloqueado: aceptación ${resumen.pct}% `
        + `(mínimo ${UMBRAL_ACEPTACION_CT}%). Contacta a un Administrador en RH ABA3B.`,
    };
  }
  return { ok: true, resumen };
}
