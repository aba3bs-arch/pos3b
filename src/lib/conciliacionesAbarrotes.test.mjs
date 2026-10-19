import assert from 'node:assert/strict';
import {
  esGastoSmokingCorte,
  esGastoConciliableRutaSmoking,
  esCobroConciliableTransito,
  TIPOS_COBRO_CONCILIACION,
  armarDiscrepanciasPorTienda,
} from './conciliacionesAbarrotes.js';
import { TIPO_COBRO_CREDITO } from './controlEfectivo.js';

assert.deepEqual(TIPOS_COBRO_CONCILIACION, ['Recolección', 'Venta Ruta']);

assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Recolección' }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Venta Ruta' }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Cobro Servicio' }), false);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: TIPO_COBRO_CREDITO }), false);
assert.equal(
  esCobroConciliableTransito({ tipo_movimiento: 'Recolección', foto_url: 'crédito cobrado · folio 1' }),
  false,
);

assert.equal(
  esGastoSmokingCorte({
    categoria: 'PROVEEDORES',
    subcategoria: 'SMOKING',
    comentario: 'Gasto Smoking',
  }),
  true,
);

assert.equal(
  esGastoConciliableRutaSmoking({
    categoria: 'PROVEEDORES',
    subcategoria: 'VENTA EN RUTA',
    comentario: 'COMPRA VENTA EN RUTA · VR-ABC1',
  }),
  true,
);

assert.equal(
  esGastoConciliableRutaSmoking({
    categoria: 'PROVEEDORES',
    subcategoria: 'SMOKING',
    comentario: 'COMPRA RECIBIDA',
  }),
  true,
);

assert.equal(
  esGastoConciliableRutaSmoking({
    categoria: 'PROVEEDORES',
    subcategoria: 'OTRO PROVEEDOR',
    comentario: 'sin marca',
  }),
  false,
);

const disc = armarDiscrepanciasPorTienda(
  [{ tienda: '3B2', monto: 100 }],
  [{ tienda: '3B2', monto: 100 }, { tienda: '3B3', monto: 50 }],
);
assert.equal(disc.tiendasSinRecoleccion.length, 1);
assert.equal(disc.tiendasSinRecoleccion[0].tienda, '3B3');
assert.equal(disc.porTienda.find((t) => t.tienda === '3B2').diff, 0);

console.log('conciliacionesAbarrotes.test.mjs OK');
