import assert from 'node:assert/strict';
import {
  articulosRutaVenta,
  costearVentasRuta,
  compararRecoleccionPorTienda,
  resumenRendimientoRuta,
  SIN_PROVEEDOR,
} from './rutaRendimiento.js';

const productos = new Map([
  ['P1', { id: 'P1', precio_compra_sin: 5 }],
  ['P2', { id: 'P2', precio_compra_sin: 6 }],
  ['P3', { id: 'P3', precio_compra_sin: 0 }],
]);
const proveedorPorProducto = new Map([
  ['P1', 'Marlboro'],
  ['P2', 'Smoking'],
]);

const venta = (id, cliente, metodo, articulos, extra = {}) => ({
  id,
  cliente_tipo: 'sucursal',
  cliente_id: cliente,
  cliente_nombre: cliente,
  metodo_pago: metodo,
  total: articulos.filter((a) => a.producto_id).reduce((s, a) => s + a.importe, 0),
  articulos,
  ...extra,
});

const ventas = [
  venta(1, '3B2', 'efectivo', [
    { producto_id: 'P1', nombre: 'Marlboro', cantidad: 10, precio: 6, importe: 60 },
    { producto_id: 'P2', nombre: 'Smoking', cantidad: 10, precio: 6, importe: 60 },
  ]),
  venta(2, '3B2', 'credito', [
    { producto_id: 'P1', nombre: 'Marlboro', cantidad: 5, precio: 6, importe: 30 },
    { _lineas_camion: [{ x: 1 }] },
  ], { estado_credito: 'pendiente' }),
  venta(3, '3B4', 'efectivo', [
    { producto_id: 'P3', nombre: 'Sin costo', cantidad: 4, precio: 10, importe: 40 },
  ]),
  venta(4, '3B2', 'efectivo', [
    { producto_id: 'P1', nombre: 'Marlboro', cantidad: 99, precio: 6, importe: 594 },
  ], { estado: 'cancelada' }),
];

{
  const arts = articulosRutaVenta(ventas[1]);
  assert.equal(arts.length, 1, 'ignora marcas internas de camión/pago mixto');
  assert.equal(arts[0].producto_id, 'P1');
}

{
  const c = costearVentasRuta(ventas, { productos, proveedorPorProducto });
  assert.equal(c.resumen.venta, 190);
  assert.equal(c.resumen.costo, 5 * 15 + 6 * 10);
  assert.equal(c.resumen.ventaSinCosto, 40);
  assert.equal(c.resumen.ganancia, 150 - 135);
  assert.equal(c.resumen.creditoPendiente, 30);
  assert.equal(c.resumen.canceladas, 1);

  const marl = c.proveedores.find((p) => p.proveedor === 'Marlboro');
  assert.equal(marl.venta, 90);
  assert.equal(marl.ganancia, 15);
  const smo = c.proveedores.find((p) => p.proveedor === 'Smoking');
  assert.equal(smo.ganancia, 0, 'Smoking a precio costo no deja ganancia');
  assert.ok(c.proveedores.some((p) => p.proveedor === SIN_PROVEEDOR));
  assert.deepEqual(c.productosSinMargen.map((p) => p.producto_id), ['P2']);
  assert.equal(c.tiendas.find((t) => t.clave === '3B2').venta, 150);
}

{
  const costeo = costearVentasRuta(ventas, { productos, proveedorPorProducto });
  const filas = compararRecoleccionPorTienda({
    costeo,
    ventasTienda: [
      { sucursal_id: '3B2', total: 1000, tarjeta: 100 },
      { sucursal_id: '3B4', total: 500, tarjeta: 0 },
    ],
    gastosTienda: [
      { sucursal_id: '3B2', monto: 300, categoria: 'PROVEEDORES', subcategoria: 'SABRITAS' },
      { sucursal_id: '3B2', monto: 60, categoria: 'PROVEEDORES', subcategoria: 'VENTA EN RUTA' },
      { sucursal_id: '3B2', monto: 999, categoria: 'PROVEEDORES', subcategoria: 'X', estado_aprobacion: 'rechazado' },
      { sucursal_id: '3B4', monto: 100, categoria: 'LIMPIEZA' },
    ],
    movimientos: [
      { sucursal_origen: '3B2', tipo_movimiento: 'Recolección', monto: 700, estatus: 'Liquidado' },
      { sucursal_origen: '3B2', tipo_movimiento: 'Recolección', monto: 5000, estatus: 'Cancelado' },
      { sucursal_origen: '3B2', tipo_movimiento: 'Venta Ruta', monto: 60, estatus: 'En Tránsito' },
      { sucursal_origen: '3B4', tipo_movimiento: 'Recolección', monto: 400, estatus: 'Liquidado' },
    ],
  });
  const t2 = filas.find((f) => f.clave === '3B2');
  assert.equal(t2.gastos, 360);
  assert.equal(t2.gastosRuta, 60);
  assert.equal(t2.gastosProveedores, 300);
  assert.equal(t2.neto, 1000 - 360, 'neto = venta − gastos');
  assert.equal(t2.recolectado, 700);
  assert.equal(t2.tarjeta, 100);
  assert.equal(t2.salido, 800, 'salido = recolectado + tarjeta (dinero electrónico)');
  assert.equal(t2.diferencia, 800 - 640);
  assert.equal(t2.estado, 'excede');
  assert.equal(t2.efectivoRutaTransito, 60);
  const t4 = filas.find((f) => f.clave === '3B4');
  assert.equal(t4.neto, 400);
  assert.equal(t4.salido, 400);
  assert.equal(t4.estado, 'cuadra');
  assert.equal(filas[0].clave, '3B2', 'ordena por mayor excedente');
}

{
  const r = resumenRendimientoRuta({
    ventas,
    productos,
    proveedorPorProducto,
    gastosRuta: [{ monto: 20, estatus: 'Liquidado' }, { monto: 500, estatus: 'Cancelado' }],
    movimientos: [
      { sucursal_origen: '3B2', tipo_movimiento: 'Venta Ruta', monto: 200, estatus: 'En Tránsito' },
    ],
    ventasTienda: [{ sucursal_id: '3B2', total: 100, tarjeta: 0 }],
    gastosTienda: [],
  });
  assert.equal(r.ruta.gastosRuta, 20);
  assert.equal(r.ruta.rendimientoNeto, 15 - 20);
  assert.equal(r.ruta.efectivoEnTransito, 200);
  const textos = r.hallazgos.map((h) => h.texto).join('\n');
  assert.match(textos, /gastos de ruta/i);
  assert.match(textos, /sin margen/i);
  assert.match(textos, /sin costo|no tiene costo/i);
  assert.match(textos, /crédito pendiente/i);
  assert.match(textos, /MAYOR que la venta en efectivo/);
  assert.match(textos, /Salida por encima del neto|Ninguna tienda excede/);
}

{
  const r = resumenRendimientoRuta({});
  assert.equal(r.ruta.venta, 0);
  assert.equal(r.hallazgos[0].nivel, 'info');
}

{
  const filas = compararRecoleccionPorTienda({
    costeo: { tiendas: [] },
    ventasTienda: [{ sucursal_id: '3B5', total: 1000, tarjeta: 600 }],
    gastosTienda: [{ sucursal_id: '3B5', monto: 100, categoria: 'LIMPIEZA' }],
    movimientos: [{ sucursal_origen: '3B5', tipo_movimiento: 'Recolección', monto: 400, estatus: 'Liquidado' }],
  });
  const t = filas.find((f) => f.clave === '3B5');
  assert.equal(t.neto, 900);
  assert.equal(t.salido, 1000);
  assert.equal(t.diferencia, 100);
  assert.equal(t.estado, 'excede', 'la tarjeta también cuenta como dinero que sale');
  const r = resumenRendimientoRuta({
    ventasTienda: [{ sucursal_id: '3B5', total: 1000, tarjeta: 600 }],
    gastosTienda: [],
    movimientos: [],
  });
  assert.equal(r.recoleccion.tarjeta, 600);
  assert.equal(r.recoleccion.salido, 600);
  assert.match(r.hallazgos.map((h) => h.texto).join('\n'), /dinero electrónico/);
}

console.log('rutaRendimiento.test.mjs ok');
