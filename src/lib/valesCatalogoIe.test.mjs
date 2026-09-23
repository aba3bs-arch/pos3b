import assert from 'node:assert/strict';
import {
  categoriasValeDesdeCatalogoIe,
  esValeGasolina,
  mapaIeDesdeVale,
  tipoValeLogico,
  valeDescuentaNominaIe,
  resolverDescuentaNominaVale,
} from './valesCatalogoIe.js';
import { CATEGORIAS_CONT_VIRTUAL_DEFAULT } from './contVirtualCatalogo.js';
import { gastoCuentaEnNomina } from './nominaGastos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';

const catalogo = CATEGORIAS_CONT_VIRTUAL_DEFAULT.map((c) => ({
  ...c,
  flujo: 'egreso',
  subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: [] })),
}));

const opts = categoriasValeDesdeCatalogoIe(catalogo, { ocultarGasolina: false });
assert.ok(opts.some((c) => c.id === 'vales'));
assert.ok(opts.some((c) => c.id === 'empleado'));
assert.ok(opts.find((c) => c.id === 'vales')?.subcategorias.some((s) => s.id === 'vales-gasolina'));

const sinGas = categoriasValeDesdeCatalogoIe(catalogo, { ocultarGasolina: true });
assert.ok(!sinGas.find((c) => c.id === 'vales')?.subcategorias.some((s) => s.id === 'vales-gasolina'));

const formCats = categoriasValeDesdeCatalogoIe(catalogo, { soloParaFormulario: true });
assert.ok(!formCats.some((c) => c.id === 'prestamos'));
assert.ok(!formCats.some((c) => c.id === 'manual'));

const adminCats = categoriasValeDesdeCatalogoIe(catalogo, { soloParaFormulario: false });
assert.ok(adminCats.some((c) => c.id === 'prestamos'), 'admin ve prestamos');
assert.ok(adminCats.some((c) => c.id === 'manual'), 'admin ve manual');
assert.ok(adminCats.some((c) => c.id === 'vales'));
assert.ok(adminCats.some((c) => c.id === 'empleado'));

assert.equal(tipoValeLogico('gasolina'), 'gasolina');
assert.equal(tipoValeLogico('vales', 'vales-gasolina'), 'gasolina');
assert.equal(tipoValeLogico({ categoria: 'vales', subcategoria: 'vales-consumo' }), 'consumo');
assert.equal(esValeGasolina({ categoria: 'vales', subcategoria: 'vales-gasolina' }), true);
assert.equal(valeDescuentaNominaIe('vales', 'vales-consumo'), true);
assert.equal(valeDescuentaNominaIe('vales', 'vales-gasolina'), false);

// Preferencia del usuario respetada, excepto gasolina (siempre false).
assert.equal(resolverDescuentaNominaVale('vales', 'vales-consumo', false), false);
assert.equal(resolverDescuentaNominaVale('vales', 'vales-consumo', true), true);
assert.equal(resolverDescuentaNominaVale('vales', 'vales-gasolina', true), false);
assert.equal(resolverDescuentaNominaVale('gasolina', null, true), false);
assert.equal(resolverDescuentaNominaVale('vales', 'vales-herramienta', true), true);
assert.equal(resolverDescuentaNominaVale('vales', 'vales-herramienta'), false);

assert.equal(gastoCuentaEnNomina({ categoria: 'VALES', subcategoria: 'GASOLINA' }), false);
assert.equal(gastoCuentaEnNomina({ categoria: 'VALES', subcategoria: 'GASOLINA · NOMINA' }), false);
assert.equal(gastoCuentaEnNomina({ categoria: 'VALES', subcategoria: 'CONSUMO · NOMINA' }), true);
assert.equal(gastoDescuentaNomina('virtual', 'VALES', 'GASOLINA'), false);
assert.equal(gastoDescuentaNomina('abarrotes', 'VALES', 'GASOLINA · NOMINA'), false);

const mapaLegacy = mapaIeDesdeVale({ categoria: 'gasolina' }, catalogo);
assert.equal(mapaLegacy.categoriaId, 'vales');
assert.equal(mapaLegacy.subcategoriaId, 'vales-gasolina');

const mapaIe = mapaIeDesdeVale({
  categoria: 'empleado',
  subcategoria: 'empleado-anticipo',
  detalle: null,
}, catalogo);
assert.equal(mapaIe.categoriaId, 'empleado');
assert.equal(mapaIe.subcategoriaId, 'empleado-anticipo');

console.log('valesCatalogoIe.test.mjs ok');
