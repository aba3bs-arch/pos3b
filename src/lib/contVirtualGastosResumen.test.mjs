import assert from 'node:assert/strict';
import test from 'node:test';
import {
  corteDeGasto,
  cajeroDeGasto,
  conceptoDeGasto,
  motivoDeGasto,
  gastosDeMovimientosPorDia,
  totalGastosLista,
} from './contVirtualGastosResumen.js';

test('corte, cajero, concepto y motivo del gasto', () => {
  const g = { fuente: 'corte', cuenta: 'abarrotes', empleado: 'Ana', categoria: 'Papelería', subcategoria: 'Rollos', comentario: 'Rollos de caja' };
  assert.equal(corteDeGasto(g), 'Corte Abarrotes');
  assert.equal(cajeroDeGasto(g), 'Ana');
  assert.equal(conceptoDeGasto(g), 'Papelería · Rollos');
  assert.equal(motivoDeGasto(g), 'Rollos de caja');
  assert.equal(corteDeGasto({ fuente: 'nom_corte', cuenta: 'virtual' }), 'Corte Virtual (nómina)');
  assert.equal(corteDeGasto({ fuente: 'manual' }), 'Captura IE');
  assert.equal(corteDeGasto({ fuente: 'vale', cuenta: 'garage' }), 'Vale · Garage');
  assert.equal(cajeroDeGasto({ solicitado_por: 'Luis' }), 'Luis');
  assert.equal(cajeroDeGasto({}), '—');
  assert.equal(motivoDeGasto({}), '—');
  assert.equal(conceptoDeGasto({}), 'Gasto');
});

test('lista de gastos desde movimientos por día, más reciente primero', () => {
  const porDia = [
    { fecha: '2026-11-09', items: [{ tipo: 'gasto', id: 'a', fecha: '2026-11-09', monto: 10 }, { tipo: 'ingreso', id: 'i', monto: 99 }] },
    { fecha: '2026-11-10', items: [{ tipo: 'gasto', id: 'b', fecha: '2026-11-10', monto: 5.5 }] },
  ];
  const l = gastosDeMovimientosPorDia(porDia);
  assert.deepEqual(l.map((x) => x.id), ['b', 'a']);
  assert.equal(totalGastosLista(l), 15.5);
});
