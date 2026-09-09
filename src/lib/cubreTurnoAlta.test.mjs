import assert from 'node:assert/strict';
import { textoNotificacionPinCt } from './cubreTurnoAlta.js';

const t1 = textoNotificacionPinCt({
  nombre: 'Juan Pérez',
  soloDia: true,
  sucursales: ['FUSION', '3B2'],
  pins: [{ etiqueta: 'Fusión', pin: '1234' }],
});
assert.match(t1, /Juan Pérez/);
assert.match(t1, /solo turnos de día/);
assert.match(t1, /1234/);
assert.match(t1, /CUBRE TURNO/);
assert.match(t1, /nómina/i);

const t2 = textoNotificacionPinCt({ nombre: 'Ana', pins: [] });
assert.match(t2, /Aún no hay PIN CT/);

console.log('cubreTurnoAlta.test.mjs ok');
