import assert from 'node:assert/strict';
import { htmlReciboCorteGeneral, datosImpresionDesdeHistorial } from './impresionCorteContabilidad.js';

const cierre = {
  id: 'x',
  sucursal_id: '3B5',
  folio: 'CGA-00001',
  turno: 'Corte general',
  usuario_nombre: 'Sistema · corte general',
  created_at: '2026-11-13T06:59:59.999Z',
  ventas: 1785,
  caja_actual: 238,
  detalle: {
    tipo_cierre: 'cierre_diario',
    fecha_negocio: '2026-11-13',
    caja_anterior: -959,
    venta: 1785,
    tarjeta: 288,
    subtotal: 1197,
    gastos_total: 335,
    gastos: [
      { id: 'g1', categoria: 'PROVEEDORES', subcategoria: 'Bimbo', monto: 300 },
      { id: 'g2', categoria: 'EMPLEADO', subcategoria: 'CONSUMO', monto: 35, usuario_nombre: 'Ana <b>' },
    ],
    egresos_dia: {
      consumos_total: 35,
      egresos_ie: [{ categoria: 'Vales', descripcion: 'Vale gasolina', monto: 100 }],
      egresos_ie_total: 100,
    },
    resumen_pos: { tickets: 40, cancelaciones: 1 },
  },
};

const data = datosImpresionDesdeHistorial(cierre, 'abarrotes');
assert.equal(data.tipo_cierre, 'cierre_diario');
const html = htmlReciboCorteGeneral(data);
assert.ok(html.includes('CGA-00001'));
assert.ok(html.includes('CORTE DE CAJA GENERAL'));
assert.ok(html.includes('$335.00'));
assert.ok(html.includes('$435.00')); // 335 gastos + 100 egresos IE
assert.ok(html.includes('Vale gasolina'));
assert.ok(html.includes('Ana &lt;b&gt;'));
assert.ok(!html.includes('Ana <b>'));
console.log('reciboCorteGeneral.test.mjs OK');
