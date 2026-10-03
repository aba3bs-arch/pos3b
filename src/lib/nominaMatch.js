import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { nombresMismaPersona } from './empleadosVisibles.js';

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
  const lista = [];
  for (const e of empleados) {
    const id = String(e.id);
    porId[id] = e;
    lista.push(e);
    const nom = normalizarNombreEmpleado(e.nombre);
    if (nom) porNombre[nom] = e;
  }
  return { porId, porNombre, lista };
}

function resolverPorNombreFlexible(nom, indice) {
  if (!nom) return null;
  if (indice.porNombre[nom]) return String(indice.porNombre[nom].id);
  for (const e of indice.lista || Object.values(indice.porId || {})) {
    if (nombresMismaPersona(nom, e.nombre)) return String(e.id);
  }
  return null;
}

function resolverIndirectoPorId(uid, indice) {
  const slug = uid.replace(/^(indirect:|consumo-pin:)/, '');
  const b = BENEFICIARIOS_VALES.find((x) => x.id === slug);
  if (!b) return null;
  if (indice.porId[uid]) return uid;
  const porNom = resolverPorNombreFlexible(normalizarNombreEmpleado(b.nombre), indice);
  if (porNom) return porNom;
  return uid;
}

/** Resuelve la clave de empleado (id) desde usuario_id o nombre. */
export function resolverClaveEmpleado(row, indice) {
  const uid = row?.usuario_id != null ? String(row.usuario_id) : '';
  if (uid.startsWith('indirect:') || uid.startsWith('consumo-pin:')) {
    return resolverIndirectoPorId(uid, indice);
  }
  if (uid && indice.porId[uid]) return uid;
  const nom = normalizarNombreEmpleado(row?.usuario_nombre || row?.nombre_empleado || row?.nombre);
  const porNom = resolverPorNombreFlexible(nom, indice);
  if (porNom) return porNom;
  if (nom) {
    const b = BENEFICIARIOS_VALES.find((x) => nombresMismaPersona(x.nombre, nom));
    if (b) {
      const idIndirect = `indirect:${b.id}`;
      if (indice.porId[idIndirect]) return idIndirect;
      const porNomBen = resolverPorNombreFlexible(normalizarNombreEmpleado(b.nombre), indice);
      if (porNomBen) return porNomBen;
      return idIndirect;
    }
  }
  return null;
}
