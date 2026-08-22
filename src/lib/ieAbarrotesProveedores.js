/**
 * IE ABARROTES — ventas y gastos por proveedor + utilidades.
 * Ventas: tickets POS atribuidos vía proveedor_producto.
 * Gastos: categoría PROVEEDORES del corte Abarrotes (subcategoría = nombre).
 */
import { esAlmacenCentral, normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia, ymdNegocioDesdeIso, hoyYmdNogales } from './corteCaja.js';
import { esCategoriaProveedores } from './corteContabilidad/catalogoGastos.js';
import {
  nombreProveedorDesdeGasto,
  normalizarNombreProveedorClave,
} from './proveedorEntregas.js';
import { costoUnitarioInventario } from './valorInventario.js';
import { consultarVentasPaginadas } from './ventasQuery.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function articulosDeVenta(venta) {
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

function articulosDeCompra(compra) {
  let items = compra?.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items) || !items.length) {
    let pedido = compra?.items_pedido;
    if (typeof pedido === 'string') {
      try {
        pedido = JSON.parse(pedido);
      } catch {
        pedido = [];
      }
    }
    items = Array.isArray(pedido) ? pedido : [];
  }
  return items;
}

function filaVacia(id, nombre) {
  return {
    id: id || 'sin-proveedor',
    nombre: nombre || 'Sin proveedor',
    ventas: 0,
    costo: 0,
    utilidad_bruta: 0,
    gastos: 0,
    compras: 0,
    piezas: 0,
    tickets: 0,
    movimientos_gasto: 0,
  };
}

/** Nombre de proveedor desde subcategoría o comentario del gasto de corte. */
export function proveedorDesdeGastoCorte(gasto) {
  const desdeSub = nombreProveedorDesdeGasto(gasto?.subcategoria);
  if (desdeSub) return desdeSub;
  const desdeCom = nombreProveedorDesdeGasto(gasto?.comentario);
  if (desdeCom) return desdeCom;
  const sub = String(gasto?.subcategoria || '').trim();
  if (sub && !['PAGO', 'MERCANCIA', 'OTROS', 'PROVEEDORES'].includes(normalizarNombreProveedorClave(sub))) {
    return sub;
  }
  return 'Proveedor sin nombre';
}

/**
 * Carga ventas POS, pagos PROVEEDORES del corte y compras, agrupados por proveedor.
 * @param {object} opts
 * @param {number} [opts.egresosIeTotal] egresos del panel IE Abarrotes del periodo
 * @param {Array} [opts.detalleGastosIe] detalle de egresos IE (para restar pagos proveedor del operativo)
 */
export async function cargarReporteProveedoresIeAbarrotes(supabase, {
  desde,
  hasta,
  sucursal = null,
  egresosIeTotal = 0,
  detalleGastosIe = [],
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);
  const avisos = [];

  const [ventasRes, gastosRes, provRes, vinculosRes, productosRes, comprasRes, cancRes] = await Promise.all([
    consultarVentasPaginadas(supabase, {
      columns: 'id,total,sucursal_id,articulos,created_at',
      desde: desdeDt,
      hasta: hastaDt,
      sucursal: suc,
      orderAsc: false,
    }),
    (async () => {
      let q = supabase
        .from('cortes_contabilidad_gastos')
        .select('*')
        .eq('modulo', 'abarrotes')
        .ilike('categoria', '%PROVEEDOR%')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    })(),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
    supabase.from('proveedor_producto').select('proveedor_id, producto_id'),
    supabase
      .from('productos')
      .select('id, nombre, precio, precio_compra_sin, precio_compra_con, impuesto')
      .limit(20000),
    (async () => {
      let q = supabase
        .from('compras')
        .select('id,sucursal_id,sucursal,estado,total,items,items_pedido,proveedor_id,fecha,created_at,proveedores(nombre)')
        .gte('created_at', desdeDt.toISOString())
        .lte('created_at', hastaDt.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000);
      if (suc) q = q.eq('sucursal_id', suc);
      return q;
    })(),
    (async () => {
      try {
        let q = supabase
          .from('cancelaciones')
          .select('id,sucursal_id,articulos,total,created_at')
          .gte('created_at', desdeDt.toISOString())
          .lte('created_at', hastaDt.toISOString())
          .limit(2000);
        if (suc) q = q.eq('sucursal_id', suc);
        return q;
      } catch {
        return { data: [], error: null };
      }
    })(),
  ]);

  if (ventasRes.error) avisos.push(`Ventas: ${ventasRes.error}`);
  if (ventasRes.aviso) avisos.push(ventasRes.aviso);
  if (gastosRes.error && gastosRes.error.code !== '42P01') avisos.push(`Gastos proveedor: ${gastosRes.error.message}`);
  if (provRes.error) avisos.push(`Proveedores: ${provRes.error.message}`);
  if (vinculosRes.error) avisos.push(`Vínculos: ${vinculosRes.error.message}`);
  if (productosRes.error) avisos.push(`Productos: ${productosRes.error.message}`);
  if (comprasRes.error && !/compras|does not exist|schema cache/i.test(String(comprasRes.error.message || ''))) {
    avisos.push(`Compras: ${comprasRes.error.message}`);
  }

  const proveedores = provRes.data || [];
  const provById = new Map(proveedores.map((p) => [String(p.id), p]));
  const provByClave = new Map();
  for (const p of proveedores) {
    const k = normalizarNombreProveedorClave(p.nombre);
    if (k) provByClave.set(k, p);
  }

  /** producto_id → proveedor_id (primer vínculo). */
  const prodAProv = new Map();
  for (const v of vinculosRes.data || []) {
    const pid = String(v.producto_id || '').trim();
    const prid = String(v.proveedor_id || '').trim();
    if (!pid || !prid || prodAProv.has(pid)) continue;
    prodAProv.set(pid, prid);
  }

  const productosById = new Map();
  for (const p of productosRes.data || []) {
    productosById.set(String(p.id), p);
  }

  const map = new Map();
  const ensure = (key, id, nombre) => {
    if (!map.has(key)) map.set(key, filaVacia(id, nombre));
    return map.get(key);
  };

  const resolverFilaPorProducto = (productoId) => {
    const pid = String(productoId || '').trim();
    const prid = prodAProv.get(pid);
    if (prid && provById.has(prid)) {
      const p = provById.get(prid);
      return ensure(`id:${prid}`, prid, p.nombre);
    }
    return ensure('sin-proveedor', 'sin-proveedor', 'Sin proveedor');
  };

  const resolverFilaPorNombre = (nombreRaw) => {
    const nombre = String(nombreRaw || '').trim() || 'Proveedor sin nombre';
    const clave = normalizarNombreProveedorClave(nombre);
    const hit = clave ? provByClave.get(clave) : null;
    if (hit) return ensure(`id:${hit.id}`, String(hit.id), hit.nombre);
    return ensure(`nom:${clave || nombre}`, clave || nombre, nombre);
  };

  let ventas = (ventasRes.data || []).filter((v) => {
    if (esAlmacenCentral(v.sucursal_id)) return false;
    if (suc && normalizarCodigoTienda(v.sucursal_id) !== suc) return false;
    return true;
  });

  // Restar cancelaciones (mismas líneas de artículo)
  const cancelaciones = (!cancRes.error && cancRes.data) ? cancRes.data : [];
  const cancelByProd = new Map();
  for (const c of cancelaciones) {
    if (suc && normalizarCodigoTienda(c.sucursal_id) !== suc) continue;
    if (esAlmacenCentral(c.sucursal_id)) continue;
    for (const a of articulosDeVenta(c)) {
      const id = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      if (!id) continue;
      const piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const importe = Number(a.importe ?? a.subtotal);
      const lineImp = Number.isFinite(importe) && importe !== 0 ? importe : precio * piezas;
      cancelByProd.set(id, {
        piezas: (cancelByProd.get(id)?.piezas || 0) + piezas,
        importe: (cancelByProd.get(id)?.importe || 0) + lineImp,
      });
    }
  }

  for (const v of ventas) {
    const arts = articulosDeVenta(v);
    if (!arts.length) {
      // Ticket sin desglose: no se puede atribuir a proveedor
      const row = ensure('sin-proveedor', 'sin-proveedor', 'Sin proveedor');
      row.ventas = round2(row.ventas + (Number(v.total) || 0));
      row.tickets += 1;
      continue;
    }
    const vistos = new Set();
    for (const a of arts) {
      const id = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      if (!id) continue;
      let piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const importeRaw = Number(a.importe ?? a.subtotal);
      let lineImp = Number.isFinite(importeRaw) && importeRaw !== 0 ? importeRaw : precio * piezas;

      const canc = cancelByProd.get(id);
      if (canc && canc.piezas > 0) {
        const restPiezas = Math.min(piezas, canc.piezas);
        const ratio = piezas > 0 ? restPiezas / piezas : 0;
        piezas -= restPiezas;
        lineImp -= lineImp * ratio;
        canc.piezas -= restPiezas;
        canc.importe = Math.max(0, (canc.importe || 0) - lineImp * ratio);
      }
      if (piezas <= 0 && lineImp <= 0) continue;

      const prod = productosById.get(id);
      const costoU = prod ? costoUnitarioInventario(prod) : 0;
      const row = resolverFilaPorProducto(id);
      row.ventas = round2(row.ventas + lineImp);
      row.costo = round2(row.costo + costoU * piezas);
      row.piezas = round2(row.piezas + piezas);
      if (!vistos.has(row.id)) {
        row.tickets += 1;
        vistos.add(row.id);
      }
    }
  }

  const gastosRaw = (gastosRes.error ? [] : gastosRes.data || []).filter((g) => {
    if (!esCategoriaProveedores(g.categoria)) return false;
    const est = g.estado_aprobacion;
    if (est && est !== 'aprobado') return false;
    if (suc && normalizarCodigoTienda(g.sucursal_id) !== suc) return false;
    return true;
  });

  const detalleGastosProv = [];
  for (const g of gastosRaw) {
    const nombre = proveedorDesdeGastoCorte(g);
    const row = resolverFilaPorNombre(nombre);
    const monto = round2(g.monto);
    row.gastos = round2(row.gastos + monto);
    row.movimientos_gasto += 1;
    detalleGastosProv.push({
      id: g.id,
      fecha: ymdNegocioDesdeIso(g.created_at) || hoyYmdNogales(),
      tienda: g.sucursal_id,
      proveedor: row.nombre,
      subcategoria: g.subcategoria || '',
      comentario: g.comentario || '',
      monto,
    });
  }

  const compras = comprasRes.error ? [] : (comprasRes.data || []);
  for (const c of compras) {
    const estado = String(c.estado || '').toLowerCase();
    if (estado && !['recibida', 'recibido', 'cerrada', 'cerrado', 'completada', 'completo'].includes(estado)) {
      // Incluir también sin estado (legado) o pedido ya totalizado
      if (estado === 'pedido' || estado === 'borrador' || estado === 'cancelada' || estado === 'cancelado') continue;
    }
    const sucC = normalizarCodigoTienda(c.sucursal_id || c.sucursal);
    if (suc && sucC !== suc) continue;
    if (esAlmacenCentral(sucC)) continue;

    let total = Number(c.total);
    if (!Number.isFinite(total) || total <= 0) {
      total = articulosDeCompra(c).reduce((s, a) => {
        const qty = Number(a.qty ?? a.cantidad ?? 1) || 1;
        const costo = Number(a.costo ?? a.costo_est ?? a.precio) || 0;
        return s + qty * costo;
      }, 0);
    }
    if (!(total > 0)) continue;

    const prid = c.proveedor_id != null ? String(c.proveedor_id) : '';
    let row;
    if (prid && provById.has(prid)) {
      const p = provById.get(prid);
      row = ensure(`id:${prid}`, prid, p.nombre);
    } else if (c.proveedores?.nombre) {
      row = resolverFilaPorNombre(c.proveedores.nombre);
    } else {
      row = ensure('sin-proveedor', 'sin-proveedor', 'Sin proveedor');
    }
    row.compras = round2(row.compras + total);
  }

  for (const row of map.values()) {
    row.utilidad_bruta = round2(row.ventas - row.costo);
  }

  const porProveedor = [...map.values()]
    .filter((r) => r.ventas > 0 || r.gastos > 0 || r.compras > 0)
    .sort((a, b) => (b.ventas + b.gastos) - (a.ventas + a.gastos) || a.nombre.localeCompare(b.nombre, 'es'));

  const ventasTotal = round2(porProveedor.reduce((s, r) => s + r.ventas, 0));
  const costoTotal = round2(porProveedor.reduce((s, r) => s + r.costo, 0));
  const utilidadBruta = round2(ventasTotal - costoTotal);
  const gastosProveedores = round2(porProveedor.reduce((s, r) => s + r.gastos, 0));
  const comprasTotal = round2(porProveedor.reduce((s, r) => s + r.compras, 0));

  // Egresos IE que ya son pagos a proveedor (NO son “gasto del negocio”:
  // son inversión / costo de mercancía — de ahí salen las ventas y la ganancia).
  const egresosProvEnIe = round2(
    (detalleGastosIe || [])
      .filter((d) => esCategoriaProveedores(d.categoria) || esCategoriaProveedores(d.categoria_id))
      .reduce((s, d) => s + (Number(d.monto) || 0), 0),
  );
  const egresosIe = round2(egresosIeTotal);

  // Gastos reales del negocio (nómina, servicios, taxis, etc.) — sin proveedores.
  const gastosOpMap = new Map();
  for (const d of detalleGastosIe || []) {
    if (esCategoriaProveedores(d.categoria) || esCategoriaProveedores(d.categoria_id)) continue;
    const monto = round2(d.monto);
    if (!(monto > 0)) continue;
    const cat = String(d.categoria || d.categoria_id || 'Otros').trim() || 'Otros';
    const prev = gastosOpMap.get(cat) || { categoria: cat, monto: 0, movimientos: 0 };
    prev.monto = round2(prev.monto + monto);
    prev.movimientos += 1;
    gastosOpMap.set(cat, prev);
  }
  const gastosOperativosDesglose = [...gastosOpMap.values()].sort((a, b) => b.monto - a.monto);
  const gastosOperativos = round2(
    gastosOperativosDesglose.reduce((s, r) => s + r.monto, 0) || Math.max(0, egresosIe - egresosProvEnIe),
  );
  const gananciaNeta = round2(utilidadBruta - gastosOperativos);

  // Panorama: de dónde sale la ganancia y en qué se gasta (sin mezclar proveedores).
  const reinversionProducto = costoTotal; // costo de lo vendido (vuelve a mercancía)
  const pctReinversionVentas = ventasTotal > 0 ? round2((reinversionProducto / ventasTotal) * 100) : 0;
  const pctGastosSobreUtilidad = utilidadBruta > 0
    ? round2((gastosOperativos / utilidadBruta) * 100)
    : (gastosOperativos > 0 ? 100 : 0);
  const pctGananciaSobreVentas = ventasTotal > 0 ? round2((gananciaNeta / ventasTotal) * 100) : 0;
  const pctUtilidadSobreVentas = ventasTotal > 0 ? round2((utilidadBruta / ventasTotal) * 100) : 0;
  const pctPagosProvSobreVentas = ventasTotal > 0 ? round2((gastosProveedores / ventasTotal) * 100) : 0;

  const desgloseConPct = gastosOperativosDesglose.map((r) => ({
    ...r,
    pct_sobre_utilidad: utilidadBruta > 0 ? round2((r.monto / utilidadBruta) * 100) : 0,
    pct_sobre_gastos: gastosOperativos > 0 ? round2((r.monto / gastosOperativos) * 100) : 0,
  }));

  return {
    ok: true,
    desde,
    hasta,
    porProveedor,
    detalleGastos: detalleGastosProv.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
    totales: {
      ventas: ventasTotal,
      costo: costoTotal,
      reinversion_producto: reinversionProducto,
      utilidad_bruta: utilidadBruta,
      gastos_proveedores: gastosProveedores,
      compras: comprasTotal,
      egresos_ie: egresosIe,
      egresos_proveedores_ie: egresosProvEnIe,
      gastos_operativos: gastosOperativos,
      ganancia_neta: gananciaNeta,
      margen_pct: pctUtilidadSobreVentas,
      pct_reinversion_ventas: pctReinversionVentas,
      pct_gastos_sobre_utilidad: pctGastosSobreUtilidad,
      pct_ganancia_ventas: pctGananciaSobreVentas,
      pct_pagos_prov_ventas: pctPagosProvSobreVentas,
    },
    panorama: {
      ventas: ventasTotal,
      reinversion: reinversionProducto,
      utilidad_bruta: utilidadBruta,
      gastos_operativos: gastosOperativos,
      ganancia_neta: gananciaNeta,
      pagos_proveedores: gastosProveedores,
      egresos_proveedores_ie: egresosProvEnIe,
      gastos_desglose: desgloseConPct,
      resumen: [
        'Los pagos a proveedores NO son un “gasto del negocio”: es el dinero con el que se compra la mercancía que después se vende.',
        ventasTotal > 0
          ? `De cada $100 vendidos, ~$${pctReinversionVentas.toFixed(0)} corresponden al costo de la mercancía (inversión). Quedan ~$${pctUtilidadSobreVentas.toFixed(0)} de ganancia del producto.`
          : 'Aún no hay ventas en el periodo para calcular la ganancia del producto.',
        utilidadBruta > 0 && gastosOperativos > 0
          ? `De esa ganancia del producto (${fmtPlain(utilidadBruta)}), se egresaron ${fmtPlain(gastosOperativos)} en gastos del negocio (~${pctGastosSobreUtilidad}%).`
          : (gastosOperativos > 0
            ? `Hay ${fmtPlain(gastosOperativos)} de gastos del negocio aunque la ganancia del producto sea 0 o negativa.`
            : 'No hubo gastos del negocio (fuera de proveedores) en el periodo.'),
        `Lo que queda al final (ganancia neta): ${fmtPlain(gananciaNeta)} — ${pctGananciaSobreVentas}% de las ventas.`,
      ].filter(Boolean),
    },
    avisos,
    meta: {
      tickets: ventas.length,
      gastos_count: gastosRaw.length,
      proveedores: porProveedor.length,
    },
  };
}

function fmtPlain(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '−' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
