import assert from 'node:assert/strict';
import { armarTableroCreditos } from './tableroCreditosPorCobrar.js';

const cargos = [
  {
    id: 'c1', tipo: 'cargo', estatus: 'pendiente', cliente_tipo: 'sucursal', cliente_id: '3B10',
    monto: 800, folio_venta: 'VR-1', created_at: '2026-11-10T18:00:00.000Z',
  },
  {
    id: 'c2', tipo: 'cargo', estatus: 'pendiente', cliente_tipo: 'sucursal', cliente_id: '3b2',
    monto: 500, folio_venta: 'VR-2', created_at: '2026-11-12T18:00:00.000Z',
  },
  {
    id: 'c3', tipo: 'cargo', estatus: 'pagado', pagado_at: '2026-11-01T18:00:00.000Z',
    cliente_tipo: 'sucursal', cliente_id: '3B10', monto: 100, folio_venta: 'VR-old',
  },
  {
    id: 'c4', tipo: 'abono', cliente_tipo: 'sucursal', cliente_id: '3B5', monto: 50,
  },
];
const abonos = [
  {
    id: 'a1', tipo: 'abono', cargo_id: 'c1', monto: 200, cliente_tipo: 'sucursal',
    cliente_id: '3B10', folio_venta: 'VR-1', created_at: '2026-11-11T18:00:00.000Z',
  },
  {
    id: 'a2', tipo: 'abono', cargo_id: 'c3', monto: 100, cliente_tipo: 'sucursal',
    cliente_id: '3B10', created_at: '2026-11-01T18:00:00.000Z',
  },
];

const t = armarTableroCreditos(cargos, abonos);

assert.equal(t.tiendas.length, 2);
assert.equal(t.tiendas[0].id, '3B10');
assert.equal(t.tiendas[0].nombre, 'El Mezquite');
assert.equal(t.tiendas[0].credito, 1000);
assert.equal(t.tiendas[0].abono, 200);
assert.equal(t.tiendas[0].actualizado, 800);
assert.equal(t.tiendas[0].folios.length, 1);
assert.equal(t.tiendas[0].folios[0].importe, 800);
assert.equal(t.tiendas[0].folios[0].estado, 'Pendiente');
assert.equal(t.tiendas[0].historial.length, 2);
assert.equal(t.tiendas[1].id, '3B2');
assert.equal(t.tiendas[1].nombre, 'Pueblo Nuevo');
assert.equal(t.tiendas[1].abono, 0);
assert.equal(t.tiendas[1].credito, 500);
assert.equal(t.totales.folios, 2);
assert.equal(t.totales.credito, 1500);
assert.equal(t.totales.abono, 200);
assert.equal(t.totales.actualizado, 1300);

const vacio = armarTableroCreditos([], []);
assert.deepEqual(vacio.totales, { folios: 0, credito: 0, abono: 0, actualizado: 0 });

console.log('tableroCreditosPorCobrar ok');
