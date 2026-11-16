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
  buscarCierreDiarioExistente,
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

/** Supabase mínimo que aplica filtros, orden y tope como la base real. */
function fakeCierres(filas) {
  return {
    from: () => {
      let rows = [...filas];
      const q = {
        select: () => q,
        eq: (col, val) => {
          rows = rows.filter((r) => (col === 'detalle->>tipo_cierre' ? r.detalle?.tipo_cierre : r[col]) === val);
          return q;
        },
        in: (col, vals) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return q;
        },
        gte: (col, val) => {
          rows = rows.filter((r) => r[col] >= val);
          return q;
        },
        lte: (col, val) => {
          rows = rows.filter((r) => r[col] <= val);
          return q;
        },
        order: (col) => {
          rows = rows.sort((a, b) => (a[col] < b[col] ? 1 : -1));
          return q;
        },
        limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      };
      return q;
    },
  };
}

test('encuentra el corte general aunque haya muchos cierres del cajero después', async () => {
  const fila = (folio, createdAt, detalle) => ({
    folio, modulo: 'abarrotes', sucursal_id: '3B5', created_at: createdAt, deleted_at: null, detalle,
  });
  const cga = (n, fecha, createdAt) => fila(`CGA-0000${n}`, createdAt, { tipo_cierre: TIPO_CIERRE_DIARIO, fecha_negocio: fecha });
  const cajero = (n, createdAt) => fila(`AB-${n}`, createdAt, { tipo_cierre: TIPO_CIERRE_OPERATIVO });
  // Caso real de 3B5 el 16/11: tres cortes generales y los cierres del cajero de esos días.
  const supabase = fakeCierres([
    cajero(212, '2026-11-13T14:41:58.000Z'),
    cajero(213, '2026-11-14T02:40:18.000Z'),
    cga(1, '2026-11-13', '2026-11-14T06:59:59.999Z'),
    cajero(214, '2026-11-14T14:22:57.000Z'),
    cajero(215, '2026-11-15T02:29:41.000Z'),
    cga(2, '2026-11-14', '2026-11-15T06:59:59.999Z'),
    cajero(216, '2026-11-15T15:33:54.000Z'),
    cga(3, '2026-11-15', '2026-11-16T06:59:59.999Z'),
    { ...cga(9, '2026-11-13', '2026-11-14T06:59:59.999Z'), sucursal_id: '3B6' },
  ]);

  const d13 = await buscarCierreDiarioExistente(supabase, { sucursal: '3B5', fecha: '2026-11-13' });
  assert.equal(d13.data?.folio, 'CGA-00001');
  assert.equal(d13.data?.sucursal_id, '3B5');
  const d15 = await buscarCierreDiarioExistente(supabase, { sucursal: '3B5', fecha: '2026-11-15' });
  assert.equal(d15.data?.folio, 'CGA-00003');
  const d16 = await buscarCierreDiarioExistente(supabase, { sucursal: '3B5', fecha: '2026-11-16' });
  assert.equal(d16.data, null);
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
