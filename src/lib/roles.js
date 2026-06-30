/**
 * Roles del POS y permisos por módulo (id = nombre en sidebar / vista).
 * Valores en BD deben coincidir con estos textos (tras normalizar).
 */
import { leerPrivilegios } from './posConfig.js';
import {
  modulosPermitidosDesde,
  origenPrivilegios,
  describeOrigenPrivilegios,
  modulosEnEdicionPrivilegios,
  tieneListaPersonalizada,
  normalizarListaModulos,
} from './privilegios.js';

export {
  modulosEnEdicionPrivilegios,
  tieneListaPersonalizada,
  normalizarListaModulos,
  origenPrivilegios,
  describeOrigenPrivilegios,
} from './privilegios.js';

export const ROLES = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador'];

/** Único submódulo bajo Contabilidad por ahora. El resto va suelto en el menú. */
export const SUBMODULOS_CONTABILIDAD = ['Nómina'];

export const MODULOS_CORTES = ['Corte Virtual', 'Corte Abarrotes', 'Corte Garage'];

export const MODULOS_AGRUPADOS_CONTABILIDAD = new Set(SUBMODULOS_CONTABILIDAD);

/** Orden fijo del menú lateral */
export const MODULOS_ORDEN = [
  'Inicio',
  'Incidencias',
  'Ventas',
  'Corte de caja',
  'Corte Virtual',
  'Corte Abarrotes',
  'Corte Garage',
  'Productos',
  'Compras',
  'Checador',
  'Proveedores',
  'Clientes',
  'Usuarios',
  'Consultas',
  'Estadisticas',
  'Reportes',
  'Vales y Préstamos',
  'Nómina',
  'Configuracion',
  'Ayuda',
];

/** Módulos del menú lateral excluyendo los que van bajo Contabilidad. */
export const MODULOS_PRIVILEGIOS_GENERAL = MODULOS_ORDEN.filter((m) => !MODULOS_AGRUPADOS_CONTABILIDAD.has(m));

const ACCESO_POR_ROL = {
  Cajero: [
    'Inicio',
    'Incidencias',
    'Ventas',
    'Corte de caja',
    'Corte Virtual',
    'Corte Abarrotes',
    'Corte Garage',
    'Vales y Préstamos',
    'Checador',
    'Ayuda',
  ],
  Repartidor: ['Inicio', 'Incidencias', 'Checador', 'Ayuda'],
  Auditor: [
    'Inicio',
    'Incidencias',
    'Corte de caja',
    'Productos',
    'Compras',
    'Checador',
    'Proveedores',
    'Clientes',
    'Consultas',
    'Estadisticas',
    'Reportes',
    'Ayuda',
  ],
  Supervisor: [
    'Inicio',
    'Incidencias',
    'Ventas',
    'Corte de caja',
    'Corte Virtual',
    'Corte Abarrotes',
    'Corte Garage',
    'Productos',
    'Compras',
    'Checador',
    'Proveedores',
    'Clientes',
    'Consultas',
    'Estadisticas',
    'Reportes',
    'Vales y Préstamos',
    'Ayuda',
  ],
  Gerente: [
    'Inicio',
    'Incidencias',
    'Ventas',
    'Corte de caja',
    'Corte Virtual',
    'Corte Abarrotes',
    'Corte Garage',
    'Productos',
    'Compras',
    'Checador',
    'Proveedores',
    'Clientes',
    'Consultas',
    'Estadisticas',
    'Reportes',
    'Nómina',
    'Vales y Préstamos',
    'Configuracion',
    'Ayuda',
  ],
  Técnico: ['Inicio', 'Incidencias', 'Checador', 'Ayuda'],
  Administrador: [...MODULOS_ORDEN],
};

/** Compatibilidad con filas antiguas en `usuarios.rol` */
const ALIAS_ROL = {
  cajero: 'Cajero',
  auditor: 'Auditor',
  repartidor: 'Repartidor',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  tecnico: 'Técnico',
  técnico: 'Técnico',
  administrador: 'Administrador',
};

export function normalizarRol(rol) {
  const r = String(rol ?? '').trim();
  if (ROLES.includes(r)) return r;
  const porAlias = ALIAS_ROL[r.toLowerCase()];
  if (porAlias) return porAlias;
  const found = ROLES.find((x) => x.toLowerCase() === r.toLowerCase());
  if (found) return found;
  return 'Cajero';
}

export function normalizarIdModulo(moduloId) {
  if (moduloId === 'Buzón') return 'Incidencias';
  return moduloId;
}

export function puedeVerModulo(rol, moduloId, userId = null) {
  const m = normalizarIdModulo(moduloId);
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;
  const permitidos = modulosPermitidosDesde(leerPrivilegios(), r, userId, ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero);
  return permitidos.includes(m);
}

/** Solo administrador ve pendientes e historial en el módulo Incidencias. */
export function esAdminModuloIncidencias(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Roles distintos de administrador: solo pestaña de reporte de incidencias. */
export function rolSoloPestanaIncidencias(rol) {
  return !esAdminModuloIncidencias(rol);
}

/** @deprecated usar rolSoloPestanaIncidencias */
export function rolVeBuzonComoIncidencias(rol) {
  return rolSoloPestanaIncidencias(rol);
}

export function etiquetaModuloSidebar(_rol, moduloId) {
  return moduloId;
}

export function modulosParaSidebar(rol, userId = null) {
  const filtrar = (lista) => lista.filter((m) => !MODULOS_AGRUPADOS_CONTABILIDAD.has(m));
  const r = normalizarRol(rol);
  if (r === 'Administrador') return filtrar(MODULOS_ORDEN);

  const permitidos = modulosPermitidosDesde(leerPrivilegios(), r, userId, ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero);
  return filtrar(MODULOS_ORDEN.filter((m) => permitidos.includes(m)));
}

export function submodulosContabilidadVisibles(rol, userId = null) {
  return SUBMODULOS_CONTABILIDAD.filter((m) => puedeVerModulo(rol, m, userId));
}

export function puedeVerSeccionContabilidad(rol, userId = null) {
  return submodulosContabilidadVisibles(rol, userId).length > 0;
}

export function modulosDefaultRol(rol) {
  const r = normalizarRol(rol);
  return [...(ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero)];
}

/** Alta, baja y edición de cuentas PIN: solo administrador. */
export function puedeGestionarUsuarios(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Solo administrador puede cambiar turno de empleados (anti-fraude). */
export function puedeAsignarTurnos(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Alta de proveedores en catálogo: solo administrador. */
export function puedeCrearProveedor(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Eliminar productos del catálogo global: solo administrador. */
export function puedeEliminarProductosCatalogo(rol) {
  return normalizarRol(rol) === 'Administrador';
}

/** Administrador y gerente pueden cambiar tienda y gestionar inventario de todas las sucursales. */
export function puedeCambiarTiendaLibremente(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

export function puedeGestionarInventarioMultitienda(rol) {
  return puedeCambiarTiendaLibremente(rol);
}

export function descripcionRol(rol) {
  const r = normalizarRol(rol);
  const textos = {
    Cajero: 'Mostrador, cobro, cortes y vales',
    Repartidor: 'Consulta en ruta',
    Auditor: 'Consultas, reportes e inventario',
    Supervisor: 'Operación sin configuración ni usuarios',
    Gerente: 'Operación y configuración; sin usuarios',
    Técnico: 'Checador y consultas en campo',
    Administrador: 'Acceso total',
  };
  return textos[r] || r;
}
