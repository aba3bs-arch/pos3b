import assert from 'node:assert/strict';
import {
  esGastoSmokingCorte,
  esGastoConciliableRutaSmoking,
  esCobroConciliableTransito,
  etiquetaCobroConciliacion,
  grupoCobroConciliacion,
  TIPOS_COBRO_CONCILIACION,
  armarDiscrepanciasPorTienda,
} from './conciliacionesAbarrotes.js';
import { TIPO_COBRO_CREDITO } from './controlEfectivo.js';

assert.ok(TIPOS_COBRO_CONCILIACION.includes('Recolección'));
assert.ok(TIPOS_COBRO_CONCILIACION.includes('Venta Ruta'));
assert.ok(TIPOS_COBRO_CONCILIACION.includes(TIPO_COBRO_CREDITO));
assert.ok(TIPOS_COBRO_CONCILIACION.includes('Entrega Crédito'));

assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Recolección' }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Venta Ruta' }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: TIPO_COBRO_CREDITO }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Entrega Crédito' }), true);
assert.equal(esCobroConciliableTransito({ tipo_movimiento: 'Cobro Servicio' }), false);
assert.equal(
  esCobroConciliableTransito({ tipo_movimiento: 'Recolección', foto_url: 'crédito cobrado · folio 1' }),
  true,
);

assert.equal(etiquetaCobroConciliacion({ tipo_movimiento: 'Venta Ruta' }), 'Venta en ruta (efectivo)');
assert.equal(etiquetaCobroConciliacion({ tipo_movimiento: TIPO_COBRO_CREDITO }), 'Crédito cobrado');
assert.equal(etiquetaCobroConciliacion({ tipo_movimiento: 'Entrega Crédito' }), 'Crédito por cobrar (entrega)');
assert.equal(etiquetaCobroConciliacion({ grupo: 'credito_pendiente' }), 'Crédito por pagar');

assert.equal(grupoCobroConciliacion({ tipo_movimiento: 'Venta Ruta' }), 'venta_ruta');
assert.equal(grupoCobroConciliacion({ tipo_movimiento: TIPO_COBRO_CREDITO }), 'credito_cobrado');
assert.equal(grupoCobroConciliacion({ tipo_movimiento: 'Entrega Crédito' }), 'credito_entrega');

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

// Efectivo + crédito pendiente deben cubrir el gasto de recepción.
const disc = armarDiscrepanciasPorTienda(
  [
    { tienda: '3B6', monto: 500, grupo: 'venta_ruta' },
    { tienda: '3B6', monto: 364, grupo: 'credito_pendiente' },
  ],
  [{ tienda: '3B6', monto: 864 }],
);
const fila = disc.porTienda.find((t) => t.tienda === '3B6');
assert.ok(fila);
assert.equal(fila.diff, 0);
assert.equal(fila.sinRecoleccion, false);

const discFalta = armarDiscrepanciasPorTienda(
  [],
  [{ tienda: '3B6', monto: 864 }],
);
assert.equal(discFalta.tiendasSinRecoleccion.length, 1);
assert.equal(discFalta.tiendasSinRecoleccion[0].tienda, '3B6');

console.log('conciliacionesAbarrotes.test.mjs OK');
