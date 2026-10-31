import assert from 'node:assert/strict';
import {
  desgloseNominaLinea,
  fusionarLineasNomina,
  pagoNominaLinea,
  recalcularLineaNomina,
} from './nominaCalculos.js';

// Caso Mayra: el recibo mostraba consumos viejos (deduccion_consumos) y el neto
// usaba deduccion_gastos → la resta no cuadraba.
const mayra = recalcularLineaNomina({
  nombre: 'Mayra',
  salario_dia: 400,
  dias_trabajados: 6,
  bonificacion: 0,
  deduccion_gastos: 2462, // valor real usado en el pago
  deduccion_consumos: 1607, // valor desfasado que el recibo prefería antes
  deduccion_inventario: 400,
  deduccion_prestamos: 0,
  deduccion_arrastre: 0,
  deducciones: 0,
  deduccion_faltas: 0,
});

assert.equal(pagoNominaLinea(mayra), -462);
const d = desgloseNominaLinea(mayra);
assert.equal(d.sueldo, 2400);
assert.equal(d.consumo, 2462, 'debe usar deduccion_gastos, no deduccion_consumos');
assert.equal(d.inventario, 400);
assert.equal(d.neto, -462);
assert.equal(d.bruto + d.pagoVirtual - d.totalDescuentos, d.neto);
assert.equal(d.pagoVirtual, 0);

// Luz: sueldo = 300 × 5 = $1,500 (la celda no cambia). Virtual = 200 × 5 = $1,000.
// Pago = 1,500 + 1,000 − gastos.
const luz = recalcularLineaNomina({
  nombre: 'Luz Zazueta',
  pagador_nomina: 'ambos',
  pago_virtual: '200',
  salario_dia: 300,
  dias_trabajados: 5,
  bonificacion: 0,
  deduccion_gastos: 0,
  deduccion_inventario: 0,
  deduccion_prestamos: 0,
  deduccion_arrastre: 0,
  deducciones: 0,
  deduccion_faltas: 0,
});
assert.equal(luz.sueldo_base, 1500);
assert.equal(pagoNominaLinea(luz), 2500);
const dl = desgloseNominaLinea(luz);
assert.equal(dl.sueldo, 1500);
assert.equal(dl.pagoVirtual, 1000);
assert.equal(dl.neto, 2500);
assert.equal(dl.bruto + dl.pagoVirtual - dl.totalDescuentos, dl.neto);

const luzConGasto = recalcularLineaNomina({ ...luz, deduccion_gastos: 200, deduccion_consumos: 0 });
assert.equal(luzConGasto.sueldo_base, 1500);
assert.equal(pagoNominaLinea(luzConGasto), 2300);
assert.equal(mayra.deduccion_consumos, 2462, 'recalcular alinea el alias legado');

// Con gastos_manual, fusionar no debe dejar consumos desfasados.
const fusion = fusionarLineasNomina(
  [{
    usuario_id: 'u1',
    gastos_manual: true,
    deduccion_gastos: 2462,
    deduccion_inventario: 400,
    salario_dia: 400,
    dias_trabajados: 6,
  }],
  [{
    usuario_id: 'u1',
    deduccion_gastos: 1607,
    deduccion_consumos: 1607,
    deduccion_inventario: 400,
    salario_dia: 400,
    dias_trabajados: 6,
    bonificacion: 0,
    deduccion_prestamos: 0,
    deduccion_arrastre: 0,
    deducciones: 0,
    deduccion_faltas: 0,
  }],
);
assert.equal(Number(fusion[0].deduccion_gastos), 2462);
assert.equal(Number(fusion[0].deduccion_consumos), 2462);
assert.equal(desgloseNominaLinea(fusion[0]).neto, -462);

console.log('nominaCalculos.recibo.test.mjs ok');
