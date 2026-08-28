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

/**
 * Multiplicador de cantidad en el buscador/escáner:
 * - `3*30` → qty 3, código "30"
 * - `5*` → qty 5, esperando escaneo/código
 * - `750123` → qty 1, código completo
 * @returns {{ qty: number, codigo: string, tieneMultiplicador: boolean, soloMultiplicador: boolean, raw: string }}
 */
export function parseMultiplicadorBusqueda(raw) {
  const t = String(raw || '').trim();
  if (!t) {
    return { qty: 1, codigo: '', tieneMultiplicador: false, soloMultiplicador: false, raw: '' };
  }
  const m = t.match(/^(\d{1,4})\s*\*\s*(.*)$/);
  if (!m) {
    return { qty: 1, codigo: t, tieneMultiplicador: false, soloMultiplicador: false, raw: t };
  }
  const qty = Math.min(9999, Math.max(1, parseInt(m[1], 10) || 1));
  const codigo = String(m[2] || '').trim();
  return {
    qty,
    codigo,
    tieneMultiplicador: true,
    soloMultiplicador: codigo === '',
    raw: t,
  };
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
 * Coincide producto con texto de búsqueda.
 * Soporta prefijo `N*` (se ignora la cantidad para filtrar).
 */
export function productoCoincideBusqueda(producto, query) {
  const { codigo, soloMultiplicador } = parseMultiplicadorBusqueda(query);
  if (soloMultiplicador) return true;
  const t = String(codigo || '')
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
  const { codigo, soloMultiplicador } = parseMultiplicadorBusqueda(query);
  if (soloMultiplicador || !String(codigo || '').trim()) return [...(inventario || [])];
  return (inventario || []).filter((p) => productoCoincideBusqueda(p, query));
}

/** Producto cuyo código (principal o alterno) coincide exactamente con el texto. */
export function productoPorCodigoExacto(inventario, query) {
  const { codigo } = parseMultiplicadorBusqueda(query);
  const t = String(codigo || '')
    .trim()
    .toLowerCase();
  if (!t) return null;
  const matches = (inventario || []).filter((p) => productoTieneCodigo(p, t));
  if (!matches.length) return null;
  const exactId = matches.find((p) => String(p.id || '').trim().toLowerCase() === t);
  if (exactId) return exactId;
  const conPrecio = matches.filter((p) => Number(p.precio) > 0);
  return conPrecio[0] || matches[0];
}
