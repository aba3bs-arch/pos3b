import { etiquetaDepartamento, normalizarDepartamento } from './departamentos.js';
import { round2, sinImpuesto } from './productoForm.js';
import {
  precioRutaComoCostoCompra,
  precioRutaEfectivoParaCosto,
  productoUsaCostoPrecioRutaPorMarca,
  proveedorUsaCostoPrecioRuta,
} from './proveedoresCostoRuta.js';

function debeUsarCostoPrecioRuta(p, opts = {}) {
  if (opts.usarPrecioRuta === true || p?.usa_costo_precio_ruta === true) return true;
  if (opts.proveedorNombre && proveedorUsaCostoPrecioRuta(opts.proveedorNombre)) return true;
  if (opts.productoIdsCostoRuta instanceof Set && p?.id != null) {
    return opts.productoIdsCostoRuta.has(String(p.id));
  }
  if (productoUsaCostoPrecioRutaPorMarca(p) || productoUsaCostoPrecioRutaPorMarca({ nombre: opts.productoNombre })) {
    return true;
  }
  return false;
}

function catalogoDeOpts(opts = {}) {
  return Array.isArray(opts.catalogo) ? opts.catalogo : [];
}

/** Costo unitario sin IVA para valorizar inventario. */
export function costoUnitarioInventario(p, opts = {}) {
  const ruta = precioRutaEfectivoParaCosto(p, catalogoDeOpts(opts));
  if (ruta != null) return ruta;
  if (debeUsarCostoPrecioRuta(p, opts)) return 0;
  const compraSin = Number(p?.precio_compra_sin);
  if (compraSin > 0) return compraSin;
  const compraCon = Number(p?.precio_compra_con);
  if (compraCon > 0) {
    const imp = p?.impuesto != null ? Number(p.impuesto) : 8;
    return sinImpuesto(compraCon, imp);
  }
  return 0;
}

/**
 * Costo unitario para gasto / Consultas → Inventario (NO es precio de venta al público).
 * CEDIS → sucursales: Precio Venta en Ruta (Marlboro/Pall Mall $6, Smoking $2.10).
 * Nunca usa precio_compra_* cuando la marca es de tarifa ruta.
 */
export function costoProveedorUnitario(p, opts = {}) {
  if (!p && !opts.productoNombre) return 0;
  const prod = p || { nombre: opts.productoNombre };
  const ruta = precioRutaEfectivoParaCosto(prod, catalogoDeOpts(opts));
  if (ruta != null) return ruta;
  if (debeUsarCostoPrecioRuta(prod, opts)) {
    // Marca ruta sin precio capturado ni heredable: no inventar compra proveedor.
    return 0;
  }
  const compraCon = Number(prod?.precio_compra_con);
  if (compraCon > 0) return round2(compraCon);
  const compraSin = Number(prod?.precio_compra_sin);
  if (compraSin > 0) return round2(compraSin);
  const costo = Number(prod?.costo);
  if (costo > 0) return round2(costo);
  return 0;
}

/**
 * Precio al público (catálogo) para valorizar venta en Consultas → Inventario.
 */
export function precioVentaUnitarioProducto(p) {
  if (!p) return 0;
  const venta = Number(p.precio);
  if (venta > 0) return round2(venta);
  const ventaCon = Number(p.precio_venta_con);
  if (ventaCon > 0) return round2(ventaCon);
  return 0;
}

/**
 * Precio/costo a mostrar en una línea de Consultas → Inventario.
 * Siempre prioriza Precio Venta en Ruta (propio o heredado por marca).
 * Nunca usa el sello del movimiento si la marca es Marlboro/Pall Mall/Smoking.
 */
export function importeUnitarioMovimientoInventario(m, producto = null, opts = {}) {
  const nombreMov = m?.producto_nombre || opts.productoNombre || '';
  const prod = producto || (nombreMov ? { nombre: nombreMov } : null);
  const optsFull = {
    ...opts,
    productoNombre: nombreMov || opts.productoNombre,
  };

  const ruta = precioRutaEfectivoParaCosto(
    prod?.nombre ? prod : { ...(prod || {}), nombre: nombreMov },
    catalogoDeOpts(optsFull),
  );
  if (ruta != null) return ruta;

  // Marca de tarifa ruta: no caer al precio_compra sellado en el movimiento ($5.25).
  if (debeUsarCostoPrecioRuta(prod, optsFull) || productoUsaCostoPrecioRutaPorMarca({ nombre: nombreMov })) {
    return 0;
  }

  const deCatalogo = costoProveedorUnitario(producto, optsFull);
  if (deCatalogo > 0) return deCatalogo;

  if (m?.precio != null && Number(m.precio) > 0) return round2(Number(m.precio));
  const metaPrecio = Number(m?.meta?.precio);
  if (Number.isFinite(metaPrecio) && metaPrecio > 0) return round2(metaPrecio);
  const qty = Math.abs(Number(m?.cantidad) || 0);
  if (m?.subtotal != null && Number(m.subtotal) !== 0 && qty > 0) {
    const u = Math.abs(Number(m.subtotal)) / qty;
    if (u > 0) return round2(u);
  }
  return 0;
}

export function resumirValorInventario(inventario = []) {
  let unidades = 0;
  let skusConStock = 0;
  let valorCosto = 0;
  let valorVenta = 0;
  let skusSinCosto = 0;
  let skusSinPrecio = 0;
  const porDept = {};

  for (const p of inventario) {
    const stock = Math.max(0, Number(p.stock) || 0);
    const costoU = costoUnitarioInventario(p, { catalogo: inventario });
    const ventaU = Number(p.precio) || 0;
    const dept = normalizarDepartamento(p.cat) || 'GENERAL';

    if (!porDept[dept]) {
      porDept[dept] = { unidades: 0, valorCosto: 0, valorVenta: 0, skus: 0, sinCosto: 0, sinPrecio: 0 };
    }

    if (stock > 0) {
      skusConStock += 1;
      unidades += stock;
      valorCosto += stock * costoU;
      valorVenta += stock * ventaU;
      if (costoU <= 0) skusSinCosto += 1;
      if (ventaU <= 0) skusSinPrecio += 1;
      porDept[dept].unidades += stock;
      porDept[dept].valorCosto += stock * costoU;
      porDept[dept].valorVenta += stock * ventaU;
      porDept[dept].skus += 1;
      if (costoU <= 0) porDept[dept].sinCosto += 1;
      if (ventaU <= 0) porDept[dept].sinPrecio += 1;
    }
  }

  const departamentos = Object.entries(porDept)
    .map(([codigo, d]) => ({
      codigo,
      etiqueta: etiquetaDepartamento(codigo),
      unidades: d.unidades,
      skus: d.skus,
      sinCosto: d.sinCosto,
      sinPrecio: d.sinPrecio,
      valorCosto: round2(d.valorCosto),
      valorVenta: round2(d.valorVenta),
    }))
    .sort((a, b) => b.valorVenta - a.valorVenta || a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const valorTotal = round2(valorVenta);

  return {
    totalSkus: inventario.length,
    skusConStock,
    skusSinCosto,
    skusSinPrecio,
    unidades,
    valorTotal,
    valorCosto: round2(valorCosto),
    valorVenta: valorTotal,
    margenPotencial: round2(valorVenta - valorCosto),
    departamentos,
  };
}

export function fmtMxn(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
