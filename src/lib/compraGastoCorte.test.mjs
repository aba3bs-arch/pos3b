import assert from 'node:assert/strict';
import {
  esCompraVentaEnRuta,
  payloadGastoDesdeCompra,
} from './compraGastoCorte.js';

assert.equal(
  esCompraVentaEnRuta({ notas: 'Venta en ruta VR-123 · Andrés' }),
  true,
);
assert.equal(
  esCompraVentaEnRuta({ notas: 'Pedido mayorista · Ticket proveedor: $100' }),
  false,
);
assert.equal(esCompraVentaEnRuta({ notas: null }), false);

const ruta = payloadGastoDesdeCompra({
  compra: { notas: 'Venta en ruta VR-9 · Juan' },
  folioCompra: 'CMP-5-ABCD1234',
  totalTicket: 1500.5,
  proveedorNombre: '',
  usuarioNombre: 'Cajero',
});
assert.equal(ruta.categoria, 'PROVEEDORES');
assert.equal(ruta.subcategoria, 'VENTA EN RUTA');
assert.equal(ruta.monto, 1500.5);
assert.equal(ruta.folios_inventario, 'CMP-5-ABCD1234');
assert.match(ruta.comentario, /COMPRA VENTA EN RUTA/);
assert.match(ruta.comentario, /CMP-5-ABCD1234/);
assert.equal(ruta.usuario_nombre, 'Cajero');

const conProv = payloadGastoDesdeCompra({
  compra: { notas: 'Venta en ruta VR-1', proveedores: { nombre: 'Smoking Norte' } },
  folioCompra: 'CMP-MAIN-FFFF0000',
  totalTicket: 200,
  proveedorNombre: 'Smoking Norte',
});
assert.equal(conProv.subcategoria, 'SMOKING NORTE');
assert.match(conProv.comentario, /Smoking Norte/i);

const mayorista = payloadGastoDesdeCompra({
  compra: { notas: 'Pedido semanal' },
  folioCompra: 'CMP-3-11112222',
  totalTicket: 99,
  proveedorNombre: 'Coca Cola',
});
assert.equal(mayorista.subcategoria, 'COCA COLA');
assert.match(mayorista.comentario, /COMPRA RECIBIDA/);
assert.equal(mayorista.monto, 99);

const sinProv = payloadGastoDesdeCompra({
  compra: { notas: 'Entrega directa' },
  folioCompra: 'ING-5-0101-0001',
  totalTicket: 10,
});
assert.equal(sinProv.subcategoria, 'MERCANCIA');

console.log('compraGastoCorte.test.mjs ok');
