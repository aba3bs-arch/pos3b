/**
 * ¿El texto se interpreta como código de producto (no como nombre)?
 * Códigos numéricos / barras: solo coincidencia exacta de id o código alterno.
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

/** Normaliza lista de códigos alternos (sin vacíos ni duplicados). */
export function normalizarCodigosAlt(raw) {
  const src = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\n]+/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const c = String(item || '').trim();
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Código principal + alternos. */
export function codigosDeProducto(producto) {
  const id = String(producto?.id ?? producto?.codigo ?? '').trim();
  const alts = normalizarCodigosAlt(producto?.codigos_alt);
  if (!id) return alts;
  const idKey = id.toLowerCase();
  return [id, ...alts.filter((c) => c.toLowerCase() !== idKey)];
}

export function productoTieneCodigo(producto, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return codigosDeProducto(producto).some((c) => c.toLowerCase() === t);
}

/**
 * ¿Este código ya lo usa otro producto (como id o alterno)?
 * @returns {{ ocupado: boolean, producto?: object, como?: 'id'|'alterno' }}
 */
export function codigoOcupadoPorOtro(inventario, codigo, excludeId = null) {
  const t = String(codigo || '')
    .trim()
    .toLowerCase();
  if (!t) return { ocupado: false };
  const excl = String(excludeId || '')
    .trim()
    .toLowerCase();
  for (const p of inventario || []) {
    const pid = String(p?.id || '')
      .trim()
      .toLowerCase();
    if (excl && pid === excl) continue;
    if (pid === t) return { ocupado: true, producto: p, como: 'id' };
    if (normalizarCodigosAlt(p?.codigos_alt).some((c) => c.toLowerCase() === t)) {
      return { ocupado: true, producto: p, como: 'alterno' };
    }
  }
  return { ocupado: false };
}

/**
 * Coincide producto con texto de búsqueda:
 * - Si parece código: id o código alterno exacto
 * - Si parece nombre: nombre contiene (parcial) o id/alterno exacto
 */
export function productoCoincideBusqueda(producto, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return true;

  if (pareceCodigoProducto(t)) {
    return productoTieneCodigo(producto, t);
  }

  if (productoTieneCodigo(producto, t)) return true;

  const nombre = String(producto?.nombre || '').toLowerCase();
  return nombre.includes(t);
}

/** Filtra inventario con la misma regla. */
export function filtrarProductosPorTexto(inventario, query) {
  const t = String(query || '').trim();
  if (!t) return [...(inventario || [])];
  return (inventario || []).filter((p) => productoCoincideBusqueda(p, t));
}

/** Producto cuyo código (principal o alterno) coincide exactamente con el texto. */
export function productoPorCodigoExacto(inventario, query) {
  const t = String(query || '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  return (inventario || []).find((p) => productoTieneCodigo(p, t)) || null;
}
