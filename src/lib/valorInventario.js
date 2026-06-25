import { etiquetaDepartamento, normalizarDepartamento } from './departamentos.js';
import { round2, sinImpuesto } from './productoForm.js';

/** Costo unitario sin IVA para valorizar inventario. */
export function costoUnitarioInventario(p) {
  const compraSin = Number(p?.precio_compra_sin);
  if (compraSin > 0) return compraSin;
  const compraCon = Number(p?.precio_compra_con);
  if (compraCon > 0) {
    const imp = p?.impuesto != null ? Number(p.impuesto) : 8;
    return sinImpuesto(compraCon, imp);
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
    const costoU = costoUnitarioInventario(p);
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
