import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { ALMACEN_CENTRAL } from './inventarioMultitienda.js';
import { normalizarRol, puedeGestionarUsuarios } from './roles.js';

/**
 * Empleados visibles en listas operativas (cortes, nómina, vales, etc.).
 * - Tienda activa: su personal + personal de MAIN (central), sin administradores.
 * - Administrador: todos (filtrar aparte si hace falta).
 */
export function empleadosVisiblesParaTienda(empleados, sucursalActiva, actorRol = null) {
  const lista = empleados || [];
  if (puedeGestionarUsuarios(actorRol)) return lista;

  const suc = normalizarCodigoTienda(sucursalActiva);
  return lista.filter((e) => {
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador') return false;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    if (empSuc === suc) return true;
    if (empSuc === ALMACEN_CENTRAL) return true;
    return false;
  });
}

/** Pantalla Usuarios (solo admin): filtro opcional por tienda. */
export function filtrarEmpleadosAdmin(empleados, filtroSucursal) {
  if (!filtroSucursal) return empleados || [];
  const f = normalizarCodigoTienda(filtroSucursal);
  return (empleados || []).filter((e) => normalizarCodigoTienda(e.sucursal_id) === f);
}
