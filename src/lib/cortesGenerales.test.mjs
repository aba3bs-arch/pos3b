import assert from 'node:assert/strict';
import {
  agruparCgaPorDia, csvCortesGenerales, listarCortesGenerales, normalizarFilaCga, unirRecibosHtml,
} from './cortesGenerales.js';

const ligera = normalizarFilaCga({
  id: '1', sucursal_id: '3B5', folio: 'CGA-00001', ventas: 1000, caja_actual: 750, created_at: '2026-11-14T06:59:59Z',
  fecha: '2026-11-13', gastos: '250', tarjeta: '100', caja_anterior: '0', egresos: '300',
});
assert.deepEqual(
  { f: ligera.fecha, v: ligera.ventas, g: ligera.gastos, e: ligera.egresos, c: ligera.cajaActual },
  { f: '2026-11-13', v: 1000, g: 250, e: 300, c: 750 },
);

const completa = normalizarFilaCga({
  id: '2', sucursal_id: '3B2', folio: 'CGA-00001', ventas: 500, caja_actual: 400, created_at: 'x',
  detalle: { fecha_negocio: '2026-11-13', gastos_total: 100, tarjeta: 50, caja_anterior: 20, egresos_dia: { egresos_total_dia: 160 } },
});
assert.equal(completa.fecha, '2026-11-13');
assert.equal(completa.egresos, 160);
assert.equal(completa.cajaAnterior, 20);

const otraFecha = normalizarFilaCga({ id: '3', sucursal_id: '3B5', folio: 'CGA-00002', ventas: 10, caja_actual: 5, fecha: '2026-11-14', gastos: '1' });
const grupos = agruparCgaPorDia([ligera, completa, otraFecha]);
assert.deepEqual(grupos.map((g) => g.fecha), ['2026-11-14', '2026-11-13']);
assert.equal(grupos[1].filas.length, 2);
assert.equal(grupos[1].ventas, 1500);
assert.equal(grupos[1].filas[0].sucursal, '3B2', 'ordena las tiendas dentro del día');

const csv = csvCortesGenerales([ligera, completa], (x) => `Tienda ${x}`);
assert.ok(csv.startsWith('\uFEFF"Fecha"'));
assert.equal(csv.split('\r\n').length, 3);
assert.ok(csv.includes('"Tienda 3B5","CGA-00001","1000"'));

const html = unirRecibosHtml([
  '<html><head><style>.r{x:1}</style></head><body><p>A</p></body></html>',
  '<html><head><style>.r{x:1}</style></head><body><p>B</p></body></html>',
]);
assert.equal((html.match(/<style>/g) || []).length, 1);
assert.ok(html.includes('<p>A</p>') && html.includes('<p>B</p>'));
assert.equal((html.match(/page-break-after/g) || []).length, 1);

const vacio = await listarCortesGenerales(null, { desde: '2026-11-13', hasta: '2026-11-13' });
assert.deepEqual(vacio.data, []);

// Servidor sin soporte de rutas JSON: usa el registro completo y filtra en el cliente.
let llamadas = 0;
const falso = {
  from() {
    llamadas += 1;
    const intento = llamadas;
    const q = new Proxy(function () {}, {
      get(_, k) {
        if (k === 'then') {
          return (res) => res(intento === 1
            ? { data: null, error: { message: 'json path' } }
            : {
              data: [
                { id: 'a', sucursal_id: '3B5', folio: 'CGA-00001', ventas: 10, caja_actual: 5, created_at: '2026-11-14T06:59:59Z', detalle: { tipo_cierre: 'cierre_diario', fecha_negocio: '2026-11-13' } },
                { id: 'b', sucursal_id: '3B5', folio: 'AB-1', ventas: 99, caja_actual: 5, created_at: '2026-11-13T20:00:00Z', detalle: { tipo_cierre: 'cierre_operativo', fecha_negocio: '2026-11-13' } },
              ],
              error: null,
            });
        }
        return () => q;
      },
    });
    return q;
  },
};
const r = await listarCortesGenerales(falso, { desde: '2026-11-13', hasta: '2026-11-13' });
assert.equal(r.error, null);
assert.equal(r.data.length, 1);
assert.equal(r.data[0].folio, 'CGA-00001');
console.log('cortesGenerales.test.mjs OK');
