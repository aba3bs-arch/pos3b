/** Nombre de icono SVG por módulo del menú lateral */
export const ICONO_MODULO = {
  Inicio: 'home',
  Ventas: 'cart',
  'Corte de caja': 'register',
  Productos: 'package',
  Compras: 'truck',
  Checador: 'scan',
  Proveedores: 'building',
  Clientes: 'users',
  Usuarios: 'userCog',
  Consultas: 'search',
  Estadisticas: 'chart',
  Reportes: 'file',
  Configuracion: 'settings',
  Ayuda: 'help',
};

/** Color de acento por módulo (iconos del menú y cabecera). */
export const COLOR_MODULO = {
  Inicio: '#3b66b5',
  Ventas: '#e19929',
  'Corte de caja': '#2e7d32',
  Productos: '#8b5cf6',
  Compras: '#0d9488',
  Checador: '#c47f15',
  Proveedores: '#6366f1',
  Clientes: '#ec4899',
  Usuarios: '#3b66b5',
  Consultas: '#0891b2',
  Estadisticas: '#16a34a',
  Reportes: '#64748b',
  Configuracion: '#5c5c5c',
  Ayuda: '#b5b03e',
};

export function iconoDeModulo(moduloId) {
  return ICONO_MODULO[moduloId] || 'circle';
}

export function colorDeModulo(moduloId) {
  return COLOR_MODULO[moduloId] || 'var(--brand-blue)';
}
