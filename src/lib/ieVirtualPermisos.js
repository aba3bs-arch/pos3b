/**
 * Privilegios de movimientos en IE VIRTUAL / IE ABARROTES.
 * Editar/eliminar: solo ABB, FJBB, JLBB + administrador principal (AMR).
 * Las herramientas exclusivas del admin principal siguen en adminPrincipal.js.
 */
import { esAdministradorPrincipal } from './adminPrincipal.js';
import { esAdministradorIeMovimientos } from './contabilidadConstants.js';

export function puedeGestionarMovimientosIe(user) {
  if (!user) return false;
  if (esAdministradorPrincipal(user)) return true;
  return esAdministradorIeMovimientos(user.nombre);
}
