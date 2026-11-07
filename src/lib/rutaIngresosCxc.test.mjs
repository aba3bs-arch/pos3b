import assert from 'node:assert/strict';
import {
  analizarCarteraPendiente,
  analizarIngresosRuta,
  analizarEntregaRecolectores,
  resumirCamionesAbiertos,
  construirAvisosIngresosRuta,
  bucketAntiguedad,
  origenCargoCxc,
  diasDesde,
} from './rutaIngresosCxc.js';

const ahora = new Date('2026-11-07T18:00:00Z');
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000).toISOString();

assert.equal(diasDesde(hace(10), ahora), 10);
assert.equal(bucketAntiguedad(5).id, '0-7');
assert.equal(bucketAntiguedad(12).id, '8-15');
assert.equal(bucketAntiguedad(20).id, '16-30');
assert.equal(bucketAntiguedad(45).id, '31+');

const cargos = [
  { id: 'a', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 300, created_at: hace(40), carga_id: 'C1', folio_venta: 'VR-1-C', venta_id: 'V1', estatus: 'pendiente' },
  { id: 'b', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 100, created_at: hace(3), carga_id: 'C1', folio_venta: 'VR-2', venta_id: 'V2' },
  { id: 'c', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B4', monto: 50, created_at: hace(20), carga_id: 'C2', folio_venta: 'VR-3', venta_id: 'V3' },
  { id: 'd', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B4', monto: 80, created_at: hace(9), carga_id: 'rec:T9', folio_venta: 'REC-9' },
  { id: 'e', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 999, created_at: hace(60), carga_id: 'C1', estatus: 'pagado', pagado_at: hace(1) },
  { id: 'f', tipo: 'abono', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 200, created_at: hace(1), pagado_at: hace(1) },
];

assert.equal(origenCargoCxc(cargos[3]), 'recoleccion');
assert.equal(origenCargoCxc(cargos[0]), 'ruta');

{
  const vend = new Map([['C1', 'Luis'], ['C2', 'Andrés']]);
  const c = analizarCarteraPendiente(cargos, { vendedorPorCarga: vend, ahora });
  assert.equal(c.ruta.monto, 450, 'solo pendientes de ruta; el pagado no cuenta');
  assert.equal(c.ruta.creditos, 3);
  assert.equal(c.recoleccion.monto, 80, 'créditos de recolección van aparte');
  assert.equal(c.total.monto, 530);
  assert.equal(c.vencidoMas30, 300);
  assert.equal(c.lista[0].id, 'a', 'más viejo primero');
  assert.equal(c.lista[0].vendedor, 'Luis');
  assert.equal(c.porAntiguedad.find((b) => b.id === '31+').monto, 300);
  assert.equal(c.porAntiguedad.find((b) => b.id === '16-30').monto, 50);
  assert.equal(c.porTienda[0].clave, '3B2');
  assert.equal(c.porTienda[0].monto, 400);
  assert.equal(c.porVendedor.find((v) => v.nombre === 'Luis').monto, 400);
  const solo4 = analizarCarteraPendiente(cargos, { tienda: '3B4', ahora });
  assert.equal(solo4.ruta.monto, 50);
  assert.equal(solo4.recoleccion.monto, 80);
}

const ventas = [
  { id: 'V1', carga_id: 'C1', folio: 'VR-1', cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'credito', total: 300, estado_credito: 'pendiente', created_at: hace(2) },
  { id: 'V9', carga_id: 'C1', folio: 'VR-9', cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'credito', total: 500, estado_credito: 'pagado', created_at: hace(2) },
  { id: 'V4', carga_id: 'C1', folio: 'VR-4', cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'efectivo', total: 1000, created_at: hace(2) },
  { id: 'V5', carga_id: 'C2', folio: 'VR-5', cliente_tipo: 'sucursal', cliente_id: '3B4', metodo_pago: 'mixto', total: 200, articulos: [{ _pago_mixto: true, efectivo: 120, credito: 80 }], created_at: hace(2) },
  { id: 'V6', carga_id: 'C2', folio: 'VR-6', cliente_tipo: 'sucursal', cliente_id: '3B4', metodo_pago: 'efectivo', total: 999, estado: 'cancelada', created_at: hace(2) },
];

{
  const mov = [
    { id: 'p1', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 300, venta_id: 'V1', carga_id: 'C1', created_at: hace(2) },
    { id: 'p2', tipo: 'cargo', cliente_tipo: 'sucursal', cliente_id: '3B4', monto: 80, folio_venta: 'VR-5-MC', carga_id: 'C2', created_at: hace(2) },
    { id: 'ab', tipo: 'abono', cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 500, pagado_at: hace(1), created_at: hace(1) },
  ];
  const i = analizarIngresosRuta(ventas, mov, { desde: '2020-01-01', hasta: '2030-01-01' });
  assert.equal(i.canceladas, 1);
  assert.equal(i.total, 300 + 500 + 1000 + 200);
  assert.equal(i.contado, 1000 + 120);
  assert.equal(i.creditoVendido, 300 + 500 + 80);
  assert.equal(i.creditoPendiente, 380, 'liga cargos por venta_id y por folio sin sufijo');
  assert.equal(i.creditoCobrado, 500);
  assert.equal(i.ingresoRealizado, 1620);
  assert.equal(i.pctRealizado, r(1620 / 2000 * 100));
  assert.equal(i.cobranzaDelPeriodo, 500);
  const t2 = analizarIngresosRuta(ventas, mov, { tienda: '3B4' });
  assert.equal(t2.total, 200);
  assert.equal(t2.creditoPendiente, 80);
}
function r(n) { return Math.round(n * 100) / 100; }

const repartidores = [{ id: 'luis', nombre: 'Luis' }, { id: 'andres', nombre: 'Andrés' }];
const cargasPorId = new Map([
  ['C1', { id: 'C1', vendedor_id: 'rt:luis', vendedor_nombre: 'Luis' }],
  ['C2', { id: 'C2', vendedor_id: 'andres', vendedor_nombre: 'Andrés' }],
]);

{
  const e = analizarEntregaRecolectores({
    ventas,
    cargasPorId,
    repartidores,
    transitoPeriodo: [
      { tipo_movimiento: 'Venta Ruta', monto: 600, estatus: 'Liquidado', repartidor_id: 'luis', sucursal_origen: '3B2' },
      { tipo_movimiento: 'Venta Ruta', monto: 100, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2' },
      { tipo_movimiento: 'Cobro Crédito', monto: 500, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2' },
      { tipo_movimiento: 'Gasto', monto: 40, estatus: 'Liquidado', repartidor_id: 'luis' },
      { tipo_movimiento: 'Venta Ruta', monto: 120, estatus: 'Liquidado', repartidor_id: 'andres', sucursal_origen: '3B4' },
      { tipo_movimiento: 'Venta Ruta', monto: 5000, estatus: 'Cancelado', repartidor_id: 'andres', sucursal_origen: '3B4' },
    ],
    transitoPendiente: [
      { tipo_movimiento: 'Venta Ruta', monto: 100, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2', fecha_hora: hace(5) },
      { tipo_movimiento: 'Cobro Crédito', monto: 500, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2', fecha_hora: hace(1) },
    ],
    ahora,
  });
  const luis = e.find((f) => f.id === 'luis');
  assert.equal(luis.vendidoEfectivo, 1000);
  assert.equal(luis.registrado, 700);
  assert.equal(luis.sinRegistrar, 300, 'vendió 1000 en efectivo y solo hay 700 registrados');
  assert.equal(luis.entregado, 600);
  assert.equal(luis.porEntregar, 600);
  assert.equal(luis.cobrosCredito, 500);
  assert.equal(luis.esperado, 1500);
  assert.equal(luis.entregado + luis.porEntregar + luis.sinRegistrar, luis.esperado);
  assert.equal(luis.gastos, 40);
  assert.equal(luis.masViejoDias, 5);
  assert.equal(luis.estado, 'faltante');
  const andres = e.find((f) => f.id === 'andres');
  assert.equal(andres.vendidoEfectivo, 120);
  assert.equal(andres.registrado, 120, 'cancelado no cuenta');
  assert.equal(andres.estado, 'completo');
  assert.equal(e[0].id, 'luis', 'el que más falta va primero');
}

{
  const e = analizarEntregaRecolectores({
    ventas: [ventas[2]],
    cargasPorId,
    repartidores,
    transitoPeriodo: [{ tipo_movimiento: 'Venta Ruta', monto: 1000, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2' }],
    transitoPendiente: [{ tipo_movimiento: 'Venta Ruta', monto: 1000, estatus: 'En Tránsito', repartidor_id: 'luis', sucursal_origen: '3B2', fecha_hora: hace(6) }],
    ahora,
  });
  assert.equal(e[0].estado, 'atrasado');
}

{
  const lineasPorCarga = new Map([
    ['C1', [
      { producto_id: 'P1', producto_nombre: 'Marlboro', precio: 6, qty_cargada: 100, qty_vendida: 60, qty_devuelta: 10 },
      { producto_id: 'P2', producto_nombre: 'Smoking', precio: 2.1, qty_cargada: 50, qty_vendida: 50, qty_devuelta: 0 },
    ]],
  ]);
  const cam = resumirCamionesAbiertos({
    cargas: [{ id: 'C1', folio: 'CG-1', vendedor_id: 'rt:luis', vendedor_nombre: 'Luis', camion_id: 'K1', created_at: hace(9) }],
    lineasPorCarga,
    ventasPorCarga: new Map([['C1', 400]]),
    productos: new Map([['P1', { id: 'P1', precio_compra_sin: 5 }]]),
    camiones: [{ id: 'K1', codigo: 'CAM-1', alias: 'Rojo' }],
    repartidores,
    ahora,
  });
  const c = cam[0];
  assert.equal(c.disponible, 30);
  assert.equal(c.cargada, 150);
  assert.equal(c.vendida, 110);
  assert.equal(c.pctVendido, r(110 / 150 * 100));
  assert.equal(c.valorDisponibleRuta, 180);
  assert.equal(c.valorDisponibleCosto, 150);
  assert.equal(c.valorVendidoRuta, 60 * 6 + 50 * 2.1);
  assert.equal(c.sinRegistrar, 465 - 400);
  assert.equal(c.dias, 9);
  assert.equal(c.camion, 'CAM-1 · Rojo');
  assert.ok(c.alertas.some((a) => /sin venta registrada/.test(a)));
  assert.ok(c.alertas.some((a) => /abierta hace 9 días/.test(a)));
  assert.equal(c.detalle[0].nombre, 'Marlboro');

  const avisos = construirAvisosIngresosRuta({
    ingresos: { total: 1000, creditoPendiente: 300 },
    cartera: { vencidoMas30: 300 },
    entrega: [{ estado: 'faltante', nombre: 'Luis', vendidoEfectivo: 1000, registrado: 700, sinRegistrar: 300 }],
    camiones: cam,
  });
  const txt = avisos.map((a) => a.texto).join('\n');
  assert.match(txt, /30% de lo vendido/);
  assert.match(txt, /más de 30 días/);
  assert.match(txt, /Luis: vendió/);
  assert.match(txt, /sin venta registrada/);
  assert.equal(construirAvisosIngresosRuta({})[0].nivel, 'info');
}

console.log('rutaIngresosCxc.test.mjs ok');
