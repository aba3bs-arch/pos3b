import assert from 'node:assert/strict';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { validarRutaTraspaso } from './traspasosInventario.js';

// Traspaso misma tienda no es válido (bug 3B3→3B3 tras venta en ruta)
{
  const r = validarRutaTraspaso('3B3', '3B3');
  assert.equal(r.ok, false);
  assert.match(String(r.error || ''), /distintos/i);
}

{
  const r = validarRutaTraspaso('3B5', '3B5');
  assert.equal(r.ok, false);
}

// Códigos de tienda se normalizan en mayúsculas
assert.equal(normalizarCodigoTienda('3b5'), '3B5');

console.log('rutaRecepcionCompras.test.mjs OK');
