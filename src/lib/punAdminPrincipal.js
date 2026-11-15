/**
 * PUN (personal unique number) del administrador principal.
 * Vive en una tabla que el resto de la app no puede leer.
 * En el navegador solo se recuerda durante esta pestaña, y solo tras entrar con él.
 */

const CLAVE_SESION = 'pos3b_pun_admin_principal_sesion';

export function recordarPunSesion(pun) {
  const valor = String(pun || '').trim();
  if (!valor || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CLAVE_SESION, valor);
  } catch {
    /* ignore */
  }
}

export function leerPunSesion() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return String(sessionStorage.getItem(CLAVE_SESION) || '');
  } catch {
    return '';
  }
}

export function olvidarPunSesion() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* ignore */
  }
}

function rpcAusente(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === 'PGRST202'
    || msg.includes('entrar_con_pun')
    || msg.includes('fijar_pun_admin_principal')
    || msg.includes('schema cache')
    || msg.includes('could not find the function')
  );
}

/** Entra como administrador principal si el texto es su PUN. No usa el PIN de usuarios. */
export async function entrarConPun(supabase, pun) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const p = String(pun || '').trim();
  if (!p) return { ok: false, error: 'Indica el PUN.' };
  const { data, error } = await supabase.rpc('entrar_con_pun', { p_pun: p });
  if (error) {
    if (rpcAusente(error)) return { ok: false, faltaRpc: true, error: null };
    return { ok: false, error: error.message };
  }
  const user = data && typeof data === 'object' ? data : null;
  if (!user?.id) return { ok: false, noExiste: true, error: null };
  return {
    ok: true,
    user: {
      ...user,
      es_admin_principal: true,
      rol: user.rol || 'Administrador',
    },
  };
}

/** Cambia el PUN. Hace falta el PUN actual. El nuevo queda solo para el administrador principal. */
export async function fijarPunAdminPrincipal(supabase, actual, nuevo) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { data, error } = await supabase.rpc('fijar_pun_admin_principal', {
    p_actual: String(actual || '').trim(),
    p_nuevo: String(nuevo || '').trim(),
  });
  if (error) {
    if (rpcAusente(error)) {
      return { ok: false, error: 'Ejecuta supabase/fix_admin_principal_pun.sql en Supabase.' };
    }
    return { ok: false, error: error.message };
  }
  if (!data?.ok) return { ok: false, error: data?.error || 'No se pudo guardar el PUN.' };
  recordarPunSesion(data.pun || nuevo);
  return { ok: true, pun: data.pun || String(nuevo || '').trim() };
}
