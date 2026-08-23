import assert from 'node:assert/strict';
import {
  bonoTurnoPorEvaluacion,
  normalizarBonosConfig,
  BONOS_CONFIG_DEFAULT,
} from './bonosConfig.js';

assert.equal(bonoTurnoPorEvaluacion(100, 100), 100);
assert.equal(bonoTurnoPorEvaluacion(100, 80), 80);
assert.equal(bonoTurnoPorEvaluacion(50, 100), 50);
assert.equal(bonoTurnoPorEvaluacion(50, 40), 20);
assert.equal(bonoTurnoPorEvaluacion(100, 0), 0);

const cfg = normalizarBonosConfig({});
assert.equal(cfg.bonosTurno.activo, true);
assert.equal(cfg.bonosTurno.TD, 100);
assert.equal(cfg.bonosTurno.TN, 50);

const cfg2 = normalizarBonosConfig({
  ...BONOS_CONFIG_DEFAULT,
  bonosTurno: { activo: true, TD: 120, TN: 60 },
});
assert.equal(cfg2.bonosTurno.TD, 120);
assert.equal(cfg2.bonosTurno.TN, 60);

const cfgOff = normalizarBonosConfig({ bonosTurno: { activo: false, TD: 100, TN: 50 } });
assert.equal(cfgOff.bonosTurno.activo, false);

console.log('bonosTurnoChecklist.test.mjs ok');
