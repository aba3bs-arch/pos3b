import assert from 'node:assert/strict';
import {
  DEPARTAMENTOS_CEDIS_UI,
  PROVEEDOR_CEDIS_NOMBRE,
  agregarDepartamentoCatalogoCedis,
  aplicaFiltroCatalogoCedis,
  catCedisDesdeUi,
  departamentoCedisUiDesdeCat,
  departamentoFiltroCoincideCedis,
  esDepartamentoCatalogoCedis,
  esProveedorCedisLas3b,
  filtrarInventarioCatalogoCedis,
  listarDepartamentosCatalogoCedis,
  listarExtrasDepartamentosCedis,
} from './catalogoCedis.js';
import { agregarDepartamentoExtra, listarDepartamentos } from './departamentos.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => { mem.clear(); },
};

mem.clear();

assert.equal(esProveedorCedisLas3b(PROVEEDOR_CEDIS_NOMBRE), true);
assert.equal(esProveedorCedisLas3b('otro'), false);
assert.equal(aplicaFiltroCatalogoCedis('CEDIS'), true);
assert.equal(aplicaFiltroCatalogoCedis('3B5'), false);

assert.equal(catCedisDesdeUi('ELECTRONICOS'), 'CIGARRO_ELECTRONICO');
assert.equal(departamentoCedisUiDesdeCat('CIGARRO_ELECTRONICO'), 'ELECTRONICOS');
assert.equal(departamentoFiltroCoincideCedis('CIGARRO_ELECTRONICO', 'ELECTRONICOS'), true);

for (const d of DEPARTAMENTOS_CEDIS_UI) {
  assert.equal(esDepartamentoCatalogoCedis(d === 'ELECTRONICOS' ? 'CIGARRO_ELECTRONICO' : d), true);
}

const listaBase = listarDepartamentosCatalogoCedis();
assert.ok(listaBase.includes('CIGARROS'));
assert.ok(listaBase.includes('ELECTRONICOS'));
assert.ok(!listaBase.includes('CIGARRO_ELECTRONICO'));

const r = await agregarDepartamentoCatalogoCedis('Accesorios', null);
assert.equal(r.ok, true);
assert.equal(r.codigo, 'ACCESORIOS');
assert.ok(esDepartamentoCatalogoCedis('ACCESORIOS'));
assert.ok(listarDepartamentosCatalogoCedis().includes('ACCESORIOS'));
assert.ok(listarExtrasDepartamentosCedis().includes('ACCESORIOS'));

// Extra CEDIS no ensucia menú de tienda (sin productos de ese depto).
const tienda = listarDepartamentos([{ cat: 'ABARROTES' }, { cat: 'BEBIDAS' }]);
assert.ok(!tienda.includes('ACCESORIOS'));

// Si ya hay producto con ese cat en inventario compartido, sí puede filtrarse en tienda.
const tiendaConProd = listarDepartamentos([{ cat: 'ACCESORIOS' }, { cat: 'ABARROTES' }]);
assert.ok(tiendaConProd.includes('ACCESORIOS'));

// Extra de tienda no va al catálogo CEDIS.
const rTienda = agregarDepartamentoExtra('FARMACIA_LOCAL');
assert.equal(rTienda.ok, true);
assert.equal(esDepartamentoCatalogoCedis('FARMACIA_LOCAL'), false);
assert.ok(!listarDepartamentosCatalogoCedis().includes('FARMACIA_LOCAL'));

const inv = [
  { id: '1', cat: 'CIGARROS' },
  { id: '2', cat: 'BEBIDAS' },
  { id: '3', cat: 'ACCESORIOS' },
  { id: '4', cat: 'CIGARRO_ELECTRONICO' },
];
const filtrado = filtrarInventarioCatalogoCedis(inv, { exigirProveedor: false });
assert.deepEqual(
  filtrado.map((p) => p.id).sort(),
  ['1', '3', '4'],
);

const dup = await agregarDepartamentoCatalogoCedis('accesorios', null);
assert.equal(dup.ok, false);

console.log('catalogoCedis.test.mjs OK');
