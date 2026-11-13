import assert from 'node:assert/strict';
import {
  esVentaAjusteRecarga, fmtHoraNogales, resumenRecargasConsulta, ticketsDeArticulo,
} from './consultasRecargas.js';

const turnos = [
  { id: 'diurno', nombre: 'Diurno', hora_inicio: '07:00', hora_fin: '19:00' },
  { id: 'nocturno', nombre: 'Nocturno', hora_inicio: '19:00', hora_fin: '07:00' },
];
const turnosDe = () => turnos;
const art = (id, nombre, precio, qty = 1) => [{ id, nombre, precio, qty }];

// 12:00 Nogales = 19:00Z ; 20:00 Nogales = 03:00Z (día siguiente)
const ventas = [
  { id: 'v1', sucursal_id: '3B5', vendedor: 'Ana', created_at: '2026-11-13T19:00:00Z', turno_id: 'diurno', turno_nombre: 'Diurno', total: 50, metodo_pago: 'Efectivo', articulos: art('rec50', 'Recarga 50', 50) },
  { id: 'v2', sucursal_id: '3B5', vendedor: 'Ana', created_at: '2026-11-13T19:00:40Z', turno_id: 'diurno', turno_nombre: 'Diurno', total: 50, metodo_pago: 'Efectivo', articulos: art('rec50', 'Recarga 50', 50) },
  { id: 'v3', sucursal_id: '3B5', vendedor: 'Ana', created_at: '2026-11-13T19:30:00Z', turno_id: 'diurno', turno_nombre: 'Diurno', total: 50, metodo_pago: 'Efectivo', articulos: art('rec50', 'Recarga 50', 50) },
  { id: 'v4', sucursal_id: '3B5', vendedor: 'Ana', created_at: '2026-11-14T03:00:00Z', turno_id: 'diurno', turno_nombre: 'Diurno', total: 30, metodo_pago: 'Recarga Mercado Pago', articulos: art('recarga-mp-ajuste-candado', 'Recarga Mercado Pago (ajuste candado)', 30) },
  { id: 'v5', sucursal_id: '3B6', vendedor: 'Ana', created_at: '2026-11-13T19:00:10Z', total: 50, metodo_pago: 'Efectivo', articulos: art('rec50', 'Recarga 50', 50) },
  { id: 'v6', sucursal_id: '3B5', vendedor: 'Ana', created_at: '2026-11-13T19:10:00Z', total: 20, metodo_pago: 'Efectivo', articulos: art('pan', 'Pan', 20) },
];

const filas = ticketsDeArticulo(ventas, 'rec50', { turnosDe });
assert.deepEqual(filas.map((f) => f.id), ['v1', 'v5', 'v2', 'v3']);
assert.equal(filas.find((f) => f.id === 'v2').duplicado, true, 'misma tienda/vendedor/importe a 40 s');
assert.equal(filas.find((f) => f.id === 'v2').duplicadoDe, 'v1');
assert.equal(filas.find((f) => f.id === 'v3').duplicado, false, 'a 30 min ya no es duplicado');
assert.equal(filas.find((f) => f.id === 'v5').duplicado, false, 'otra tienda no cuenta');
assert.equal(filas.find((f) => f.id === 'v1').turnoPorHora, 'Turno diurno');
assert.equal(filas.find((f) => f.id === 'v5').turnoGuardado, '', 'sin turno guardado');

const todas = ticketsDeArticulo(ventas, 'recarga-mp-ajuste-candado', { turnosDe });
assert.equal(todas.length, 1);
assert.equal(todas[0].ajuste, true);
assert.equal(todas[0].turnoPorHora, 'Turno nocturno');
assert.equal(todas[0].turnoDistinto, true, 'ajuste guardado en diurno pero hecho de noche');

const res = resumenRecargasConsulta(ventas, { turnosDe });
assert.equal(res.lineas, 5);
assert.equal(res.duplicados, 1);
assert.equal(res.importeDuplicado, 50);
assert.equal(res.turnoDistinto, 1);
assert.equal(res.ajustes, 1);

assert.equal(esVentaAjusteRecarga({ metodo_pago: 'Recarga Mercado Pago' }), true);
assert.equal(esVentaAjusteRecarga({ metodo_pago: 'Efectivo', articulos: art('x', 'Pan', 1) }), false);
assert.equal(fmtHoraNogales('2026-11-13T19:00:05Z'), '13/11 12:00:05');
assert.equal(fmtHoraNogales(null), '—');
console.log('consultasRecargas.test.mjs OK');
