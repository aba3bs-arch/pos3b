import assert from 'node:assert/strict';
import {
  crearCategoriaValePermanente,
  agregarSubcategoriaVale,
  eliminarSubcategoriaVale,
  agregarDetalleVale,
  eliminarDetalleVale,
  listarCategoriasVale,
  listarSubcategoriasVale,
  listarDetallesVale,
  esSubcategoriaValeValida,
  esDetalleValeValido,
  etiquetaSubcategoriaVale,
  etiquetaDetalleVale,
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
assert.deepEqual(sub1.subcategoria.detalles, []);

const sub2 = await agregarSubcategoriaVale(null, 'uniformes', 'Pantalones');
assert.equal(sub2.ok, true);

const dup = await agregarSubcategoriaVale(null, 'uniformes', 'camisas');
assert.equal(dup.ok, false);

const det1 = await agregarDetalleVale(null, 'uniformes', 'camisas', 'Manga corta');
assert.equal(det1.ok, true);
assert.equal(det1.detalle.label, 'Manga corta');

const det2 = await agregarDetalleVale(null, 'uniformes', 'camisas', 'Manga larga');
assert.equal(det2.ok, true);

const dupDet = await agregarDetalleVale(null, 'uniformes', 'camisas', 'manga corta');
assert.equal(dupDet.ok, false);

const lista = listarCategoriasVale();
const uni = lista.find((c) => c.id === 'uniformes');
assert.ok(uni);
assert.equal(uni.subcategorias.length, 2);
assert.equal(listarSubcategoriasVale('uniformes').length, 2);
assert.equal(listarDetallesVale('uniformes', 'camisas').length, 2);
assert.equal(esSubcategoriaValeValida('uniformes', 'camisas'), true);
assert.equal(esSubcategoriaValeValida('uniformes', 'zapatos'), false);
assert.equal(esDetalleValeValido('uniformes', 'camisas', 'manga-corta'), true);
assert.equal(esDetalleValeValido('uniformes', 'camisas', 'xxl'), false);
assert.equal(etiquetaSubcategoriaVale('uniformes', 'camisas'), 'Camisas');
assert.equal(etiquetaDetalleVale('uniformes', 'camisas', 'manga-corta'), 'Manga corta');

await eliminarDetalleVale(null, 'uniformes', 'camisas', 'manga-corta');
assert.equal(listarDetallesVale('uniformes', 'camisas').length, 1);

// Sub en categoría fija + detalle
const subFija = await agregarSubcategoriaVale(null, 'consumo', 'Snacks');
assert.equal(subFija.ok, true);
const detFija = await agregarDetalleVale(null, 'consumo', 'snacks', 'Papas');
assert.equal(detFija.ok, true);
assert.ok(listarDetallesVale('consumo', 'snacks').some((d) => d.id === 'papas'));

await eliminarSubcategoriaVale(null, 'consumo', 'snacks');
assert.equal(listarSubcategoriasVale('consumo').length, 0);

await desactivarCategoriaValePermanente(null, 'uniformes');
assert.ok(!listarCategoriasVale().some((c) => c.id === 'uniformes'));

console.log('valesCategorias.test.mjs ok');
