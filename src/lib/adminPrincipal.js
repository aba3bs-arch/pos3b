import { normalizarRol } from './roles.js';
import { verificarPinAdministrador } from './valesPrestamos.js';

export function normalizarNombrePersona(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Solo el administrador principal Andrés puede usar herramientas destructivas. */
export function esAdministradorPrincipal(user) {
  if (!user) return false;
  if (normalizarRol(user.rol) !== 'Administrador') return false;
  const n = normalizarNombrePersona(user.nombre);
  return n.includes('andres');
}

export async function verificarAdminPrincipal(supabase, pin, sucursal) {
  const auth = await verificarPinAdministrador(supabase, pin, sucursal);
  if (!auth.ok) return auth;
  if (!esAdministradorPrincipal(auth.user)) {
    return { ok: false, error: 'Solo el administrador principal Andrés puede realizar esta acción.' };
  }
  return auth;
}
