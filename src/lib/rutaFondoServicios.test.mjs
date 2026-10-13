import assert from 'node:assert/strict';
import {
  resumirFondoPorServicio,
  totalesFondo,
} from './rutaFondoServicios.js';

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
