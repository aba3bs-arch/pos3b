import assert from 'node:assert/strict';
import {
  numCuotasPorDefecto,
  primerCobroPorDefecto,
  cuotaEnPeriodo,
  cuotaProgramada,
  numeroCuotaEnPeriodo,
  textoCuotaPrestamo,
} from './prestamoCuotas.js';
import { cuotaDeducibleNomina } from './nominaPrestamos.js';

assert.equal(numCuotasPorDefecto(1000), 2);
assert.equal(numCuotasPorDefecto(1200), 3);
assert.equal(numCuotasPorDefecto(300), 1);
assert.equal(numCuotasPorDefecto(0), 1);

// Préstamo pedido el martes 2026-11-03 (semana sáb 31 oct – vie 6 nov): primer cobro en la semana siguiente.
assert.equal(primerCobroPorDefecto('2026-11-03'), '2026-11-13');

const p = { monto_original: 1000, saldo: 1000, num_cuotas: 2, primer_cobro: '2026-11-13', estado: 'activo' };
const sem = (inicio, fin) => ({ inicio, fin });
const s1 = sem('2026-10-31', '2026-11-06');
const s2 = sem('2026-11-07', '2026-11-13');
const s3 = sem('2026-11-14', '2026-11-20');
const s4 = sem('2026-11-21', '2026-11-27');

assert.equal(cuotaEnPeriodo(p, s1).estado, 'aun_no');
assert.equal(cuotaEnPeriodo(p, s1).monto, 0);
assert.equal(numeroCuotaEnPeriodo(p, s2.inicio), 1);
assert.equal(cuotaEnPeriodo(p, s2).monto, 500);

// Después de abonar la 1.ª cuota, la 2.ª liquida y la 3.ª ya no descuenta.
const tras1 = { ...p, saldo: 500 };
assert.equal(cuotaEnPeriodo(tras1, s3).monto, 500);
assert.equal(cuotaEnPeriodo(tras1, s3).numero, 2);
const tras2 = { ...p, saldo: 0 };
assert.equal(cuotaEnPeriodo(tras2, s4).monto, 0);
// Aunque quedara saldo por un error previo, pasada la última cuota no se vuelve a descontar.
assert.equal(cuotaEnPeriodo({ ...p, saldo: 500 }, s4).monto, 0);
assert.equal(cuotaEnPeriodo({ ...p, saldo: 500 }, s4).estado, 'terminado');

// Cuotas distintas a $500: 1000 en 4 cuotas → 250.
const p4 = { monto_original: 1000, saldo: 1000, num_cuotas: 4, primer_cobro: '2026-11-13' };
assert.equal(cuotaProgramada(p4), 250);
assert.equal(cuotaEnPeriodo(p4, s2).monto, 250);

assert.equal(cuotaDeducibleNomina(p, s2), 500);
assert.equal(cuotaDeducibleNomina({ ...p, saldo: 500 }, s4), 0);
// Préstamo anterior sin calendario: se mantiene $500 por semana mientras haya saldo.
assert.equal(cuotaDeducibleNomina({ monto_original: 1000, saldo: 1000 }, s4), 500);
assert.equal(cuotaDeducibleNomina({ monto_original: 1000, saldo: 300 }, s4), 300);

assert.match(textoCuotaPrestamo(p), /2 cuotas/);
assert.equal(textoCuotaPrestamo({ saldo: 5 }), '');
console.log('prestamoCuotas.test.mjs OK');
