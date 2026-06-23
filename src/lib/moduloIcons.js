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

export function iconoDeModulo(moduloId) {
  return ICONO_MODULO[moduloId] || 'circle';
}
