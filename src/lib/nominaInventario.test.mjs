import assert from 'node:assert/strict';
import {
  DIVISOR_FALTANTE_INVENTARIO_NOMINA,
  cuotaFaltanteInventarioNomina,
  registroFaltanteAplicaASemana,
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

const semana = { inicio: '2026-08-29', fin: '2026-09-04' }; // sáb–vie
const regOk = {
  sucursal_id: '3B5',
  desde: '2026-08-31',
  hasta: '2026-09-04',
  valor_faltante: 3000,
  updated_at: '2026-09-04T12:00:00.000Z',
};
assert.equal(registroFaltanteAplicaASemana(regOk, semana.inicio, semana.fin), true);
assert.equal(registroFaltanteAplicaASemana({ ...regOk, valor_faltante: 0 }, semana.inicio, semana.fin), false);
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
