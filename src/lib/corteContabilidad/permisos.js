import { normalizarRol } from '../roles.js';
import { leerPrivilegios } from '../posConfig.js';

/** Permisos de cortes contabilidad — aislados del Corte de caja del POS. */
export function permisosCorteContabilidad(rol, userId = null) {
  const r = normalizarRol(rol);
  const base =
    r === 'Administrador' || r === 'Gerente'
      ? {
          guardar: true,
          gastos: true,
          comentarios: true,
          moneda_inicial: true,
          moneda_final: true,
          folio: true,
          soloLectura: false,
        }
      : r === 'Auditor'
        ? {
            guardar: false,
            gastos: false,
            comentarios: false,
            moneda_inicial: false,
            moneda_final: false,
            folio: false,
            soloLectura: true,
          }
        : {
            guardar: false,
            gastos: false,
            comentarios: false,
            moneda_inicial: false,
            moneda_final: false,
            folio: false,
            soloLectura: true,
          };

  const esAdmin = r === 'Administrador';

  return {
    ...base,
    recoleccion: esAdmin || puedeRecoleccionCortes(rol, userId),
    /** Administrador: edita cualquier campo, catálogo global y gastos del turno. */
    editarTodo: esAdmin,
  };
}

/** Solo administrador o quien tenga el privilegio de recolección marcado. */
export function puedeRecoleccionCortes(rol, userId = null) {
  if (normalizarRol(rol) === 'Administrador') return true;
  const p = leerPrivilegios();
  const acc = p.acciones?.recoleccion_cortes || {};
  const uid = userId != null ? String(userId) : '';
  if (uid && acc.porUsuario?.[uid]) return true;
  const r = normalizarRol(rol);
  if (acc.porRol?.[r]) return true;
  return false;
}
