import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';

/** Normaliza nombre para comparar consumos/préstamos con empleados del POS. */
export function normalizarNombreEmpleado(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function indiceEmpleados(empleados = []) {
  const porId = {};
  const porNombre = {};
  for (const e of empleados) {
    const id = String(e.id);
    porId[id] = e;
    const nom = normalizarNombreEmpleado(e.nombre);
    if (nom) porNombre[nom] = e;
  }
  return { porId, porNombre };
}

function resolverIndirectoPorId(uid, indice) {
  const slug = uid.replace(/^indirect:/, '');
  const b = BENEFICIARIOS_VALES.find((x) => x.id === slug);
  if (!b) return null;
  if (indice.porId[uid]) return uid;
  const nom = normalizarNombreEmpleado(b.nombre);
  if (nom && indice.porNombre[nom]) return String(indice.porNombre[nom].id);
  return uid;
}

/** Resuelve la clave de empleado (id) desde usuario_id o nombre. */
export function resolverClaveEmpleado(row, indice) {
  const uid = row?.usuario_id != null ? String(row.usuario_id) : '';
  if (uid.startsWith('indirect:')) {
    return resolverIndirectoPorId(uid, indice);
  }
  if (uid && indice.porId[uid]) return uid;
  const nom = normalizarNombreEmpleado(row?.usuario_nombre || row?.nombre_empleado || row?.nombre);
  if (nom && indice.porNombre[nom]) return String(indice.porNombre[nom].id);
  if (nom) {
    const b = BENEFICIARIOS_VALES.find((x) => normalizarNombreEmpleado(x.nombre) === nom);
    if (b) {
      const idIndirect = `indirect:${b.id}`;
      if (indice.porId[idIndirect]) return idIndirect;
      if (indice.porNombre[nom]) return String(indice.porNombre[nom].id);
      return idIndirect;
    }
  }
  return null;
}
