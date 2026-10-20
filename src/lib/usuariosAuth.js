import { normalizarCodigoTienda, etiquetaTienda, esCentralAdmin } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';
import { normalizarPinComparacion } from './cubreTurno.js';

/** Columnas mínimas para login (menos Disk IO que SELECT *). */
const COLS_LOGIN_USUARIO =
  'id,nombre,pin,rol,sucursal_id,activo,turno_id,turno_horario,'
  + 'dispositivo_id,dispositivo_id_2,tipo_empleado,created_at';

function variantesPinLogin(pin) {
  const p = normalizarPinComparacion(pin);
  if (!p) return [];
  const set = new Set([p]);
  if (/^\d+$/.test(p)) {
    const sinCeros = p.replace(/^0+/, '') || '0';
    set.add(sinCeros);
    if (p.length < 6) set.add(p.padStart(4, '0'));
    if (p.length <= 4) set.add(p.padStart(6, '0'));
  }
  return [...set];
}

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
  if (esCentralAdmin(sucursalUsuario(user))) return true;
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

/** Empleado dado de alta (activo !== false). Sin columna = se trata como activo. */
export function usuarioEstaActivo(user) {
  if (!user) return false;
  return user.activo !== false;
}

function rechazarSiInactivo(user) {
  if (!user) return { user: null, error: null };
  if (!usuarioEstaActivo(user)) {
    return { user: null, error: 'Este usuario está dado de baja. Pide al administrador reactivarlo.' };
  }
  return { user, error: null };
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

function mensajeErrorConsultaUsuarios(error) {
  const msg = String(error?.message || error || '');
  const low = msg.toLowerCase();
  // Disk IO / timeouts de Supabase: el login falla aunque el PIN sea correcto.
  if (
    low.includes('timeout')
    || low.includes('57014')
    || low.includes('statement timeout')
    || low.includes('cloudflare')
    || low.includes('502')
    || low.includes('503')
    || low.includes('fetch failed')
    || low.includes('network')
    || low.includes('failed to fetch')
  ) {
    return (
      'No se pudo consultar usuarios (Supabase lento o Disk IO agotado). '
      + 'Espera unos minutos o sube el plan / deja que se recargue el presupuesto de disco, e intenta de nuevo.'
    );
  }
  return msg || 'Error al consultar usuarios.';
}

/** true si PostgREST se quejó por 0 o N filas con Accept object (maybeSingle/single). */
function errorFilasAmbiguas(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === 'PGRST116' || msg.includes('multiple') || msg.includes('0 rows');
}

/**
 * Busca usuario por PIN.
 * - Empleados fijos (cajero, etc.): solo en la sucursal de la caja.
 * - Administrador: PIN válido desde cualquier tienda o dispositivo (sin anclaje).
 * - opts.aceptarPersonalCentral: personal de MAIN también válido (reloj empleados).
 */
export async function buscarUsuarioPorPinYSucursal(supabase, pin, sucursalActiva, opts = {}) {
  if (!supabase) return { user: null, error: 'Sin conexión a Supabase.' };
  const variantes = variantesPinLogin(pin);
  if (!variantes.length) return { user: null, error: null };
  const suc = normalizarCodigoTienda(sucursalActiva);

  const consultar = async (cols) => {
    // 1) PIN (+ variantes) en esta tienda
    let qExact = supabase
      .from('usuarios')
      .select(cols)
      .in('pin', variantes)
      .eq('sucursal_id', suc)
      .limit(10);
    let exactRes = await qExact;
    // Reintento único si Disk IO / red falla
    if (exactRes.error && !faltaColumnaSucursal(exactRes.error) && !errorFilasAmbiguas(exactRes.error)) {
      await new Promise((r) => setTimeout(r, 400));
      exactRes = await supabase
        .from('usuarios')
        .select(cols)
        .in('pin', variantes)
        .eq('sucursal_id', suc)
        .limit(10);
    }
    if (exactRes.error && !faltaColumnaSucursal(exactRes.error) && !errorFilasAmbiguas(exactRes.error)) {
      return { error: mensajeErrorConsultaUsuarios(exactRes.error) };
    }
    const exactos = (exactRes.data || []).filter(Boolean);
    if (exactos.length) {
      const preferido = exactos.find(usuarioEstaActivo) || exactos[0];
      const r = rechazarSiInactivo(preferido);
      return r.error ? { error: r.error } : { user: r.user };
    }

    // 2) Mismo PIN en cualquier tienda (admin / personal central / aviso sucursal)
    let qAll = await supabase.from('usuarios').select(cols).in('pin', variantes).limit(30);
    if (qAll.error && faltaColumnaSucursal(qAll.error)) {
      const qLegacy = await supabase.from('usuarios').select(cols).in('pin', variantes).limit(10);
      if (qLegacy.error && !errorFilasAmbiguas(qLegacy.error)) {
        return { error: mensajeErrorConsultaUsuarios(qLegacy.error) };
      }
      const legacy = (qLegacy.data || [])[0];
      if (legacy) {
        const r = rechazarSiInactivo(legacy);
        return r.error ? { error: r.error } : { user: r.user, sinColumnaSucursal: true };
      }
      return {};
    }
    if (qAll.error && !errorFilasAmbiguas(qAll.error)) {
      return { error: mensajeErrorConsultaUsuarios(qAll.error) };
    }
    return { list: qAll.data || [] };
  };

  let res = await consultar(COLS_LOGIN_USUARIO);
  // Si faltan columnas nuevas en el SELECT, reintentar con *
  if (res.error && /column|schema cache|does not exist/i.test(String(res.error))) {
    res = await consultar('*');
  }
  if (res.error) return { user: null, error: res.error };
  if (res.user) {
    return {
      user: res.user,
      error: null,
      sinColumnaSucursal: Boolean(res.sinColumnaSucursal),
    };
  }

  const list = (res.list || []).filter(usuarioEstaActivo);
  if (list.length === 0) {
    const algunoBaja = (res.list || []).some((u) => !usuarioEstaActivo(u));
    if (algunoBaja) return { user: null, error: 'Este usuario está dado de baja. Pide al administrador reactivarlo.' };
    return { user: null, error: null };
  }

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

/** Carga un usuario activo por id (p. ej. tras desbloqueo biométrico). */
export async function buscarUsuarioPorId(supabase, userId) {
  if (!supabase) return { user: null, error: 'Sin conexión a Supabase.' };
  const id = String(userId || '').trim();
  if (!id) return { user: null, error: 'Usuario inválido.' };
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle();
  if (error) return { user: null, error: error.message };
  if (!data) return { user: null, error: 'Usuario no encontrado.' };
  return rechazarSiInactivo(data);
}

