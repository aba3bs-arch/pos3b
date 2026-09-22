import assert from 'node:assert/strict';
import {
  crearCategoriaValePermanente,
  agregarSubcategoriaVale,
  eliminarSubcategoriaVale,
  listarCategoriasVale,
  listarSubcategoriasVale,
  esSubcategoriaValeValida,
  etiquetaSubcategoriaVale,
  desactivarCategoriaValePermanente,
} from './valesCategorias.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = { dispatchEvent: () => {} };

store.clear();

const cat = await crearCategoriaValePermanente(null, {
  label: 'Uniformes',
  descuentaNomina: true,
});
assert.equal(cat.ok, true);
assert.equal(cat.categoria.id, 'uniformes');

const sub1 = await agregarSubcategoriaVale(null, 'uniformes', 'Camisas');
assert.equal(sub1.ok, true);
assert.equal(sub1.subcategoria.label, 'Camisas');

const sub2 = await agregarSubcategoriaVale(null, 'uniformes', 'Pantalones');
assert.equal(sub2.ok, true);

const dup = await agregarSubcategoriaVale(null, 'uniformes', 'camisas');
assert.equal(dup.ok, false);

const lista = listarCategoriasVale();
const uni = lista.find((c) => c.id === 'uniformes');
assert.ok(uni);
assert.equal(uni.subcategorias.length, 2);
assert.equal(listarSubcategoriasVale('uniformes').length, 2);
assert.equal(esSubcategoriaValeValida('uniformes', 'camisas'), true);
assert.equal(esSubcategoriaValeValida('uniformes', 'zapatos'), false);
assert.equal(etiquetaSubcategoriaVale('uniformes', 'camisas'), 'Camisas');

// Sub en categoría fija
const subFija = await agregarSubcategoriaVale(null, 'consumo', 'Snacks');
assert.equal(subFija.ok, true);
assert.ok(listarSubcategoriasVale('consumo').some((s) => s.id === 'snacks'));

await eliminarSubcategoriaVale(null, 'consumo', 'snacks');
assert.equal(listarSubcategoriasVale('consumo').length, 0);

await desactivarCategoriaValePermanente(null, 'uniformes');
assert.ok(!listarCategoriasVale().some((c) => c.id === 'uniformes'));

console.log('valesCategorias.test.mjs ok');
