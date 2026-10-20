import { normalizarCodigoTienda, etiquetaTienda, esCentralAdmin } from '../constants/sucursales.js';
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

export const MENSAJE_SUPABASE_CAIDO =
  'La base de datos de Supabase está caída o reiniciando. '
  + 'No es tu PIN: no se pudo leer la tabla de usuarios. '
  + 'Espera un minuto y vuelve a intentar. Si sigue igual, abre el proyecto en Supabase y pulsa Restart project.';

/** 521/503, schema cache (PGRST002) o timeout: el proyecto no contestó, el PIN no se validó. */
export function esFalloTransitorioSupabase(error) {
  const code = String(error?.code || error?.name || '');
  const msg = String(error?.message || error || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (['PGRST002', 'PGRST003', '57014', '08006', '08001', '57P01', 'AbortError'].includes(code)) return true;
  if ([502, 503, 504, 521, 522, 523, 524].includes(status)) return true;
  return (
    msg.includes('schema cache')
    || msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('57014')
    || msg.includes('statement timeout')
    || msg.includes('cloudflare')
    || msg.includes('521')
    || msg.includes('522')
    || msg.includes('502')
    || msg.includes('503')
    || msg.includes('504')
    || msg.includes('origin_down')
    || msg.includes('web server is down')
    || msg.includes('connection refused')
    || msg.includes('econnrefused')
    || msg.includes('fetch failed')
    || msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('aborterror')
    || msg.includes('the operation was aborted')
    || msg.includes('aborted')
  );
}

function mensajeErrorConsultaUsuarios(error) {
  if (esFalloTransitorioSupabase(error)) return MENSAJE_SUPABASE_CAIDO;
  const msg = String(error?.message || error || '');
  return msg || 'Error al consultar usuarios.';
}

function abrirSenal(ms) {
  if (typeof AbortController === 'undefined') return { signal: null, cancel() {} };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel() { clearTimeout(t); } };
}

/**
 * Reintenta si Supabase/PostgREST está caído (521 o PGRST002).
 * Un parpadeo de 1–2 s no debe verse como «no hay usuarios».
 */
async function leerUsuarios(run, { intentos = 3, esperaMs = 700, timeoutMs = 8000 } = {}) {
  let last = { data: null, error: { message: 'Error al consultar usuarios.' } };
  for (let i = 0; i < intentos; i += 1) {
    const senal = abrirSenal(timeoutMs);
    try {
      let req = run();
      if (senal.signal && req && typeof req.abortSignal === 'function') req = req.abortSignal(senal.signal);
      last = await req;
    } catch (err) {
      last = { data: null, error: err };
    } finally {
      senal.cancel();
    }
    if (!last?.error || !esFalloTransitorioSupabase(last.error)) return last;
    if (i < intentos - 1 && esperaMs > 0) {
      await new Promise((r) => setTimeout(r, esperaMs * (i + 1)));
    }
  }
  return last;
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
  const p = String(pin || '').trim();
  if (!p) return { user: null, error: null };
  const suc = normalizarCodigoTienda(sucursalActiva);

  // Evitar maybeSingle: con PIN duplicado en la misma tienda bloqueaba TODO el login (PGRST116).
  const qExact = await leerUsuarios(
    () => supabase.from('usuarios').select('*').eq('pin', p).eq('sucursal_id', suc).limit(5),
    opts.reintento,
  );
  if (qExact.error && !faltaColumnaSucursal(qExact.error) && !errorFilasAmbiguas(qExact.error)) {
    return { user: null, error: mensajeErrorConsultaUsuarios(qExact.error) };
  }
  const exactos = (qExact.data || []).filter(Boolean);
  if (exactos.length) {
    const preferido = exactos.find(usuarioEstaActivo) || exactos[0];
    const r = rechazarSiInactivo(preferido);
    return r.error ? r : { user: r.user, error: null };
  }

  const qAll = await leerUsuarios(
    () => supabase.from('usuarios').select('*').eq('pin', p).limit(20),
    opts.reintento,
  );
  if (qAll.error) {
    if (faltaColumnaSucursal(qAll.error)) {
      const qLegacy = await leerUsuarios(
        () => supabase.from('usuarios').select('*').eq('pin', p).limit(5),
        opts.reintento,
      );
      if (qLegacy.error && !errorFilasAmbiguas(qLegacy.error)) {
        return { user: null, error: mensajeErrorConsultaUsuarios(qLegacy.error) };
      }
      const legacy = (qLegacy.data || [])[0];
      if (legacy) {
        const r = rechazarSiInactivo(legacy);
        return r.error ? r : { user: r.user, error: null, sinColumnaSucursal: true };
      }
    }
    return { user: null, error: mensajeErrorConsultaUsuarios(qAll.error) };
  }

  const list = (qAll.data || []).filter(usuarioEstaActivo);
  if (list.length === 0) {
    const algunoBaja = (qAll.data || []).some((u) => !usuarioEstaActivo(u));
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

