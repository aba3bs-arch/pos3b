import { leerPrivilegios } from './posConfig.js';
import { normalizarRol, puedeVerModulo } from './roles.js';

/**
 * Subcomandos del hub Venta en Ruta (privilegios en ACCIONES_PRIVILEGIO).
 * Se asignan en Configuración → Privilegios → Venta en Ruta — acciones especiales.
 */
export const SUBCOMANDOS_VENTA_RUTA = [
  { id: 'ruta_carga', vista: 'carga', label: 'Carga de camión', desc: `Repartidor · descuenta CEDIS`, icon: 'truck', grupo: 'admin' },
  { id: 'ruta_precios', vista: 'precios', label: 'Precios de ruta', desc: 'Precio especial sin impuestos', icon: 'dollar', grupo: 'admin' },
  { id: 'ruta_clientes', vista: 'clientes', label: 'Clientes externos', desc: 'Clientes no propios', icon: 'users', grupo: 'admin' },
  { id: 'ruta_consultas', vista: 'consultas', label: 'Consultas', desc: 'Ventas, cargas y créditos cobrados', icon: 'search', grupo: 'admin' },
  { id: 'ruta_pos', vista: 'venta', label: 'POS venta en ruta', desc: 'Departamentos · carrito · cobro', icon: 'cart', grupo: 'oper' },
  { id: 'ruta_corte', vista: 'corte', label: 'Corte de caja', desc: 'Arqueo de ventas del camión', icon: 'dollar', grupo: 'oper' },
  { id: 'ruta_preinventario', vista: 'preinventario', label: 'Preinventario', desc: 'Plantillas y conteo del camión', icon: 'package', grupo: 'oper' },
  { id: 'ruta_creditos', vista: 'creditos', label: 'Créditos por pagar', desc: 'Cajero liquida con PIN', icon: 'register', grupo: 'oper' },
  { id: 'ruta_liquidacion', vista: 'liquidacion', label: 'Liquidación', desc: 'Recibir efectivo recolectado del repartidor', icon: 'register', grupo: 'admin' },
];

const ADMIN_DEFAULT = new Set(
  SUBCOMANDOS_VENTA_RUTA.filter((s) => s.grupo === 'admin').map((s) => s.id),
);
const OPER_DEFAULT = new Set(
  SUBCOMANDOS_VENTA_RUTA.filter((s) => s.grupo === 'oper').map((s) => s.id),
);

export function puedeAccionVentaRuta(rol, userId, accionId) {
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;
  if (!puedeVerModulo(rol, 'Venta en Ruta', userId)) return false;

  const p = leerPrivilegios();
  const acc = p.acciones?.[accionId] || {};
  const uid = userId != null ? String(userId) : '';
  if (uid && acc.porUsuario?.[uid]) return true;
  if (acc.porRol?.[r]) return true;

  // Sin checkbox asignado: Gerente = admin tiles; quien ve el módulo = operación (POS, corte, etc.)
  if (ADMIN_DEFAULT.has(accionId)) return r === 'Gerente';
  if (OPER_DEFAULT.has(accionId)) return true;
  return false;
}

export function subcomandosVentaRutaVisibles(rol, userId) {
  return SUBCOMANDOS_VENTA_RUTA.filter((s) => puedeAccionVentaRuta(rol, userId, s.id));
}
