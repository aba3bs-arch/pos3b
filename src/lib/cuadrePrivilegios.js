/**
 * Quién puede bajar del piso las piezas vendidas que el cuadre encontró sin baja.
 * El administrador (y Andrés / el administrador principal) siempre puede.
 * Luz Elena lo tiene por defecto. En Configuración → Privilegios se le puede dar a alguien más,
 * o quitárselo a ella si se desmarca su usuario.
 */
import { leerPrivilegios } from './posConfig.js';
import { esAndresMarrero, normalizarRol, tienePrivilegiosCompletos } from './roles.js';

export const ACCION_CUADRE_AJUSTAR = 'cuadre_ajustar';

/** Usuario de Luz Elena Zazueta (entra como «Luz Zazueta», auditora de MAIN). */
export const LUZ_ELENA_USUARIO_ID = 'e27e3f84-a56b-4acb-ba21-bd9b2c0ae1c6';

export const ACCIONES_CUADRE_PRIVILEGIO = [
  {
    id: ACCION_CUADRE_AJUSTAR,
    label: 'Ajustar cuadre de piezas',
    desc: 'Baja del piso las piezas vendidas que el inventario no descontó. Luz Elena lo tiene por defecto. Márcalo para dárselo a otro rol o empleado.',
  },
];

function nombrePlano(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function esLuzElenaCuadre(user) {
  if (!user) return false;
  if (user.id != null && String(user.id) === LUZ_ELENA_USUARIO_ID) return true;
  const n = nombrePlano(user.nombre);
  if (!n.includes('luz')) return false;
  return n.includes('elena') || n.includes('zazueta');
}

function accionesDe(data) {
  return data?.acciones?.[ACCION_CUADRE_AJUSTAR] || null;
}

function marcaUsuario(data, userId) {
  const uid = userId != null ? String(userId) : '';
  const mapa = accionesDe(data)?.porUsuario;
  if (!uid || !mapa || !Object.prototype.hasOwnProperty.call(mapa, uid)) return null;
  return Boolean(mapa[uid]);
}

function marcaRol(data, rol) {
  const mapa = accionesDe(data)?.porRol;
  if (!rol || !mapa || !Object.prototype.hasOwnProperty.call(mapa, rol)) return null;
  return Boolean(mapa[rol]);
}

function privilegiosDe(data) {
  if (data) return data;
  try {
    return leerPrivilegios();
  } catch {
    return { acciones: {} };
  }
}

/**
 * @param {{ id?: string, nombre?: string, rol?: string, es_admin_principal?: boolean }} user
 * @param {object} [data] privilegios ya leídos; si no vienen, se leen del equipo
 */
export function puedeAjustarCuadre(user, data = null) {
  if (!user) return false;
  const rol = normalizarRol(user.rol);
  const esPersona = user.id != null || user.nombre || user.es_admin_principal === true;
  if (esPersona) {
    if (tienePrivilegiosCompletos(user) || esAndresMarrero(user)) return true;
  } else if (rol === 'Administrador') {
    return true;
  }

  const priv = privilegiosDe(data);
  const porUsuario = marcaUsuario(priv, user.id);
  if (porUsuario !== null) return porUsuario;
  if (esLuzElenaCuadre(user)) return true;
  const porRol = marcaRol(priv, rol);
  if (porRol !== null) return porRol;
  return false;
}
