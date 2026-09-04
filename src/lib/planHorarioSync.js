/**
 * Persistencia del plan horario: localStorage + nube pos_plan_horario.
 */
import { normalizarPlan, planVacio } from './planHorario.js';

export const LS_PLAN_HORARIO = 'pos3b_plan_horario';
export const LS_PLAN_HORARIO_AT = 'pos3b_plan_horario_at';
export const EVENTO_PLAN_HORARIO = 'pos3b-plan-horario-updated';

export const AVISO_FALTA_PLAN_HORARIO_SQL =
  'Ejecuta supabase/fix_plan_horario.sql en Supabase para sincronizar el plan horario entre sucursales.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_plan_horario')
    || (msg.includes('schema cache') && msg.includes('plan_horario'))
  );
}

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_PLAN_HORARIO));
  } catch {
    /* ignore */
  }
}

export function leerPlanHorarioLocal() {
  try {
    const raw = localStorage.getItem(LS_PLAN_HORARIO);
    if (!raw) return planVacio();
    return normalizarPlan(JSON.parse(raw));
  } catch {
    return planVacio();
  }
}

export function leerPlanHorarioAt() {
  try {
    return localStorage.getItem(LS_PLAN_HORARIO_AT) || null;
  } catch {
    return null;
  }
}

export function guardarPlanHorarioLocal(plan, { updatedAt = null } = {}) {
  const norm = normalizarPlan(plan);
  const at = updatedAt || new Date().toISOString();
  try {
    localStorage.setItem(LS_PLAN_HORARIO, JSON.stringify(norm));
    localStorage.setItem(LS_PLAN_HORARIO_AT, at);
  } catch {
    /* ignore */
  }
  emit();
  return { plan: norm, updatedAt: at };
}

export async function bajarPlanHorarioDeNube(supabase) {
  if (!supabase) return { ok: false, sinSupabase: true };
  const { data, error } = await supabase
    .from('pos_plan_horario')
    .select('id,config,updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_FALTA_PLAN_HORARIO_SQL, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, vacio: true, plan: planVacio(), updated_at: null };
  return { ok: true, plan: normalizarPlan(data.config), updated_at: data.updated_at || null };
}

export async function sincronizarPlanHorarioDesdeNube(supabase) {
  const remoto = await bajarPlanHorarioDeNube(supabase);
  if (!remoto.ok) return remoto;
  if (remoto.vacio) return { ok: true, cambio: false, plan: leerPlanHorarioLocal() };
  const localAt = leerPlanHorarioAt();
  const remotoAt = remoto.updated_at || '';
  const cambio = !localAt || remotoAt > localAt;
  if (cambio || !localAt) {
    guardarPlanHorarioLocal(remoto.plan, { updatedAt: remotoAt || new Date().toISOString() });
  }
  return { ok: true, cambio, plan: cambio || !localAt ? remoto.plan : leerPlanHorarioLocal(), aviso: remoto.aviso };
}

export async function subirPlanHorarioANube(supabase, plan) {
  if (!supabase) return { ok: true };
  const norm = normalizarPlan(plan);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('pos_plan_horario').upsert({
    id: 'global',
    config: norm,
    updated_at,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_FALTA_PLAN_HORARIO_SQL, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true, updated_at, plan: norm };
}

export async function persistirPlanHorario(plan, supabase) {
  const local = guardarPlanHorarioLocal(plan);
  const remoto = await subirPlanHorarioANube(supabase, local.plan);
  if (remoto.ok && remoto.updated_at) {
    guardarPlanHorarioLocal(remoto.plan || local.plan, { updatedAt: remoto.updated_at });
  }
  return { local: local.plan, remoto };
}
