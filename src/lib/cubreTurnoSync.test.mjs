import assert from 'node:assert/strict';
import {
  elegirFilaPinCubreMasReciente,
  mapaPinsCubreDesdeFilas,
} from './cubreTurnoSync.js';

const filas = [
  { sucursal_id: '3b3', pin: '1111', updated_at: '2026-01-01T00:00:00.000Z' },
  { sucursal_id: '3B3', pin: '2222', updated_at: '2026-06-01T00:00:00.000Z' },
  { sucursal_id: '3B5', pin: '5555', updated_at: '2026-03-01T00:00:00.000Z' },
];

const best = elegirFilaPinCubreMasReciente(filas, '3b3');
assert.equal(best.sucursal_id, '3B3');
assert.equal(best.pin, '2222');

const mapa = mapaPinsCubreDesdeFilas(filas);
assert.equal(mapa['3B3'], '2222');
assert.equal(mapa['3B5'], '5555');

// Empate de fecha: preferir clave canónica
const empate = elegirFilaPinCubreMasReciente(
  [
    { sucursal_id: '3b3', pin: 'AAAA', updated_at: '2026-06-01T00:00:00.000Z' },
    { sucursal_id: '3B3', pin: 'BBBB', updated_at: '2026-06-01T00:00:00.000Z' },
  ],
  '3B3',
);
assert.equal(empate.pin, 'BBBB');

assert.equal(elegirFilaPinCubreMasReciente([], '3B3'), null);

console.log('cubreTurnoSync.test.mjs ok');
