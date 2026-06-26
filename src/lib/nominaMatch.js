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

/** Resuelve la clave de empleado (id) desde usuario_id o nombre. */
export function resolverClaveEmpleado(row, indice) {
  const uid = row?.usuario_id != null ? String(row.usuario_id) : '';
  if (uid && indice.porId[uid]) return uid;
  const nom = normalizarNombreEmpleado(row?.usuario_nombre || row?.nombre_empleado || row?.nombre);
  if (nom && indice.porNombre[nom]) return String(indice.porNombre[nom].id);
  return null;
}
