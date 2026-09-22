import assert from 'node:assert/strict';
import {
  esCompraVentaEnRuta,
  payloadGastoDesdeCompra,
  metodoPagoDesdeNotasCompra,
  folioVentaRutaDesdeNotas,
  montosPagoDesdeVentaRuta,
  decidirGastoRecepcionCompra,
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

assert.equal(folioVentaRutaDesdeNotas('Venta en ruta VR-ABC1 · Juan'), 'VR-ABC1');
assert.equal(metodoPagoDesdeNotasCompra('Venta en ruta VR-1 · metodo credito'), 'credito');
assert.equal(metodoPagoDesdeNotasCompra('Venta en ruta VR-1 · metodo mixto'), 'mixto');
assert.equal(metodoPagoDesdeNotasCompra('Venta en ruta VR-1 · Juan'), null);

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

// Crédito: no cargar gasto al recibir
const dCred = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-9 · metodo credito' },
  totalTicket: 500,
});
assert.equal(dCred.cargar, false);
assert.equal(dCred.motivo, 'credito');

const dCredVenta = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-9 · Andrés' },
  totalTicket: 500,
  venta: { metodo_pago: 'credito', total: 500 },
});
assert.equal(dCredVenta.cargar, false);

const dEfe = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-9 · metodo efectivo' },
  totalTicket: 500,
  venta: { metodo_pago: 'efectivo', total: 500 },
});
assert.equal(dEfe.cargar, true);
assert.equal(dEfe.monto, 500);

const dMix = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-9 · metodo mixto' },
  totalTicket: 1000,
  venta: {
    metodo_pago: 'mixto',
    total: 1000,
    articulos: [{ _pago_mixto: true, efectivo: 300, credito: 700 }],
  },
});
assert.equal(dMix.cargar, true);
assert.equal(dMix.monto, 300);
assert.equal(dMix.montoCredito, 700);

const dMixSoloCred = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-9 · metodo mixto' },
  totalTicket: 400,
  venta: {
    metodo_pago: 'mixto',
    total: 400,
    articulos: [{ _pago_mixto: true, efectivo: 0, credito: 400 }],
  },
});
assert.equal(dMixSoloCred.cargar, false);

const dNormal = decidirGastoRecepcionCompra({
  compra: { notas: 'Pedido mayorista' },
  totalTicket: 80,
});
assert.equal(dNormal.cargar, true);
assert.equal(dNormal.monto, 80);

const m = montosPagoDesdeVentaRuta({ metodo_pago: 'credito', total: 12 });
assert.equal(m.montoEfectivo, 0);
assert.equal(m.montoCredito, 12);

console.log('compraGastoCorte.test.mjs ok');
