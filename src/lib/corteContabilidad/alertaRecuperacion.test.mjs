import assert from 'node:assert/strict';
import { calcularVistaAlertaRecuperacion } from './alertaRecuperacion.js';

// Deuda 500 + venta 800 → negativo 0, recuperado 500, alerta permanece
{
  const v = calcularVistaAlertaRecuperacion({ deuda: 500, venta: 800, cajaActual: 300 });
  assert.equal(v.recuperado, 500);
  assert.equal(v.negativo, 0);
  assert.equal(v.cubiertoPorVenta, true);
  assert.equal(v.visible, true);
  assert.equal(v.puedeAbonarLiquidar, true);
}

// Cubre turno: misma alerta visible, sin Abono/Liquidar
{
  const v = calcularVistaAlertaRecuperacion({
    deuda: 500,
    venta: 800,
    cajaActual: 300,
    esCubreTurno: true,
  });
  assert.equal(v.visible, true);
  assert.equal(v.recuperado, 500);
  assert.equal(v.puedeAbonarLiquidar, false);
  assert.equal(v.esCubreTurno, true);
}

// Caja -500 cubierta por venta (pico 500, caja ya en +): permanece hasta liquidar
{
  const v = calcularVistaAlertaRecuperacion({
    deuda: 0,
    venta: 800,
    cajaActual: 300,
    picoCaja: 500,
    cajaLiquidada: false,
    esCubreTurno: true,
  });
  assert.equal(v.negativo, 0);
  assert.equal(v.recuperado, 500);
  assert.equal(v.pendienteCajaRecuperada, true);
  assert.equal(v.visible, true);
  assert.equal(v.puedeAbonarLiquidar, false);
}

// Tras liquidar caja: se oculta
{
  const v = calcularVistaAlertaRecuperacion({
    deuda: 0,
    venta: 800,
    cajaActual: 300,
    picoCaja: 0,
    cajaLiquidada: true,
  });
  assert.equal(v.visible, false);
}

console.log('alertaRecuperacion.test.mjs OK');
