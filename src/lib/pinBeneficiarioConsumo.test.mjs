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
assert.equal(resolverBeneficiarioConsumoPin('Misael Garcia')?.id, 'misael');
assert.equal(resolverBeneficiarioConsumoPin('Luis Enrique')?.id, 'luis-enrique');
// No confundir empleados de tienda cuyo apellido/segundo nombre es Misael
assert.equal(resolverBeneficiarioConsumoPin('Leyver Misael'), null);
assert.equal(beneficiarioRequierePinConsumo('Leyver Misael'), false);
assert.equal(resolverBeneficiarioConsumoPin('Juan Misael Lopez'), null);

console.log('pinBeneficiarioConsumo.test.mjs OK');
