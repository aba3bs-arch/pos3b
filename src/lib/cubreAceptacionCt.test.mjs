import assert from 'node:assert/strict';
import {
  UMBRAL_ACEPTACION_CT,
  ACEPTACION_INICIAL_CT,
  MIN_EVALS_BLOQUEO_CT,
  promedioCalificacionCt,
  aceptacionPctDesdeEvals,
  aceptacionPorSucursal,
  construirResumenAceptacionCt,
  esAccesoAppCtBloqueado,
  etiquetaNivelAceptacionCt,
  colorNivelAceptacionCt,
} from './cubreAceptacionCt.js';

assert.equal(UMBRAL_ACEPTACION_CT, 60);
assert.equal(ACEPTACION_INICIAL_CT, 100);
assert.ok(MIN_EVALS_BLOQUEO_CT >= 1);

assert.equal(promedioCalificacionCt([]), null);
assert.equal(promedioCalificacionCt([{ calificacion: 4 }, { calificacion: 2 }]), 3);

// Sin calificaciones → arranca en 100%.
assert.equal(aceptacionPctDesdeEvals([]), 100);
assert.equal(aceptacionPctDesdeEvals([{ calificacion: 5 }]), 100);
assert.equal(aceptacionPctDesdeEvals([{ calificacion: 3 }]), 60);
assert.equal(aceptacionPctDesdeEvals([{ calificacion: 2 }]), 40);

const por = aceptacionPorSucursal([
  { calificacion: 2, sucursal_id: '3B2' },
  { calificacion: 4, sucursal_id: '3B2' },
  { calificacion: 5, sucursal_id: 'FUSION' },
]);
assert.equal(por.length, 2);
const b2 = por.find((r) => r.sucursal_id === '3B2');
assert.equal(b2.n, 2);
assert.equal(b2.promedio, 3);
assert.equal(b2.pct, 60);

const inicial = construirResumenAceptacionCt([]);
assert.equal(inicial.pct, 100);
assert.equal(inicial.inicial, true);
assert.equal(inicial.bajoUmbral, false);
assert.equal(inicial.n, 0);
assert.equal(inicial.promedio, 5);

const bajo = construirResumenAceptacionCt([
  { calificacion: 2, sucursal_id: '3B2' },
  { calificacion: 2, sucursal_id: 'FUSION' },
]);
assert.equal(bajo.pct, 40);
assert.equal(bajo.bajoUmbral, true);
assert.equal(bajo.inicial, false);
assert.equal(bajo.n, 2);

const alto = construirResumenAceptacionCt([{ calificacion: 5, sucursal_id: '3B2' }]);
assert.equal(alto.bajoUmbral, false);
assert.equal(alto.pct, 100);
assert.equal(alto.inicial, false);

assert.equal(esAccesoAppCtBloqueado({ ct_acceso_app_bloqueado: true }), true);
assert.equal(esAccesoAppCtBloqueado({}), false);
assert.match(etiquetaNivelAceptacionCt(40), /Bajo|bloqueado/i);
assert.match(etiquetaNivelAceptacionCt(100, { inicial: true }), /Inicial|100/i);
assert.equal(typeof colorNivelAceptacionCt(40), 'string');

console.log('cubreAceptacionCt.test.mjs ok');
