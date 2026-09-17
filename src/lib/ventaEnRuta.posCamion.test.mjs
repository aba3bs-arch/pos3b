import assert from 'node:assert/strict';
import {
  asignarVentaALineasProducto,
  catalogoPosCamionDesdeLineas,
  disponibleEnLineaCarga,
  inventarioCamionDesdeLineas,
} from './ventaEnRuta.js';

// Asignación FIFO entre varias líneas del mismo producto
{
  const lineas = [
    { id: 'l1', carga_id: 'c1', producto_id: 'P1', qty_cargada: 5, qty_vendida: 0, qty_devuelta: 0 },
    { id: 'l2', carga_id: 'c2', producto_id: 'P1', qty_cargada: 8, qty_vendida: 2, qty_devuelta: 0 },
  ];
  assert.equal(disponibleEnLineaCarga(lineas[0]), 5);
  assert.equal(disponibleEnLineaCarga(lineas[1]), 6);

  const ok = asignarVentaALineasProducto(lineas, 7);
  assert.equal(ok.ok, true);
  assert.equal(ok.asignaciones.length, 2);
  assert.equal(ok.asignaciones[0].qty, 5);
  assert.equal(ok.asignaciones[0].cargaId, 'c1');
  assert.equal(ok.asignaciones[1].qty, 2);
  assert.equal(ok.asignaciones[1].cargaId, 'c2');

  const fail = asignarVentaALineasProducto(lineas, 20);
  assert.equal(fail.ok, false);
  assert.match(fail.error, /solo hay 11/i);
}

// Catálogo POS consolida existencia y precio
{
  const lineas = [
    {
      id: 'l1',
      carga_id: 'c1',
      producto_id: 'A',
      producto_nombre: 'Agua',
      precio: 12,
      qty_cargada: 10,
      qty_vendida: 1,
      qty_devuelta: 0,
    },
    {
      id: 'l2',
      carga_id: 'c2',
      producto_id: 'A',
      producto_nombre: 'Agua',
      precio: 15,
      qty_cargada: 4,
      qty_vendida: 0,
      qty_devuelta: 0,
    },
    {
      id: 'l3',
      carga_id: 'c1',
      producto_id: 'B',
      producto_nombre: 'Pan',
      precio: 20,
      qty_cargada: 2,
      qty_vendida: 2,
      qty_devuelta: 0,
    },
  ];
  const inv = inventarioCamionDesdeLineas(lineas);
  assert.equal(inv.find((p) => p.id === 'A')._disp_camion, 13);
  assert.equal(inv.find((p) => p.id === 'B')._disp_camion, 0);

  const cat = catalogoPosCamionDesdeLineas(lineas, {
    productoPorId: new Map([
      ['A', { id: 'A', cat: 'ABARROTES', precio_ruta: 10 }],
      ['B', { id: 'B', cat: 'PANADERIA', precio_ruta: 20 }],
    ]),
  });
  // B sin disponible no aparece
  assert.equal(cat.length, 1);
  assert.equal(cat[0].id, 'A');
  assert.equal(cat[0].disponible, 13);
  assert.equal(cat[0].precio, 15); // mayor precio de línea
  assert.equal(cat[0].cat, 'ABARROTES');
}

console.log('ventaEnRuta.posCamion.test.mjs OK');
