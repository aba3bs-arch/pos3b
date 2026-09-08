/**
 * Privilegios IE: editar/eliminar movimientos.
 * Ejecutar: node --test src/lib/ieVirtualPermisos.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esAdministradorIeMovimientos } from './contabilidadConstants.js';
import { puedeGestionarMovimientosIe } from './ieVirtualPermisos.js';

describe('esAdministradorIeMovimientos', () => {
  it('reconoce ABB, FJBB y JLBB', () => {
    assert.equal(esAdministradorIeMovimientos('ABB'), true);
    assert.equal(esAdministradorIeMovimientos('Antonio'), true);
    assert.equal(esAdministradorIeMovimientos('FJBB'), true);
    assert.equal(esAdministradorIeMovimientos('Francisco'), true);
    assert.equal(esAdministradorIeMovimientos('JLBB'), true);
    assert.equal(esAdministradorIeMovimientos('José Luis'), true);
  });

  it('no incluye Cheche ni usuarios genéricos', () => {
    assert.equal(esAdministradorIeMovimientos('Cheche'), false);
    assert.equal(esAdministradorIeMovimientos('Luis Enrique'), false);
    assert.equal(esAdministradorIeMovimientos('Cajero 1'), false);
  });
});

describe('puedeGestionarMovimientosIe', () => {
  it('ABB/FJBB/JLBB por nombre aunque no sean admin principal', () => {
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Administrador', nombre: 'ABB' }), true);
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Gerente', nombre: 'FJBB' }), true);
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Administrador', nombre: 'JLBB' }), true);
  });

  it('admin principal (AMR) tiene el privilegio', () => {
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Administrador', nombre: 'AMR' }), true);
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Administrador', nombre: 'Andrés' }), true);
  });

  it('administrador genérico sin ser ABB/FJBB/JLBB no puede', () => {
    assert.equal(puedeGestionarMovimientosIe({ rol: 'Administrador', nombre: 'Supervisor Tienda' }), false);
  });
});
