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
 * Cuenta oculta del administrador principal.
 * No aparece en Usuarios, nómina ni RH. Nadie más puede darla de baja o borrarla.
 */
export function esCuentaAdminPrincipalOculta(user) {
  return user?.es_admin_principal === true;
}

/**
 * Administrador principal: la cuenta marcada es_admin_principal.
 * Antes de esa columna, seguía siendo el administrador cuyo nombre es AMR / Andrés.
 */
export function esAdministradorPrincipal(user) {
  if (!user) return false;
  if (normalizarRol(user.rol) !== 'Administrador') return false;
  if (user.es_admin_principal === true) return true;
  if (user.es_admin_principal === false) return false;
  return nombreEsAdminPrincipal(user.nombre);
}

/** Quita la cuenta oculta de cualquier lista que vean los demás. */
export function omitirAdminPrincipalOculto(lista) {
  return (lista || []).filter((u) => !esCuentaAdminPrincipalOculta(u));
}

/**
 * Valida el PUN del administrador principal (también acepta el PIN legado
 * solo mientras la cuenta siga identificándose por el nombre, sin la marca nueva).
 */
export async function verificarAdminPrincipal(supabase, pin, _sucursal) {
  const credencial = String(pin || '').trim();
  const auth = await verificarPinAdministradorGlobal(supabase, credencial);
  if (auth.ok && esAdministradorPrincipal(auth.user) && !esCuentaAdminPrincipalOculta(auth.user)) {
    return auth;
  }
  const { entrarConPun } = await import('./punAdminPrincipal.js');
  const porPun = await entrarConPun(supabase, credencial);
  if (porPun.ok && esAdministradorPrincipal(porPun.user)) {
    return { ok: true, user: porPun.user, nombre: porPun.user.nombre || 'Administrador principal' };
  }
  return {
    ok: false,
    error: 'Solo el administrador principal puede realizar esta acción. Usa su PUN.',
  };
}
