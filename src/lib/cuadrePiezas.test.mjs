import assert from 'node:assert/strict';
import {
  construirCuadre,
  parseCodigosCuadre,
  parseConteosCuadre,
  separarTicketsDuplicados,
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

console.log('cuadrePiezas.test.mjs ok');
