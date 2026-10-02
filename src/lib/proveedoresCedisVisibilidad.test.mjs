import assert from 'node:assert/strict';
import {
  aplicaOcultarProveedoresCedis,
  filtrarProveedoresVisiblesCedis,
  listarIdsProveedoresOcultosCedis,
  ocultarProveedorEnCedis,
  puedeOcultarProveedorEnCedis,
  proveedorOcultoEnCedis,
  restaurarProveedorEnCedis,
} from './proveedoresCedisVisibilidad.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => { mem.clear(); },
};
mem.clear();

assert.equal(aplicaOcultarProveedoresCedis('CEDIS'), true);
assert.equal(aplicaOcultarProveedoresCedis('3B5'), false);
assert.equal(puedeOcultarProveedorEnCedis({ nombre: 'CEDIS LAS 3B' }), false);
assert.equal(puedeOcultarProveedorEnCedis({ nombre: 'Coca Cola' }), true);

const r = await ocultarProveedorEnCedis('prov-1', null, { nombre: 'Coca Cola' });
assert.equal(r.ok, true);
assert.equal(proveedorOcultoEnCedis('prov-1'), true);
assert.deepEqual(listarIdsProveedoresOcultosCedis(), ['prov-1']);

const list = [
  { id: 'prov-1', nombre: 'Coca Cola' },
  { id: 'prov-2', nombre: 'CEDIS LAS 3B' },
];
assert.deepEqual(
  filtrarProveedoresVisiblesCedis(list).map((p) => p.id),
  ['prov-2'],
);

const block = await ocultarProveedorEnCedis('x', null, { nombre: 'CEDIS LAS 3B' });
assert.equal(block.ok, false);

const rest = await restaurarProveedorEnCedis('prov-1', null);
assert.equal(rest.ok, true);
assert.equal(proveedorOcultoEnCedis('prov-1'), false);

console.log('proveedoresCedisVisibilidad.test.mjs OK');
