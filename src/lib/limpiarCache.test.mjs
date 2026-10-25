import assert from 'node:assert/strict';
import { limpiarCacheTemporal } from './limpiarCache.js';

function storage(seed) {
  const s = Object.create({
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  });
  Object.assign(s, seed);
  return s;
}

globalThis.localStorage = storage({
  pos3b_ruta_auditoria_borrador_cam1: '{"conteos":{"A":"3"}}',
  pos3b_ruta_auditorias: '[{"folio":"INV-RT-1"}]',
  pos3b_ajustes_inventario_espera: '[{"id":"auto-departamento-MAIN"}]',
  pos3b_algo_temporal: 'borrar',
});
globalThis.sessionStorage = storage({});

const r = await limpiarCacheTemporal();
assert.equal(localStorage.getItem('pos3b_ruta_auditoria_borrador_cam1'), '{"conteos":{"A":"3"}}');
assert.equal(localStorage.getItem('pos3b_ruta_auditorias'), '[{"folio":"INV-RT-1"}]');
assert.equal(localStorage.getItem('pos3b_ajustes_inventario_espera'), '[{"id":"auto-departamento-MAIN"}]');
assert.equal(localStorage.getItem('pos3b_algo_temporal'), null);
assert.equal(r.claves, 1);
console.log('limpiarCache (conserva inventario en curso) OK');
