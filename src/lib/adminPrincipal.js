import { normalizarRol } from './roles.js';
import { verificarPinAdministradorGlobal } from './autorizacionTurnoFueraHorario.js';

export function normalizarNombrePersona(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Alias del mismo administrador principal: AMR = Andrés (Marrero).
 * Debe coincidir con RESERVADOS_ADMIN_PRINCIPAL en reservadoAdminPrincipal.js.
 */
export const PATRONES_ADMIN_PRINCIPAL = ['amr', 'andres', 'marrero'];

/** ¿El nombre (usuario o texto) es el admin principal? */
export function nombreEsAdminPrincipal(nombre) {
  const n = normalizarNombrePersona(nombre);
  if (!n) return false;
  return PATRONES_ADMIN_PRINCIPAL.some((p) => n.includes(p));
}

/**
 * Administrador principal (AMR / Andrés): herramientas sensibles y
 * autorización de comentarios/categorías con su nombre.
 */
export function esAdministradorPrincipal(user) {
  if (!user) return false;
  if (normalizarRol(user.rol) !== 'Administrador') return false;
  return nombreEsAdminPrincipal(user.nombre);
}

/**
 * Valida PIN del admin principal en cualquier sucursal
 * (AMR/Andrés no está anclado a una sola caja).
 */
export async function verificarAdminPrincipal(supabase, pin, _sucursal) {
  const auth = await verificarPinAdministradorGlobal(supabase, pin);
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.error || 'PIN incorrecto.',
    };
  }
  if (!esAdministradorPrincipal(auth.user)) {
    return {
      ok: false,
      error: 'Solo el administrador principal (AMR / Andrés) puede realizar esta acción.',
    };
  }
  return auth;
}
