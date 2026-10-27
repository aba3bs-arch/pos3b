import { inicioDia, finDia } from './corteCaja.js';
import { montosPagoVentaRuta } from './corteRuta.js';
import { familiaFoliosPago } from './foliosPago.js';
import { folioVisibleCompra } from './foliosInventario.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

const n = (v) => Number(v) || 0;
const dinero = (v) => Math.round(n(v) * 100) / 100;
const suma = (rows, key) => dinero(rows.reduce((s, r) => s + n(r[key]), 0));
export function arrayRuta(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
const activa = (r) => !/cancelad|anulad/i.test(`${r.estado || ''} ${r.estatus || ''}`);
const contiene = (text, token) => !!token && String(text || '').toUpperCase().split(/[^A-Z0-9_-]+/).includes(String(token).toUpperCase());
const mismaTienda = (a, b) => normalizarCodigoTienda(a) === normalizarCodigoTienda(b);

/** Informe de evidencia; no modifica ventas, saldos ni existencias. */
export function consolidarRuta({ ventas = [], cargas = [], compras = [], movimientos = [], gastos = [], cxc = [], transitos = [], cortes = [], lineas = [] } = {}) {
  const entregas = ventas.filter((v) => activa(v) && !arrayRuta(v.articulos).some((a) => a._cancelada)).map((v) => {
    const carga = cargas.find((c) => String(c.id) === String(v.carga_id));
    const articulos = arrayRuta(v.articulos);
    const familia = familiaFoliosPago(v.folio, v.metodo_pago);
    const folios = [...new Set([v.folio, familia.operacion, familia.efectivo, familia.credito].filter(Boolean))];
    const alertas = [];
    const pagoConocido = ['efectivo', 'credito', 'mixto'].includes(v.metodo_pago)
      && (v.metodo_pago !== 'mixto' || articulos.some((a) => a._pago_mixto));
    const pago = pagoConocido ? montosPagoVentaRuta({ ...v, articulos }) : { efectivo: null, credito: null };
    if (!pagoConocido) alertas.push('Pago sin desglose verificable');
    if (pagoConocido && Math.abs(pago.efectivo + pago.credito - n(v.total)) > 0.01) alertas.push('El desglose de pago no coincide con la venta');
    const pedidos = compras.filter((c) => activa(c) && mismaTienda(c.sucursal_id || c.sucursal, v.cliente_id)
      && ((v.compra_id && String(c.id) === String(v.compra_id)) || folios.some((f) => contiene(c.notas, f))));
    const cargos = cxc.filter((c) => activa(c) && c.tipo === 'cargo'
      && ((c.venta_id && String(c.venta_id) === String(v.id)) || folios.includes(c.folio_venta)));
    const abonos = cxc.filter((c) => activa(c) && c.tipo === 'abono'
      && ((c.venta_id && String(c.venta_id) === String(v.id)) || folios.includes(c.folio_venta)));
    const pendientesCredito = cargos.filter((c) => !c.pagado_at && c.estatus !== 'pagado');
    const pagadosLegacy = cargos.filter((c) => (c.pagado_at || c.estatus === 'pagado')
      && !abonos.some((a) => String(a.cargo_id) === String(c.id) || (!a.cargo_id && a.folio_venta === c.folio_venta)));
    const creditoCobrado = dinero(suma(abonos, 'monto') + suma(pagadosLegacy, 'monto'));
    const saldoCredito = suma(pendientesCredito, 'monto');
    const creditoRegistrado = dinero(saldoCredito + creditoCobrado);
    const diferenciaCredito = pagoConocido ? dinero(creditoRegistrado - pago.credito) : null;
    if (diferenciaCredito !== null && Math.abs(diferenciaCredito) > 0.01) alertas.push('Crédito registrado distinto al vendido');
    if (cargos.length > 1) alertas.push('Revisar múltiples cargos de crédito');
    const relacionados = transitos.filter((t) => activa(t) && (folios.includes(t.num_traspaso)
      || folios.some((f) => contiene(t.foto_url, f))));
    const ts = relacionados.filter((t) => !/^CXC-/i.test(t.num_traspaso || '') && !/cr[eé]dito/i.test(t.descripcion_gasto || ''));
    const cobros = relacionados.filter((t) => !ts.includes(t));
    const efectivoRegistrado = suma(ts, 'monto');
    const liquidado = suma(ts.filter((t) => t.estatus === 'Liquidado'), 'monto');
    const pendiente = suma(ts.filter((t) => t.estatus !== 'Liquidado'), 'monto');
    const cobrosLiquidados = suma(cobros.filter((t) => t.estatus === 'Liquidado'), 'monto');
    const cobrosPendientes = suma(cobros.filter((t) => t.estatus !== 'Liquidado'), 'monto');
    if (pagoConocido && Math.abs(efectivoRegistrado - pago.efectivo) > 0.01) alertas.push('Efectivo en tránsito distinto al vendido');
    if (Math.abs(suma(cobros, 'monto') - creditoCobrado) > 0.01) alertas.push('Cobros de crédito sin efectivo en tránsito coincidente');
    if (ts.length > 1) alertas.push('Revisar múltiples registros de efectivo');
    let gasto = null;
    let diferenciaGasto = null;
    let gastoCredito = null;
    let productos = [];
    const interna = v.cliente_tipo === 'sucursal';
    if (interna) {
      if (!pedidos.length) alertas.push('Sin pedido de recepción enlazado');
      if (pedidos.length > 1) alertas.push('Múltiples pedidos enlazados');
      const recibidos = pedidos.filter((c) => ['recibida', 'recibido', 'cerrada'].includes(c.estado));
      if (pedidos.length && recibidos.length !== pedidos.length) alertas.push('Recepción pendiente');
      const foliosCompra = pedidos.map(folioVisibleCompra);
      const entradas = movimientos.filter((m) => m.tipo === 'entrada' && mismaTienda(m.sucursal_id, v.cliente_id)
        && (pedidos.some((c) => String(c.id) === String(m.meta?.compra_id))
          || [...foliosCompra, ...folios].includes(m.meta?.folio)));
      const gs = gastos.filter((g) => /PROVEEDOR/i.test(g.categoria || '') && mismaTienda(g.sucursal_id, v.cliente_id)
        && [...folios, ...foliosCompra, ...pedidos.map((c) => c.id)].some((f) => contiene(g.comentario, f)));
      const gastosCobro = gastos.filter((g) => /CREDITO|CRÉDITO/i.test(g.categoria || '') && mismaTienda(g.sucursal_id, v.cliente_id)
        && (abonos.some((a) => a.gasto_id && String(a.gasto_id) === String(g.id))
          || folios.some((f) => contiene(g.comentario, f))));
      gastoCredito = suma(gastosCobro, 'monto');
      if (Math.abs(gastoCredito - creditoCobrado) > 0.01) alertas.push('Gasto por cobro de crédito distinto al crédito cobrado');
      gasto = suma(gs, 'monto');
      diferenciaGasto = pagoConocido ? dinero(gasto - pago.efectivo) : null;
      if (diferenciaGasto !== null && Math.abs(diferenciaGasto) > 0.01) alertas.push('Gasto de tienda distinto al efectivo de la venta');
      if (gs.length > 1) alertas.push('Revisar múltiples gastos enlazados');
      // Solo los movimientos reales prueban el ingreso; el pedido por sí solo no lo acredita.
      const porProducto = new Map();
      for (const a of articulos.filter((a) => a.producto_id || a.productoId)) {
        const id = String(a.producto_id || a.productoId);
        const p = porProducto.get(id) || { id, nombre: a.nombre || id, vendido: 0, recibido: 0 };
        p.vendido += n(a.cantidad);
        porProducto.set(id, p);
      }
      for (const m of entradas) {
        const id = String(m.producto_id);
        const p = porProducto.get(id) || { id, nombre: m.producto_nombre || id, vendido: 0, recibido: 0 };
        p.recibido += n(m.cantidad);
        porProducto.set(id, p);
      }
      productos = [...porProducto.values()].map((p) => ({ ...p, diferencia: Math.round((p.recibido - p.vendido) * 1000) / 1000 }));
      if (!entradas.length) alertas.push('Sin ingreso de inventario comprobado');
      if (productos.some((p) => Math.abs(p.diferencia) > 0.001)) alertas.push('Mercancía vendida distinta a la ingresada');
    }
    return { id: v.id, folio: v.folio, fecha: v.created_at, cargaId: v.carga_id,
      repartidorId: String(carga?.vendedor_id || `nombre:${v.vendedor_nombre || 'sin-asignar'}`),
      cargaIds: [...new Set([v.carga_id, ...articulos.flatMap((a) => (a._lineas_camion || []).map((l) => l.cargaId))].filter(Boolean).map(String))],
      repartidor: carga?.vendedor_nombre || v.vendedor_nombre || 'Sin repartidor',
      tienda: v.cliente_nombre || v.cliente_id, interna, total: dinero(v.total),
      efectivo: pago.efectivo, credito: pago.credito, creditoRegistrado, diferenciaCredito,
      efectivoRegistrado, liquidado, pendiente, gastoCredito, creditoCobrado, saldoCredito, cobrosLiquidados, cobrosPendientes, gasto, diferenciaGasto, productos, alertas };
  });
  const grupos = new Map();
  for (const e of entregas) {
    if (!grupos.has(e.repartidorId)) grupos.set(e.repartidorId, { id: e.repartidorId, nombre: e.repartidor, entregas: [] });
    grupos.get(e.repartidorId).entregas.push(e);
  }
  const repartidores = [...grupos.values()].map((g) => {
    const ids = new Set(g.entregas.flatMap((e) => e.cargaIds));
    const arqueos = [...ids].map((id) => cortes.filter((c) => String(c.carga_id) === id)
      .sort((a, b) => String(b.created_at || b.fecha).localeCompare(String(a.created_at || a.fecha)))[0]).filter(Boolean);
    return { ...g, total: suma(g.entregas, 'total'), efectivo: suma(g.entregas, 'efectivo'), credito: suma(g.entregas, 'credito'),
      liquidado: suma(g.entregas, 'liquidado'), pendiente: suma(g.entregas, 'pendiente'),
      creditoCobrado: suma(g.entregas, 'creditoCobrado'), saldoCredito: suma(g.entregas, 'saldoCredito'),
      cobrosLiquidados: suma(g.entregas, 'cobrosLiquidados'), cobrosPendientes: suma(g.entregas, 'cobrosPendientes'),
      incidencias: g.entregas.filter((e) => e.alertas.length).length,
      arqueos: arqueos.map((c) => ({ ...c, diferenciaCalculada: c.efectivo_contado == null || c.efectivo_esperado == null ? null : dinero(n(c.efectivo_contado) - n(c.efectivo_esperado)) })),
      stock: lineas.filter((l) => ids.has(String(l.carga_id))).map((l) => ({ ...l,
        saldo: Math.round((n(l.qty_cargada) - n(l.qty_vendida) - n(l.qty_devuelta)) * 1000) / 1000 })),
    };
  });
  return { entregas, repartidores };
}

async function paginas(factory) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const r = await factory().range(start, start + 499);
    if (r.error) throw new Error(r.error.message || 'No se pudieron consultar los registros.');
    rows.push(...(r.data || []));
    if ((r.data || []).length < 500) return rows;
  }
}
async function porIds(db, table, field, ids, select = '*') {
  const values = [...new Set(ids.filter(Boolean).map(String))];
  const rows = [];
  for (let i = 0; i < values.length; i += 100) {
    rows.push(...await paginas(() => db.from(table).select(select).in(field, values.slice(i, i + 100)).order('id')));
  }
  return rows;
}
export async function cargarConsolidacionRuta(db, { desde, hasta }) {
  if (!db) throw new Error('Se necesita conexión para consolidar la ruta.');
  if (!desde || !hasta || desde > hasta) throw new Error('Indica un rango de fechas válido.');
  const ventas = await paginas(() => db.from('ruta_ventas').select('*')
    .gte('created_at', inicioDia(desde).toISOString()).lte('created_at', finDia(hasta).toISOString()).order('id'));
  if (!ventas.length) return consolidarRuta();
  const cargaIds = ventas.flatMap((v) => [v.carga_id, ...arrayRuta(v.articulos).flatMap((a) => (a._lineas_camion || []).map((l) => l.cargaId))]);
  // Los comprobantes ligados pueden ser posteriores al periodo de la venta.
  const [cargas, compras, movimientos, gastos, cxc, transitos, cortes, lineas] = await Promise.all([
    porIds(db, 'ruta_cargas', 'id', cargaIds),
    paginas(() => db.from('compras').select('id,sucursal_id,sucursal,estado,items,total,notas,created_at').ilike('notas', '%Venta en ruta%').order('id')),
    paginas(() => db.from('movimientos_inventario').select('id,tipo,producto_id,producto_nombre,cantidad,sucursal_id,meta').eq('tipo', 'entrada').gte('created_at', inicioDia(desde).toISOString()).order('id')),
    paginas(() => db.from('cortes_contabilidad_gastos').select('id,sucursal_id,categoria,comentario,monto').eq('modulo', 'abarrotes').gte('created_at', inicioDia(desde).toISOString()).order('id')),
    porIds(db, 'ruta_cxc_movimientos', 'venta_id', ventas.map((v) => v.id)),
    paginas(() => db.from('transito_efectivo').select('id,num_traspaso,monto,estatus,tipo_movimiento,foto_url,descripcion_gasto').in('tipo_movimiento', ['Venta Ruta', 'Cobro Crédito']).gte('fecha_hora', inicioDia(desde).toISOString()).order('id')),
    porIds(db, 'ruta_cortes_caja', 'carga_id', cargaIds),
    porIds(db, 'ruta_carga_lineas', 'carga_id', cargaIds),
  ]);
  const folios = ventas.flatMap((v) => { const f = familiaFoliosPago(v.folio, v.metodo_pago); return [v.folio, f.operacion, f.efectivo, f.credito]; });
  const [cxcPorFolio, comprasPorId] = await Promise.all([
    porIds(db, 'ruta_cxc_movimientos', 'folio_venta', folios),
    porIds(db, 'compras', 'id', ventas.map((v) => v.compra_id), 'id,sucursal_id,sucursal,estado,items,total,notas,created_at'),
  ]);
  const unir = (a, b) => [...new Map([...a, ...b].map((r) => [String(r.id), r])).values()];
  return consolidarRuta({ ventas, cargas, compras: unir(compras, comprasPorId), movimientos, gastos,
    cxc: unir(cxc, cxcPorFolio), transitos, cortes, lineas });
}
