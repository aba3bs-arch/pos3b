import assert from 'node:assert/strict';
import {
  construirCartaXRInventario,
  paretoMermaPorDepartamentoPorSucursal,
} from './reporteInventario.js';

function fila(suc, semanaSabadoYmd, merma, operativo) {
  return {
    sucursal: suc,
    created_at: `${semanaSabadoYmd}T12:00:00.000Z`,
    merma,
    inventarioOperativo: operativo,
  };
}

{
  const carta = construirCartaXRInventario([
    fila('3B1', '2026-08-01', 100, 10000), // 1%
    fila('3B2', '2026-08-01', 300, 10000), // 3%
    fila('3B1', '2026-08-08', 200, 10000), // 2%
    fila('3B2', '2026-08-08', 200, 10000), // 2%
  ]);
  assert.equal(carta.puntos.length, 2);
  assert.ok(carta.xBarBar > 0);
  assert.ok(carta.rBar >= 0);
  assert.equal(carta.puntos[0].n, 2);
  assert.ok(Math.abs(carta.puntos[0].xbar - 2) < 0.01);
  assert.ok(Math.abs(carta.puntos[0].r - 2) < 0.01);
}

{
  const paretos = paretoMermaPorDepartamentoPorSucursal([
    {
      sucursal: '3B1',
      departamentoKey: 'ABARROTES',
      departamento: 'Abarrotes',
      diferencia: -2,
      valorDiferencia: 50,
    },
    {
      sucursal: '3B1',
      departamentoKey: 'FRUTAS',
      departamento: 'Frutas',
      diferencia: -1,
      valorDiferencia: 20,
    },
    {
      sucursal: '3B2',
      departamentoKey: 'ABARROTES',
      departamento: 'Abarrotes',
      diferencia: -3,
      valorDiferencia: 90,
    },
    {
      sucursal: '3B1',
      departamentoKey: 'ABARROTES',
      departamento: 'Abarrotes',
      diferencia: 5,
      valorDiferencia: 10,
    },
  ]);
  assert.equal(paretos.length, 2);
  assert.equal(paretos[0].sucursal, '3B1');
  assert.equal(paretos[0].items[0].id, 'ABARROTES');
  assert.equal(paretos[0].items[0].total, 50);
  assert.ok(paretos[0].items[0].acumPct <= 100);
}

console.log('reporteInventario.graficas.test.mjs OK');
