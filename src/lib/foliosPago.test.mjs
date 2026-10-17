import assert from 'node:assert/strict';
import {
  familiaFoliosPago,
  folioConSufijoPago,
  foliosPagoMixto,
  leerSufijoPagoFolio,
  mismosFoliosBase,
  normalizarMetodoPagoFolio,
  quitarSufijoPagoFolio,
  sufijoFolioPago,
} from './foliosPago.js';

assert.equal(normalizarMetodoPagoFolio('Crédito'), 'credito');
assert.equal(normalizarMetodoPagoFolio('EFECTIVO'), 'efectivo');
assert.equal(normalizarMetodoPagoFolio('mixto'), 'mixto');

assert.equal(sufijoFolioPago('efectivo'), 'E');
assert.equal(sufijoFolioPago('credito'), 'C');
assert.equal(sufijoFolioPago('mixto'), 'M');

assert.equal(folioConSufijoPago('CMP-2-8F0E3996', 'credito'), 'CMP-2-8F0E3996-C');
assert.equal(folioConSufijoPago('CMP-2-8D4F1786', 'efectivo'), 'CMP-2-8D4F1786-E');
assert.equal(folioConSufijoPago('CMP-2-8D4F1786', 'mixto'), 'CMP-2-8D4F1786-M');
assert.equal(folioConSufijoPago('CMP-2-8D4F1786-E', 'credito'), 'CMP-2-8D4F1786-C');

const mix = foliosPagoMixto('CMP-2-8D4F1786');
assert.equal(mix.operacion, 'CMP-2-8D4F1786-M');
assert.equal(mix.efectivo, 'CMP-2-8D4F1786-ME');
assert.equal(mix.credito, 'CMP-2-8D4F1786-MC');

const fam = familiaFoliosPago('VR-ABC123', 'mixto');
assert.equal(fam.operacion, 'VR-ABC123-M');
assert.equal(fam.efectivo, 'VR-ABC123-ME');
assert.equal(fam.credito, 'VR-ABC123-MC');

assert.equal(quitarSufijoPagoFolio('CMP-2-8D4F1786-ME'), 'CMP-2-8D4F1786');
assert.equal(leerSufijoPagoFolio('CMP-2-8D4F1786-MC'), 'MC');
assert.equal(mismosFoliosBase('CMP-2-X-M', 'CMP-2-X-ME'), true);

console.log('foliosPago.test.mjs OK');
