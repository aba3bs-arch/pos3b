import { normalizarNombrePersona, verificarAdminPrincipal } from './adminPrincipal.js';
import { normalizarRol } from './roles.js';

/** Nombres/iniciales reservados: AMR = Andrés = Marrero (misma persona). */
export const RESERVADOS_ADMIN_PRINCIPAL = ['amr', 'andres', 'marrero'];

/** Cualquier Administrador puede usar Andrés / AMR / Marrero sin PIN. */
export function esAdminPuedeUsarReservado(user) {
  return Boolean(user) && normalizarRol(user.rol) === 'Administrador';
}

export function textoContieneReservadoAdmin(texto) {
  const n = normalizarNombrePersona(texto);
  if (!n) return false;
  // Palabra completa o token separado (evita falsos positivos raros en otros textos).
  return RESERVADOS_ADMIN_PRINCIPAL.some((r) => {
    if (n === r) return true;
    if (n.includes(` ${r} `) || n.startsWith(`${r} `) || n.endsWith(` ${r}`)) return true;
    // Iniciales / pegado frecuente: "amr.", "a.marrero", "andres/"
    if (n.includes(r)) return true;
    return false;
  });
}

export function encontrarReservadoAdmin(texto) {
  const n = normalizarNombrePersona(texto);
  if (!n) return null;
  return RESERVADOS_ADMIN_PRINCIPAL.find((r) => n.includes(r)) || null;
}

/**
 * Valida comentarios / categorías / motivos.
 * Cualquier Administrador puede usar Andrés/AMR/Marrero sin PIN.
 * Si no es admin y hay coincidencia → pedir PIN del admin principal.
 * @returns {{ ok: true } | { ok: false, error: string, requierePin?: true }}
 */
export function validarTextoSinReservadoAdmin(texto, user) {
  const hallado = encontrarReservadoAdmin(texto);
  if (!hallado) return { ok: true };
  if (esAdminPuedeUsarReservado(user)) return { ok: true };
  return {
    ok: false,
    requierePin: true,
    error:
      `No se puede usar «${hallado.toUpperCase()}» en comentarios ni categorías ` +
      `sin ser administrador o sin autorización (PIN de AMR / Andrés).`,
  };
}

/**
 * Si el texto tiene reservado y el usuario no es Administrador, pide PIN de AMR/Andrés.
 * @returns {{ ok: true, autorizadoPor?: string } | { ok: false, error: string, cancelado?: boolean }}
 */
export async function asegurarTextoSinReservadoOPin(supabase, texto, { user, sucursal, promptFn = prompt } = {}) {
  const v = validarTextoSinReservadoAdmin(texto, user);
  if (v.ok) return { ok: true };
  if (!supabase) return { ok: false, error: v.error };

  const pin = promptFn(
    `${v.error}\n\nPIN de AMR / Andrés para autorizar:`,
  );
  if (pin === null) return { ok: false, error: 'Autorización cancelada.', cancelado: true };
  const auth = await verificarAdminPrincipal(supabase, String(pin).trim(), sucursal);
  if (!auth.ok) return { ok: false, error: auth.error || 'PIN no autorizado.' };
  return { ok: true, autorizadoPor: auth.nombre };
}

/** Une varios campos de texto y valida el conjunto. */
export async function asegurarCamposSinReservadoOPin(supabase, campos, opts = {}) {
  const texto = (campos || []).filter(Boolean).join(' · ');
  return asegurarTextoSinReservadoOPin(supabase, texto, opts);
}
