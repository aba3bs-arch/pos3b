import assert from 'node:assert/strict';
import { repartirMontoEntreCargos } from './rutaCxc.js';

function cargo(id, monto, created_at) {
  return { id, monto, created_at, tipo: 'cargo', estatus: 'pendiente' };
}

{
  const r = repartirMontoEntreCargos([], 10);
  assert.equal(r.ok, false);
}

{
  const r = repartirMontoEntreCargos([cargo('a', 10, '2026-01-01')], 0);
  assert.equal(r.ok, false);
}

{
  const r = repartirMontoEntreCargos([cargo('a', 10, '2026-01-01')], 11);
  assert.equal(r.ok, false);
}

{
  const cargos = [
    cargo('b', 15, '2026-01-02'),
    cargo('a', 10, '2026-01-01'),
    cargo('c', 20, '2026-01-03'),
  ];
  const r = repartirMontoEntreCargos(cargos, 22);
  assert.equal(r.ok, true);
  assert.equal(r.partes.length, 2);
  assert.equal(r.partes[0].cargo.id, 'a');
  assert.equal(r.partes[0].monto, 10);
  assert.equal(r.partes[0].parcial, false);
  assert.equal(r.partes[1].cargo.id, 'b');
  assert.equal(r.partes[1].monto, 12);
  assert.equal(r.partes[1].parcial, true);
  assert.equal(r.montoAplicado, 22);
}

{
  const r = repartirMontoEntreCargos([cargo('a', 17.1, '2026-01-01')], 17.1);
  assert.equal(r.ok, true);
  assert.equal(r.partes[0].parcial, false);
  assert.equal(r.partes[0].monto, 17.1);
}

console.log('rutaCxc.reparto.test.mjs ok');
