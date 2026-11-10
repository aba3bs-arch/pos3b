import assert from 'node:assert/strict';
import test from 'node:test';
import {
  corteDeGasto,
  cajeroDeGasto,
  conceptoDeGasto,
  motivoDeGasto,
  gastosDeMovimientosPorDia,
  totalGastosLista,
  agruparGastosPorTienda,
  etiquetaConceptoGasto,
  gastoCoincideConcepto,
  listarConceptosGastoPeriodo,
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

test('agrupa gastos por tienda con total y mayor monto primero', () => {
  const lista = [
    { id: '1', tienda: '3B6', monto: 100, fecha: '2026-11-09' },
    { id: '2', tienda: 'MAIN', monto: 50, fecha: '2026-11-09' },
    { id: '3', tienda: '3B6', monto: 20.55, fecha: '2026-11-08' },
    { id: '4', tienda: '', monto: 10, fecha: '2026-11-07' },
  ];
  const grupos = agruparGastosPorTienda(lista);
  assert.deepEqual(grupos.map((g) => g.id), ['3B6', 'MAIN']);
  assert.equal(grupos[0].gastos, 120.55);
  assert.deepEqual(grupos[0].items.map((x) => x.id), ['1', '3']);
  assert.equal(grupos[1].gastos, 60);
  assert.deepEqual(grupos[1].items.map((x) => x.id), ['2', '4']);
  assert.deepEqual(agruparGastosPorTienda([]), []);
});

test('etiqueta corta CT / Bono / Limpieza', () => {
  assert.equal(etiquetaConceptoGasto({ id: 'cubre-turno', nombre: 'Cubre turno' }), 'CT');
  assert.equal(etiquetaConceptoGasto({ id: 'bono', nombre: 'Bono' }), 'Bono');
  assert.equal(etiquetaConceptoGasto({ id: 'limpieza', nombre: 'Limpieza' }), 'Limpieza');
  assert.equal(etiquetaConceptoGasto({ id: 'taxis', nombre: 'Taxis' }), 'Taxis');
});

test('gastoCoincideConcepto por id, nombre y alias', () => {
  const bono = { id: 'bono', nombre: 'Bono', label: 'Bono' };
  assert.equal(gastoCoincideConcepto({ categoria_id: 'bono', monto: 10 }, bono), true);
  assert.equal(gastoCoincideConcepto({ categoria: 'Bono', monto: 10 }, bono), true);
  assert.equal(gastoCoincideConcepto({ categoria: 'Otros', comentario: 'pago de bono semanal', monto: 10 }, bono), true);
  assert.equal(gastoCoincideConcepto({ categoria_id: 'taxis', categoria: 'Taxis', monto: 10 }, bono), false);

  const ct = { id: 'cubre-turno', nombre: 'Cubre turno', label: 'CT' };
  assert.equal(gastoCoincideConcepto({ categoria_id: 'cubre-turno', monto: 5 }, ct), true);
  assert.equal(gastoCoincideConcepto({ categoria: 'CUBRE TURNO', monto: 5 }, ct), true);
});

test('listarConceptosGastoPeriodo total y desglose por tienda', () => {
  const catalogo = [
    { id: 'bono', nombre: 'Bono', orden: 10, activo: true },
    { id: 'taxis', nombre: 'Taxis', orden: 20, activo: true },
    { id: 'cubre-turno', nombre: 'Cubre turno', orden: 15, activo: true },
    { id: 'limpieza', nombre: 'Limpieza', orden: 30, activo: true },
    { id: 'credito-autorizado', nombre: 'Crédito autorizado', orden: 25, activo: true },
  ];
  const detalle = [
    { id: '1', categoria_id: 'bono', categoria: 'Bono', tienda: '3B1', monto: 100 },
    { id: '2', categoria_id: 'bono', categoria: 'Bono', tienda: '3B2', monto: 50 },
    { id: '3', categoria_id: 'taxis', categoria: 'Taxis', tienda: '3B1', monto: 80 },
    { id: '4', categoria: 'Otros', comentario: 'limpieza local', tienda: 'MAIN', monto: 20 },
    { id: '5', categoria_id: 'manual', categoria: 'Otros / manual', categoria_raw: 'CREDITO', tienda: '3B6', monto: 200 },
    { id: '6', categoria_id: 'credito-autorizado', categoria: 'Crédito autorizado', tienda: '3B1', monto: 75 },
  ];
  const conceptos = listarConceptosGastoPeriodo({ catalogoEgreso: catalogo, detalleGastos: detalle });
  const bono = conceptos.find((c) => c.id === 'bono');
  const taxis = conceptos.find((c) => c.id === 'taxis');
  const ct = conceptos.find((c) => c.id === 'cubre-turno');
  const lim = conceptos.find((c) => c.id === 'limpieza');
  const cred = conceptos.find((c) => c.id === 'credito-autorizado');
  assert.ok(bono && taxis && ct && lim && cred);
  assert.equal(bono.label, 'Bono');
  assert.equal(ct.label, 'CT');
  assert.equal(cred.label, 'Crédito autorizado');
  assert.equal(bono.total, 150);
  assert.deepEqual(bono.porTienda.map((t) => t.id), ['3B1', '3B2']);
  assert.equal(taxis.total, 80);
  assert.equal(lim.total, 20);
  assert.equal(cred.total, 275);
  assert.deepEqual(cred.porTienda.map((t) => t.id), ['3B6', '3B1']);
  assert.equal(ct.total, 0);
  // Con monto aparecen antes que los en cero.
  assert.ok(conceptos.findIndex((c) => c.id === 'bono') < conceptos.findIndex((c) => c.id === 'cubre-turno'));
});
