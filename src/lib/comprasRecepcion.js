function normalizarCodigoBusqueda(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  // Lectores a veces mandan sufijo Enter/tab o espacios raros
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (/e[+-]/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

/** Quita ceros a la izquierda solo para comparar códigos numéricos. */
function codigoSinCeros(v) {
  const s = String(v || '').trim();
  if (!/^\d+$/.test(s)) return s;
  const n = s.replace(/^0+/, '');
  return n || '0';
}

/** Busca producto por código de barras exacto o, si hay un solo match por nombre, lo devuelve. */
export function buscarProductoInventario(inventario, codigoRaw) {
  const codigo = normalizarCodigoBusqueda(codigoRaw);
  if (!codigo) return { producto: null, ambiguo: false, candidatos: [] };

  const list = inventario || [];
  const lower = codigo.toLowerCase();
  const codigoDigits = codigoSinCeros(codigo);

  const exact = list.find((p) => {
    const id = String(p.id || '').trim();
    if (!id) return false;
    if (id === codigo || id.toLowerCase() === lower) return true;
    if (/^\d+$/.test(id) && /^\d+$/.test(codigo) && codigoSinCeros(id) === codigoDigits) return true;
    return false;
  });
  if (exact) return { producto: exact, ambiguo: false, candidatos: [exact] };

  const porIdParcial = list.filter((p) => {
    const id = String(p.id || '');
    if (!id) return false;
    if (id.includes(codigo) || id.toLowerCase().includes(lower)) return true;
    if (/^\d+$/.test(id) && /^\d+$/.test(codigo)) {
      return codigoSinCeros(id).includes(codigoDigits) || codigoDigits.includes(codigoSinCeros(id));
    }
    return false;
  });
  if (porIdParcial.length === 1) return { producto: porIdParcial[0], ambiguo: false, candidatos: porIdParcial };
  if (porIdParcial.length > 1) return { producto: null, ambiguo: true, candidatos: porIdParcial.slice(0, 40) };

  const porNombre = list.filter((p) => String(p.nombre || '').toLowerCase().includes(lower));
  if (porNombre.length === 1) return { producto: porNombre[0], ambiguo: false, candidatos: porNombre };
  if (porNombre.length > 1) return { producto: null, ambiguo: true, candidatos: porNombre.slice(0, 40) };

  return { producto: null, ambiguo: false, candidatos: [] };
}

/** Líneas de conteo al abrir un pedido: cantidad recibida en cero, referencia del pedido. */
export function lineasInicialesDesdePedido(itemsPedido, inventario, costoFn) {
  const invById = new Map((inventario || []).map((p) => [String(p.id), p]));
  return (Array.isArray(itemsPedido) ? itemsPedido : []).map((x) => {
    const p = invById.get(String(x.id));
    const costoEst = Number(x.costo_est);
    return {
      id: x.id,
      nombre: x.nombre || p?.nombre || x.id,
      costo: costoEst > 0 ? costoEst : p && costoFn ? costoFn(p) : 0,
      qty: 0,
      qty_pedido: Number(x.qty_pedido) || 0,
      enPedido: true,
    };
  });
}

export function incrementarLineaRecibida(lineas, producto, { costoDefault = 0, qtyPedidoRef = 0, enPedido = false } = {}) {
  const id = producto.id;
  const idx = lineas.findIndex((l) => String(l.id) === String(id));
  if (idx >= 0) {
    const next = [...lineas];
    next[idx] = { ...next[idx], qty: (Number(next[idx].qty) || 0) + 1 };
    return next;
  }
  return [
    ...lineas,
    {
      id: producto.id,
      nombre: producto.nombre,
      costo: costoDefault,
      qty: 1,
      qty_pedido: qtyPedidoRef,
      enPedido,
    },
  ];
}

export function estadoLinea(l) {
  if (!l.enPedido) return 'extra';
  const q = Number(l.qty) || 0;
  const p = Number(l.qty_pedido) || 0;
  if (q === 0) return 'pendiente';
  if (q < p) return 'corto';
  if (q > p) return 'sobre';
  return 'ok';
}

export function resumenRecepcion(lineas) {
  const activas = (lineas || []).filter((l) => Number(l.qty) > 0 || l.enPedido);
  const conPedido = activas.filter((l) => l.enPedido);
  const completas = conPedido.filter((l) => estadoLinea(l) === 'ok');
  const cortas = conPedido.filter((l) => estadoLinea(l) === 'corto');
  const sobres = conPedido.filter((l) => estadoLinea(l) === 'sobre');
  const sinContar = conPedido.filter((l) => estadoLinea(l) === 'pendiente');
  const fueraPedido = activas.filter((l) => !l.enPedido && Number(l.qty) > 0);
  const unidadesRecibidas = activas.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  return {
    completas: completas.length,
    totalPedido: conPedido.length,
    cortas,
    sobres,
    sinContar,
    fueraPedido,
    unidadesRecibidas,
    hayDiferencias: cortas.length + sobres.length + fueraPedido.length > 0,
  };
}

export function lineasParaInventario(lineas) {
  return (lineas || [])
    .filter((l) => Number(l.qty) > 0)
    .map((l) => ({
      id: l.id,
      nombre: l.nombre,
      costo: Number(l.costo) || 0,
      qty: Number(l.qty) || 0,
    }));
}
