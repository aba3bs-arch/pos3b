import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const { buscarUsuarioPorPinYSucursal } = await import('./usuariosAuth.js');

function mockUsuarios(rows) {
  return {
    from() {
      const filtros = [];
      const q = {
        select() {
          return q;
        },
        eq(col, val) {
          filtros.push([col, val]);
          return q;
        },
        limit() {
          return q;
        },
        then(res, rej) {
          const data = rows.filter((row) => filtros.every(([col, val]) => String(row[col]) === String(val)));
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

const ana = { id: '1', nombre: 'Ana', rol: 'Cajero', pin: '1111', sucursal_id: '3B2', activo: true };
const luis = { id: '2', nombre: 'Luis', rol: 'Cajero', pin: '2222', sucursal_id: '3B1', activo: true };
const otro = { id: '3', nombre: 'Otro', rol: 'Cajero', pin: '2222', sucursal_id: '3B3', activo: true };
const sb = mockUsuarios([ana, luis, otro]);

let r = await buscarUsuarioPorPinYSucursal(sb, '1111', '3B1');
assert.equal(r.user, null);
assert.equal(r.avisoSucursal, true);

r = await buscarUsuarioPorPinYSucursal(sb, '1111', '3B1', { aceptarCualquierSucursal: true });
assert.equal(r.user?.id, '1');
assert.equal(r.otraSucursal, true);
assert.equal(r.error, null);

r = await buscarUsuarioPorPinYSucursal(sb, '1111', '3B2');
assert.equal(r.user?.nombre, 'Ana');
assert.equal(r.otraSucursal, undefined);

r = await buscarUsuarioPorPinYSucursal(sb, '2222', '3B9', { aceptarCualquierSucursal: true });
assert.equal(r.user, null);
assert.match(r.error, /varias tiendas/);

console.log('usuariosAuth.cualquierSucursal.test.mjs ok');
