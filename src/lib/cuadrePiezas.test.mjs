import assert from 'node:assert/strict';
import {
  construirCuadre,
  motivoAjusteCuadre,
  parseCodigosCuadre,
  parseConteosCuadre,
  separarTicketsDuplicados,
  textoResumenCuadre,
} from './cuadrePiezas.js';

const ticketA = {
  id: 'c47af608-c1c4-4e7a-866f-4eac6dec333e',
  created_at: '2026-11-18T09:42:06.162Z',
  sucursal_id: '3B6',
  vendedor: 'Rene Salcido duran',
  total: 73,
  articulos: [
    { id: '41', nombre: 'Marlboro Rojo 100', qty: 2 },
    { id: '34', nombre: 'Double Fusion Ruby', qty: 3 },
  ],
};
const ticketB = { ...ticketA, id: '016a3de7-74db-4ded-b15b-639f96c049cf' };
const ventaRuby = {
  id: 'ea0d79ed-1111-4111-8111-111111111111',
  created_at: '2026-11-17T15:12:39.058Z',
  sucursal_id: '3B6',
  vendedor: 'Sandra Lourdes Martinez Galindo',
  total: 8,
  articulos: [{ id: '34', nombre: 'Double Fusion Ruby', qty: 1 }],
};
const movRuby = {
  producto_id: '34',
  tipo: 'retiro',
  modo: 'venta',
  cantidad: 1,
  motivo: 'Venta · Efectivo MXN · ticket ea0d79ed',
};
const ventaVista = {
  id: 'b1f4fff2-2222-4222-8222-222222222222',
  created_at: '2026-11-18T13:49:47.250Z',
  sucursal_id: '3B6',
  vendedor: 'Rene Salcido duran',
  total: 16,
  articulos: [{ id: '33', nombre: 'Malboro Vista 100', qty: 2 }],
};
const movVista = {
  producto_id: '33',
  tipo: 'retiro',
  modo: 'venta',
  cantidad: 2,
  motivo: 'Venta · Efectivo MXN · ticket b1f4fff2',
};

const { reales, copias } = separarTicketsDuplicados([ticketA, ticketB, ventaRuby]);
assert.equal(reales.length, 2);
assert.equal(copias.length, 1);

const cuadre = construirCuadre({
  ventas: [ticketA, ticketB, ventaRuby, ventaVista],
  movimientos: [movRuby, movVista],
  conteos: { 34: 16, 33: 2 },
  stocks: { 34: 19, 41: 24, 33: 5 },
  filtroIds: ['34', '41', '33'],
});

const ruby = cuadre.filas.find((f) => f.id === '34');
assert.equal(ruby.piezasConsulta, 7);
assert.equal(ruby.piezasReales, 4);
assert.equal(ruby.piezasDuplicadas, 3);
assert.equal(ruby.sinBaja, 3);
assert.match(ruby.explicacion, /3 pieza/);
assert.match(ruby.explicacion, /conteo sigue 0|igual que el conteo|queda en 16/);

const rojo = cuadre.filas.find((f) => f.id === '41');
assert.equal(rojo.sinBaja, 2);
assert.equal(rojo.piezasDuplicadas, 2);
assert.equal(rojo.piezasConsulta, 4);

const vista = cuadre.filas.find((f) => f.id === '33');
assert.equal(vista.sinBaja, 0);
assert.match(vista.explicacion, /coinciden/);
assert.match(vista.explicacion, /3 pieza/);

assert.deepEqual(parseCodigosCuadre('34, 41 33'), ['34', '41', '33']);
assert.deepEqual(parseConteosCuadre('34 16\n41,22'), { 34: 16, 41: 22 });
assert.equal(cuadre.resumen.piezasPorAjustar, 5);
assert.equal(cuadre.resumen.ticketsRepetidos, 1);
assert.equal(cuadre.resumen.todaLaVendida, false);

const ventaOk = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  created_at: '2026-11-18T18:00:00.000Z',
  sucursal_id: '3B10',
  vendedor: 'Ana',
  total: 20,
  articulos: [{ id: '99', nombre: 'Sabritas', qty: 2 }],
};
const movOk = {
  producto_id: '99',
  tipo: 'retiro',
  modo: 'venta',
  cantidad: 2,
  motivo: 'Venta · Efectivo MXN · ticket aaaaaaaa',
};
const todo = construirCuadre({
  ventas: [ventaOk, ventaVista],
  movimientos: [movOk, movVista],
  stocks: { 99: 8, 33: 5 },
});
assert.equal(todo.filas.length, 2);
assert.equal(todo.filas.find((f) => f.id === '99').piezasReales, 2);
assert.equal(todo.filas.find((f) => f.id === '99').diferencia, false);
assert.equal(todo.resumen.todaLaVendida, true);
assert.equal(todo.resumen.productosVendidos, 2);
assert.equal(todo.resumen.piezasVendidas, 4);
assert.equal(todo.resumen.conDesfase, 0);
assert.equal(todo.resumen.coinciden, 2);
assert.match(textoResumenCuadre(todo.resumen), /Toda la mercancía vendida: 2 producto/);
assert.match(textoResumenCuadre(todo.resumen), /coinciden/);

const soloConteo = construirCuadre({
  ventas: [],
  conteos: { 30: 192 },
  stocks: { 30: 166 },
  nombres: { 30: 'Smoking Gun' },
});
assert.equal(soloConteo.filas.length, 1);
assert.equal(soloConteo.filas[0].diferencia, true);
assert.match(soloConteo.filas[0].explicacion, /26 pieza/);

assert.match(motivoAjusteCuadre(rojo), /016a3de7/);
const sinCopia = construirCuadre({
  ventas: [ticketB],
  movimientos: [{
    producto_id: '41',
    tipo: 'retiro',
    modo: 'consolidacion_venta',
    cantidad: 2,
    motivo: motivoAjusteCuadre(rojo),
  }],
  stocks: { 41: 15 },
  filtroIds: ['41'],
});
const rojoOk = sinCopia.filas.find((f) => f.id === '41');
assert.equal(rojoOk.sinBaja, 0);
assert.equal(rojoOk.piezasDuplicadas, 0);
assert.equal(rojoOk.diferencia, false);

console.log('cuadrePiezas.test.mjs ok');
