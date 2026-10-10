import assert from 'node:assert/strict';
import {
  ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL,
  puedeLimpiarConsultasVentaRuta,
  subcomandosVentaRutaVisibles,
} from './ventaEnRutaAcciones.js';

assert.equal(puedeLimpiarConsultasVentaRuta('Administrador', '1'), true);
assert.equal(puedeLimpiarConsultasVentaRuta('Gerente', '2'), false);
assert.equal(puedeLimpiarConsultasVentaRuta('Cajero', '3'), false);
assert.ok(!(ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL.Gerente || []).includes('ruta_limpiar_consultas'));

const hub = subcomandosVentaRutaVisibles('Administrador', '1');
assert.ok(!hub.some((s) => s.id === 'ruta_limpiar_consultas'), 'no debe aparecer en el hub');
assert.ok(hub.some((s) => s.id === 'ruta_consultas'));

console.log('ventaEnRutaAcciones.limpiar.test.mjs ok');
