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
  etiquetaCategoriaGasto,
  etiquetaSubcategoriaGasto,
  etiquetaDetalleGasto,
  agruparGastosPorCatalogo,
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

test('etiquetas de categoría / subcategoría / detalle limpian el › embebido', () => {
  const g = {
    categoria: 'Empleado',
    subcategoria: 'Ana › Consumo',
    subcategoria_nombre: 'Ana',
    detalle: 'Consumo',
  };
  assert.equal(etiquetaCategoriaGasto(g), 'Empleado');
  assert.equal(etiquetaSubcategoriaGasto(g), 'Ana');
  assert.equal(etiquetaDetalleGasto(g), 'Consumo');
  assert.equal(etiquetaSubcategoriaGasto({ subcategoria: 'Rollos' }), 'Rollos');
  assert.equal(etiquetaSubcategoriaGasto({
    subcategoria: 'Ana › Consumo',
    detalle: 'Consumo',
  }), 'Ana');
  assert.equal(etiquetaCategoriaGasto({}), 'Sin categoría');
  assert.equal(etiquetaSubcategoriaGasto({}), 'Sin subcategoría');
  assert.equal(etiquetaDetalleGasto({}), '');
});

test('agrupa gastos por categoría → subcategoría → detalle', () => {
  const lista = [
    { id: '1', categoria: 'Empleado', subcategoria_nombre: 'Ana', detalle: 'Consumo', monto: 100 },
    { id: '2', categoria: 'Empleado', subcategoria_nombre: 'Ana', detalle: 'Consumo', monto: 50 },
    { id: '3', categoria: 'Empleado', subcategoria_nombre: 'Luis', detalle: '', monto: 80 },
    { id: '4', categoria: 'Papelería', subcategoria: 'Rollos', monto: 200 },
    { id: '5', categoria: 'Empleado', subcategoria: 'Ana › Taxi', detalle: 'Taxi', monto: 30 },
  ];
  const cats = agruparGastosPorCatalogo(lista);
  assert.deepEqual(cats.map((c) => c.label), ['Empleado', 'Papelería']);
  assert.equal(cats[0].gastos, 260);
  assert.equal(cats[1].gastos, 200);

  const emp = cats[0];
  assert.deepEqual(emp.subcategorias.map((s) => s.label), ['Ana', 'Luis']);
  assert.equal(emp.subcategorias[0].gastos, 180);
  assert.equal(emp.subcategorias[0].tieneDetalle, true);
  assert.deepEqual(emp.subcategorias[0].detalles.map((d) => [d.label, d.gastos]), [
    ['Consumo', 150],
    ['Taxi', 30],
  ]);
  assert.equal(emp.subcategorias[1].tieneDetalle, false);
  assert.deepEqual(emp.subcategorias[1].items.map((x) => x.id), ['3']);

  assert.equal(emp.subcategorias[0].sinDetalle.length, 0);
  assert.deepEqual(agruparGastosPorCatalogo([]), []);
});
