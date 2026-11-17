import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerFilasInventario, resumirInventarioCamion } from './resumenInventarioCamion.js';

test('el saldo descuenta ventas y devoluciones a precio de ruta vigente', () => {
  const lineas = [
    { producto_id: 'a', qty_cargada: 100, qty_vendida: 30, qty_devuelta: 10, precio: 8 },
    { producto_id: 'a', qty_cargada: 20, qty_vendida: 5, precio: 9 },
    { producto_id: 'b', qty_cargada: 10, qty_vendida: 2, precio: 5 },
  ];
  const productos = [{ id: 'a', precio_ruta: 10 }];
  assert.deepEqual(resumirInventarioCamion(lineas, productos), {
    cargado: 1250, disponible: 790, sinPrecio: false,
  });
  const venta = lineas.map((l, i) => i === 0 ? { ...l, qty_vendida: 35 } : l);
  assert.equal(resumirInventarioCamion(venta, productos).disponible, 740);
  assert.equal(resumirInventarioCamion(venta, productos).cargado, 1250);
  assert.equal(resumirInventarioCamion(lineas, productos).disponible, 790, 'cancelar la venta restaura el saldo');
});

test('no presenta un saldo negativo y advierte precios faltantes', () => {
  assert.deepEqual(resumirInventarioCamion([
    { producto_id: 'a', qty_cargada: 4, qty_vendida: 5, precio: 2 },
    { producto_id: 'b', qty_cargada: 2 },
  ]), { cargado: 8, disponible: 0, sinPrecio: true });
  assert.deepEqual(resumirInventarioCamion([]), { cargado: 0, disponible: 0, sinPrecio: false });
});

test('lee todas las páginas y rechaza errores sin devolver un total parcial', async () => {
  const filas = Array.from({ length: 1205 }, (_, id) => ({ id }));
  const paginas = [];
  const resultado = await leerFilasInventario(() => ({
    order: () => ({ range: async (desde, hasta) => {
      paginas.push([desde, hasta]);
      return { data: filas.slice(desde, hasta + 1) };
    } }),
  }));
  assert.equal(resultado.length, 1205);
  assert.equal(paginas.length, 3);
  await assert.rejects(leerFilasInventario(() => ({
    order: () => ({ range: async () => ({ error: { message: 'Sin conexión' } }) }),
  })), /Sin conexión/);
});
