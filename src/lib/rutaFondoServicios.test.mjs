import assert from 'node:assert/strict';
import {
  CUENTA_RT_FONDO_DEFAULT,
  CUENTAS_RT,
  puedeVerSolicitudPagoServicio,
  resumirFondoPorServicio,
  sucursalesParaAlertaServicio,
  totalesFondo,
} from './rutaFondoServicios.js';

assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Cajero', nombre: 'Sandra' }), true);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Supervisor', nombre: 'Luis' }), true);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Administrador', nombre: 'Administrador principal' }), false);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Cajero', nombre: 'Creador', es_admin_principal: true }), false);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Gerente', nombre: 'Andres Marrero' }), false);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Gerente', nombre: 'Otro gerente' }), false);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Cajero', esCtMovil: true, nombre: 'CT' }), true);
assert.equal(puedeVerSolicitudPagoServicio({ rol: 'Cajero', esCubreTurno: true, nombre: 'CT caja', sucursal_id: '3B6' }), true);

const ctMovil = { esCtMovil: true, rol: 'Cajero', nombre: 'CT', ctRhId: 'rh-1' };
const coberturaHoy = {
  estado: 'aceptada',
  pin_temporal: '1234',
  sucursal_id: '3B6',
  pin_valido_desde: '2020-01-01T00:00:00-07:00',
  pin_valido_hasta: '2099-01-01T00:00:00-07:00',
};
const coberturaFutura = {
  ...coberturaHoy,
  sucursal_id: '3B7',
  pin_valido_desde: '2098-01-01T00:00:00-07:00',
};
assert.deepEqual(sucursalesParaAlertaServicio(ctMovil, 'MAIN', [coberturaHoy, coberturaFutura]), ['3B6']);
assert.deepEqual(sucursalesParaAlertaServicio(ctMovil, 'MAIN', []), []);
assert.deepEqual(
  sucursalesParaAlertaServicio({ esCubreTurno: true, rol: 'Cajero', sucursal_id: '3B10' }, 'MAIN', []),
  ['3B10'],
);

assert.equal(CUENTA_RT_FONDO_DEFAULT, 'servicios');
assert.ok(CUENTAS_RT.some((c) => c.id === 'servicios'));
assert.ok(!CUENTAS_RT.some((c) => c.id === 'luis-enrique' || c.id === 'cheche' || c.id === 'francisco'));

{
  const catalogo = [
    { clave: 'CFE', nombre: 'CFE Luz', activo: true },
    { clave: 'AGUA', nombre: 'Agua', activo: true },
  ];
  const movs = [
    { tipo: 'ingreso', servicio_clave: 'CFE', servicio_nombre: 'CFE Luz', monto: 50 },
    { tipo: 'ingreso', servicio_clave: 'CFE', monto: 50 },
    { tipo: 'egreso', servicio_clave: 'CFE', monto: 30 },
    { tipo: 'ingreso', servicio_clave: 'GAS', servicio_nombre: 'Gas', monto: 100 },
  ];
  const resumen = resumirFondoPorServicio(movs, catalogo);
  const cfe = resumen.find((r) => r.clave === 'CFE');
  assert.equal(cfe.ingresos, 100);
  assert.equal(cfe.egresos, 30);
  assert.equal(cfe.saldo, 70);
  const agua = resumen.find((r) => r.clave === 'AGUA');
  assert.equal(agua.saldo, 0);
  const gas = resumen.find((r) => r.clave === 'GAS');
  assert.equal(gas.saldo, 100);

  const t = totalesFondo(resumen);
  assert.equal(t.ingresos, 200);
  assert.equal(t.egresos, 30);
  assert.equal(t.saldo, 170);
}

console.log('rutaFondoServicios.test.mjs ok');
