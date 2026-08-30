import assert from 'node:assert/strict';

// Aísla el módulo de constantes sin ciclo: departamentos no importa cedis al cargar assert de sync.
const {
  CEDIS_VENTA_ACTIVA,
  CEDIS_VENTA_DEPARTAMENTOS,
  cedisVentaActiva,
  departamentoPermitidoEnCedisVenta,
  esCedisModoVenta,
  filtrarInventarioCedisVenta,
  productoPermitidoEnCedisVenta,
} = await import('./cedisVentaConfig.js');

assert.equal(typeof CEDIS_VENTA_ACTIVA, 'boolean');
assert.ok(Array.isArray(CEDIS_VENTA_DEPARTAMENTOS) && CEDIS_VENTA_DEPARTAMENTOS.length > 0);
assert.equal(cedisVentaActiva(), CEDIS_VENTA_ACTIVA);

assert.equal(departamentoPermitidoEnCedisVenta('cigarros'), true);
assert.equal(departamentoPermitidoEnCedisVenta('BLUNT_WRAPS'), true);
assert.equal(departamentoPermitidoEnCedisVenta('Tecnologia'), true);
assert.equal(departamentoPermitidoEnCedisVenta('BEBIDAS'), false);
assert.equal(departamentoPermitidoEnCedisVenta(''), false);

assert.equal(productoPermitidoEnCedisVenta({ cat: 'ROPA' }), true);
assert.equal(productoPermitidoEnCedisVenta({ cat: 'DULCES' }), false);

const inv = [
  { id: 1, cat: 'CIGARROS', nombre: 'Marlboro' },
  { id: 2, cat: 'BEBIDAS', nombre: 'Coca' },
  { id: 3, cat: 'abarrotes', nombre: 'Aceite' },
];
assert.deepEqual(
  filtrarInventarioCedisVenta(inv).map((p) => p.id),
  [1, 3],
);

if (CEDIS_VENTA_ACTIVA) {
  assert.equal(esCedisModoVenta('CEDIS'), true);
  assert.equal(esCedisModoVenta('3B5'), false);
  assert.equal(esCedisModoVenta('MAIN'), false);
} else {
  assert.equal(esCedisModoVenta('CEDIS'), false);
}

console.log('cedisVentaConfig.test.mjs ok');
