import { normalizarCodigoTienda, etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';

export function sucursalUsuario(user) {
  const s = user?.sucursal_id;
  return s ? normalizarCodigoTienda(s) : null;
}

/** Roles de personal de Central (reloj / asistencia en cualquier sucursal). */
export const ROLES_PERSONAL_CENTRAL = ['Administrador', 'Auditor', 'Técnico', 'Repartidor'];

/**
 * Personal de Central de administración:
 * - asignado a MAIN, o
 * - rol de central (Auditor / Técnico / Repartidor / Administrador).
 * Gerente de piso NO entra aquí (sigue ligado a su tienda en el checador).
 */
export function esPersonalCentralAdmin(user) {
  if (esAlmacenCentral(sucursalUsuario(user))) return true;
  const r = normalizarRol(user?.rol);
  return ROLES_PERSONAL_CENTRAL.includes(r);
}

/** Puede marcar asistencia en el checador de cualquier sucursal. */
export function puedeMarcarAsistenciaCualquierSucursal(user) {
  return esPersonalCentralAdmin(user);
}

/** Solo Administrador: sin anclaje a sucursal ni a dispositivo en el login. */
export function esAdministradorSinAnclaje(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Usuario sin sucursal asignada (filas antiguas) puede entrar en cualquier tienda. */
export function usuarioCoincideSucursal(user, sucursalActiva) {
  if (esAdministradorSinAnclaje(user?.rol)) return true;
  const asignada = sucursalUsuario(user);
  if (!asignada) return true;
  return asignada === normalizarCodigoTienda(sucursalActiva);
}

export function mensajePinSucursalIncorrecta(sucursalActiva, sucursalReal) {
  if (sucursalReal) {
    return `Este PIN pertenece a ${etiquetaTienda(sucursalReal)}, no a ${etiquetaTienda(sucursalActiva)}. Cambia la tienda de la caja o pide al admin mover tu usuario.`;
  }
  return `PIN no válido para la tienda ${etiquetaTienda(sucursalActiva)}. Verifica que el empleado esté dado de alta en esta sucursal.`;
}

function faltaColumnaSucursal(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('sucursal_id') && msg.includes('does not exist');
}

/** Si hay varios admins con el mismo PIN, prioriza la tienda actual, luego MAIN. */
function elegirAdministradorPorPin(admins, sucursalActiva) {
  if (!admins?.length) return null;
  if (admins.length === 1) return admins[0];
  const suc = normalizarCodigoTienda(sucursalActiva);
  const enTienda = admins.find((u) => sucursalUsuario(u) === suc);
  if (enTienda) return enTienda;
  const main = admins.find((u) => sucursalUsuario(u) === 'MAIN');
  if (main) return main;
  const sinSuc = admins.find((u) => !sucursalUsuario(u));
  if (sinSuc) return sinSuc;
  return admins[0];
}

/**
 * Busca usuario por PIN.
 * - Empleados fijos (cajero, etc.): solo en la sucursal de la caja.
 * - Administrador: PIN válido desde cualquier tienda o dispositivo (sin anclaje).
 * - opts.aceptarPersonalCentral: personal de MAIN también válido (reloj empleados).
 */
export async function buscarUsuarioPorPinYSucursal(supabase, pin, sucursalActiva, opts = {}) {
  if (!supabase) return { user: null, error: 'Sin conexión a Supabase.' };
  const p = String(pin || '').trim();
  if (!p) return { user: null, error: null };
  const suc = normalizarCodigoTienda(sucursalActiva);

  const qExact = await supabase.from('usuarios').select('*').eq('pin', p).eq('sucursal_id', suc).maybeSingle();
  if (qExact.error && !faltaColumnaSucursal(qExact.error)) {
    return { user: null, error: qExact.error.message };
  }
  if (qExact.data) return { user: qExact.data, error: null };

  const qAll = await supabase.from('usuarios').select('*').eq('pin', p);
  if (qAll.error) {
    if (faltaColumnaSucursal(qAll.error)) {
      const qLegacy = await supabase.from('usuarios').select('*').eq('pin', p).maybeSingle();
      if (qLegacy.error) return { user: null, error: qLegacy.error.message };
      if (qLegacy.data) return { user: qLegacy.data, error: null, sinColumnaSucursal: true };
    }
    return { user: null, error: qAll.error.message };
  }

  const list = qAll.data || [];
  if (list.length === 0) return { user: null, error: null };

  // Administrador: puede entrar desde cualquier sucursal / dispositivo.
  const admins = list.filter((u) => esAdministradorSinAnclaje(u.rol));
  const admin = elegirAdministradorPorPin(admins, suc);
  if (admin) return { user: admin, error: null };

  // Reloj empleados: personal de Central puede marcar en cualquier caja.
  if (opts.aceptarPersonalCentral) {
    const centrales = list.filter((u) => puedeMarcarAsistenciaCualquierSucursal(u));
    if (centrales.length === 1) return { user: centrales[0], error: null, personalCentral: true };
    if (centrales.length > 1) {
      const enMain = centrales.find((u) => sucursalUsuario(u) === 'MAIN') || centrales[0];
      return { user: enMain, error: null, personalCentral: true };
    }
  }

  const enTienda = list.find((u) => sucursalUsuario(u) === suc);
  if (enTienda) return { user: enTienda, error: null };

  const sinSucursal = list.find((u) => !sucursalUsuario(u));
  if (sinSucursal) return { user: sinSucursal, error: null, sinColumnaSucursal: true };

  return {
    user: null,
    error: null,
    avisoSucursal: true,
    sucursalReal: sucursalUsuario(list[0]),
  };
}

/** True si el PIN ya lo usa un empleado fijo de esa sucursal. */
export async function pinUsuarioOcupadoEnSucursal(supabase, pin, sucursalActiva, { excluirUsuarioId } = {}) {
  if (!supabase) return { ocupado: false, error: 'Sin conexión a Supabase.' };
  const p = String(pin || '').trim();
  if (!p) return { ocupado: false };
  const suc = normalizarCodigoTienda(sucursalActiva);
  let q = supabase.from('usuarios').select('id,nombre,sucursal_id').eq('pin', p).eq('sucursal_id', suc);
  if (excluirUsuarioId) q = q.neq('id', excluirUsuarioId);
  const { data, error } = await q.maybeSingle();
  if (error && !faltaColumnaSucursal(error)) return { ocupado: false, error: error.message };
  if (data) return { ocupado: true, usuario: data };
  return { ocupado: false };
}
