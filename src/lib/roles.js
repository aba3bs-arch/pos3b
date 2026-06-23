/**
 * Roles del POS y permisos por módulo (id = nombre en sidebar / vista).
 * Valores en BD deben coincidir con estos textos (tras normalizar).
 */
export const ROLES = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Administrador'];

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
  'Configuracion',
  'Ayuda',
];

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
    'Configuracion',
    'Ayuda',
  ],
  Administrador: [...MODULOS_ORDEN],
};

/** Compatibilidad con filas antiguas en `usuarios.rol` */
const ALIAS_ROL = {
  cajero: 'Cajero',
  auditor: 'Auditor',
  repartidor: 'Repartidor',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
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

export function puedeVerModulo(rol, moduloId) {
  const r = normalizarRol(rol);
  const lista = ACCESO_POR_ROL[r] || ACCESO_POR_ROL.Cajero;
  return lista.includes(moduloId);
}

export function modulosParaSidebar(rol) {
  const permitidos = new Set(ACCESO_POR_ROL[normalizarRol(rol)] || ACCESO_POR_ROL.Cajero);
  return MODULOS_ORDEN.filter((m) => permitidos.has(m));
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

export function descripcionRol(rol) {
  const r = normalizarRol(rol);
  const textos = {
    Cajero: 'Mostrador y cobro',
    Repartidor: 'Consulta en ruta',
    Auditor: 'Consultas, reportes e inventario',
    Supervisor: 'Operación sin configuración ni usuarios',
    Gerente: 'Operación y configuración; sin usuarios',
    Administrador: 'Acceso total',
  };
  return textos[r] || r;
}
