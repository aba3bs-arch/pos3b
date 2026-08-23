import assert from 'node:assert/strict';
import { montoVentaCierreAbarrotes } from './contVirtualData.js';

// Columna ventas
assert.equal(montoVentaCierreAbarrotes({ ventas: 646, detalle: {} }), 646);

// Fallback detalle.venta si ventas=0
assert.equal(montoVentaCierreAbarrotes({ ventas: 0, detalle: { venta: 657 } }), 657);

// Fallback subtotal (como Estadísticas)
assert.equal(montoVentaCierreAbarrotes({
  ventas: null,
  detalle: { subtotal: 3010 },
}), 3010);

// Cierre Fusion típico AB-*
assert.equal(montoVentaCierreAbarrotes({
  ventas: 1811,
  sucursal_id: 'FUSION',
  folio: 'AB-028',
  detalle: { tipo_cierre: 'cierre', venta: 1811 },
}), 1811);

console.log('contVirtualAbarrotesCierres.test.mjs ok');
