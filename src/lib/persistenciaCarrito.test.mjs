import assert from 'node:assert/strict';

function crearStorage(limite = Infinity) {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      const usado = [...m.entries()].reduce((s, [kk, vv]) => s + (kk === k ? 0 : kk.length + vv.length), 0);
      if (usado + k.length + String(v).length > limite) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}

globalThis.localStorage = crearStorage(2000);
globalThis.sessionStorage = crearStorage();

const { guardarCarritoVenta, leerCarritoVenta, limpiarCarritoVenta } = await import('./carritoVentaPersistencia.js');
const { guardarCarritoPosRuta, leerCarritoPosRuta } = await import('./carritoPosRutaPersistencia.js');

const foto = `data:image/jpeg;base64,${'A'.repeat(50000)}`;
const lineas = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nombre: `Prod ${i}`, precio: 10, qty: 2, foto_url: foto }));

// Las fotos base64 no se persisten: el carrito cabe aunque el almacenamiento sea chico.
guardarCarritoVenta('3B2', lineas);
let leido = leerCarritoVenta('3B2');
assert.equal(leido.length, 6);
assert.equal(leido[0].foto_url, null);
assert.equal(leido[0].qty, 2);

// Con localStorage lleno, el carrito se respalda en sessionStorage y no se pierde.
globalThis.localStorage = crearStorage(10);
guardarCarritoVenta('3B2', lineas);
leido = leerCarritoVenta('3B2');
assert.equal(leido.length, 6);

limpiarCarritoVenta('3B2');
assert.equal(leerCarritoVenta('3B2').length, 0);

// POS ruta: igual.
guardarCarritoPosRuta({ id: 'u1' }, {
  clienteKey: 'sucursal:3B2',
  carrito: [{ productoId: 'a', nombre: 'A', precio: 5, cantidad: 2, foto_url: foto, disponible: 9 }],
});
const ruta = leerCarritoPosRuta({ id: 'u1' });
assert.equal(ruta.clienteKey, 'sucursal:3B2');
assert.equal(ruta.carrito[0].cantidad, 2);
assert.equal(ruta.carrito[0].foto_url, null);

console.log('persistenciaCarrito: ok');
