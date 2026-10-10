/**
 * Dedupe ticket + retiro/venta (caso Mezquite Coca 75004699 → «44» era 22×2).
 * node src/lib/consultasInventario.dedupeVenta.test.mjs
 */
import assert from 'node:assert/strict';
import { dedupeMovimientos } from './consultasInventario.js';

const t0 = Date.parse('2026-10-09T20:49:47.000Z');

const retiroNube = {
  id: 'uuid-retiro-1',
  cloudId: 'uuid-retiro-1',
  tipo: 'retiro',
  modo: 'venta',
  producto_id: '75004699',
  producto_nombre: 'Coca Cola 500ml ( vidrio)',
  cantidad: 1,
  stock_antes: 56,
  stock_despues: 55,
  sucursal: '3B10',
  created_at: new Date(t0).toISOString(),
  origen: 'nube',
};

const ticketDerivado = {
  id: 'venta_ticket1_75004699',
  tipo: 'retiro',
  modo: 'venta',
  producto_id: '75004699',
  producto_nombre: 'Coca Cola 500ml ( vidrio)',
  cantidad: 1,
  subtotal: 20,
  precio: 20,
  sucursal: '3B10',
  created_at: new Date(t0 + 400).toISOString(),
  origen: 'ventas',
  motivo: 'Venta · efectivo · ticket abc',
};

const merged = dedupeMovimientos([retiroNube, ticketDerivado]);
assert.equal(merged.length, 1, 'un solo evento de venta');
assert.equal(Number(merged[0].cantidad), 1);
assert.equal(merged[0].stock_antes, 56, 'conserva stock del retiro');
assert.equal(merged[0].subtotal, 20, 'conserva monto del ticket');

// 22 pares → 22 filas (no 44)
const pares = [];
for (let i = 0; i < 22; i += 1) {
  const ts = t0 + i * 180000; // 3 min entre ventas
  pares.push({
    id: `nube-${i}`,
    cloudId: `nube-${i}`,
    tipo: 'retiro',
    modo: 'venta',
    producto_id: '75004699',
    cantidad: 1,
    stock_antes: 77 - i,
    stock_despues: 76 - i,
    sucursal: '3B10',
    created_at: new Date(ts).toISOString(),
    origen: 'nube',
  });
  pares.push({
    id: `venta_t${i}_75004699`,
    tipo: 'retiro',
    modo: 'venta',
    producto_id: '75004699',
    cantidad: 1,
    subtotal: 20,
    sucursal: '3B10',
    created_at: new Date(ts + 200).toISOString(),
    origen: 'ventas',
  });
}
const deduped = dedupeMovimientos(pares);
assert.equal(deduped.length, 22, '22 ventas reales, no 44');
assert.equal(
  deduped.reduce((a, m) => a + Number(m.cantidad || 0), 0),
  22,
);

// Entrada masivo no se confunde con ventas
const conEntrada = dedupeMovimientos([
  {
    id: 'ing',
    cloudId: 'ing',
    tipo: 'entrada',
    modo: 'masivo',
    producto_id: '75004699',
    cantidad: 72,
    stock_antes: 5,
    stock_despues: 77,
    sucursal: '3B10',
    created_at: '2026-10-06T18:47:24.580Z',
    origen: 'nube',
  },
  ...pares,
]);
assert.equal(conEntrada.length, 23);

console.log('consultasInventario.dedupeVenta.test.mjs ok');
