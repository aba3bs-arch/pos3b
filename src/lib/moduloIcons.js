/** Nombre de icono SVG por módulo del menú lateral */
export const ICONO_MODULO = {
  Inicio: 'home',
  Incidencias: 'alert',
  Ventas: 'cart',
  'Corte de caja': 'register',
  Recolecciones: 'dollar',
  'Liquidación recolecciones': 'register',
  Productos: 'package',
  Compras: 'truck',
  Checador: 'scan',
  Proveedores: 'building',
  Clientes: 'users',
  Usuarios: 'userCog',
  Consultas: 'search',
  Estadisticas: 'chart',
  Reportes: 'file',
  Contabilidad: 'dollar',
  'Nómina': 'dollar',
  'Recolecciones y traspasos': 'truck',
  'Vales y Préstamos': 'file',
  'Corte Virtual': 'register',
  'Corte Abarrotes': 'package',
  'Corte Garage': 'building',
  Configuracion: 'settings',
  Ayuda: 'help',
};

/** Color de acento por módulo (iconos del menú y cabecera). */
export const COLOR_MODULO = {
  Inicio: '#3b66b5',
  Incidencias: '#dc2626',
  Ventas: '#e19929',
  'Corte de caja': '#2e7d32',
  Recolecciones: '#0d9488',
  'Liquidación recolecciones': '#047857',
  Productos: '#8b5cf6',
  Compras: '#0d9488',
  Checador: '#c47f15',
  Proveedores: '#6366f1',
  Clientes: '#ec4899',
  Usuarios: '#3b66b5',
  Consultas: '#0891b2',
  Estadisticas: '#16a34a',
  Reportes: '#64748b',
  Contabilidad: '#7c3aed',
  'Nómina': '#0d9488',
  'Recolecciones y traspasos': '#047857',
  'Vales y Préstamos': '#b45309',
  'Corte Virtual': '#8e44ad',
  'Corte Abarrotes': '#b5a642',
  'Corte Garage': '#7f8c8d',
  Configuracion: '#5c5c5c',
  Ayuda: '#b5b03e',
};

export function iconoDeModulo(moduloId) {
  return ICONO_MODULO[moduloId] || 'circle';
}

export function colorDeModulo(moduloId) {
  return COLOR_MODULO[moduloId] || 'var(--brand-blue)';
}
