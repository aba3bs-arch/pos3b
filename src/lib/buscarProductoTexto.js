/**
 * ¿El texto se interpreta como código de producto (no como nombre)?
 * Códigos numéricos / barras: solo coincidencia exacta de id.
 */
export function pareceCodigoProducto(query) {
  const t = String(query || '').trim();
  if (!t) return false;
  // Solo dígitos (código de barras / SKU numérico)
  if (/^\d+$/.test(t)) return true;
  // Clave alfanumérica sin espacios (ej. A30, SKU-12) — no frases de nombre
  if (!/\s/.test(t) && /^[A-Za-z0-9._\-]+$/.test(t) && /\d/.test(t)) return true;
  return false;
}

/**
 * Coincide producto con texto de búsqueda:
 * - Si parece código: solo id exacto (buscar "30" ≠ productos con "30" en el nombre)
 * - Si parece nombre: nombre contiene (parcial) o id exacto
 */
export function productoCoincideBusqueda(producto, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return true;

  const id = String(producto?.id ?? producto?.codigo ?? '')
    .trim()
    .toLowerCase();

  if (pareceCodigoProducto(t)) {
    return Boolean(id) && id === t;
  }

  if (Boolean(id) && id === t) return true;

  const nombre = String(producto?.nombre || '').toLowerCase();
  return nombre.includes(t);
}

/** Filtra inventario con la misma regla. */
export function filtrarProductosPorTexto(inventario, query) {
  const t = String(query || '').trim();
  if (!t) return [...(inventario || [])];
  return (inventario || []).filter((p) => productoCoincideBusqueda(p, t));
}

/** Producto cuyo código coincide exactamente con el texto (ignorando mayúsculas). */
export function productoPorCodigoExacto(inventario, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  return (inventario || []).find((p) => String(p?.id ?? '').trim().toLowerCase() === t) || null;
}
