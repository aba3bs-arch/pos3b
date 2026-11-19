import assert from 'node:assert/strict';
import { agruparCreditoPorTienda, aplicarAbonosFinAnio, armarLiquidacionCuetes, cobrosCueteDeVenta } from './liquidacionCuetes.js';

const ids = new Set(['93', '85']);

const credito = {
  id: 'v1',
  folio: 'VR-1-C',
  cliente_tipo: 'sucursal',
  cliente_id: '3B3',
  cliente_nombre: '3B3',
  metodo_pago: 'credito',
  total: 1000,
  estado_credito: 'pendiente',
  created_at: '2026-11-18T20:00:00Z',
  articulos: [
    { producto_id: '93', nombre: 'Escupidor', cantidad: 40, precio: 25, importe: 1000 },
  ],
};
const contado = {
  id: 'v2',
  folio: 'VR-2-E',
  cliente_tipo: 'sucursal',
  cliente_id: '3B5',
  metodo_pago: 'efectivo',
  total: 200,
  created_at: '2026-11-18T21:00:00Z',
  articulos: [
    { producto_id: '85', importe: 100 },
    { producto_id: '100', importe: 100 },
  ],
};

const abierto = armarLiquidacionCuetes([credito, contado], ids, [
  { id: 'a1', venta_id: 'v1', folio_venta: 'VR-1-C', monto: 480, created_at: '2026-11-18T22:00:00Z' },
], []);
assert.equal(abierto.pendiente, 520);
assert.equal(abierto.abonado, 580);
assert.equal(abierto.totalAntes, 1100);
const b3 = abierto.partes.find((p) => p.sucursal_id === '3B3');
assert.equal(b3.monto, 480);
assert.equal(b3.abonos[0].ref, 'abono:a1');

const cerrado = armarLiquidacionCuetes([credito, contado], ids, [
  { id: 'a1', venta_id: 'v1', monto: 480 },
], [{
  estado: 'cerrada',
  detalle: abierto.partes,
}]);
assert.equal(cerrado.pendiente, 520);
assert.equal(cerrado.abonado, 0);
assert.equal(cerrado.totalAntes, 520);

assert.equal(cobrosCueteDeVenta({ ...credito, estado: 'cancelada' }, ids, []), null);
assert.equal(cobrosCueteDeVenta({
  id: 'v3',
  metodo_pago: 'efectivo',
  total: 50,
  articulos: [{ producto_id: '1', importe: 50 }],
}, ids, []), null);

const tiendas = agruparCreditoPorTienda([credito, contado], ids, [
  { id: 'a1', venta_id: 'v1', monto: 480 },
]);
assert.equal(tiendas.length, 1);
assert.equal(tiendas[0].sucursal_id, '3B3');
assert.equal(tiendas[0].credito, 1000);
assert.equal(tiendas[0].pendiente, 520);
assert.equal(tiendas[0].abonado, 480);
assert.equal(tiendas[0].tickets[0].folio, 'VR-1-C');
assert.equal(tiendas[0].tickets[0].lineas[0].nombre, 'Escupidor');
assert.equal(tiendas[0].tickets[0].lineas.length, 1);

const conAbono = aplicarAbonosFinAnio(
  agruparCreditoPorTienda([credito], ids, []),
  [{ id: 'fa1', cuenta_id: 'c3', monto: 480, created_at: '2026-11-18T22:00:00Z' }],
  [{ id: 'c3', sucursal_id: '3B3' }],
);
assert.equal(conAbono[0].pendiente, 520);
assert.equal(conAbono[0].abonado, 480);
assert.equal(conAbono[0].tickets[0].pendiente, 520);

const liqAbono = armarLiquidacionCuetes([credito], ids, [], [], [
  { id: 'fa1', sucursal_id: '3B3', monto: 480, created_at: '2026-11-18T22:00:00Z' },
], []);
assert.equal(liqAbono.pendiente, 520);
assert.equal(liqAbono.abonado, 480);
assert.equal(liqAbono.partes[0].abonos[0].ref, 'finanio:fa1');

console.log('liquidacionCuetes.test.mjs ok');
