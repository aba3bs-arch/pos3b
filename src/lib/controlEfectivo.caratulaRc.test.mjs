import assert from 'node:assert/strict';
import { agruparCaratulaRcPorRepartidor, bucketCaratulaRc } from './controlEfectivo.js';

assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Venta Ruta' }), 'venta');
assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Recolección' }), 'venta');
assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Cobro Crédito' }), 'creditos');
assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Entrega Crédito' }), 'creditos');
assert.equal(
  bucketCaratulaRc({ tipo_movimiento: 'Recolección', foto_url: 'Crédito cobrado. Desglose: 843: $810.00' }),
  'creditos',
);
assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Cobro Servicio' }), 'servicios');
assert.equal(bucketCaratulaRc({ tipo_movimiento: 'Gasto' }), null);

const caratula = agruparCaratulaRcPorRepartidor(
  [
    { id: 'rep_b', nombre: 'test user' },
    { id: 'rep_a', nombre: 'Luis Enrique Mada Osuna' },
  ],
  [
    { repartidor_id: 'rep_a', tipo_movimiento: 'Venta Ruta', monto: 20000 },
    { repartidor_id: 'rep_a', tipo_movimiento: 'Recolección', monto: 3000 },
    { repartidor_id: 'rep_a', tipo_movimiento: 'Cobro Crédito', monto: 5000 },
    { repartidor_id: 'rep_a', tipo_movimiento: 'Cobro Servicio', monto: 2000 },
    { repartidor_id: 'rep_a', tipo_movimiento: 'Gasto', monto: 900 },
  ],
);

assert.equal(caratula[0].nombre, 'Luis Enrique Mada Osuna');
assert.equal(caratula[0].total, 30000);
assert.equal(caratula[0].count, 4);
assert.equal(caratula[0].venta.total, 23000);
assert.equal(caratula[0].venta.count, 2);
assert.equal(caratula[0].creditos.total, 5000);
assert.equal(caratula[0].creditos.count, 1);
assert.equal(caratula[0].servicios.total, 2000);
assert.equal(caratula[0].servicios.count, 1);
assert.equal(caratula[1].nombre, 'test user');
assert.equal(caratula[1].total, 0);
assert.equal(caratula[1].count, 0);
assert.equal(caratula[1].venta.count, 0);

console.log('controlEfectivo.caratulaRc.test.mjs OK');
