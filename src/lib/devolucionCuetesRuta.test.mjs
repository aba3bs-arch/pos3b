import assert from 'node:assert/strict';
import {
  esCancelacionCuetes,
  esDevolucionCuetes,
  opcionesDevolucionCuetes,
  planDevolucionCueteAlCamion,
} from './devolucionCuetesRuta.js';

const cuentas = [
  { id: 'c1', sucursal_id: '3B6', estado: 'abierta' },
  { id: 'c2', sucursal_id: '3B7', estado: 'cerrada' },
];
const movs = [
  { cuenta_id: 'c1', tipo: 'dejar', codigo: '93', nombre: 'Escupidor', cantidad: 10, importe: 300, created_by: 'Luis García', created_at: '2026-11-01T10:00:00Z' },
  { cuenta_id: 'c1', tipo: 'retirar', codigo: '93', nombre: 'Escupidor', cantidad: 3, importe: 90, created_at: '2026-11-02T10:00:00Z' },
  { cuenta_id: 'c1', tipo: 'dejar', codigo: '85', nombre: 'Cañón', cantidad: 4, importe: 40, created_by: 'Misael', created_at: '2026-11-03T10:00:00Z' },
  { cuenta_id: 'c2', tipo: 'dejar', codigo: '93', nombre: 'Escupidor', cantidad: 8, importe: 240, created_by: 'Luis García', created_at: '2026-11-01T10:00:00Z' },
];

const ops = opcionesDevolucionCuetes(cuentas, movs);
assert.equal(ops.length, 2);
const esc = ops.find((o) => o.codigo === '93');
assert.equal(esc.cantidad, 7);
assert.equal(esc.cuentaId, 'c1');
assert.equal(esc.repartidorNombre, 'Luis García');
assert.equal(esc.folio, 'CUETES-3B6-93');
assert.equal(esDevolucionCuetes(esc.id), true);
assert.equal(ops.some((o) => o.cuentaId === 'c2'), false);

const cargas = [
  { id: 'cg-luis', vendedor_id: 'u1', vendedor_nombre: 'Luis Garcia', camion_etiqueta: 'Camión 1' },
  { id: 'cg-mis', vendedor_id: 'u2', vendedor_nombre: 'Misael', camion_etiqueta: 'Camión 2' },
];
const lineas = [
  { id: 'l1', carga_id: 'cg-luis', producto_id: '93', qty_vendida: 4 },
  { id: 'l2', carga_id: 'cg-luis', producto_id: '93', qty_vendida: 6 },
  { id: 'l3', carga_id: 'cg-mis', producto_id: '93', qty_vendida: 20 },
];

const alLuis = planDevolucionCueteAlCamion(cargas, lineas, {
  productoId: '93',
  repartidorNombre: 'Luis García',
  cantidad: 7,
});
assert.equal(alLuis.ok, true);
assert.equal(alLuis.camionNombre, 'Luis Garcia');
assert.equal(alLuis.asignaciones.every((a) => String(a.linea.carga_id) === 'cg-luis'), true);
assert.equal(alLuis.asignaciones.reduce((s, a) => s + a.qty, 0), 7);

const corto = planDevolucionCueteAlCamion(cargas, lineas, {
  productoId: '93',
  repartidorNombre: 'Luis García',
  cantidad: 15,
});
assert.equal(corto.ok, false);

const unSolo = planDevolucionCueteAlCamion(
  [cargas[1]],
  [lineas[2]],
  { productoId: '93', repartidorNombre: 'Administrador principal', cantidad: 4 },
);
assert.equal(unSolo.ok, true);
assert.equal(unSolo.camionNombre, 'Misael');

const varios = planDevolucionCueteAlCamion(cargas, lineas, {
  productoId: '93',
  repartidorNombre: 'Administrador principal',
  cantidad: 4,
});
assert.equal(varios.ok, false);
assert.match(varios.error, /varios camiones/);

const nadie = planDevolucionCueteAlCamion(cargas, lineas, {
  productoId: '99',
  repartidorNombre: 'Luis García',
  cantidad: 1,
});
assert.equal(nadie.ok, false);

assert.equal(esCancelacionCuetes({ metodo_pago: 'cuetes' }), true);
assert.equal(esCancelacionCuetes({ meta: { tipo: 'cuetes' } }), true);
assert.equal(esCancelacionCuetes({ metodo_pago: 'credito' }), false);

console.log('devolucionCuetesRuta.test.mjs ok');
