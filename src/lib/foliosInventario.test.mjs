import assert from 'node:assert/strict';
import {
  coincideFolioCompra,
  folioDesdeCompraId,
  generarFolioMovimiento,
  generarFolioTrp,
  normalizarFolioIngRet,
  normalizarFolioInventario,
  normalizarFolioTrp,
  notasConFolioInv,
  sugerirFolioConSucursal,
  variantesFolioInventario,
} from './foliosInventario.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
};

const ing5a = generarFolioMovimiento('entrada', '3B5');
const ing2 = generarFolioMovimiento('entrada', '3B2');
const ing5b = generarFolioMovimiento('entrada', '3B5');
const ing10 = generarFolioMovimiento('entrada', '3B10');
const ingFus = generarFolioMovimiento('entrada', 'FUSION');

assert.match(ing5a, /^ING-5-\d{4}-0001$/);
assert.match(ing2, /^ING-2-\d{4}-0001$/);
assert.match(ing5b, /^ING-5-\d{4}-0002$/);
assert.match(ing10, /^ING-10-\d{4}-0001$/);
assert.match(ingFus, /^ING-FUS-\d{4}-0001$/);
assert.notEqual(ing5a, ing2);
assert.notEqual(ing5a, ing10);

const ret5 = generarFolioMovimiento('retiro', '3B5');
assert.match(ret5, /^RET-5-\d{4}-0001$/);

const id = 'a1b2c3d4-1111-2222-3333-444444444444';
assert.equal(folioDesdeCompraId(id, '3B5'), 'CMP-5-A1B2C3D4');
assert.equal(folioDesdeCompraId(id, '3B2'), 'CMP-2-A1B2C3D4');
assert.equal(folioDesdeCompraId(id, 'FUSION'), 'CMP-FUS-A1B2C3D4');
assert.equal(folioDesdeCompraId(id), 'CMP-A1B2C3D4');
assert.equal(coincideFolioCompra({ id, sucursal_id: '3B5' }, 'CMP-5-A1B2C3D4'), true);
assert.equal(coincideFolioCompra({ id, sucursal_id: '3B5' }, 'CMP-A1B2C3D4'), true);
assert.equal(coincideFolioCompra({ id, sucursal_id: '3B2' }, 'CMP-5-A1B2C3D4'), false);

assert.equal(generarFolioTrp('3B5'), 'trp-5-0001');
assert.equal(generarFolioTrp('3B10'), 'trp-10-0001');
assert.equal(generarFolioTrp('FUSION'), 'trp-FUS-0001');
assert.equal(generarFolioTrp('3B5'), 'trp-5-0002');

assert.equal(normalizarFolioTrp('trp-20'), 'trp-0020');
assert.equal(normalizarFolioTrp('trp0020'), 'trp-0020');
assert.equal(normalizarFolioTrp('trp-5-20'), 'trp-5-0020');
assert.equal(normalizarFolioTrp('trp-fus-7'), 'trp-FUS-0007');
assert.equal(normalizarFolioIngRet('ing-0309-1'), 'ING-0309-0001');
assert.equal(normalizarFolioIngRet('ING-5-0309-1'), 'ING-5-0309-0001');
assert.equal(normalizarFolioInventario('ing-5-0309-1'), 'ING-5-0309-0001');
assert.equal(normalizarFolioInventario('trp-10-3'), 'trp-10-0003');
assert.equal(normalizarFolioInventario('CMP-5-a1b2c3d4'), 'CMP-5-A1B2C3D4');

assert.deepEqual(
  variantesFolioInventario('ING-5-0309-0001', '3B5').includes('ING-0309-0001'),
  true,
);
assert.equal(sugerirFolioConSucursal('ING-0309-0001', '3B5'), 'ING-5-0309-0001');
assert.equal(sugerirFolioConSucursal('trp-0020', '3B10'), 'trp-10-0020');
assert.equal(sugerirFolioConSucursal('CMP-AABBCCDD', 'FUSION'), 'CMP-FUS-AABBCCDD');
assert.equal(notasConFolioInv('Ticket $10 · Folio inv ING-0309-0001', 'ING-5-0309-0001'), 'Ticket $10 · Folio inv ING-5-0309-0001');

console.log('foliosInventario.test.mjs ok');
