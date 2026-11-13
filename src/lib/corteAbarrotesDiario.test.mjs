import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUTOVER_CIERRE_DIARIO,
  TIPO_CIERRE_DIARIO,
  TIPO_CIERRE_OPERATIVO,
  armarEstadoCorteDiario,
  esCierreContableAbarrotes,
  folioCorteDiario,
} from './corteAbarrotesDiario.js';
import { calcularAbarrotes } from './corteContabilidad/calc.js';

test('folio diario estable por fecha', () => {
  assert.equal(folioCorteDiario('2026-11-12'), 'ABD-20261112');
});

test('esCierreContable: diario sí, operativo no', () => {
  assert.equal(esCierreContableAbarrotes({
    detalle: { tipo_cierre: TIPO_CIERRE_DIARIO, fecha_negocio: '2026-11-13' },
  }), true);
  assert.equal(esCierreContableAbarrotes({
    detalle: { tipo_cierre: TIPO_CIERRE_OPERATIVO, fecha_negocio: '2026-11-13' },
  }), false);
  assert.equal(esCierreContableAbarrotes({
    detalle: { tipo_cierre: 'recoleccion' },
  }), false);
});

test('esCierreContable: legado de cajero solo antes del cutover', () => {
  assert.equal(esCierreContableAbarrotes({
    detalle: { tipo_cierre: 'cierre', fecha_negocio: '2026-11-10' },
  }), true);
  assert.ok(CUTOVER_CIERRE_DIARIO <= '2026-11-13' || CUTOVER_CIERRE_DIARIO === '2026-11-13');
  assert.equal(esCierreContableAbarrotes({
    detalle: { tipo_cierre: 'cierre', fecha_negocio: CUTOVER_CIERRE_DIARIO },
  }), false);
});

test('armar + calc: ventas − gastos − tarjeta − faltante', () => {
  const estado = armarEstadoCorteDiario({
    venta: 1000,
    tarjeta: 200,
    faltante: 50,
    cajaAnterior: 100,
    fechaNegocio: '2026-11-12',
  });
  const gastos = [{ monto: 80, estado_aprobacion: 'aprobado' }];
  const calc = calcularAbarrotes(estado, gastos);
  assert.equal(calc.venta, 1000);
  assert.equal(calc.gastosTotal, 80);
  // subtotal = 1000 - 80 - 50 - 200 = 670
  assert.equal(calc.subtotal, 670);
  // caja = 1000 + 100 - 80 - 0 - 50 - 200 = 770
  assert.equal(calc.cajaActual, 770);
  assert.equal(estado.folio, 'ABD-20261112');
  assert.match(estado.comentarios, /automático/i);
});
