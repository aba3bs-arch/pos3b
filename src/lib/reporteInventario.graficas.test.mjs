import assert from 'node:assert/strict';
import {
  paretoComparativoPorSucursal,
  paretoMermaPorDepartamentoPorSucursal,
} from './reporteInventario.js';

{
  const items = paretoComparativoPorSucursal(
    [
      {
        sucursal: '3B2',
        diferencia: -2,
        valorDiferencia: 80,
      },
      {
        sucursal: '3B5',
        diferencia: -1,
        valorDiferencia: 40,
      },
    ],
    ['FUSION', '3B2', '3B3', '3B5', '3B6', '3B7', '3B9', '3B10'],
    { '3B3': 25 },
  );
  assert.ok(items.length >= 8, 'debe listar todas las tiendas del catálogo');
  assert.equal(items[0].sucursal, '3B2');
  assert.equal(items[0].total, 80);
  const b3 = items.find((x) => x.sucursal === '3B3');
  assert.ok(b3);
  assert.equal(b3.total, 25);
  assert.equal(b3.fuente, 'resultado');
  const b6 = items.find((x) => x.sucursal === '3B6');
  assert.ok(b6);
  assert.equal(b6.total, 0);
}

{
  const paretos = paretoMermaPorDepartamentoPorSucursal(
    [
      {
        sucursal: '3B2',
        departamentoKey: 'ABARROTES',
        departamento: 'Abarrotes',
        diferencia: -2,
        valorDiferencia: 50,
      },
      {
        sucursal: '3B2',
        departamentoKey: 'FRUTAS',
        departamento: 'Frutas',
        diferencia: -1,
        valorDiferencia: 20,
      },
    ],
    ['3B2', '3B5', '3B6'],
  );
  assert.equal(paretos.length, 3);
  assert.ok(paretos.some((g) => g.sucursal === '3B5' && g.items.length === 0));
  const b2 = paretos.find((g) => g.sucursal === '3B2');
  assert.equal(b2.items[0].id, 'ABARROTES');
  assert.equal(b2.items[0].total, 50);
}

console.log('reporteInventario.graficas.test.mjs OK');
