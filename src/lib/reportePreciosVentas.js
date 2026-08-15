/** Compara el precio cobrado en ventas vs el precio actual del inventario. */

export const EPS_PRECIO = 0.005;

export function articulosDeVenta(venta) {
  let a = venta?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clavePrecio(n) {
  return String(round2(n));
}

/**
 * @param {object[]} ventas
 * @param {Map<string, object>|object[]} inventario
 */
export function compararPreciosVentasInventario(ventas = [], inventario = []) {
  const byId = inventario instanceof Map
    ? inventario
    : new Map((inventario || []).map((p) => [String(p.id), p]));

  const stats = {
    ventas: (ventas || []).length,
    lineas: 0,
    lineasConCatalogo: 0,
    lineasSinCatalogo: 0,
    lineasIgual: 0,
    lineasDif: 0,
    lineasCero: 0,
    impactoFirmado: 0,
    impactoAbs: 0,
  };

  const porProducto = new Map();

  const acc = (id) => {
    if (!porProducto.has(id)) {
      porProducto.set(id, {
        id,
        nombre: '',
        precioInv: null,
        sinCatalogo: false,
        lineas: 0,
        piezas: 0,
        lineasDif: 0,
        piezasDif: 0,
        lineasCero: 0,
        piezasCero: 0,
        cobrado: 0,
        aPrecioActual: 0,
        impacto: 0,
        preciosVenta: new Map(),
        sucursales: new Set(),
        primera: null,
        ultima: null,
        ejemplos: [],
      });
    }
    return porProducto.get(id);
  };

  for (const venta of ventas || []) {
    const created = venta.created_at || '';
    for (const a of articulosDeVenta(venta)) {
      stats.lineas += 1;
      const pid = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      const nombre = String(a.nombre || '').trim();
      const precioVenta = num(a.precio);
      const qty = num(a.qty) || 1;
      const prod = pid ? byId.get(pid) : null;

      if (!prod) {
        stats.lineasSinCatalogo += 1;
        const r = acc(`SIN_CAT:${pid || nombre || '?'}`);
        r.nombre = nombre || pid || 'Sin código';
        r.sinCatalogo = true;
        r.lineas += 1;
        r.piezas += qty;
        r.cobrado += precioVenta * qty;
        if (venta.sucursal_id) r.sucursales.add(venta.sucursal_id);
        if (!r.primera || created < r.primera) r.primera = created;
        if (!r.ultima || created > r.ultima) r.ultima = created;
        const pv = r.preciosVenta.get(clavePrecio(precioVenta)) || {
          precio: precioVenta,
          n: 0,
          piezas: 0,
        };
        pv.n += 1;
        pv.piezas += qty;
        r.preciosVenta.set(clavePrecio(precioVenta), pv);
        continue;
      }

      const precioInv = num(prod.precio ?? prod.precio_venta_con);
      stats.lineasConCatalogo += 1;
      const r = acc(pid);
      r.nombre = prod.nombre || nombre;
      r.precioInv = precioInv;
      r.lineas += 1;
      r.piezas += qty;
      r.cobrado += precioVenta * qty;
      r.aPrecioActual += precioInv * qty;
      if (venta.sucursal_id) r.sucursales.add(venta.sucursal_id);
      if (!r.primera || created < r.primera) r.primera = created;
      if (!r.ultima || created > r.ultima) r.ultima = created;

      const pv = r.preciosVenta.get(clavePrecio(precioVenta)) || {
        precio: precioVenta,
        n: 0,
        piezas: 0,
      };
      pv.n += 1;
      pv.piezas += qty;
      r.preciosVenta.set(clavePrecio(precioVenta), pv);

      if (precioVenta <= EPS_PRECIO) {
        stats.lineasCero += 1;
        r.lineasCero += 1;
        r.piezasCero += qty;
      }

      const dif = Math.abs(precioVenta - precioInv);
      if (dif > EPS_PRECIO) {
        stats.lineasDif += 1;
        r.lineasDif += 1;
        r.piezasDif += qty;
        const impacto = (precioInv - precioVenta) * qty;
        r.impacto += impacto;
        stats.impactoFirmado += impacto;
        stats.impactoAbs += Math.abs(impacto);
        if (r.ejemplos.length < 8) {
          r.ejemplos.push({
            ventaId: venta.id,
            fecha: created,
            sucursal: venta.sucursal_id,
            vendedor: venta.vendedor,
            qty,
            precioVenta,
            precioInv,
            totalTicket: num(venta.total),
          });
        }
      } else {
        stats.lineasIgual += 1;
      }
    }
  }

  const filas = [...porProducto.values()].map((r) => {
    const preciosCobrados = [...r.preciosVenta.values()].sort((a, b) => b.piezas - a.piezas);
    const sospechosoBajo = preciosCobrados.some(
      (p) => r.precioInv >= 5 && p.precio > EPS_PRECIO && p.precio < r.precioInv * 0.4,
    );
    let tipo = 'igual';
    if (r.sinCatalogo) tipo = 'sin_catalogo';
    else if (r.lineasCero > 0) tipo = 'cero';
    else if (sospechosoBajo) tipo = 'bajo';
    else if ((r.precioInv || 0) <= EPS_PRECIO && r.cobrado > EPS_PRECIO) tipo = 'catalogo_cero';
    else if (r.lineasDif > 0) tipo = 'cambio';

    return {
      id: r.id,
      nombre: r.nombre,
      precioInv: r.precioInv,
      sinCatalogo: r.sinCatalogo,
      tipo,
      lineas: r.lineas,
      piezas: r.piezas,
      lineasDif: r.lineasDif,
      piezasDif: r.piezasDif,
      lineasCero: r.lineasCero,
      piezasCero: r.piezasCero,
      cobrado: round2(r.cobrado),
      aPrecioActual: round2(r.aPrecioActual),
      impacto: round2(r.impacto),
      preciosCobrados,
      sucursales: [...r.sucursales].filter(Boolean),
      primera: r.primera,
      ultima: r.ultima,
      ejemplos: r.ejemplos,
    };
  });

  filas.sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto) || b.lineasDif - a.lineasDif);

  return {
    stats: {
      ...stats,
      impactoFirmado: round2(stats.impactoFirmado),
      impactoAbs: round2(stats.impactoAbs),
      productosConDiferencia: filas.filter((f) => f.lineasDif > 0 && !f.sinCatalogo).length,
      productosCero: filas.filter((f) => f.lineasCero > 0 && !f.sinCatalogo).length,
      pctLineasDif: round2((stats.lineasDif / Math.max(1, stats.lineasConCatalogo)) * 100),
    },
    filas,
  };
}

export function etiquetaTipoPrecio(tipo) {
  if (tipo === 'cero') return 'Vendido a $0';
  if (tipo === 'bajo') return 'Precio muy bajo';
  if (tipo === 'catalogo_cero') return 'Catálogo en $0';
  if (tipo === 'cambio') return 'Precio distinto';
  if (tipo === 'sin_catalogo') return 'Ya no está en catálogo';
  return 'Igual al inventario';
}
