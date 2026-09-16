/**
 * Descansos autorizados (cambio de día de descanso / permiso).
 * Ese día no cuenta como falta para bono por recolección.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_FALTA_DESCANSOS_AUT =
  'Falta la tabla descansos_autorizados. En Supabase → SQL Editor pega supabase/fix_descansos_autorizados.sql y pulsa Run.';

export const EVENTO_DESCANSOS_AUTORIZADOS = 'pos3b-descansos-autorizados';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('descansos_autorizados')
    || (msg.includes('schema cache') && msg.includes('descanso'))
  );
}

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_DESCANSOS_AUTORIZADOS));
  } catch {
    /* ignore */
  }
}

export function claveDescansoAutorizado(usuarioId, fechaYmd) {
  return `${String(usuarioId || '').trim()}|${String(fechaYmd || '').slice(0, 10)}`;
}

/**
 * @returns {Promise<{ ok: boolean, data: Array, error?: string, faltaTabla?: boolean }>}
 */
export async function listarDescansosAutorizados(supabase, {
  sucursalId = '',
  desdeYmd = '',
  hastaYmd = '',
  usuarioId = '',
  limit = 500,
} = {}) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  let q = supabase
    .from('descansos_autorizados')
    .select('id,usuario_id,nombre,sucursal_id,fecha,motivo,autorizado_por,autorizado_por_rol,created_at')
    .order('fecha', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  const suc = normalizarCodigoTienda(sucursalId);
  if (suc) q = q.eq('sucursal_id', suc);
  if (usuarioId) q = q.eq('usuario_id', String(usuarioId));
  if (desdeYmd) q = q.gte('fecha', String(desdeYmd).slice(0, 10));
  if (hastaYmd) q = q.lte('fecha', String(hastaYmd).slice(0, 10));
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) return { ok: false, data: [], error: AVISO_FALTA_DESCANSOS_AUT, faltaTabla: true };
    return { ok: false, data: [], error: error.message };
  }
  const rows = (data || []).map((r) => ({
    ...r,
    fecha: String(r.fecha || '').slice(0, 10),
  }));
  return { ok: true, data: rows };
}

/** Set de claves usuarioId|ymd para lookup rápido. */
export function setClavesDescansosAutorizados(rows = []) {
  const set = new Set();
  for (const r of rows || []) {
    const k = claveDescansoAutorizado(r.usuario_id, r.fecha);
    if (k && !k.startsWith('|')) set.add(k);
  }
  return set;
}

/**
 * Autoriza un día como descanso (idempotente por usuario+fecha).
 */
export async function autorizarDescanso(supabase, {
  usuarioId,
  nombre = '',
  sucursalId,
  fechaYmd,
  motivo = '',
  autorizadoPor = '',
  autorizadoPorRol = '',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const uid = String(usuarioId || '').trim();
  const suc = normalizarCodigoTienda(sucursalId);
  const fecha = String(fechaYmd || '').slice(0, 10);
  if (!uid || !suc || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: 'Indica empleado, sucursal y fecha.' };
  }
  const row = {
    usuario_id: uid,
    nombre: String(nombre || '').trim() || null,
    sucursal_id: suc,
    fecha,
    motivo: String(motivo || '').trim() || 'Cambio de descanso autorizado',
    autorizado_por: String(autorizadoPor || '').trim() || null,
    autorizado_por_rol: String(autorizadoPorRol || '').trim() || null,
  };
  const { data, error } = await supabase
    .from('descansos_autorizados')
    .upsert(row, { onConflict: 'usuario_id,fecha' })
    .select('*')
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_DESCANSOS_AUT, faltaTabla: true };
    // Fallback sin unique: buscar e insertar/actualizar
    if (/on conflict|unique|constraint/i.test(String(error.message || ''))) {
      const prev = await supabase
        .from('descansos_autorizados')
        .select('id')
        .eq('usuario_id', uid)
        .eq('fecha', fecha)
        .maybeSingle();
      if (prev.data?.id) {
        const upd = await supabase
          .from('descansos_autorizados')
          .update(row)
          .eq('id', prev.data.id)
          .select('*')
          .single();
        if (upd.error) return { ok: false, error: upd.error.message };
        emit();
        return { ok: true, row: { ...upd.data, fecha: String(upd.data.fecha || '').slice(0, 10) } };
      }
      const ins = await supabase.from('descansos_autorizados').insert([row]).select('*').single();
      if (ins.error) {
        if (faltaTabla(ins.error)) return { ok: false, error: AVISO_FALTA_DESCANSOS_AUT, faltaTabla: true };
        return { ok: false, error: ins.error.message };
      }
      emit();
      return { ok: true, row: { ...ins.data, fecha: String(ins.data.fecha || '').slice(0, 10) } };
    }
    return { ok: false, error: error.message };
  }
  emit();
  return { ok: true, row: data ? { ...data, fecha: String(data.fecha || '').slice(0, 10) } : row };
}

export async function revocarDescansoAutorizado(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Registro inválido.' };
  const { error } = await supabase.from('descansos_autorizados').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_DESCANSOS_AUT, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  emit();
  return { ok: true };
}
