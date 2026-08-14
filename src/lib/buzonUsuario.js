/**
 * Filtro de buzón por usuario: cada responsable ve lo suyo;
 * Admin/Gerente pueden ver todo con el toggle "Ver todo".
 */
import { esAprobadorRecoleccionIe, esSocioAprobadorPrestamo } from './contabilidadConstants.js';
import { RESPONSABLES_INCIDENCIA, esResponsableIncidencia, normalizarNombreResponsable } from './incidenciasPos.js';
import { normalizarRol } from './roles.js';

// Literales (evitar import circular con contabilidadNotificaciones).
const T = {
  INCIDENCIA: 'incidencia_tienda',
  RECOLECCION_CORTE_IE: 'recoleccion_corte_pendiente_ie',
  PRESTAMO_SOCIO: 'prestamo_pendiente_socio',
  VALE_PENDIENTE: 'vale_pendiente_admin',
  PRESTAMO_ADMIN: 'prestamo_pendiente_admin',
  PRESTAMO_INTERAREA: 'prestamo_interarea',
  PRESTAMO_SUCURSAL: 'prestamo_sucursal',
  CONSUMO_CORTE: 'consumo_corte_pendiente',
  RECOLECCION_POST_LIQ: 'recoleccion_post_liquidacion',
  RECOLECCION_REPARTIDOR: 'recoleccion_repartidor',
  INVERSION_OFICINA: 'inversion_oficina_proveedor',
  RIF_ABIERTO: 'rif_abierto',
  RIF_LIQUIDADO: 'rif_liquidado',
  RIF_VENCIDO: 'rif_vencido',
};

export function esUsuarioMainNotificable(user) {
  const rol = normalizarRol(user?.rol ?? user);
  if (rol === 'Administrador' || rol === 'Gerente') return true;
  if (esAprobadorRecoleccionIe(user?.nombre)) return true;
  if (esSocioAprobadorPrestamo(user?.nombre)) return true;
  const u = normalizarNombreResponsable(user?.nombre);
  if (!u) return false;
  return RESPONSABLES_INCIDENCIA.some((r) => esResponsableIncidencia(user?.nombre, r));
}

/** Extrae responsable del mensaje de notificación de incidencia. */
export function responsableDesdeMensajeNotif(mensaje) {
  const m = String(mensaje || '');
  const hit = m.match(/Responsable:\s*([^·|]+)/i);
  return hit ? hit[1].trim() : '';
}

/** ¿Esta notificación corresponde al buzón personal del usuario? */
export function notificacionEsDeMiBuzon(n, user) {
  if (!n || !user) return false;
  const rol = normalizarRol(user.rol);
  const tipo = n.tipo;

  if (tipo === T.INCIDENCIA) {
    const resp = responsableDesdeMensajeNotif(n.mensaje);
    if (resp && esResponsableIncidencia(user.nombre, resp)) return true;
    return false;
  }

  if (tipo === T.RECOLECCION_CORTE_IE) {
    return esAprobadorRecoleccionIe(user.nombre) || rol === 'Administrador' || rol === 'Gerente';
  }

  if (tipo === T.PRESTAMO_SOCIO) {
    return esSocioAprobadorPrestamo(user.nombre) || rol === 'Administrador';
  }

  if (
    tipo === T.VALE_PENDIENTE
    || tipo === T.PRESTAMO_ADMIN
    || tipo === T.PRESTAMO_INTERAREA
    || tipo === T.PRESTAMO_SUCURSAL
    || tipo === T.CONSUMO_CORTE
    || tipo === T.RECOLECCION_POST_LIQ
    || tipo === T.RECOLECCION_REPARTIDOR
    || tipo === T.INVERSION_OFICINA
    || tipo === T.RIF_ABIERTO
    || tipo === T.RIF_LIQUIDADO
    || tipo === T.RIF_VENCIDO
  ) {
    return rol === 'Administrador' || rol === 'Gerente';
  }

  return rol === 'Administrador' || rol === 'Gerente';
}

export function filtrarNotificacionesMiBuzon(lista, user, { verTodo = false } = {}) {
  const rol = normalizarRol(user?.rol);
  const esAdminOGerente = rol === 'Administrador' || rol === 'Gerente';
  if (verTodo && esAdminOGerente) return lista || [];
  return (lista || []).filter((n) => notificacionEsDeMiBuzon(n, user));
}

export function incidenciaEsDeMiBuzon(inc, user) {
  if (!inc || !user) return false;
  if (esResponsableIncidencia(user.nombre, inc.responsable)) return true;
  if (
    inc.reportado_por
    && normalizarNombreResponsable(inc.reportado_por) === normalizarNombreResponsable(user.nombre)
  ) {
    return true;
  }
  return false;
}

export function filtrarIncidenciasMiBuzon(lista, user, { verTodo = false } = {}) {
  const rol = normalizarRol(user?.rol);
  const esAdminOGerente = rol === 'Administrador' || rol === 'Gerente';
  if (verTodo && esAdminOGerente) return lista || [];
  return (lista || []).filter((i) => incidenciaEsDeMiBuzon(i, user));
}
