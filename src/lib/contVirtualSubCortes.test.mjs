/**
 * Tests — subcategorías ocultas en catálogo de cortes.
 * node --test src/lib/contVirtualSubCortes.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  subcategoriaEnCatalogoCortes,
  categoriaEnCatalogoCortes,
} from './contVirtualCatalogo.js';
import { catalogoIeAFormatoCorte } from './corteContabilidad/catalogoGastos.js';

describe('subcategoriaEnCatalogoCortes', () => {
  it('default true si falta flag', () => {
    assert.equal(subcategoriaEnCatalogoCortes({ id: 'a', nombre: 'X' }), true);
    assert.equal(subcategoriaEnCatalogoCortes({ id: 'a', nombre: 'X', en_catalogo_cortes: null }), true);
  });
  it('false cuando se oculta', () => {
    assert.equal(subcategoriaEnCatalogoCortes({ id: 'a', nombre: 'X', en_catalogo_cortes: false }), false);
  });
  it('inactiva no entra', () => {
    assert.equal(subcategoriaEnCatalogoCortes({ id: 'a', nombre: 'X', activo: false, en_catalogo_cortes: true }), false);
  });
});

describe('catalogoIeAFormatoCorte filtra sub ocultas', () => {
  it('omite subcuentas con en_catalogo_cortes=false', () => {
    const ie = [
      {
        id: 'gastos-admin',
        nombre: 'Gastos Administrativo',
        activo: true,
        flujo: 'egreso',
        en_catalogo_cortes: true,
        subcategorias: [
          { id: 'sub-a', nombre: 'Visible', activo: true, en_catalogo_cortes: true, detalles: [] },
          { id: 'sub-b', nombre: 'Oculta', activo: true, en_catalogo_cortes: false, detalles: [] },
          {
            id: 'sub-c',
            nombre: 'Comidas',
            activo: true,
            en_catalogo_cortes: false,
            detalles: [{ id: 'd1', nombre: 'Cena', activo: true }],
          },
        ],
      },
    ];
    assert.equal(categoriaEnCatalogoCortes(ie[0]), true);
    const out = catalogoIeAFormatoCorte(ie);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].subcategorias, ['VISIBLE']);
  });
});
