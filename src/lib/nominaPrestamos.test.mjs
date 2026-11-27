import assert from 'node:assert/strict';
import {
  cuotaDeducibleNomina,
  prestamoDeducibleEnNomina,
  ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA,
  prestamosDeduccionPorEmpleado,
  aplicarPrestamosNomina,
  nominaDescuentaPrestamos,
  PRESTAMOS_SIN_NOMINA_DESDE,
} from './nominaPrestamos.js';
import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';

assert.equal(PRESTAMOS_SIN_NOMINA_DESDE, '2026-11-27');
assert.equal(nominaDescuentaPrestamos({ inicio: '2026-11-14', fin: '2026-11-20' }), true);
assert.equal(nominaDescuentaPrestamos({ inicio: '2026-11-21', fin: '2026-11-27' }), false);
assert.equal(nominaDescuentaPrestamos({ inicio: '2026-11-28', fin: '2026-12-04' }), false);
assert.equal(nominaDescuentaPrestamos(null), false, 'sin periodo: ya no se descuenta');
assert.equal(nominaDescuentaPrestamos({}), false);

assert.equal(CUOTA_SEMANAL_MINIMA, 500);
assert.deepEqual(ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA, ['activo', 'pendiente_socio']);
assert.equal(cuotaDeducibleNomina({ saldo: 5000 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 500 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 350 }), 350, 'última semana: remanente');
assert.equal(cuotaDeducibleNomina({ saldo: 0 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: -10 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: 1000, cuota_semanal: 800 }), 500, 'ignora cuota custom > 500');

// Caso Sandra: $1500 pendiente de socio — sí era deducible (periodos anteriores al corte).
assert.equal(prestamoDeducibleEnNomina({
  estado: 'pendiente_socio',
  saldo: 1500,
  nombre_empleado: 'Sandra Lourdes Martinez Galindo',
}), true);
assert.equal(cuotaDeducibleNomina({ estado: 'pendiente_socio', saldo: 1500 }), 500);
assert.equal(prestamoDeducibleEnNomina({ estado: 'pendiente_admin', saldo: 1500 }), false);
assert.equal(cuotaDeducibleNomina({ estado: 'pendiente_admin', saldo: 1500 }), 0);
assert.equal(prestamoDeducibleEnNomina({ estado: 'rechazado', saldo: 1500 }), false);
assert.equal(prestamoDeducibleEnNomina({ estado: 'activo', saldo: 1500 }), true);

// Nombre reordenado (Sandra Lourdes Galindo Martinez ↔ Martinez Galindo)
const idx = indiceEmpleados([
  { id: '17a2deb8-ff8e-469d-b20f-048a019fefb3', nombre: 'Sandra Lourdes Martinez Galindo' },
]);
assert.equal(
  resolverClaveEmpleado({
    usuario_id: null,
    nombre_empleado: 'Sandra Lourdes Galindo Martinez',
  }, idx),
  '17a2deb8-ff8e-469d-b20f-048a019fefb3',
);

function mockSupabase(rows) {
  const api = {
    from() { return api; },
    select() { return api; },
    in() { return api; },
    gt() { return api; },
    eq() { return api; },
    order() { return Promise.resolve({ data: rows, error: null }); },
  };
  return api;
}

const sandraId = '17a2deb8-ff8e-469d-b20f-048a019fefb3';
const sandraRow = {
  id: '06639193-40e5-4af6-816b-1619094153c3',
  usuario_id: sandraId,
  nombre_empleado: 'Sandra Lourdes Martinez Galindo',
  saldo: 1500,
  estado: 'pendiente_socio',
  sucursal_id: '3B6',
};
const empleadosSandra = [{ id: sandraId, nombre: 'Sandra Lourdes Martinez Galindo', sucursal_id: '3B6' }];
const periodoAntes = { desde: '2026-11-14', hasta: '2026-11-20' };

const res = await prestamosDeduccionPorEmpleado(
  mockSupabase([sandraRow]),
  { empleados: empleadosSandra, todasSucursales: true, ...periodoAntes },
);
assert.equal(res.map[sandraId].total, 500);
assert.equal(res.map[sandraId].detalle[0].estado, 'pendiente_socio');
assert.ok(res.avisos.some((a) => /Sandra/i.test(a) && /socio/i.test(a)));

const arrendatario = await prestamosDeduccionPorEmpleado(
  mockSupabase([
    {
      id: 'p-arr',
      usuario_id: null,
      nombre_empleado: 'Sandra Lourdes Martinez Galindo',
      saldo: 800,
      estado: 'activo',
      sucursal_id: '3B6',
      notas: '[ARRENDATARIO] Fiado',
    },
    sandraRow,
  ]),
  { empleados: empleadosSandra, todasSucursales: true, ...periodoAntes },
);
assert.equal(arrendatario.map[sandraId].total, 500, 'el fiado del arrendatario no suma a nómina');
assert.equal(arrendatario.map[sandraId].detalle.length, 1);

const desdeHoy = await prestamosDeduccionPorEmpleado(
  mockSupabase([sandraRow]),
  {
    empleados: empleadosSandra,
    todasSucursales: true,
    desde: '2026-11-21',
    hasta: '2026-11-27',
  },
);
assert.deepEqual(desdeHoy.map, {}, 'a partir del 27/11/2026 ya no se descuenta en nómina');
assert.equal(desdeHoy.avisos.length, 0);

const sinFechas = await prestamosDeduccionPorEmpleado(
  mockSupabase([sandraRow]),
  { empleados: empleadosSandra, todasSucursales: true },
);
assert.deepEqual(sinFechas.map, {}, 'sin periodo (flujo actual) no descuenta');

const aplicar = await aplicarPrestamosNomina(mockSupabase([sandraRow]), {
  lineas: [{ usuario_id: sandraId, deduccion_prestamos: 500 }],
  empleados: empleadosSandra,
  periodo: { inicio: '2026-11-21', fin: '2026-11-27' },
});
assert.equal(aplicar.ok, true);

console.log('nominaPrestamos.test.mjs ok');
