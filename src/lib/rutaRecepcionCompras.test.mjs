import assert from 'node:assert/strict';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { validarRutaTraspaso } from './traspasosInventario.js';
import { crearPedidoCompraDesdeVentaRuta } from './ventaEnRuta.js';

// Traspaso misma tienda no es válido (legado 3B3→3B3); la recepción va por Compras
{
  const r = validarRutaTraspaso('3B3', '3B3');
  assert.equal(r.ok, false);
  assert.match(String(r.error || ''), /distintos/i);
}

{
  const r = validarRutaTraspaso('3B5', '3B5');
  assert.equal(r.ok, false);
}

assert.equal(normalizarCodigoTienda('3b5'), '3B5');

// Pedido Compras: sin conexión / sucursal inválida
{
  const r = await crearPedidoCompraDesdeVentaRuta(null, {
    sucursalId: '3B5',
    folioVenta: 'VR-1',
    articulos: [{ producto_id: 'P1', nombre: 'A', cantidad: 2, precio: 10 }],
    total: 20,
  });
  assert.equal(r.ok, false);
}
{
  const r = await crearPedidoCompraDesdeVentaRuta({}, {
    sucursalId: 'MAIN',
    folioVenta: 'VR-1',
    articulos: [{ producto_id: 'P1', nombre: 'A', cantidad: 1, precio: 5 }],
    total: 5,
  });
  assert.equal(r.ok, false);
  assert.match(String(r.error || ''), /Sucursal inválida/i);
}
{
  const r = await crearPedidoCompraDesdeVentaRuta({}, {
    sucursalId: '3B5',
    folioVenta: 'VR-1',
    articulos: [],
    total: 0,
  });
  assert.equal(r.ok, false);
  assert.match(String(r.error || ''), /artículos/i);
}

console.log('rutaRecepcionCompras.test.mjs OK');
