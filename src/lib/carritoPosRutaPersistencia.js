/**
 * Persiste el carrito del POS de Venta en Ruta en localStorage por vendedor.
 * Sobrevive a cierre de la app y a «Limpiar caché» (clave preservada).
 */

export const LS_CARRITO_POS_RUTA_PREFIX = 'pos3b_carrito_pos_ruta_';

/** Identificador estable del vendedor en sesión (usuario o Panel RT). */
export function claveVendedorPosRuta(vendedorSesion) {
  if (!vendedorSesion) return '';
  const id = vendedorSesion.id != null ? String(vendedorSesion.id).trim() : '';
  if (id) return id;
  const uid = vendedorSesion.usuario_id != null ? String(vendedorSesion.usuario_id).trim() : '';
  return uid;
}

export function claveCarritoPosRuta(vendedorSesion) {
  const k = claveVendedorPosRuta(vendedorSesion);
  if (!k) return '';
  return `${LS_CARRITO_POS_RUTA_PREFIX}${k}`;
}

function normalizarLinea(row) {
  if (!row || row.productoId == null) return null;
  const cantidad = Math.max(1, Math.floor(Number(row.cantidad) || 1));
  const precio = Number(row.precio);
  const disponible = Number(row.disponible);
  return {
    productoId: row.productoId,
    nombre: String(row.nombre || 'Producto'),
    precio: Number.isFinite(precio) && precio >= 0 ? precio : 0,
    cantidad,
    foto_url: row.foto_url || null,
    disponible: Number.isFinite(disponible) && disponible >= 0 ? disponible : cantidad,
  };
}

/**
 * @returns {{ clienteKey: string, carrito: Array }}
 */
export function leerCarritoPosRuta(vendedorSesion) {
  const vacio = { clienteKey: '', carrito: [] };
  try {
    const clave = claveCarritoPosRuta(vendedorSesion);
    if (!clave) return vacio;
    const raw = localStorage.getItem(clave);
    if (!raw) return vacio;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return vacio;
    const clienteKey = String(data.clienteKey || '');
    const arr = Array.isArray(data.carrito) ? data.carrito : [];
    return {
      clienteKey,
      carrito: arr.map(normalizarLinea).filter(Boolean),
    };
  } catch {
    return vacio;
  }
}

export function guardarCarritoPosRuta(vendedorSesion, { clienteKey = '', carrito = [] } = {}) {
  try {
    const clave = claveCarritoPosRuta(vendedorSesion);
    if (!clave) return;
    const limpio = (carrito || []).map(normalizarLinea).filter(Boolean);
    const ck = String(clienteKey || '');
    if (!limpio.length && !ck) {
      localStorage.removeItem(clave);
      return;
    }
    localStorage.setItem(clave, JSON.stringify({ clienteKey: ck, carrito: limpio }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function limpiarCarritoPosRuta(vendedorSesion) {
  try {
    const clave = claveCarritoPosRuta(vendedorSesion);
    if (!clave) return;
    localStorage.removeItem(clave);
  } catch {
    /* ignore */
  }
}

/** Borra todos los carritos POS ruta (purga admin). */
export function limpiarTodosCarritosPosRuta() {
  try {
    const aBorrar = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_CARRITO_POS_RUTA_PREFIX)) aBorrar.push(k);
    }
    for (const k of aBorrar) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
