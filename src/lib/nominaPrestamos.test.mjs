import assert from 'node:assert/strict';
import {
  cuotaDeducibleNomina,
  prestamoDeducibleEnNomina,
  ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA,
  prestamosDeduccionPorEmpleado,
} from './nominaPrestamos.js';
import { CUOTA_SEMANAL_MINIMA } from './contabilidadConstants.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';

assert.equal(CUOTA_SEMANAL_MINIMA, 500);
assert.deepEqual(ESTADOS_PRESTAMO_DEDUCIBLE_NOMINA, ['activo', 'pendiente_socio']);
assert.equal(cuotaDeducibleNomina({ saldo: 5000 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 500 }), 500);
assert.equal(cuotaDeducibleNomina({ saldo: 350 }), 350, 'última semana: remanente');
assert.equal(cuotaDeducibleNomina({ saldo: 0 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: -10 }), 0);
assert.equal(cuotaDeducibleNomina({ saldo: 1000, cuota_semanal: 800 }), 500, 'ignora cuota custom > 500');

// Caso Sandra: $1500 pendiente de socio — sí debe descontar en nómina.
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

// Mock supabase: Sandra pendiente_socio debe mapear cuota 500
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
const res = await prestamosDeduccionPorEmpleado(
  mockSupabase([{
    id: '06639193-40e5-4af6-816b-1619094153c3',
    usuario_id: sandraId,
    nombre_empleado: 'Sandra Lourdes Martinez Galindo',
    saldo: 1500,
    estado: 'pendiente_socio',
    sucursal_id: '3B6',
  }]),
  {
    empleados: [{ id: sandraId, nombre: 'Sandra Lourdes Martinez Galindo', sucursal_id: '3B6' }],
    todasSucursales: true,
  },
);
assert.equal(res.map[sandraId].total, 500);
assert.equal(res.map[sandraId].detalle[0].estado, 'pendiente_socio');
assert.ok(res.avisos.some((a) => /Sandra/i.test(a) && /socio/i.test(a)));

console.log('nominaPrestamos.test.mjs ok');
