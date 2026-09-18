import { leerPrivilegios } from './posConfig.js';
import { normalizarRol, puedeVerModulo } from './roles.js';

/**
 * Subcomandos del hub Venta en Ruta (privilegios en ACCIONES_PRIVILEGIO).
 * Se asignan en Configuración → Privilegios → Venta en Ruta — acciones especiales.
 * Checkbox explícito (true/false) manda sobre el default del rol.
 */
export const SUBCOMANDOS_VENTA_RUTA = [
  { id: 'ruta_camiones', vista: 'camiones', label: 'Camiones', desc: 'Alta y asignación a repartidor', icon: 'truck', grupo: 'admin' },
  { id: 'ruta_carga', vista: 'carga', label: 'Carga de camión', desc: `Repartidor · descuenta CEDIS`, icon: 'package', grupo: 'admin' },
  { id: 'ruta_precios', vista: 'precios', label: 'Precios de ruta', desc: 'Precio especial sin impuestos', icon: 'dollar', grupo: 'admin' },
  { id: 'ruta_clientes', vista: 'clientes', label: 'Clientes externos', desc: 'Clientes no propios', icon: 'users', grupo: 'admin' },
  { id: 'ruta_consultas', vista: 'consultas', label: 'Consultas', desc: 'Ingresos, ventas, cargas y créditos', icon: 'search', grupo: 'admin' },
  { id: 'ruta_pos', vista: 'venta', label: 'POS venta en ruta', desc: 'Login vendedor · inventario del camión', icon: 'cart', grupo: 'oper' },
  { id: 'ruta_corte', vista: 'corte', label: 'Corte de caja', desc: 'Admin cierra · imprime ticket', icon: 'dollar', grupo: 'corte' },
  { id: 'ruta_preinventario', vista: 'preinventario', label: 'Preinventario', desc: 'Plantillas y conteo del camión', icon: 'package', grupo: 'oper' },
  { id: 'ruta_creditos', vista: 'creditos', label: 'Créditos por pagar', desc: 'Cajero liquida con PIN', icon: 'register', grupo: 'oper' },
  { id: 'ruta_liquidacion', vista: 'liquidacion', label: 'Liquidación', desc: 'Recibir efectivo recolectado del repartidor', icon: 'register', grupo: 'admin' },
];

/** Defaults por rol cuando no hay checkbox en Configuración. */
export const ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL = {
  Gerente: SUBCOMANDOS_VENTA_RUTA.map((s) => s.id),
  Repartidor: ['ruta_pos', 'ruta_preinventario'],
  Cajero: ['ruta_creditos'],
  Supervisor: ['ruta_pos', 'ruta_preinventario', 'ruta_creditos'],
};

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

/**
 * ¿El rol/usuario ve este subcomando del hub?
 * Administrador siempre sí. Si hay checkbox en Configuración, manda (incl. false = ocultar).
 */
export function puedeAccionVentaRuta(rol, userId, accionId, data = null) {
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;
  if (!SUBCOMANDOS_VENTA_RUTA.some((s) => s.id === accionId)) return false;
  if (!puedeVerModulo(rol, 'Venta en Ruta', userId)) return false;

  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, accionId, r, userId);
  if (explicito !== null) return explicito;

  return (ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL[r] || []).includes(accionId);
}

export function subcomandosVentaRutaVisibles(rol, userId, data = null) {
  return SUBCOMANDOS_VENTA_RUTA.filter((s) => puedeAccionVentaRuta(rol, userId, s.id, data));
}

/** Alias para Configuración → Privilegios (misma forma que Productos / Checador). */
export const ACCIONES_VENTA_RUTA_PRIVILEGIO = SUBCOMANDOS_VENTA_RUTA.map((s) => ({
  id: s.id,
  label: s.label,
  desc: s.desc,
  icon: s.icon,
  grupo: s.grupo,
}));

/** ¿El checkbox debe verse marcado? (incluye default del rol). */
export function tieneAccionVentaRuta(accionId, rol, userId = null, data = null) {
  return puedeAccionVentaRuta(rol, userId, accionId, data);
}
