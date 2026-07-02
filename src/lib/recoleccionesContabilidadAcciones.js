import { leerPrivilegios } from './posConfig.js';
import { normalizarRol, puedeVerModulo } from './roles.js';

/** Subcomandos del panel Recolecciones y traspasos (privilegios en ACCIONES_PRIVILEGIO). */
export const SUBCOMANDOS_RECOLECCIONES_CONTAB = [
  { id: 'recol_ctb_reporte', tab: 'tienda', label: 'Reporte por tienda', desc: 'Totales por sucursal y matriz por fecha', icon: 'building' },
  { id: 'recol_ctb_servicios', tab: 'servicios', label: 'Servicios', desc: 'Alta y edición de CFE y otros cobros', icon: 'dollar' },
  { id: 'recol_ctb_recolectores', tab: 'recolectores', label: 'Recolectores', desc: 'Alta, edición y baja de repartidores', icon: 'users' },
  { id: 'recol_ctb_eliminar', tab: 'eliminar', label: 'Eliminar registros', desc: 'Corregir capturas erróneas', icon: 'x' },
  { id: 'recol_ctb_gastos', tab: 'gastos', label: 'Gastos / liberar', desc: 'Gastos del recolector y liberación de efectivo', icon: 'truck' },
];

export function puedeSubcomandoRecoleccionesContab(rol, userId, accionId) {
  const r = normalizarRol(rol);
  if (r === 'Administrador') return true;
  if (!puedeVerModulo(rol, 'Recolecciones y traspasos', userId)) return false;
  const p = leerPrivilegios();
  const acc = p.acciones?.[accionId] || {};
  const uid = userId != null ? String(userId) : '';
  if (uid && acc.porUsuario?.[uid]) return true;
  if (acc.porRol?.[r]) return true;
  if (r === 'Gerente') return true;
  return false;
}

export function subcomandosRecoleccionesVisibles(rol, userId) {
  return SUBCOMANDOS_RECOLECCIONES_CONTAB.filter((s) => puedeSubcomandoRecoleccionesContab(rol, userId, s.id));
}
