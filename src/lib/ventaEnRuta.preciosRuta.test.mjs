import assert from 'node:assert/strict';
import {
  gananciaRutaMonto,
  gananciaRutaPct,
  precioCompraCatalogo,
  precioRutaEspecial,
  guardarPrecioRutaProducto,
} from './ventaEnRuta.js';
import { puedeAccionVentaRuta } from './ventaEnRutaAcciones.js';

{
  assert.equal(precioRutaEspecial({ precio_ruta: 25.5 }), 25.5);
  assert.equal(precioRutaEspecial({ precio_ruta: 0 }), null);
  assert.equal(precioCompraCatalogo({ precio_compra_sin: 10 }), 10);
  assert.equal(precioCompraCatalogo({ precio_compra_con: 108, impuesto: 8 }), 100);
}

{
  assert.equal(gananciaRutaMonto({ precio_compra_sin: 80, precio_ruta: 100 }), 20);
  assert.equal(gananciaRutaPct({ precio_compra_sin: 80, precio_ruta: 100 }), 25);
  assert.equal(gananciaRutaMonto({ precio_compra_sin: 100, precio_ruta: 90 }), -10);
  assert.equal(gananciaRutaMonto({}, {}), null);
}

{
  // Sin privilegio
  const r = await guardarPrecioRutaProducto(null, 'P1', { precio_ruta: 10 }, { rol: 'Cajero' });
  assert.equal(r.ok, false);
  assert.match(r.error, /privilegio/i);
}

{
  // Admin: sin supabase → error de conexión (después de validar privilegio)
  assert.equal(puedeAccionVentaRuta('Administrador', 'u1', 'ruta_precios'), true);
  const r = await guardarPrecioRutaProducto(
    null,
    'P1',
    { precio_ruta: 12, precio_compra_sin: 8 },
    { rol: 'Administrador', userId: 'u1' },
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /conexión/i);
}

{
  // Mock supabase update
  const calls = [];
  const sb = {
    from(table) {
      assert.equal(table, 'productos');
      return {
        update(patch) {
          calls.push(patch);
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const r = await guardarPrecioRutaProducto(
    sb,
    'ABC',
    { precio_ruta: 50, precio_compra_sin: 30, impuesto: 8 },
    { rol: 'Administrador' },
  );
  assert.equal(r.ok, true);
  assert.equal(r.precio_ruta, 50);
  assert.equal(r.precio_compra_sin, 30);
  assert.equal(r.precio_compra_con, 32.4);
  assert.deepEqual(calls[0], {
    precio_ruta: 50,
    precio_compra_sin: 30,
    precio_compra_con: 32.4,
  });
}

{
  // Compat: tercer arg numérico = solo precio_ruta
  const calls = [];
  const sb = {
    from() {
      return {
        update(patch) {
          calls.push(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
  const r = await guardarPrecioRutaProducto(sb, 'X', 19.5, { rol: 'Administrador' });
  assert.equal(r.ok, true);
  assert.equal(r.precio, 19.5);
  assert.deepEqual(calls[0], { precio_ruta: 19.5 });
}

console.log('ventaEnRuta.preciosRuta.test.mjs ok');
