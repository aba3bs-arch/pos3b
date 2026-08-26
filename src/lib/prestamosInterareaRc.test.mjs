import assert from 'node:assert/strict';
import {
  etiquetaColectaPrestamo,
  prestamoInterareaPendienteRc,
  prestamoInterareaPuedeOperarHastaRc,
  prestamoInterareaPuedeRecolectarRc,
} from './contabilidadConstants.js';
import {
  puedeRecolectarPrestamoInterareaRc,
  puedeOperarPrestamoAreaSucursal,
  puedeAbonarLiquidarPrestamoAreaSucursal,
  calcularVistaRecuperacionPrestamo,
  planRecuperacionPrestamosPorNegativo,
} from './valesPrestamos.js';

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'recuperar', saldo: 100 }),
  true,
  'con saldo pendiente se puede recolectar a RC',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'por_recolectar', saldo: 100 }),
  true,
  'por_recolectar con saldo puede ir a RC',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'recuperar', saldo: 0, abono: 500 }),
  true,
  'dinero ya separado (abono) sigue permitiendo Recolectar → RC',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'por_recolectar', saldo: 0, abono: 0 }),
  false,
  'sin saldo ni abono no aparece Recolectar',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({
    estado: 'por_recolectar',
    saldo: 100,
    rc_recibido_por: 'AMR',
  }),
  false,
  'ya recolectado a RC: se ocultan botones de recolección',
);

assert.equal(prestamoInterareaPendienteRc({ estado: 'por_recolectar', saldo: 10 }), true);
assert.equal(prestamoInterareaPendienteRc({ estado: 'recuperado', rc_recibido_por: 'X' }), false);
assert.equal(prestamoInterareaPuedeOperarHastaRc({ estado: 'recuperar', saldo: 10 }), true);
assert.equal(prestamoInterareaPuedeOperarHastaRc({ rc_recibido_por: 'X' }), false);

assert.equal(puedeOperarPrestamoAreaSucursal('Administrador'), true);
assert.equal(puedeOperarPrestamoAreaSucursal('Gerente'), true);
assert.equal(puedeOperarPrestamoAreaSucursal('Repartidor'), false);
assert.equal(puedeOperarPrestamoAreaSucursal('Cajero'), false, 'cajero no edita/ajusta');

assert.equal(puedeAbonarLiquidarPrestamoAreaSucursal('Administrador'), true);
assert.equal(puedeAbonarLiquidarPrestamoAreaSucursal('Gerente'), true);
assert.equal(puedeAbonarLiquidarPrestamoAreaSucursal('Cajero'), true, 'cajero abona/liquida');
assert.equal(puedeAbonarLiquidarPrestamoAreaSucursal('Repartidor'), false);

assert.equal(puedeRecolectarPrestamoInterareaRc('Repartidor'), true);
assert.equal(puedeRecolectarPrestamoInterareaRc('Administrador'), true);
assert.equal(puedeRecolectarPrestamoInterareaRc('Cajero'), false);

assert.match(
  etiquetaColectaPrestamo({
    colectado_por: 'JLBB',
    colectado_at: '2026-08-23T12:00:00Z',
    colectado_modulo: 'virtual',
    colectado_folio: 'REC-V-054',
  }),
  /JLBB/,
);

assert.match(
  etiquetaColectaPrestamo({
    colectado_por: 'JLBB',
    colectado_at: '2026-08-23T12:00:00Z',
    rc_recibido_por: 'AMR',
    rc_recibido_at: '2026-08-24T10:00:00Z',
    rc_monto: 500,
  }),
  /RC · AMR/,
);

assert.equal(etiquetaColectaPrestamo({ cargado_corte: true }), 'En corte · pendiente recolección');

// Alerta: préstamo 500 + venta 750 → negativo 0, recuperado 500
{
  const vista = calcularVistaRecuperacionPrestamo(
    [{ estado: 'recuperar', saldo: 500, monto: 500, origen: 'virtual' }],
    750,
  );
  assert.equal(vista.deuda, 500);
  assert.equal(vista.recuperado, 500);
  assert.equal(vista.negativo, 0);
  assert.equal(vista.visible, true);
}

// Venta parcial
{
  const vista = calcularVistaRecuperacionPrestamo(
    [{ estado: 'recuperar', saldo: 500, monto: 500 }],
    200,
  );
  assert.equal(vista.recuperado, 200);
  assert.equal(vista.negativo, 300);
}

// Sin préstamo abierto: no alerta
{
  const vista = calcularVistaRecuperacionPrestamo(
    [{ estado: 'liquidado', saldo: 0, monto: 500 }],
    100,
  );
  assert.equal(vista.visible, false);
}

// Auto-abono por caja desactivado
assert.deepEqual(
  planRecuperacionPrestamosPorNegativo([{ estado: 'recuperar', saldo: 500 }], -500),
  [],
);

assert.equal(
  calcularVistaRecuperacionPrestamo(
    [{ estado: 'recuperar', saldo: 500, monto: 500, origen: 'abarrotes', destino: 'virtual' }],
    750,
  ).visible,
  true,
  'alerta visible para el área que recibe (origen=abarrotes)',
);

console.log('prestamosInterareaRc.test.mjs OK');
