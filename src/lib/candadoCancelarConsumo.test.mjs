import assert from 'node:assert/strict';
import {
  configEmpleadoConsumo,
  esRegistroConsumo,
  evaluarCandadoCancelarConsumo,
  evaluarLimiteConsumo,
  normalizarCandadoCancelarConsumo,
} from './candadoCancelarConsumo.js';

assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'CONSUMO' }), true);
assert.equal(esRegistroConsumo({ categoria: 'consumo', subcategoria: 'vales-consumo' }), true);
assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'FALTANTE' }), false);
assert.equal(esRegistroConsumo({ categoria: 'gasolina' }), false);

const cfg = normalizarCandadoCancelarConsumo({
  empleados: {
    'u-luz': { id: 'u-luz', nombre: 'Luz Zazueta', cancelar: false, limite: 150 },
    'u-gaby': { nombre: 'Gabriela Janette', cancelar: true, limite: '' },
    'u-malo': { nombre: 'Sin tope', cancelar: true, limite: -5 },
  },
});
assert.equal(cfg.empleados['u-luz'].cancelar, false);
assert.equal(cfg.empleados['u-luz'].limite, 150);
assert.equal(cfg.empleados['u-gaby'].limite, null);
assert.equal(cfg.empleados['u-malo'].limite, null);

assert.equal(configEmpleadoConsumo(cfg, { usuarioId: 'u-luz' }).nombre, 'Luz Zazueta');
assert.equal(configEmpleadoConsumo(cfg, { nombre: 'Luz Zazueta' }).id, 'u-luz');
assert.equal(configEmpleadoConsumo(cfg, { nombre: 'Otra persona' }), null);

const bloqueo = evaluarCandadoCancelarConsumo(cfg, { usuarioId: 'u-luz' });
assert.equal(bloqueo.ok, false);
assert.match(bloqueo.error, /Luz Zazueta/);
assert.equal(evaluarCandadoCancelarConsumo(cfg, { nombre: 'Nadie' }).ok, true);

const tope = evaluarLimiteConsumo({ limite: 150, acumulado: 100, monto: 80, nombre: 'Luz Zazueta' });
assert.equal(tope.ok, false);
assert.equal(tope.disponible, 50);
assert.match(tope.error, /150\.00/);
assert.equal(evaluarLimiteConsumo({ limite: 150, acumulado: 100, monto: 40 }).ok, true);
assert.equal(evaluarLimiteConsumo({ limite: null, acumulado: 999, monto: 1 }).ok, true);
assert.equal(evaluarLimiteConsumo({ limite: 0, acumulado: 0, monto: 1, nombre: 'Ana' }).ok, false);

console.log('candadoCancelarConsumo.test.mjs ok');
