import assert from 'node:assert/strict';
import {
  DIVISOR_FALTANTE_INVENTARIO_NOMINA,
  cuotaFaltanteInventarioNomina,
  faltanteNetoParaNomina,
  registroFaltanteAplicaASemana,
  ventanaInventarioNomina,
  registroFaltantePorTienda,
  mapaCuotasFaltantePorEmpleado,
  combinarDeduccionInventario,
  empleadoRecibeCuotaFaltante,
} from './nominaInventario.js';

assert.equal(DIVISOR_FALTANTE_INVENTARIO_NOMINA, 3);
assert.equal(cuotaFaltanteInventarioNomina(3000), 1000);
assert.equal(cuotaFaltanteInventarioNomina(3500), 1166.67);
assert.equal(cuotaFaltanteInventarioNomina(0), 0);
assert.equal(cuotaFaltanteInventarioNomina(-10), 0);
assert.equal(combinarDeduccionInventario(50, 1000), 1050);

// Neto = bruto − bonificación (nunca descontar la bonif).
assert.equal(faltanteNetoParaNomina({ valor_faltante: 3000, valor_bonificacion: 600, valor_faltante_neto: 2400 }), 2400);
assert.equal(faltanteNetoParaNomina({ valor_faltante: 3000, valor_bonificacion: 600 }), 2400);
assert.equal(faltanteNetoParaNomina({ valor_faltante: 3000 }), 3000);
assert.equal(faltanteNetoParaNomina({ valor_faltante: 500, valor_bonificacion: 800 }), 0);
assert.equal(cuotaFaltanteInventarioNomina(faltanteNetoParaNomina({ valor_faltante: 3000, valor_bonificacion: 600 })), 800);

const semana = { inicio: '2026-08-29', fin: '2026-09-04' }; // sáb–vie
const regOk = {
  sucursal_id: '3B5',
  desde: '2026-08-31',
  hasta: '2026-09-04',
  valor_faltante: 3000,
  valor_bonificacion: 0,
  valor_faltante_neto: 3000,
  updated_at: '2026-09-04T12:00:00.000Z',
};
assert.equal(registroFaltanteAplicaASemana(regOk, semana.inicio, semana.fin), true);
assert.equal(registroFaltanteAplicaASemana({ ...regOk, valor_faltante: 0, valor_faltante_neto: 0 }, semana.inicio, semana.fin), false);
assert.equal(registroFaltanteAplicaASemana({ ...regOk, desde: '2026-07-01', hasta: '2026-07-31' }, semana.inicio, semana.fin), false);

const empleados = [
  { id: 1, nombre: 'Ana', sucursal_id: '3B5', rol: 'Cajero', tipo_empleado: 'tienda', activo: true },
  { id: 2, nombre: 'Beto', sucursal_id: '3B5', rol: 'Cajero', tipo_empleado: 'tienda', activo: true },
  { id: 3, nombre: 'Cora', sucursal_id: 'FUSION', rol: 'Cajero', tipo_empleado: 'tienda', activo: true },
  { id: 4, nombre: 'Oficina', sucursal_id: 'MAIN', rol: 'Cajero', tipo_empleado: 'indirecto', activo: true },
  { id: 5, nombre: 'Baja', sucursal_id: '3B5', rol: 'Cajero', tipo_empleado: 'tienda', activo: false },
];
assert.equal(empleadoRecibeCuotaFaltante(empleados[0]), true);
assert.equal(empleadoRecibeCuotaFaltante(empleados[3]), false);
assert.equal(empleadoRecibeCuotaFaltante(empleados[4]), false);

const map = mapaCuotasFaltantePorEmpleado({
  registros: [regOk, { sucursal_id: 'FUSION', desde: '2026-07-01', hasta: '2026-07-07', valor_faltante: 9000 }],
  empleados,
  desde: semana.inicio,
  hasta: semana.fin,
});
assert.equal(map['1'].cuota, 1000);
assert.equal(map['2'].cuota, 1000);
assert.equal(map['3'], undefined);
assert.equal(map['4'], undefined);
assert.ok(map['1'].nota.includes('÷ 3'));

// Con bonificación: descuenta solo el neto.
const mapBon = mapaCuotasFaltantePorEmpleado({
  registros: [{
    sucursal_id: '3B5',
    desde: '2026-08-31',
    hasta: '2026-09-04',
    valor_faltante: 3000,
    valor_bonificacion: 900,
    valor_faltante_neto: 2100,
    updated_at: '2026-09-04T12:00:00.000Z',
  }],
  empleados,
  desde: semana.inicio,
  hasta: semana.fin,
});
assert.equal(mapBon['1'].faltante, 2100, 'neto sin bonificación');
assert.equal(mapBon['1'].cuota, 700);
assert.equal(mapBon['1'].bonificacion, 900);
assert.match(mapBon['1'].nota, /neto \$2100\.00/);
assert.match(mapBon['1'].nota, /bonif \$900\.00/);

// Neto 0 por bonif ≥ bruto → sin cuota.
const mapCero = mapaCuotasFaltantePorEmpleado({
  registros: [{
    sucursal_id: '3B5',
    desde: '2026-08-31',
    hasta: '2026-09-04',
    valor_faltante: 500,
    valor_bonificacion: 500,
    valor_faltante_neto: 0,
    updated_at: '2026-09-04T12:00:00.000Z',
  }],
  empleados,
  desde: semana.inicio,
  hasta: semana.fin,
});
assert.equal(mapCero['1'], undefined);

const elegido = registroFaltantePorTienda(
  [
    { sucursal_id: '3B5', desde: '2026-08-01', hasta: '2026-08-31', valor_faltante: 100, updated_at: '2026-08-31T00:00:00.000Z' },
    { sucursal_id: '3B5', desde: '2026-08-29', hasta: '2026-09-04', valor_faltante: 3000, updated_at: '2026-09-01T00:00:00.000Z' },
  ],
  '3B5',
  semana.inicio,
  semana.fin,
);
assert.equal(elegido.valor_faltante, 3000);

console.log('nominaInventario.test.mjs OK');

// Semana de pago sáb 31 oct – vie 6 nov; semana de inventarios lun–sáb → inventarios cerrados del 1 al 7 nov.
const sem2 = { inicio: '2026-10-31', fin: '2026-11-06' };
assert.deepEqual(ventanaInventarioNomina(sem2.inicio, sem2.fin), { desde: '2026-11-01', hasta: '2026-11-07' });
const regVentana = (hasta, suc = '3B5') => ({ ...regOk, sucursal_id: suc, desde: '2026-10-25', hasta });
for (const suc of ['3B5', '3B9', '3B10']) {
  // Sábado de inicio = inventario de la semana anterior.
  assert.equal(registroFaltanteAplicaASemana(regVentana('2026-10-31', suc), sem2.inicio, sem2.fin), false);
  assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-02', suc), sem2.inicio, sem2.fin), true);
  assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-06', suc), sem2.inicio, sem2.fin), true);
  // Sábado siguiente al viernes de cierre = inventario de esta semana.
  assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-07', suc), sem2.inicio, sem2.fin), true);
  assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-08', suc), sem2.inicio, sem2.fin), false);
}

// Semana nueva (sáb 7 – vie 13 nov): el día que arranca aún no hay inventarios; el del sáb 7 ya es de la semana cerrada.
const sem3 = { inicio: '2026-11-07', fin: '2026-11-13' };
assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-07', '3B9'), sem3.inicio, sem3.fin), false);
assert.equal(registroFaltanteAplicaASemana(regVentana('2026-11-14', '3B9'), sem3.inicio, sem3.fin), true);
const mapaNueva = mapaCuotasFaltantePorEmpleado({
  registros: [regVentana('2026-11-07', '3B5')],
  empleados,
  desde: sem3.inicio,
  hasta: sem3.fin,
});
assert.equal(mapaNueva['1'], undefined);
console.log('nominaInventario.test.mjs ventana lun-sáb OK');
