import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidarRuta, cargarConsolidacionRuta } from './consolidacionRuta.js';
const venta = { id: 'v1', carga_id: 'c1', folio: 'VR-123-M', cliente_tipo: 'sucursal', cliente_id: 'BRISAS', cliente_nombre: 'Brisas', metodo_pago: 'mixto', total: 100, articulos: [{ producto_id: 'p1', nombre: 'Arroz', cantidad: 5 }, { _pago_mixto: true, efectivo: 40, credito: 60 }], vendedor_nombre: 'Luis', compra_id: 'pedido1' };
const base = () => ({ ventas: [venta], cargas: [{ id: 'c1', vendedor_id: 'u1', vendedor_nombre: 'Luis' }], compras: [{ id: 'pedido1', sucursal_id: 'BRISAS', estado: 'recibida' }], movimientos: [{ id: 'm1', tipo: 'entrada', sucursal_id: 'BRISAS', producto_id: 'p1', cantidad: 5, meta: { compra_id: 'pedido1' } }], gastos: [{ id: 'g1', categoria: 'PROVEEDORES', sucursal_id: 'BRISAS', comentario: 'Venta VR-123-ME', monto: 40 }], cxc: [{ id: 'cargo1', venta_id: 'v1', tipo: 'cargo', monto: 60, estatus: 'pendiente' }], transitos: [{ id: 't1', num_traspaso: 'VR-123-ME', monto: 40, tipo_movimiento: 'Venta Ruta', estatus: 'En Tránsito' }] });
test('mixto: ingreso completo, gasto de efectivo y crédito cuadran sin exigir gasto del crédito', () => {
  const { entregas: [e], repartidores: [g] } = consolidarRuta(base());
  assert.deepEqual(e.alertas, []); assert.equal(e.gasto, 40); assert.equal(e.saldoCredito, 60); assert.equal(g.pendiente, 40);
});
test('abono parcial: cargo residual más abonos reconstruyen el crédito original', () => {
  const data = base(); data.cxc[0].monto = 40;
  data.cxc.push({ id: 'ab1', cargo_id: 'cargo1', venta_id: 'v1', tipo: 'abono', monto: 20, gasto_id: 'g2', estatus: 'pagado' });
  data.gastos.push({ id: 'g2', categoria: 'CREDITO RUTA', sucursal_id: 'BRISAS', comentario: 'VR-123-MC', monto: 20 });
  data.transitos.push({ id: 't2', num_traspaso: 'CXC-aleatorio', foto_url: 'credito parcial · VR-123-MC', descripcion_gasto: 'Crédito ruta cobrado', monto: 20, tipo_movimiento: 'Venta Ruta', estatus: 'Liquidado' });
  const { entregas: [e] } = consolidarRuta(data);
  assert.deepEqual(e.alertas, []); assert.equal(e.creditoRegistrado, 60); assert.equal(e.creditoCobrado, 20); assert.equal(e.saldoCredito, 40); assert.equal(e.cobrosLiquidados, 20); assert.equal(e.efectivoRegistrado, 40);
});
test('pago completo no duplica cargo pagado y su abono', () => {
  const data = base(); data.cxc[0].estatus = 'pagado';
  data.cxc.push({ id: 'ab1', cargo_id: 'cargo1', venta_id: 'v1', tipo: 'abono', monto: 60 });
  const e = consolidarRuta(data).entregas[0]; assert.equal(e.creditoRegistrado, 60); assert.equal(e.saldoCredito, 0);
});
test('faltantes y sobrantes por producto no se compensan entre sí', () => {
  const data = base(); data.movimientos[0].cantidad = 3;
  data.movimientos.push({ tipo: 'entrada', sucursal_id: 'BRISAS', producto_id: 'p2', cantidad: 2, meta: { compra_id: 'pedido1' } });
  const e = consolidarRuta(data).entregas[0]; assert.equal(e.productos[0].diferencia, -2); assert.equal(e.productos[1].diferencia, 2); assert.ok(e.alertas.includes('Mercancía vendida distinta a la ingresada'));
});
test('pedido recibido sin movimientos no acredita ingreso', () => {
  const data = base(); data.movimientos = [];
  assert.ok(consolidarRuta(data).entregas[0].alertas.includes('Sin ingreso de inventario comprobado'));
});
test('folios parecidos y gastos de otra tienda no se enlazan', () => {
  const data = base(); data.gastos[0].comentario = 'VR-123-ME-OTRO';
  data.gastos.push({ ...data.gastos[0], id: 'otro', sucursal_id: 'OTRA', comentario: 'VR-123-ME' });
  assert.equal(consolidarRuta(data).entregas[0].gasto, 0);
});
test('ventas canceladas y metadatos de cancelación quedan fuera', () => {
  const data = base(); data.ventas = [{ ...venta, estado: 'cancelada' }, { ...venta, id: 'v2', articulos: [{ _cancelada: true }] }];
  assert.equal(consolidarRuta(data).entregas.length, 0);
});
test('mixto sin metadatos queda pendiente de verificar y no se asume efectivo', () => {
  const data = base(); data.ventas = [{ ...venta, articulos: [] }];
  const e = consolidarRuta(data).entregas[0]; assert.equal(e.efectivo, null); assert.equal(e.diferenciaCredito, null); assert.ok(e.alertas.includes('Pago sin desglose verificable'));
});
test('último arqueo por carga evita sumar cortes acumulativos', () => {
  const data = base(); data.cortes = [{ id: '1', carga_id: 'c1', created_at: '2026-10-01', efectivo_contado: 20, efectivo_esperado: 40 }, { id: '2', carga_id: 'c1', created_at: '2026-10-02', efectivo_contado: 35, efectivo_esperado: 40 }];
  const g = consolidarRuta(data).repartidores[0]; assert.equal(g.arqueos.length, 1); assert.equal(g.arqueos[0].diferenciaCalculada, -5);
});
test('stock incluye cargas secundarias y detecta saldo negativo', () => {
  const data = base(); data.ventas = [{ ...venta, articulos: [...venta.articulos, { _lineas_camion: [{ cargaId: 'c2' }] }] }];
  data.lineas = [{ id: 'l2', carga_id: 'c2', qty_cargada: 5, qty_vendida: 4, qty_devuelta: 2 }];
  assert.equal(consolidarRuta(data).repartidores[0].stock[0].saldo, -1);
});
test('sin conexión y rango inválido producen error y no un informe cuadrado vacío', async () => {
  await assert.rejects(cargarConsolidacionRuta(null, { desde: '2026-01-01', hasta: '2026-01-02' }), /conexión/);
  await assert.rejects(cargarConsolidacionRuta({}, { desde: '2026-02-01', hasta: '2026-01-01' }), /rango/);
});
function fakeDb(tables, errors = {}) {
  const calls = [];
  return { calls, from(table) {
    let filters = [];
    const q = {
      select() { return q; }, order() { return q; },
      eq(field, value) { filters.push((r) => r[field] === value); return q; },
      in(field, values) { filters.push((r) => values.map(String).includes(String(r[field]))); return q; },
      gte(field, value) { calls.push({ table, op: 'gte', field, value }); filters.push((r) => r[field] == null || r[field] >= value); return q; },
      lte(field, value) { calls.push({ table, op: 'lte', field, value }); filters.push((r) => r[field] == null || r[field] <= value); return q; },
      ilike() { return q; },
      async range(start, end) { calls.push({ table, start, end }); return errors[table] ? { error: { message: errors[table] } } : { data: (tables[table] || []).filter((r) => filters.every((f) => f(r))).slice(start, end + 1) }; },
    }; return q;
  } };
}
test('consulta pagina ventas y recupera comprobantes posteriores al periodo', async () => {
  const db = fakeDb({ ruta_ventas: Array.from({ length: 501 }, (_, i) => ({ ...venta, id: `v${i}` })),
    compras: [{ id: 'pedido1', sucursal_id: 'BRISAS', estado: 'recibida', created_at: '2026-11-03T12:00:00Z' }],
    movimientos_inventario: [{ tipo: 'entrada', sucursal_id: 'BRISAS', producto_id: 'p1', cantidad: 5, meta: { compra_id: 'pedido1' }, created_at: '2026-11-03T12:00:00Z' }] });
  const r = await cargarConsolidacionRuta(db, { desde: '2026-10-01', hasta: '2026-10-01' });
  assert.equal(r.entregas.length, 501);
  assert.ok(db.calls.some((c) => c.table === 'ruta_ventas' && c.start === 500));
  assert.equal(r.entregas[0].productos[0].recibido, 5);
  assert.ok(!db.calls.some((c) => c.table === 'movimientos_inventario' && c.op === 'lte'));
});
test('una fuente fallida invalida el informe completo', async () => {
  const db = fakeDb({ ruta_ventas: [venta] }, { ruta_cxc_movimientos: 'Fuente no disponible' });
  await assert.rejects(cargarConsolidacionRuta(db, { desde: '2026-10-01', hasta: '2026-10-01' }), /Fuente no disponible/);
});
