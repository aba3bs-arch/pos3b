import assert from 'node:assert/strict';
import { agruparInventarioCamion, planDevolucionCamion } from './creditoFinAnioCamion.js';
import { asignarVentaALineasProducto } from './ventaEnRuta.js';

const cargas = [
  { id: 'cg1', vendedor_id: 'rep_luis', vendedor_nombre: 'Luis', camion_etiqueta: 'Camión 1' },
];
const lineas = [
  { id: 'l1', carga_id: 'cg1', producto_id: '93', producto_nombre: 'Escupidor', qty_cargada: 20, qty_vendida: 5, qty_devuelta: 0 },
  { id: 'l2', carga_id: 'cg1', producto_id: '85', producto_nombre: 'Cañón', qty_cargada: 10, qty_vendida: 10, qty_devuelta: 0 },
];

const grupos = agruparInventarioCamion(cargas, lineas);
assert.equal(grupos.length, 1);
assert.equal(grupos[0].nombre, 'Luis');
assert.equal(grupos[0].piezas, 15);
assert.equal(grupos[0].productos.find((p) => p.id === '93').disponible, 15);
assert.equal(grupos[0].productos.find((p) => p.id === '85'), undefined);

const venta = asignarVentaALineasProducto(
  [{ id: 'l1', producto_id: '93', qty_cargada: 20, qty_vendida: 5, qty_devuelta: 0 }],
  4,
);
assert.equal(venta.ok, true);
assert.equal(venta.asignaciones[0].qty, 4);

const corto = asignarVentaALineasProducto(
  [{ id: 'l1', producto_id: '93', qty_cargada: 20, qty_vendida: 5, qty_devuelta: 0 }],
  40,
);
assert.equal(corto.ok, false);

const dev = planDevolucionCamion(
  [
    { id: 'a', producto_id: '93', qty_vendida: 2 },
    { id: 'b', producto_id: '93', qty_vendida: 6 },
  ],
  '93',
  5,
);
assert.equal(dev.asignaciones.length, 1);
assert.equal(dev.asignaciones[0].linea.id, 'b');
assert.equal(dev.asignaciones[0].nueva, 1);
assert.equal(dev.pendiente, 0);

console.log('creditoFinAnioCamion.test.mjs ok');
