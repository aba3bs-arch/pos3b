/**
 * Roles del POS y permisos por módulo (id = nombre en sidebar / vista).
 * Valores en BD deben coincidir con estos textos (tras normalizar).
 */
import { leerPrivilegios } from './posConfig.js';

export const ROLES = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador'];

/** Submódulos bajo Contabilidad (no aparecen sueltos en el menú). */
export const SUBMODULOS_CONTABILIDAD = [
  'Nómina',
  'Vales y Préstamos',
  'Corte Virtual',
  'Corte Abarrotes',
  'Corte Garage',
];

export const MODULOS_AGRUPADOS_CONTABILIDAD = new Set(SUBMODULOS_CONTABILIDAD);

/** Orden fijo del menú lateral */
export const MODULOS_ORDEN = [
  'Inicio',
  'Ventas',
  'Corte de caja',
  'Productos',
  'Compras',
  'Checador',
  'Proveedores',
  'Clientes',
  'Usuarios',
  'Consultas',
  'Estadisticas',
  'Reportes',
  'Nómina',
  'Vales y Préstamos',
  'Corte Virtual',
  'Corte Abarrotes',
  'Corte Garage',
  'Configuracion',
  'Ayuda',
];

/** Módulos del menú lateral excluyendo los que van bajo Contabilidad. */
export const MODULOS_PRIVILEGIOS_GENERAL = MODULOS_ORDEN.filter((m) => !MODULOS_AGRUPADOS_CONTABILIDAD.has(m));

const ACCESO_POR_ROL = {
  Cajero: ['Inicio', 'Ventas', 'Corte de caja', 'Checador', 'Ayuda'],
  Repartidor: ['Inicio', 'Checador', 'Ayuda'],
  Auditor: [
    'Inicio',
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
    'Ventas',
    'Corte de caja',
    'Productos',
    'Compras',
    'Checador',
    'Proveedores',
    'Clientes',
    'Consultas',
    'Estadisticas',
    'Reportes',
    'Corte Virtual',
    'Corte Abarrotes',
    'Corte Garage',
    'Ayuda',
  ],
  Gerente: [
    'Inicio',
    'Ventas',
    'Corte de caja',
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
    'Corte Virtual',
    'Corte Abarrotes',
    'Corte Garage',
    'Configuracion',
    'Ayuda',
  ],
  Técnico: ['Inicio', 'Checador', 'Ayuda'],
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

export function puedeVerModulo(rol, moduloId, userId = null) {
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;

  const priv = leerPrivilegios();
  const uid = userId != null ? String(userId) : '';
  if (uid && Array.isArray(priv.porUsuario[uid])) {
    return priv.porUsuario[uid].includes(moduloId);
  }
  if (Array.isArray(priv.porRol[r])) {
    return priv.porRol[r].includes(moduloId);
  }
  const lista = ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero;
  return lista.includes(moduloId);
}

export function modulosParaSidebar(rol, userId = null) {
  const filtrar = (lista) => lista.filter((m) => !MODULOS_AGRUPADOS_CONTABILIDAD.has(m));
  const r = normalizarRol(rol);
  if (r === 'Administrador') return filtrar(MODULOS_ORDEN);

  const priv = leerPrivilegios();
  const uid = userId != null ? String(userId) : '';
  if (uid && Array.isArray(priv.porUsuario[uid])) {
    const set = new Set(priv.porUsuario[uid]);
    return filtrar(MODULOS_ORDEN.filter((m) => set.has(m)));
  }
  if (Array.isArray(priv.porRol[r])) {
    const set = new Set(priv.porRol[r]);
    return filtrar(MODULOS_ORDEN.filter((m) => set.has(m)));
  }
  const permitidos = new Set(ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero);
  return filtrar(MODULOS_ORDEN.filter((m) => permitidos.has(m)));
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
    Cajero: 'Mostrador y cobro',
    Repartidor: 'Consulta en ruta',
    Auditor: 'Consultas, reportes e inventario',
    Supervisor: 'Operación sin configuración ni usuarios',
    Gerente: 'Operación y configuración; sin usuarios',
    Técnico: 'Checador y consultas en campo',
    Administrador: 'Acceso total',
  };
  return textos[r] || r;
}
