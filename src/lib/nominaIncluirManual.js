import { normalizarRol } from './roles.js';

const ROLES_FUERA_DE_NOMINA = new Set(['Administrador', 'Cliente']);

/**
 * Marca como activos (solo para esta nómina) a los usuarios que el administrador
 * agregó a mano: ex cajeros que hoy son Cubre Turno, bajas fuera del periodo, etc.
 */
export function aplicarIncluidosManuales(usuarios, idsIncluidos) {
  const ids = idsIncluidos instanceof Set ? idsIncluidos : new Set((idsIncluidos || []).map(String));
  if (!ids.size) return usuarios || [];
  return (usuarios || []).map((u) => {
    if (!u || !ids.has(String(u.id))) return u;
    return { ...u, activo: true, excluir_nomina: false, incluido_manual_nomina: true };
  });
}

/** Usuarios que se pueden agregar a mano: los que no quedaron en la lista de nómina. */
export function candidatosAgregarNomina(usuarios, listaNomina) {
  const enNomina = new Set((listaNomina || []).map((e) => String(e.id)));
  return (usuarios || [])
    .filter((u) => {
      if (!u?.id || enNomina.has(String(u.id))) return false;
      if (ROLES_FUERA_DE_NOMINA.has(normalizarRol(u.rol))) return false;
      if (u.socio_3b || u.tipo_empleado === 'socio_3b') return false;
      return true;
    })
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}
