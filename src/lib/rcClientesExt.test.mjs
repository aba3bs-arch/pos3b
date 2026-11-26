import assert from 'node:assert/strict';
import { armarRegistroClientesExt } from './rcClientesExt.js';

const pepe = {
  id: 'v1',
  folio: 'EXT-1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  metodo_pago: 'credito',
  total: 1000,
  estado_credito: 'pendiente',
  created_at: '2026-11-18T20:00:00Z',
  articulos: [{ producto_id: '93', nombre: 'Cuete', cantidad: 40, precio: 25, importe: 1000 }],
};
const luis = {
  id: 'v2',
  folio: 'EXT-2',
  cliente_tipo: 'externo',
  cliente_id: 'cli-2',
  cliente_nombre: 'Luis',
  metodo_pago: 'mixto',
  total: 500,
  estado_credito: 'pagado',
  created_at: '2026-11-19T20:00:00Z',
  articulos: [
    { producto_id: '93', importe: 500 },
    { _pago_mixto: true, efectivo: 200, credito: 300 },
  ],
};
const tienda = {
  id: 'v3',
  folio: '3B-1',
  cliente_tipo: 'sucursal',
  cliente_id: '3B5',
  cliente_nombre: '3B5',
  metodo_pago: 'credito',
  total: 800,
  estado_credito: 'pendiente',
  articulos: [{ producto_id: '93', importe: 800 }],
};

const reg = armarRegistroClientesExt([pepe, luis, tienda], [
  { id: 'a1', tipo: 'abono', venta_id: 'v1', cliente_tipo: 'externo', cliente_id: 'cli-1', cliente_nombre: 'Don Pepe', monto: 400, created_at: '2026-11-20T18:00:00Z', notas: 'Abono atrasado' },
]);

assert.equal(reg.clientes.length, 2);
assert.equal(reg.clientes[0].nombre, 'Don Pepe');
assert.equal(reg.clientes[0].credito, 1000);
assert.equal(reg.clientes[0].cobrado, 400);
assert.equal(reg.clientes[0].pendiente, 600);
assert.equal(reg.clientes[0].tickets[0].cobros[0].nota, 'Abono atrasado');
assert.equal(reg.clientes[1].nombre, 'Luis');
assert.equal(reg.clientes[1].efectivo, 200);
assert.equal(reg.clientes[1].credito, 300);
assert.equal(reg.clientes[1].cobrado, 300);
assert.equal(reg.clientes[1].pendiente, 0);
assert.equal(reg.clientes[1].tickets[0].cobros[0].nota, 'Crédito cobrado');
assert.equal(reg.totales.credito, 1300);
assert.equal(reg.totales.cobrado, 700);
assert.equal(reg.totales.pendiente, 600);
assert.equal(reg.totales.efectivo, 200);

console.log('rcClientesExt.test.mjs ok');
