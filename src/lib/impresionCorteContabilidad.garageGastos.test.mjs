import assert from 'node:assert/strict';
import { htmlCorteContabilidad, htmlRecoleccionGarage } from './impresionCorteContabilidad.js';

const gastos = [
  {
    categoria: 'EMPLEADO',
    subcategoria: 'CONSUMO',
    monto: 80,
    usuario_nombre: 'Ana López',
    solicitado_por: 'Luis',
    comentario: 'Refresco y botana del turno',
    created_at: '2026-11-16T22:10:00.000Z',
  },
  {
    categoria: 'OPERATIVOS',
    subcategoria: 'REFACCION',
    monto: 45.5,
    usuario_nombre: 'Pedro',
    comentario: '',
  },
];

const rec = htmlRecoleccionGarage({
  modulo: 'garage',
  sucursal: '3B1',
  folio: 'REC-G1',
  tipo_cierre: 'recoleccion',
  venta: 500,
  gastos_total: 125.5,
  gastos,
  recoleccion: 200,
  estado: { recoleccion_actual: 200, recoleccion_anterior: 0 },
});

assert.match(rec, /1\. EMPLEADO › CONSUMO/);
assert.match(rec, /Empleado: Ana López/);
assert.match(rec, /Generó: Luis/);
assert.match(rec, /Descripción:<\/strong> Refresco y botana del turno/);
assert.match(rec, /2\. OPERATIVOS › REFACCION/);
assert.match(rec, /Sin descripción/);
assert.match(rec, /Desglose de gastos \(2\)/);

const corte = htmlCorteContabilidad({
  modulo: 'garage',
  sucursal: '3B1',
  folio: 'G-12',
  turno: 'Nocturno',
  usuario_nombre: 'Ana',
  tipo_cierre: 'cierre',
  venta: 500,
  subtotal: 374.5,
  caja_actual: 374.5,
  gastos_total: 125.5,
  gastos,
  estado: {},
});

assert.match(corte, /Descripción:<\/strong> Refresco y botana del turno/);
assert.match(corte, /OPERATIVOS › REFACCION/);
assert.doesNotMatch(corte, /Desglose de gastos por categoría/);

console.log('ticket garage gastos ok');
