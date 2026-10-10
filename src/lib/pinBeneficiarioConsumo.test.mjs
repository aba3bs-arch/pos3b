import assert from 'node:assert/strict';
import {
  BENEFICIARIOS_CONSUMO_PIN,
  beneficiarioRequierePinConsumo,
  esValeConsumo,
  resolverBeneficiarioConsumoPin,
  valeConsumoRequierePinBeneficiario,
} from './pinBeneficiarioConsumo.js';

assert.ok(BENEFICIARIOS_CONSUMO_PIN.length >= 2);
assert.equal(beneficiarioRequierePinConsumo('Luis Enrique'), true);
assert.equal(beneficiarioRequierePinConsumo('Luis Enrique Mada Osuna'), true);
assert.equal(beneficiarioRequierePinConsumo('Misael'), true);
assert.equal(beneficiarioRequierePinConsumo('Gonzalo'), false);
assert.equal(beneficiarioRequierePinConsumo('Ana Cajera'), false);

assert.equal(esValeConsumo('consumo'), true);
assert.equal(esValeConsumo('vales', 'vales-consumo'), true);
assert.equal(esValeConsumo('gasolina'), false);
assert.equal(esValeConsumo('vales', 'vales-gasolina'), false);

assert.equal(
  valeConsumoRequierePinBeneficiario({
    nombreEmpleado: 'Misael',
    categoria: 'vales',
    subcategoria: 'vales-consumo',
  }),
  true,
);
assert.equal(
  valeConsumoRequierePinBeneficiario({
    nombreEmpleado: 'Misael',
    categoria: 'gasolina',
  }),
  false,
);
assert.equal(
  valeConsumoRequierePinBeneficiario({
    nombreEmpleado: 'Gonzalo',
    categoria: 'consumo',
  }),
  false,
);

assert.equal(resolverBeneficiarioConsumoPin('misael')?.id, 'misael');
assert.equal(resolverBeneficiarioConsumoPin('Misael Edwin Avalos Perez')?.id, 'misael');
assert.equal(resolverBeneficiarioConsumoPin('Luis Enrique')?.id, 'luis-enrique');
// 3B7 nocturno: segundo nombre Misael ≠ beneficiario MAIN
assert.equal(resolverBeneficiarioConsumoPin('Leyver Misael Jimenez salinas'), null);
assert.equal(beneficiarioRequierePinConsumo('Leyver Misael Jimenez salinas'), false);

console.log('pinBeneficiarioConsumo.test.mjs OK');
