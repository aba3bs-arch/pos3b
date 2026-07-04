import { leerPrivilegios } from './posConfig.js';
import { esResponsableIncidencia } from './incidenciasPos.js';

const ROLES_SISTEMA = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador'];

function normRol(rol) {
  const r = String(rol ?? '').trim();
  if (ROLES_SISTEMA.includes(r)) return r;
  const found = ROLES_SISTEMA.find((x) => x.toLowerCase() === r.toLowerCase());
  return found || r;
}

/** Acciones granulares del módulo Incidencias (configurables en Configuración). */
export const ACCIONES_INCIDENCIAS_PRIVILEGIO = [
  {
    id: 'inc_bandeja_pendientes',
    label: 'Bandeja de pendientes',
    desc: 'Ver la pestaña Pendientes con avisos de vales, préstamos e incidencias nuevas de todas las tiendas (uso en central MAIN).',
  },
  {
    id: 'inc_ver_todas_tiendas',
    label: 'Ver incidencias de todas las sucursales',
    desc: 'Listar reportes de 3B2, 3B5, FUSION, etc. Sin esto solo ve la tienda activa en la sesión.',
  },
  {
    id: 'inc_resolver_asignadas',
    label: 'Resolver incidencias asignadas a mí',
    desc: 'Marcar en revisión, resolver y cerrar reportes donde el empleado aparece como responsable.',
  },
  {
    id: 'inc_resolver_todas',
    label: 'Resolver cualquier incidencia',
    desc: 'Atender reportes de cualquier responsable (auditoría y supervisión desde central MAIN).',
  },
  {
    id: 'inc_redirigir',
    label: 'Redirigir a otro responsable',
    desc: 'Reasignar un reporte a otro miembro del personal de central.',
  },
  {
    id: 'inc_historial_notif',
    label: 'Historial de notificaciones',
    desc: 'Consultar notificaciones ya atendidas (administración central).',
  },
];

export const IDS_ACCIONES_INCIDENCIAS = new Set(ACCIONES_INCIDENCIAS_PRIVILEGIO.map((a) => a.id));

/** Valores por defecto si no hay personalización en Configuración. */
const ACCIONES_CENTRAL_INCIDENCIAS = [
  'inc_bandeja_pendientes',
  'inc_ver_todas_tiendas',
  'inc_resolver_todas',
  'inc_redirigir',
  'inc_historial_notif',
];

export const ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL = {
  Técnico: [...ACCIONES_CENTRAL_INCIDENCIAS],
  Repartidor: [...ACCIONES_CENTRAL_INCIDENCIAS],
  Auditor: [...ACCIONES_CENTRAL_INCIDENCIAS],
  Gerente: [...ACCIONES_CENTRAL_INCIDENCIAS],
};

/** Atajos para personal de central MAIN. */
export const PRESET_INCIDENCIAS_CENTRAL_MAIN = [
  'inc_bandeja_pendientes',
  'inc_ver_todas_tiendas',
  'inc_resolver_todas',
  'inc_redirigir',
  'inc_historial_notif',
];

export const PRESET_INCIDENCIAS_CAMPO = ['inc_resolver_asignadas', 'inc_redirigir'];

export const DESCRIPCION_MODULO_INCIDENCIAS =
  'Reportar fallas y, con las acciones especiales de abajo, atender y resolver reportes asignados o de todas las tiendas.';

function lecturaExplicitaAccion(data, accionId, rol, userId) {
  const acc = data?.acciones?.[accionId];
  if (!acc) return null;
  const uid = userId != null ? String(userId) : '';
  if (uid && Object.prototype.hasOwnProperty.call(acc.porUsuario || {}, uid)) {
    return Boolean(acc.porUsuario[uid]);
  }
  if (Object.prototype.hasOwnProperty.call(acc.porRol || {}, rol)) {
    return Boolean(acc.porRol[rol]);
  }
  return null;
}

/** Incluye valores por defecto del rol para acciones de incidencias. */
export function tieneAccionIncidencia(accionId, rol, userId = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  if (!IDS_ACCIONES_INCIDENCIAS.has(accionId)) return false;
  const data = leerPrivilegios();
  const explicito = lecturaExplicitaAccion(data, accionId, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL[r] || []).includes(accionId);
}

/**
 * solo_reporte — solo levanta reportes propios.
 * resolucion — atiende incidencias (asignadas o todas según acciones).
 * administracion — vista completa como administrador.
 */
export function modoVistaIncidencias(rol, userId = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return 'administracion';
  if (
    tieneAccionIncidencia('inc_bandeja_pendientes', r, userId) ||
    tieneAccionIncidencia('inc_resolver_todas', r, userId)
  ) {
    return 'resolucion';
  }
  if (tieneAccionIncidencia('inc_resolver_asignadas', r, userId)) return 'resolucion';
  return 'solo_reporte';
}

export function puedeVerBandejaPendientesIncidencias(rol, userId = null) {
  const r = normRol(rol);
  if (r === 'Administrador' || r === 'Gerente') return true;
  return tieneAccionIncidencia('inc_bandeja_pendientes', r, userId);
}

export function puedeVerHistorialIncidencias(rol, userId = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  return tieneAccionIncidencia('inc_historial_notif', r, userId);
}

export function puedeVerTodasIncidencias(rol, userId = null, _sucursal = null) {
  const r = normRol(rol);
  if (r === 'Administrador' || r === 'Gerente') return true;
  return tieneAccionIncidencia('inc_ver_todas_tiendas', r, userId);
}

export function puedeResolverAlgunaIncidencia(rol, userId = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  return (
    tieneAccionIncidencia('inc_resolver_todas', r, userId) ||
    tieneAccionIncidencia('inc_resolver_asignadas', r, userId)
  );
}

export function puedeResolverIncidencia(usuario, incidencia, rol, userId = null) {
  const r = normRol(rol || usuario?.rol);
  if (r === 'Administrador') return true;
  if (tieneAccionIncidencia('inc_resolver_todas', r, userId)) return true;
  if (!tieneAccionIncidencia('inc_resolver_asignadas', r, userId)) return false;
  return esResponsableIncidencia(usuario?.nombre, incidencia?.responsable);
}

export function puedeRedirigirIncidenciaPrivilegio(usuario, incidencia, rol, userId = null, { esAdmin = false } = {}) {
  if (esAdmin) return true;
  const r = normRol(rol || usuario?.rol);
  if (!tieneAccionIncidencia('inc_redirigir', r, userId)) return false;
  if (tieneAccionIncidencia('inc_resolver_todas', r, userId)) return true;
  if (!incidencia?.responsable) return false;
  return esResponsableIncidencia(usuario?.nombre, incidencia.responsable);
}

export function puedeAbrirBandejaIncidencias(rol, userId = null) {
  return modoVistaIncidencias(rol, userId) !== 'solo_reporte';
}

/** @deprecated usar modoVistaIncidencias */
export function esAdminModuloIncidencias(rol, userId = null) {
  return modoVistaIncidencias(rol, userId) === 'administracion';
}

export function rolSoloPestanaIncidencias(rol, userId = null) {
  return modoVistaIncidencias(rol, userId) === 'solo_reporte';
}
