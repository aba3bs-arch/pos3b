/**
 * Estadísticas · Venta en Ruta vs recolección.
 *
 * Responde dos preguntas:
 *  1) ¿La ruta deja rendimiento? (venta − costo de lo vendido − gastos de ruta, por proveedor y tienda)
 *  2) ¿Lo que sale de cada tienda (recolección en efectivo + pago con tarjeta) excede lo que la tienda
 *     generó neto? Si sale más que (venta − gastos del corte), el excedente sale de la
 *     ganancia de los demás proveedores (o de lo que había que pagarles).
 */
import { normalizarCodigoTienda, etiquetaTienda } from '../constants/sucursales.js';
import { precioCompraCatalogo } from './ventaEnRuta.js';
import {
  tiendaDeVentaRuta,
  ventaCancelada,
  listarVentasRutaPorRango,
  listarGastosRutaPorRango,
  gastoVigente,
  totalGastos,
} from './ventasRutaPorTienda.js';
import { montosPagoDesdeVentaRuta } from './compraGastoCorte.js';
import { listarMovimientosRecoleccionContabilidad } from './controlEfectivo.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const SIN_PROVEEDOR = 'Sin proveedor';
export const TOLERANCIA_MIN_MXN = 50;
export const TOLERANCIA_PCT = 0.05;

function esCancelado(m) {
  return /cancel/i.test(String(m?.estatus || ''));
}

/** Renglones reales de una venta de ruta (sin las marcas internas de pago mixto / camión). */
export function articulosRutaVenta(venta) {
  let arts = venta?.articulos;
  if (typeof arts === 'string') {
    try {
      arts = JSON.parse(arts);
    } catch {
      arts = [];
    }
  }
  return (Array.isArray(arts) ? arts : [])
    .filter((a) => a && !a._pago_mixto && !a._lineas_camion && (a.producto_id ?? a.productoId))
    .map((a) => {
      const cantidad = Number(a.cantidad ?? a.qty) || 0;
      const precio = Number(a.precio) || 0;
      const importe = Number(a.importe);
      return {
        producto_id: String(a.producto_id ?? a.productoId),
        nombre: a.nombre || '',
        cantidad,
        precio,
        importe: Number.isFinite(importe) && importe !== 0 ? importe : precio * cantidad,
      };
    })
    .filter((a) => a.cantidad > 0);
}

function filaVacia(extra = {}) {
  return { piezas: 0, venta: 0, costo: 0, ganancia: 0, ventaSinCosto: 0, ...extra };
}

function cerrarFila(f) {
  const venta = r2(f.venta);
  const costo = r2(f.costo);
  const ventaConCosto = r2(venta - f.ventaSinCosto);
  const ganancia = r2(ventaConCosto - costo);
  return {
    ...f,
    venta,
    costo,
    ganancia,
    ventaSinCosto: r2(f.ventaSinCosto),
    margenPct: ventaConCosto > 0 ? r2((ganancia / ventaConCosto) * 100) : null,
  };
}

/**
 * Costea las ventas de ruta con el costo de compra del catálogo (sin IVA).
 * @param {Array} ventas filas de ruta_ventas
 * @param {Map<string, object>} productos id → producto (precio_compra_sin / _con / impuesto)
 * @param {Map<string, string>} proveedorPorProducto id → nombre del proveedor
 */
export function costearVentasRuta(ventas, { productos = new Map(), proveedorPorProducto = new Map() } = {}) {
  const total = filaVacia({ ventas: 0, efectivo: 0, credito: 0, canceladas: 0, creditoPendiente: 0 });
  const porProveedor = new Map();
  const porTienda = new Map();
  const porProducto = new Map();

  for (const v of ventas || []) {
    if (ventaCancelada(v)) {
      total.canceladas += 1;
      continue;
    }
    const tienda = tiendaDeVentaRuta(v);
    const pago = montosPagoDesdeVentaRuta(v);
    const efectivo = r2(pago.montoEfectivo);
    const credito = r2(pago.montoCredito);
    total.ventas += 1;
    total.efectivo = r2(total.efectivo + efectivo);
    total.credito = r2(total.credito + credito);
    if (credito > 0 && String(v?.estado_credito || '').toLowerCase() === 'pendiente') {
      total.creditoPendiente = r2(total.creditoPendiente + credito);
    }

    let filaTienda = porTienda.get(tienda.clave);
    if (!filaTienda) {
      filaTienda = filaVacia({
        clave: tienda.clave,
        nombre: tienda.nombre,
        externo: tienda.externo,
        ventas: 0,
        efectivo: 0,
        credito: 0,
      });
      porTienda.set(tienda.clave, filaTienda);
    }
    filaTienda.ventas += 1;
    filaTienda.efectivo = r2(filaTienda.efectivo + efectivo);
    filaTienda.credito = r2(filaTienda.credito + credito);

    const arts = articulosRutaVenta(v);
    for (const a of arts) {
      const prod = productos.get(a.producto_id);
      const compra = prod ? precioCompraCatalogo(prod) : null;
      const conCosto = compra != null && compra > 0;
      const costoLinea = conCosto ? compra * a.cantidad : 0;
      const proveedor = proveedorPorProducto.get(a.producto_id) || SIN_PROVEEDOR;

      let filaProv = porProveedor.get(proveedor);
      if (!filaProv) {
        filaProv = filaVacia({ proveedor });
        porProveedor.set(proveedor, filaProv);
      }
      let filaProd = porProducto.get(a.producto_id);
      if (!filaProd) {
        filaProd = filaVacia({ producto_id: a.producto_id, nombre: a.nombre, proveedor });
        porProducto.set(a.producto_id, filaProd);
      }
      for (const f of [total, filaTienda, filaProv, filaProd]) {
        f.piezas += a.cantidad;
        f.venta += a.importe;
        f.costo += costoLinea;
        if (!conCosto) f.ventaSinCosto += a.importe;
      }
    }
    if (!arts.length && Number(v?.total) > 0) {
      const t = Number(v.total);
      for (const f of [total, filaTienda]) {
        f.venta += t;
        f.ventaSinCosto += t;
      }
    }
  }

  const resumen = cerrarFila(total);
  const proveedores = [...porProveedor.values()].map(cerrarFila).sort((a, b) => b.venta - a.venta);
  const tiendas = [...porTienda.values()].map(cerrarFila).sort((a, b) => b.venta - a.venta);
  const productosCerrados = [...porProducto.values()].map(cerrarFila);
  const productosSinMargen = productosCerrados
    .filter((p) => p.venta - p.ventaSinCosto > 0 && p.ganancia <= 0)
    .sort((a, b) => b.venta - a.venta);

  return { resumen, proveedores, tiendas, productosSinMargen };
}

function esGastoVigente(g) {
  return !/rechaz|cancel/i.test(String(g?.estado_aprobacion || ''));
}

function esGastoDeRuta(g) {
  const blob = `${g?.subcategoria || ''} ${g?.comentario || ''}`;
  return /venta\s+en\s+ruta|cr[eé]dito\s+ruta/i.test(blob);
}

/**
 * Cruza cada tienda: lo que la ruta le vendió, lo que la tienda generó neto y lo recolectado.
 * neto = venta del corte − gastos del corte (lo que la tienda generó).
 * salido = recolectado en efectivo + pago con tarjeta (dinero electrónico que también sale de la tienda).
 * diferencia = salido − neto (positivo = salió más dinero del que la tienda generó).
 */
export function compararRecoleccionPorTienda({
  costeo,
  ventasTienda = [],
  gastosTienda = [],
  movimientos = [],
  tiendasBase = [],
} = {}) {
  const filas = new Map();
  const get = (clave) => {
    const k = normalizarCodigoTienda(clave) || String(clave || '').toUpperCase();
    if (!k) return null;
    let f = filas.get(k);
    if (!f) {
      f = {
        clave: k,
        nombre: etiquetaTienda(k) || k,
        ventaRuta: 0,
        gananciaRuta: 0,
        ventaTienda: 0,
        tarjeta: 0,
        gastos: 0,
        gastosRuta: 0,
        gastosProveedores: 0,
        recolectado: 0,
        efectivoRutaTransito: 0,
      };
      filas.set(k, f);
    }
    return f;
  };

  for (const t of tiendasBase) get(t);

  for (const t of costeo?.tiendas || []) {
    if (t.externo) continue;
    const f = get(t.clave);
    if (!f) continue;
    f.ventaRuta = r2(f.ventaRuta + t.venta);
    f.gananciaRuta = r2(f.gananciaRuta + t.ganancia);
  }

  for (const v of ventasTienda) {
    const f = get(v.sucursal_id);
    if (!f) continue;
    f.ventaTienda = r2(f.ventaTienda + (Number(v.total) || 0));
    f.tarjeta = r2(f.tarjeta + (Number(v.tarjeta) || 0));
  }

  for (const g of gastosTienda) {
    if (!esGastoVigente(g)) continue;
    const f = get(g.sucursal_id);
    if (!f) continue;
    const m = Number(g.monto) || 0;
    f.gastos = r2(f.gastos + m);
    if (esGastoDeRuta(g)) f.gastosRuta = r2(f.gastosRuta + m);
    else if (String(g.categoria || '').toUpperCase().includes('PROVEEDOR')) {
      f.gastosProveedores = r2(f.gastosProveedores + m);
    }
  }

  for (const m of movimientos) {
    if (esCancelado(m)) continue;
    const f = get(m.sucursal_origen);
    if (!f) continue;
    const monto = Number(m.monto) || 0;
    if (m.tipo_movimiento === 'Recolección') f.recolectado = r2(f.recolectado + monto);
    else if (m.tipo_movimiento === 'Venta Ruta') f.efectivoRutaTransito = r2(f.efectivoRutaTransito + monto);
  }

  const out = [...filas.values()].map((f) => {
    const neto = r2(f.ventaTienda - f.gastos);
    const salido = r2(f.recolectado + f.tarjeta);
    const diferencia = r2(salido - neto);
    const tolerancia = Math.max(TOLERANCIA_MIN_MXN, Math.abs(neto) * TOLERANCIA_PCT);
    let estado = 'cuadra';
    if (f.ventaTienda <= 0 && salido <= 0) estado = 'sin_datos';
    else if (diferencia > tolerancia) estado = 'excede';
    else if (diferencia < -tolerancia) estado = 'falta';
    return { ...f, neto, salido, diferencia, tolerancia: r2(tolerancia), estado };
  });
  return out
    .filter((f) => f.ventaRuta > 0 || f.ventaTienda > 0 || f.recolectado > 0 || f.gastos > 0)
    .sort((a, b) => b.diferencia - a.diferencia);
}

const fmt = (n) => {
  const v = Number(n) || 0;
  const txt = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}$${txt}`;
};

/**
 * Arma el análisis completo y los hallazgos en lenguaje llano.
 */
export function resumenRendimientoRuta({
  ventas = [],
  productos = new Map(),
  proveedorPorProducto = new Map(),
  movimientos = [],
  gastosRuta = null,
  ventasTienda = [],
  gastosTienda = [],
  tiendasBase = [],
} = {}) {
  const costeo = costearVentasRuta(ventas, { productos, proveedorPorProducto });
  const tiendas = compararRecoleccionPorTienda({ costeo, ventasTienda, gastosTienda, movimientos, tiendasBase });

  let efectivoRegistrado = 0;
  let efectivoEnTransito = 0;
  let efectivoLiquidado = 0;
  for (const m of movimientos) {
    if (m.tipo_movimiento !== 'Venta Ruta' || esCancelado(m)) continue;
    const monto = Number(m.monto) || 0;
    efectivoRegistrado = r2(efectivoRegistrado + monto);
    if (m.estatus === 'En Tránsito') efectivoEnTransito = r2(efectivoEnTransito + monto);
    else if (m.estatus === 'Liquidado') efectivoLiquidado = r2(efectivoLiquidado + monto);
  }

  const gastosRutaTotal = gastosRuta == null ? null : totalGastos(gastosRuta);
  const r = costeo.resumen;
  const rendimientoNeto = gastosRutaTotal == null ? null : r2(r.ganancia - gastosRutaTotal);

  const totalRecolectado = r2(tiendas.reduce((s, t) => s + t.recolectado, 0));
  const totalTarjeta = r2(tiendas.reduce((s, t) => s + t.tarjeta, 0));
  const totalVentaTiendas = r2(tiendas.reduce((s, t) => s + t.ventaTienda, 0));
  const totalSalido = r2(totalRecolectado + totalTarjeta);
  const totalNeto = r2(tiendas.reduce((s, t) => s + t.neto, 0));
  const excede = tiendas.filter((t) => t.estado === 'excede');
  const sumaExceso = r2(excede.reduce((s, t) => s + t.diferencia, 0));

  const hallazgos = [];
  if (r.venta <= 0) {
    hallazgos.push({ nivel: 'info', texto: 'No hay ventas de ruta en el periodo.' });
  } else {
    if (r.margenPct != null && r.margenPct <= 0) {
      hallazgos.push({
        nivel: 'alto',
        texto: `Sin rendimiento: la ruta vendió ${fmt(r.venta)} y su costo fue ${fmt(r.costo)} (ganancia ${fmt(r.ganancia)}). Se está vendiendo a costo o por debajo.`,
      });
    } else if (r.margenPct != null) {
      hallazgos.push({
        nivel: 'info',
        texto: `Ganancia bruta de ruta ${fmt(r.ganancia)} (${r.margenPct}% sobre venta) en ${fmt(r.venta - r.ventaSinCosto)} con costo capturado.`,
      });
    }
    if (rendimientoNeto != null && gastosRutaTotal > 0) {
      hallazgos.push({
        nivel: rendimientoNeto <= 0 ? 'alto' : 'medio',
        texto: rendimientoNeto <= 0
          ? `Los gastos de ruta (${fmt(gastosRutaTotal)}) se comen toda la ganancia bruta (${fmt(r.ganancia)}): rendimiento neto ${fmt(rendimientoNeto)}.`
          : `Gastos de ruta ${fmt(gastosRutaTotal)} → rendimiento neto ${fmt(rendimientoNeto)}.`,
      });
    }
    if (costeo.productosSinMargen.length) {
      const venta = r2(costeo.productosSinMargen.reduce((s, p) => s + p.venta, 0));
      hallazgos.push({
        nivel: 'alto',
        texto: `${costeo.productosSinMargen.length} producto(s) se vendieron sin margen (precio ruta ≤ costo de compra): ${fmt(venta)} de venta que no deja ganancia.`,
      });
    }
    if (r.ventaSinCosto > 0) {
      const pct = r2((r.ventaSinCosto / r.venta) * 100);
      hallazgos.push({
        nivel: pct >= 20 ? 'alto' : 'medio',
        texto: `${fmt(r.ventaSinCosto)} (${pct}%) de la venta no tiene costo de compra capturado; no entra al cálculo de ganancia. Captura el costo en Productos.`,
      });
    }
    if (r.creditoPendiente > 0) {
      hallazgos.push({
        nivel: 'medio',
        texto: `${fmt(r.creditoPendiente)} de la venta está a crédito pendiente de cobro: la ganancia existe pero todavía no es efectivo.`,
      });
    }
    if (efectivoRegistrado > 0 || r.efectivo > 0) {
      const dif = r2(efectivoRegistrado - r.efectivo);
      if (Math.abs(dif) > 1) {
        hallazgos.push({
          nivel: dif > 0 ? 'alto' : 'medio',
          texto: dif > 0
            ? `El efectivo de ruta registrado en tránsito (${fmt(efectivoRegistrado)}) es ${fmt(dif)} MAYOR que la venta en efectivo de ruta (${fmt(r.efectivo)}): se registró más de lo vendido.`
            : `El efectivo de ruta registrado en tránsito (${fmt(efectivoRegistrado)}) es ${fmt(-dif)} MENOR que la venta en efectivo de ruta (${fmt(r.efectivo)}): falta efectivo por registrar.`,
        });
      }
    }
  }

  if (totalTarjeta > 0 && totalVentaTiendas > 0) {
    hallazgos.push({
      nivel: 'info',
      texto: `Pago con tarjeta ${fmt(totalTarjeta)} (${r2((totalTarjeta / totalVentaTiendas) * 100)}% de la venta de las tiendas): es dinero electrónico que sale de la tienda y cuenta igual que una recolección.`,
    });
  }

  if (excede.length) {
    hallazgos.push({
      nivel: 'alto',
      texto: `Salida por encima del neto: en ${excede.length} tienda(s) (${excede.slice(0, 4).map((t) => t.nombre).join(', ')}${excede.length > 4 ? '…' : ''}) salió ${fmt(sumaExceso)} más (recolección en efectivo + pago con tarjeta) que lo que generaron (venta − gastos del corte). Ese excedente sale de lo que había que pagar a los demás proveedores o de su ganancia.`,
    });
  } else if (tiendas.some((t) => t.estado !== 'sin_datos')) {
    hallazgos.push({
      nivel: 'info',
      texto: `Ninguna tienda excede su neto: salió ${fmt(totalSalido)} (efectivo ${fmt(totalRecolectado)} + tarjeta ${fmt(totalTarjeta)}) vs neto generado ${fmt(totalNeto)}.`,
    });
  }

  return {
    costeo,
    tiendas,
    ruta: {
      ...r,
      efectivoRegistrado,
      efectivoEnTransito,
      efectivoLiquidado,
      gastosRuta: gastosRutaTotal,
      rendimientoNeto,
    },
    recoleccion: { total: totalRecolectado, tarjeta: totalTarjeta, salido: totalSalido, neto: totalNeto, exceso: sumaExceso, tiendasExceden: excede.length },
    hallazgos,
  };
}

async function consultarPorIds(supabase, tabla, columnas, columnaId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from(tabla).select(columnas).in(columnaId, ids.slice(i, i + 100));
    if (error) return { data: out, error: error.message };
    out.push(...(data || []));
  }
  return { data: out, error: null };
}

/** Carga ventas de ruta, catálogo, movimientos de recolección y gastos de ruta del periodo. */
export async function cargarRendimientoRuta(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };
  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const avisos = [];

  const [ventasRes, movimientos, gastosRes] = await Promise.all([
    listarVentasRutaPorRango(supabase, { desde, hasta }),
    listarMovimientosRecoleccionContabilidad(supabase, { desde, hasta, tienda: suc || undefined }).catch((e) => {
      avisos.push(`Recolecciones: ${e?.message || e}`);
      return [];
    }),
    suc ? Promise.resolve({ data: null }) : listarGastosRutaPorRango(supabase, { desde, hasta }),
  ]);
  if (ventasRes.error) avisos.push(`Ventas de ruta: ${ventasRes.error}`);
  if (gastosRes.error) avisos.push(`Gastos de ruta: ${gastosRes.error}`);

  const ventas = suc
    ? (ventasRes.data || []).filter((v) => tiendaDeVentaRuta(v).clave === suc)
    : ventasRes.data || [];

  const ids = new Set();
  for (const v of ventas) for (const a of articulosRutaVenta(v)) ids.add(a.producto_id);
  const idList = [...ids];

  const productos = new Map();
  const proveedorPorProducto = new Map();
  if (idList.length) {
    const [prodRes, provRes] = await Promise.all([
      consultarPorIds(
        supabase,
        'productos',
        'id, nombre, precio_compra_sin, precio_compra_con, impuesto, precio_ruta',
        'id',
        idList,
      ),
      consultarPorIds(supabase, 'proveedor_producto', 'producto_id, proveedores(nombre)', 'producto_id', idList),
    ]);
    if (prodRes.error) avisos.push(`Productos: ${prodRes.error}`);
    for (const p of prodRes.data) productos.set(String(p.id), p);
    if (provRes.error) avisos.push(`Proveedores: ${provRes.error}`);
    for (const row of provRes.data) {
      const nombre = row?.proveedores?.nombre;
      const id = String(row.producto_id);
      if (nombre && !proveedorPorProducto.has(id)) proveedorPorProducto.set(id, nombre);
    }
  }

  return {
    ok: true,
    ventas,
    productos,
    proveedorPorProducto,
    movimientos: movimientos || [],
    gastosRuta: gastosRes.data ? gastosRes.data.filter(gastoVigente) : null,
    avisos,
  };
}
