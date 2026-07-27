/**
 * Coincide producto con texto de búsqueda:
 * - nombre: contiene (parcial)
 * - código (id): solo coincidencia exacta (no "30" dentro de "301")
 */
export function productoCoincideBusqueda(producto, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return true;

  const nombre = String(producto?.nombre || '').toLowerCase();
  if (nombre.includes(t)) return true;

  const id = String(producto?.id ?? producto?.codigo ?? '')
    .trim()
    .toLowerCase();
  return Boolean(id) && id === t;
}

/** Filtra inventario con la misma regla (código exacto + nombre parcial). */
export function filtrarProductosPorTexto(inventario, query) {
  const t = String(query || '').trim();
  if (!t) return [...(inventario || [])];
  return (inventario || []).filter((p) => productoCoincideBusqueda(p, t));
}
