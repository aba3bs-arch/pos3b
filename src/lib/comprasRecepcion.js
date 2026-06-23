/** Busca producto por código de barras exacto o, si hay un solo match por nombre, lo devuelve. */
export function buscarProductoInventario(inventario, codigoRaw) {
  const codigo = String(codigoRaw || '').trim();
  if (!codigo) return { producto: null, ambiguo: false };

  const list = inventario || [];
  const exact = list.find(
    (p) => String(p.id) === codigo || String(p.id).toLowerCase() === codigo.toLowerCase(),
  );
  if (exact) return { producto: exact, ambiguo: false };

  const lower = codigo.toLowerCase();
  const porNombre = list.filter((p) => String(p.nombre || '').toLowerCase().includes(lower));
  if (porNombre.length === 1) return { producto: porNombre[0], ambiguo: false };
  if (porNombre.length > 1) return { producto: null, ambiguo: true };

  const porIdParcial = list.filter((p) => String(p.id || '').includes(codigo));
  if (porIdParcial.length === 1) return { producto: porIdParcial[0], ambiguo: false };
  if (porIdParcial.length > 1) return { producto: null, ambiguo: true };

  return { producto: null, ambiguo: false };
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
