import assert from 'node:assert/strict';
import {
  esCompraVentaEnRuta,
  payloadGastoDesdeCompra,
  metodoPagoDesdeNotasCompra,
  folioVentaRutaDesdeNotas,
  montosPagoDesdeVentaRuta,
  montosMixtoDesdeNotasCompra,
  decidirGastoRecepcionCompra,
  metaPagoMixtoDesdeArticulos,
  pagoTicketRecepcionCompra,
  armarPayloadTicketRecepcion,
  resolverVentaRutaDeCompra,
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
assert.equal(
  metodoPagoDesdeNotasCompra('Crédito fin de año Fin de año 2026 · 3B3 · Folio inv CMP-3-4B208DFB-C · Folio inv CMP-M-4B208DFB-E'),
  'credito',
);

assert.deepEqual(
  montosMixtoDesdeNotasCompra('Venta en ruta VR-1 · metodo mixto · efe 300.00 · cre 60.00'),
  { efectivo: 300, credito: 60 },
);
assert.equal(montosMixtoDesdeNotasCompra('Venta en ruta VR-1 · metodo mixto'), null);

assert.deepEqual(
  metaPagoMixtoDesdeArticulos([{ producto_id: '1' }, { _pago_mixto: true, efectivo: 300, credito: 60 }]),
  { efectivo: 300, credito: 60 },
);
assert.deepEqual(
  metaPagoMixtoDesdeArticulos(JSON.stringify([{ _pago_mixto: true, efectivo: 10, credito: 5 }])),
  { efectivo: 10, credito: 5 },
);

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

// Caso real: 300 efe + 60 cré → gasto solo 300
const dMix360 = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-MUW9T8HW · metodo mixto · efe 300.00 · cre 60.00' },
  totalTicket: 360,
});
assert.equal(dMix360.cargar, true);
assert.equal(dMix360.monto, 300);
assert.equal(dMix360.montoCredito, 60);
assert.equal(dMix360.motivo, 'mixto_efectivo');

// Mixto sin desglose (bug viejo): NO cargar los 360 como efectivo
const dMixSinDesglose = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-X · metodo mixto' },
  totalTicket: 360,
});
assert.equal(dMixSinDesglose.cargar, false);
assert.equal(dMixSinDesglose.monto, 0);

// Venta resuelta con meta, notas compra sin efe/cre
const dMixVenta = decidirGastoRecepcionCompra({
  compra: { notas: 'Venta en ruta VR-MUW9T8HW · metodo mixto · Ticket proveedor: $360.00' },
  totalTicket: 360,
  venta: {
    metodo_pago: 'mixto',
    total: 360,
    articulos: [{ _pago_mixto: true, efectivo: 300, credito: 60 }],
    estado_credito: 'pendiente',
  },
});
assert.equal(dMixVenta.cargar, true);
assert.equal(dMixVenta.monto, 300);
assert.equal(dMixVenta.montoCredito, 60);

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

const dFinAnio = decidirGastoRecepcionCompra({
  compra: { notas: 'Crédito fin de año Fin de año 2026 · 3B3 · metodo credito' },
  totalTicket: 900,
});
assert.equal(dFinAnio.cargar, false);
assert.equal(dFinAnio.metodo, 'credito');
assert.equal(dFinAnio.montoEfectivo, 0);
assert.equal(dFinAnio.montoCredito, 900);

const ticketFin = pagoTicketRecepcionCompra(
  { id: '4b208dfb-d048-445f-b476-736d573b996e', notas: 'Crédito fin de año Fin de año 2026 · 3B3 · Folio inv CMP-3-4B208DFB-C · Ticket proveedor: $900.00 · Folio inv CMP-M-4B208DFB-E', total: 900, sucursal_id: '3B3' },
  null,
  900,
);
assert.equal(ticketFin.metodo, 'credito');
assert.equal(ticketFin.montoEfectivo, 0);
assert.equal(ticketFin.montoCredito, 900);
const payloadFin = armarPayloadTicketRecepcion({
  compra: {
    id: '4b208dfb-d048-445f-b476-736d573b996e',
    sucursal_id: '3B3',
    notas: 'Crédito fin de año Fin de año 2026 · 3B3 · Folio inv CMP-3-4B208DFB-C · Ticket proveedor: $900.00 · Folio inv CMP-M-4B208DFB-E',
    total: 900,
    items: [{ id: '87', nombre: 'Garra de tigre', qty: 10, costo: 40 }],
  },
  proveedor: 'CUETES',
  total: 900,
});
assert.equal(payloadFin.metodo_pago, 'credito');
assert.equal(payloadFin.monto_efectivo, 0);
assert.match(payloadFin.folio, /-C$/);

const dNormal = decidirGastoRecepcionCompra({
  compra: { notas: 'Pedido mayorista' },
  totalTicket: 80,
});
assert.equal(dNormal.cargar, true);
assert.equal(dNormal.monto, 80);

const m = montosPagoDesdeVentaRuta({ metodo_pago: 'credito', total: 12 });
assert.equal(m.montoEfectivo, 0);
assert.equal(m.montoCredito, 12);

// Al recibir, la venta se busca sin la columna notas (no existe en ruta_ventas).
// Si el schema rechaza una columna opcional, se reintenta y igual regresa cliente y tránsito.
{
  const venta = {
    id: 'v1',
    folio: 'VR-1-C',
    metodo_pago: 'credito',
    total: 126,
    articulos: [{ producto_id: 'p', cantidad: 60 }],
    cliente_id: '3B2',
    cliente_tipo: 'sucursal',
    cliente_nombre: '3B2 Pueblo Nuevo',
    transito_id: null,
    carga_id: 'c1',
    vendedor_nombre: 'Luis',
    estado_credito: null,
    compra_id: 'compra-1',
  };
  const selects = [];
  const sb = {
    from(tabla) {
      assert.equal(tabla, 'ruta_ventas');
      return {
        select(cols) {
          selects.push(cols);
          const q = {
            eq() { return q; },
            order() { return q; },
            limit() { return q; },
            maybeSingle: async () => {
              if (cols.split(',').map((s) => s.trim()).includes('notas')) {
                return { data: null, error: { message: 'column ruta_ventas.notas does not exist' } };
              }
              if (cols.includes('estado_credito') && selects.filter((s) => s.includes('estado_credito')).length === 1) {
                return { data: null, error: { message: 'column ruta_ventas.estado_credito does not exist' } };
              }
              return { data: venta, error: null };
            },
          };
          return q;
        },
      };
    },
  };
  const hallada = await resolverVentaRutaDeCompra(sb, {
    id: 'compra-1',
    notas: 'Venta en ruta VR-1-C · metodo credito',
  });
  assert.equal(hallada?.id, 'v1');
  assert.equal(hallada?.cliente_id, '3B2');
  assert.ok(selects.length >= 1);
  assert.equal(selects.some((s) => s.split(',').map((x) => x.trim()).includes('notas')), false);
  assert.equal(hallada?.cliente_nombre, '3B2 Pueblo Nuevo');
}

console.log('compraGastoCorte.test.mjs ok');
