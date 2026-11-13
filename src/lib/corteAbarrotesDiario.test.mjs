import assert from 'node:assert/strict';
import test from 'node:test';
import {
  folioCorteGeneral,
  numeroFolioCorteGeneral,
  resumenEgresosDia,
  siguienteFolioCorteGeneral,
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

test('armar + calc: ventas − gastos − tarjeta (el faltante va como gasto)', () => {
  const estado = armarEstadoCorteDiario({
    venta: 1000,
    tarjeta: 200,
    cajaAnterior: 100,
    fechaNegocio: '2026-11-12',
  });
  const gastos = [{ monto: 80, estado_aprobacion: 'aprobado' }];
  const calc = calcularAbarrotes(estado, gastos);
  assert.equal(calc.venta, 1000);
  assert.equal(calc.gastosTotal, 80);
  // subtotal = 1000 - 80 - 200 = 720
  assert.equal(calc.subtotal, 720);
  // caja = 1000 + 100 - 80 - 0 - 200 = 820
  assert.equal(calc.cajaActual, 820);
  // un faltante viejo guardado en el estado ya no resta dos veces
  assert.equal(calcularAbarrotes({ ...estado, faltante: 50 }, gastos).subtotal, 720);
  assert.equal(estado.folio, 'ABD-20261112');
  assert.match(estado.comentarios, /automático/i);
});

test('folio de corte general CGA-00001 consecutivo', async () => {
  assert.equal(folioCorteGeneral(1), 'CGA-00001');
  assert.equal(folioCorteGeneral(12), 'CGA-00012');
  assert.equal(numeroFolioCorteGeneral('CGA-00012'), 12);
  assert.equal(numeroFolioCorteGeneral('AB-210'), 0);
  const fake = (folios, error = null) => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        ilike: () => q,
        limit: () => Promise.resolve({ data: folios.map((folio) => ({ folio })), error }),
      };
      return q;
    },
  });
  assert.equal(await siguienteFolioCorteGeneral(fake([]), { sucursal: '3B5' }), 'CGA-00001');
  assert.equal(await siguienteFolioCorteGeneral(fake(['CGA-00001', 'CGA-00007', 'CGA-00003']), { sucursal: '3B5' }), 'CGA-00008');
  assert.equal(await siguienteFolioCorteGeneral(fake([], { message: 'x' }), { sucursal: '3B5' }), 'CGA-00001');
});

test('armar con folio CGA y resumen de egresos del día', () => {
  const estado = armarEstadoCorteDiario({ venta: 1000, tarjeta: 0, cajaAnterior: 0, fechaNegocio: '2026-11-13', folio: 'CGA-00001' });
  assert.equal(estado.folio, 'CGA-00001');
  const r = resumenEgresosDia({
    gastos: [
      { categoria: 'PROVEEDORES', subcategoria: 'Bimbo', monto: 400 },
      { categoria: 'EMPLEADO', subcategoria: 'CONSUMO', monto: 35, usuario_nombre: 'Ana' },
    ],
    egresosIe: [
      { id: 'e1', categoria_nombre: 'Vales', monto: 100, ref_tabla: 'vales' },
      { id: 'e2', categoria_nombre: 'Espejo', monto: 435, ref_tabla: 'cortes_contabilidad_gastos' },
    ],
  });
  assert.equal(r.gastos_total, 435);
  assert.equal(r.consumos_total, 35);
  assert.equal(r.egresos_ie_total, 100);
  assert.equal(r.egresos_ie.length, 1);
  assert.equal(r.egresos_total_dia, 535);
});
