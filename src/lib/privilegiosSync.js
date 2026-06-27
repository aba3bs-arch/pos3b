import { leerPrivilegiosLocal, guardarPrivilegiosLocal, persistirPrivilegios } from './posConfig.js';
import { sanitizarPrivilegios } from './privilegios.js';

const AVISO_SIN_TABLA =
  'Opcional: ejecuta supabase/fix_privilegios_pos.sql para sincronizar privilegios entre todas las cajas.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('pos_privilegios');
}

function ts(val) {
  const n = Date.parse(val);
  return Number.isFinite(n) ? n : 0;
}

/** Descarga privilegios globales si la nube tiene una versión más reciente. */
export async function sincronizarPrivilegiosDesdeNube(supabase) {
  if (!supabase) return { ok: true, aviso: null, cambio: false };
  const { data, error } = await supabase.from('pos_privilegios').select('data, updated_at').eq('id', 'global').maybeSingle();
  if (error) {
    if (faltaTabla(error)) return { ok: true, aviso: AVISO_SIN_TABLA, cambio: false, sinTabla: true };
    return { ok: false, error: error.message, cambio: false };
  }
  if (!data?.data) return { ok: true, cambio: false };

  const remoto = sanitizarPrivilegios({ ...data.data, _updatedAt: data.updated_at });
  const local = leerPrivilegiosLocal();
  const remotoMs = ts(remoto._updatedAt);
  const localMs = ts(local._updatedAt);

  if (remotoMs >= localMs && remotoMs > 0) {
    guardarPrivilegiosLocal(remoto, { silencioso: true });
    return { ok: true, cambio: remotoMs > localMs };
  }
  return { ok: true, cambio: false };
}

/** Sube privilegios a Supabase (misma copia en todas las sucursales). */
export async function subirPrivilegiosANube(supabase, data) {
  if (!supabase) return { ok: true, aviso: null };
  const payload = sanitizarPrivilegios(data);
  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('pos_privilegios').upsert({
    id: 'global',
    data: { porRol: payload.porRol, porUsuario: payload.porUsuario, acciones: payload.acciones },
    updated_at,
  });
  if (error) {
    if (faltaTabla(error)) return { ok: false, aviso: AVISO_SIN_TABLA, sinTabla: true, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true, updated_at };
}
