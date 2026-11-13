import assert from 'node:assert/strict';
import { aplicarIncluidosManuales, candidatosAgregarNomina } from './nominaIncluirManual.js';
import { empleadosParaNominaGlobal } from './empleadosVisibles.js';

const usuarios = [
  { id: 'u1', nombre: 'Kathara', rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', activo: false },
  { id: 'u2', nombre: 'Luis', rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', activo: true },
  { id: 'u3', nombre: 'Jefe', rol: 'Administrador', sucursal_id: 'MAIN', activo: true },
  { id: 'u4', nombre: 'Cliente X', rol: 'Cliente', activo: true },
  { id: 'u5', nombre: 'Ana', rol: 'Cajero', sucursal_id: '3B2', tipo_empleado: 'tienda', activo: false },
];

const base = empleadosParaNominaGlobal(usuarios).filter((e) => !String(e.id).startsWith('indirect:'));
assert.deepEqual(base.map((e) => e.id), ['u2', 'u3'], 'Kathara (inactiva) no entra sola; el administrador sí');

const cands = candidatosAgregarNomina(usuarios, base);
assert.deepEqual(cands.map((e) => e.nombre), ['Ana', 'Kathara'], 'solo inactivos/excluidos, sin clientes, orden A-Z');

const conKathara = empleadosParaNominaGlobal(aplicarIncluidosManuales(usuarios, new Set(['u1'])))
  .filter((e) => !String(e.id).startsWith('indirect:'));
assert.deepEqual(conKathara.map((e) => e.id).sort(), ['u1', 'u2', 'u3'], 'al agregarla entra a la nómina');
assert.equal(usuarios[0].activo, false, 'no muta el original');

assert.equal(aplicarIncluidosManuales(usuarios, new Set()), usuarios);
assert.deepEqual(candidatosAgregarNomina(usuarios, conKathara).map((e) => e.nombre), ['Ana']);

const adminInactivo = { id: 'u6', nombre: 'Admin baja', rol: 'Administrador', sucursal_id: 'MAIN', activo: false };
assert.ok(
  candidatosAgregarNomina([adminInactivo], []).some((e) => e.id === 'u6'),
  'un administrador inactivo se puede agregar a mano',
);
const socioAdmin = { id: 'u7', nombre: 'Socio', rol: 'Administrador', sucursal_id: 'MAIN', activo: true, socio_3b: true };
assert.ok(!empleadosParaNominaGlobal([socioAdmin]).some((e) => e.id === 'u7'), 'los socios 3B siguen fuera');
console.log('nominaIncluirManual.test.mjs OK');
