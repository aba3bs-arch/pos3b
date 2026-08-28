import assert from 'node:assert/strict';
import {
  empleadoIncluidoEnTipoFiltro,
  esIndirectoNomina,
  TIPOS_FILTRO_NOMINA,
} from './nominaCalculos.js';
import { lineasDesdeEmpleados } from './nomina.js';

assert.ok(TIPOS_FILTRO_NOMINA.some((t) => t.id === 'directo'));
assert.ok(TIPOS_FILTRO_NOMINA.some((t) => t.id === 'indirecto'));

const tienda = { id: 1, nombre: 'Ana Tienda', rol: 'Cajero', sucursal_id: 'VIRT', tipo_empleado: 'tienda' };
const main = { id: 2, nombre: 'Luis Enrique', rol: 'Indirecto', sucursal_id: 'MAIN', tipo_empleado: 'indirecto' };
const mainPorSuc = { id: 3, nombre: 'Otro Main', rol: 'Cajero', sucursal_id: 'MAIN' };

assert.equal(esIndirectoNomina(tienda), false);
assert.equal(esIndirectoNomina(main), true);
assert.equal(esIndirectoNomina(mainPorSuc), true);

assert.equal(empleadoIncluidoEnTipoFiltro(tienda, ''), true);
assert.equal(empleadoIncluidoEnTipoFiltro(tienda, 'directo'), true);
assert.equal(empleadoIncluidoEnTipoFiltro(tienda, 'indirecto'), false);
assert.equal(empleadoIncluidoEnTipoFiltro(main, 'directo'), false);
assert.equal(empleadoIncluidoEnTipoFiltro(main, 'indirecto'), true);

const todos = lineasDesdeEmpleados([tienda, main], {});
assert.equal(todos.length, 2);

const soloDirectos = lineasDesdeEmpleados([tienda, main], { tipoFiltro: 'directo' });
assert.equal(soloDirectos.length, 1);
assert.equal(soloDirectos[0].usuario_id, 1);
assert.equal(soloDirectos[0].es_indirecto, false);

const soloIndirectos = lineasDesdeEmpleados([tienda, main], { tipoFiltro: 'indirecto' });
assert.equal(soloIndirectos.length, 1);
assert.equal(soloIndirectos[0].usuario_id, 2);
assert.equal(soloIndirectos[0].es_indirecto, true);

console.log('nominaTipoFiltro.test.mjs OK');
