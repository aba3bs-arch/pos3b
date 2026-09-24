import assert from 'node:assert/strict';
import {
  actorPuedeGastosAIndirectos,
  empleadosParaCorte,
  textoMencionaPersonalIndirecto,
  agruparEmpleadosParaSelectCorte,
  esEmpleadoConsumoPinCorte,
  empleadoPermitidoEnGastoCorte,
  gastoCorteRequierePinConsumoBeneficiario,
} from './empleadosVisibles.js';

const tienda = {
  id: 1,
  nombre: 'Ana Tienda',
  rol: 'Cajero',
  sucursal_id: 'CEDIS',
  tipo_empleado: 'tienda',
  activo: true,
};
const tiendaOtra = {
  id: 4,
  nombre: 'Beto Otra',
  rol: 'Cajero',
  sucursal_id: '5',
  tipo_empleado: 'tienda',
  activo: true,
};
const indirecto = {
  id: 2,
  nombre: 'Gonzalo Leal',
  rol: 'Técnico',
  sucursal_id: 'MAIN',
  tipo_empleado: 'indirecto',
  activo: true,
};
const luis = {
  id: 10,
  nombre: 'Luis Enrique Mada Osuna',
  rol: 'Repartidor',
  sucursal_id: 'MAIN',
  tipo_empleado: 'indirecto',
  activo: true,
};
const misael = {
  id: 11,
  nombre: 'Misael',
  rol: 'Técnico',
  sucursal_id: 'MAIN',
  tipo_empleado: 'indirecto',
  activo: true,
};
const admin = {
  id: 3,
  nombre: 'Admin',
  rol: 'Administrador',
  sucursal_id: 'MAIN',
  activo: true,
};

assert.equal(actorPuedeGastosAIndirectos('Administrador'), false);
assert.equal(esEmpleadoConsumoPinCorte(luis), true);
assert.equal(esEmpleadoConsumoPinCorte(misael), true);
assert.equal(esEmpleadoConsumoPinCorte(indirecto), false);
assert.equal(empleadoPermitidoEnGastoCorte(luis, { modulo: 'abarrotes' }), true);
assert.equal(empleadoPermitidoEnGastoCorte(luis, { modulo: 'virtual' }), true);
assert.equal(empleadoPermitidoEnGastoCorte(luis, { modulo: 'garage' }), false);
assert.equal(empleadoPermitidoEnGastoCorte(indirecto, { modulo: 'abarrotes' }), false);
assert.equal(gastoCorteRequierePinConsumoBeneficiario(luis, 'CONSUMO'), true);
assert.equal(gastoCorteRequierePinConsumoBeneficiario(tienda, 'CONSUMO'), false);

const todos = [tienda, tiendaOtra, indirecto, luis, misael, admin];

const paraAdmin = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Administrador');
assert.ok(paraAdmin.some((e) => e.id === 1), 'admin ve tienda de la sucursal');
assert.ok(!paraAdmin.some((e) => e.id === 2), 'Gonzalo (otros indirectos) no aparece');
assert.ok(!paraAdmin.some((e) => e.id === 3), 'nadie ve admins');
assert.ok(!paraAdmin.some((e) => e.id === 4), 'no ve tienda de otra sucursal');
assert.ok(paraAdmin.some((e) => e.id === 10), 'Luis Enrique visible en Virtual');
assert.ok(paraAdmin.some((e) => e.id === 11), 'Misael visible en Virtual');
assert.ok(paraAdmin.every((e) => e.id !== 10 || e.requiere_pin_consumo), 'Luis marca PIN');

// Un solo Misael aunque haya homónimos / placeholder
const misaelDup = empleadosParaCorte(
  [
    ...todos,
    { id: 99, nombre: 'Misael Garcia', rol: 'Técnico', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
    { id: 'consumo-pin:misael', nombre: 'Misael', rol: 'Indirecto', sucursal_id: 'MAIN', tipo_empleado: 'indirecto', activo: true },
  ],
  'CEDIS',
  'abarrotes',
  'Cajero',
);
const misaeles = misaelDup.filter((e) => /misael/i.test(e.nombre) || e.consumo_pin_id === 'misael');
assert.equal(misaeles.length, 1, `Misael duplicado: ${misaeles.map((e) => e.id + ':' + e.nombre).join(', ')}`);
const luises = misaelDup.filter((e) => e.consumo_pin_id === 'luis-enrique' || /luis enrique/i.test(e.nombre));
assert.equal(luises.length, 1, 'Luis Enrique una sola vez');

const gruposDup = agruparEmpleadosParaSelectCorte(misaelDup);
assert.equal(gruposDup.consumoPin.filter((e) => e.consumo_pin_id === 'misael').length, 1);
assert.equal(gruposDup.consumoPin.filter((e) => e.consumo_pin_id === 'luis-enrique').length, 1);

const paraAbarrotes = empleadosParaCorte(todos, 'CEDIS', 'abarrotes', 'Cajero');
assert.ok(paraAbarrotes.some((e) => e.id === 10));
assert.ok(paraAbarrotes.some((e) => e.id === 11));

const paraGarage = empleadosParaCorte(todos, 'CEDIS', 'garage', 'Cajero');
assert.ok(!paraGarage.some((e) => e.id === 10), 'Garage no lista Luis Enrique');
assert.ok(!paraGarage.some((e) => e.id === 11), 'Garage no lista Misael');
assert.deepEqual(paraGarage.map((e) => e.id), [1]);

const paraCajero = empleadosParaCorte(todos, 'CEDIS', 'virtual', 'Cajero');
assert.ok(paraCajero.some((e) => e.id === 1));
assert.ok(paraCajero.some((e) => e.id === 10));

const grupos = agruparEmpleadosParaSelectCorte(paraAdmin);
assert.equal(grupos.tienda.length, 1);
assert.ok(grupos.consumoPin.length >= 2, 'grupo consumo PIN con Misael y Luis');
assert.ok(grupos.consumoPin.every((e) => e.requiere_pin_consumo || esEmpleadoConsumoPinCorte(e)));

// Sin usuarios reales: placeholders fijos
const soloTienda = empleadosParaCorte([tienda], 'CEDIS', 'abarrotes', 'Cajero');
assert.ok(soloTienda.some((e) => String(e.id).startsWith('consumo-pin:') || e.nombre === 'Misael' || /luis/i.test(e.nombre)));
assert.ok(soloTienda.some((e) => /misael/i.test(e.nombre)));
assert.ok(soloTienda.some((e) => /luis/i.test(e.nombre)));

assert.equal(textoMencionaPersonalIndirecto('compra de bolsas', todos), false);
assert.equal(textoMencionaPersonalIndirecto('consumo gonzalo', todos), true);
assert.equal(textoMencionaPersonalIndirecto('PARA LUIS ENRIQUE', todos), true);
assert.equal(textoMencionaPersonalIndirecto('Misael cobró', todos), true);
assert.equal(textoMencionaPersonalIndirecto('', todos), false);

console.log('empleadosVisibles.indirectosCorte.test.mjs ok');
