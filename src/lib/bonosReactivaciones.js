/**
 * Reactivación de bono por empleado de tienda (directo).
 * `vuelve_ymd` = primer día en que el bono vuelve a contar.
 * Las faltas estrictamente anteriores a esa fecha dejan de bloquear.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_FALTA_BONOS_REACTIVACIONES =
  'Falta la tabla bonos_reactivaciones. En Supabase → SQL Editor pega supabase/fix_bonos_reactivaciones.sql y pulsa Run.';

export const EVENTO_BONOS_REACTIVACIONES = 'pos3b-bonos-reactivaciones';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('bonos_reactivaciones')
    || (msg.includes('schema cache') && msg.includes('reactiv'))
  );
}

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_BONOS_REACTIVACIONES));
  } catch {
    /* ignore */
  }
}

export function ymdReactivacion(row) {
  return String(row?.vuelve_ymd ?? row?.vuelveYmd ?? '').slice(0, 10);
}

export function idDesdeClaveBloqueoBono(clave) {
  const s = String(clave || '').trim();
  return s.startsWith('id:') ? s.slice(3) : s;
}

/** Mapa usuarioId → { vuelveYmd, ...row } */
export function mapaReactivacionesBono(rows = []) {
  const map = {};
  for (const r of rows || []) {
    const uid = String(r.usuario_id ?? r.usuarioId ?? '').trim();
    const ymd = ymdReactivacion(r);
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    map[uid] = { ...r, usuarioId: uid, vuelveYmd: ymd };
    map[`id:${uid}`] = map[uid];
  }
  return map;
}

/**
 * Faltas que aún cuentan tras una reactivación.
 * Si hoy >= vuelveYmd, se ignoran las anteriores a esa fecha.
 * Si la fecha de reactivación es futura, no se recorta (el ban sigue;
 * la UI puede mostrar esa fecha como “vuelve”).
 */
export function faltasTrasReactivacion(faltasYmd = [], { hoy, vuelveYmd } = {}) {
  const list = [...new Set(
    (faltasYmd || []).map((x) => String(x || '').slice(0, 10)).filter(Boolean),
  )].sort();
  const corte = String(vuelveYmd || '').slice(0, 10);
  const h = String(hoy || '').slice(0, 10);
  if (!corte || !h || h < corte) return list;
  return list.filter((ymd) => ymd >= corte);
}

/**
 * @returns {Promise<{ ok: boolean, data: Array, error?: string, faltaTabla?: boolean }>}
 */
export async function listarBonosReactivaciones(supabase, {
  sucursalId = '',
  usuarioId = '',
  limit = 200,
} = {}) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  let q = supabase
    .from('bonos_reactivaciones')
    .select('id,usuario_id,nombre,sucursal_id,vuelve_ymd,motivo,autorizado_por,autorizado_por_rol,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 200, 1), 500));
  const suc = normalizarCodigoTienda(sucursalId);
  if (suc) q = q.eq('sucursal_id', suc);
  if (usuarioId) q = q.eq('usuario_id', String(usuarioId));
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, data: [], error: AVISO_FALTA_BONOS_REACTIVACIONES, faltaTabla: true };
    }
    return { ok: false, data: [], error: error.message };
  }
  const rows = (data || []).map((r) => ({
    ...r,
    vuelve_ymd: String(r.vuelve_ymd || '').slice(0, 10),
    sucursal_id: normalizarCodigoTienda(r.sucursal_id) || r.sucursal_id,
  }));
  return { ok: true, data: rows };
}

/**
 * Reactiva (o corrige la fecha de reactivación) el bono de un empleado de tienda.
 * Idempotente por usuario_id: reemplaza la fecha anterior.
 */
export async function reactivarBonoEmpleado(supabase, {
  usuarioId,
  nombre = '',
  sucursalId,
  vuelveYmd,
  motivo = '',
  autorizadoPor = '',
  autorizadoPorRol = '',
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const uid = String(usuarioId || '').trim();
  const suc = normalizarCodigoTienda(sucursalId);
  const fecha = String(vuelveYmd || '').slice(0, 10);
  if (!uid || !suc || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: 'Indica empleado de tienda, sucursal y fecha de reactivación.' };
  }

  const row = {
    usuario_id: uid,
    nombre: String(nombre || '').trim() || null,
    sucursal_id: suc,
    vuelve_ymd: fecha,
    motivo: String(motivo || '').trim() || 'Reactivación de bono',
    autorizado_por: String(autorizadoPor || '').trim() || null,
    autorizado_por_rol: String(autorizadoPorRol || '').trim() || null,
  };

  const upsert = await supabase
    .from('bonos_reactivaciones')
    .upsert(row, { onConflict: 'usuario_id' })
    .select('*')
    .maybeSingle();
  if (!upsert.error) {
    emit();
    return {
      ok: true,
      row: upsert.data
        ? { ...upsert.data, vuelve_ymd: String(upsert.data.vuelve_ymd || '').slice(0, 10) }
        : row,
    };
  }
  if (faltaTabla(upsert.error)) {
    return { ok: false, error: AVISO_FALTA_BONOS_REACTIVACIONES, faltaTabla: true };
  }
  if (/on conflict|unique|constraint/i.test(String(upsert.error.message || ''))) {
    const prev = await supabase
      .from('bonos_reactivaciones')
      .select('id')
      .eq('usuario_id', uid)
      .maybeSingle();
    if (prev.data?.id) {
      const upd = await supabase
        .from('bonos_reactivaciones')
        .update(row)
        .eq('id', prev.data.id)
        .select('*')
        .single();
      if (upd.error) return { ok: false, error: upd.error.message };
      emit();
      return { ok: true, row: { ...upd.data, vuelve_ymd: String(upd.data.vuelve_ymd || '').slice(0, 10) } };
    }
    const ins = await supabase.from('bonos_reactivaciones').insert([row]).select('*').single();
    if (ins.error) {
      if (faltaTabla(ins.error)) {
        return { ok: false, error: AVISO_FALTA_BONOS_REACTIVACIONES, faltaTabla: true };
      }
      return { ok: false, error: ins.error.message };
    }
    emit();
    return { ok: true, row: { ...ins.data, vuelve_ymd: String(ins.data.vuelve_ymd || '').slice(0, 10) } };
  }
  return { ok: false, error: upsert.error.message };
}

export async function revocarReactivacionBono(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Registro inválido.' };
  const { error } = await supabase.from('bonos_reactivaciones').delete().eq('id', id);
  if (error) {
    if (faltaTabla(error)) {
      return { ok: false, error: AVISO_FALTA_BONOS_REACTIVACIONES, faltaTabla: true };
    }
    return { ok: false, error: error.message };
  }
  emit();
  return { ok: true };
}

export function etiquetaReactivacionBono(row) {
  const ymd = ymdReactivacion(row);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  const suc = etiquetaTienda(row?.sucursal_id || row?.sucursalId || '');
  const fecha = d && m ? `${d}/${m}/${y}` : ymd;
  return suc ? `${fecha} · ${suc}` : fecha;
}
