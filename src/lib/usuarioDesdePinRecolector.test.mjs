import assert from 'node:assert/strict';
import { usuarioDesdePinRecolector } from './usuariosAuth.js';
import { usuarioAutorizadoLogin } from './turnos.js';
import { evaluarVinculoDispositivo } from './dispositivoUsuario.js';

function mock(repartidores, usuarios) {
  return {
    from(tabla) {
      const q = {
        select() { return q; },
        eq() { return q; },
        limit() { return q; },
        then(res, rej) {
          const data = tabla === 'repartidores' ? repartidores : usuarios;
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

const reps = [
  { id: 'rep_r', nombre: 'recolector', pin: '4321', activo: true },
  { id: 'rep_luis', nombre: 'Luis Enrique', pin: '1111', activo: true },
];
const usuarios = [
  { id: 'u-luis', nombre: 'Luis Enrique', rol: 'Repartidor', pin: '99999999', sucursal_id: 'MAIN', activo: true },
];

const suelto = await usuarioDesdePinRecolector(mock(reps, usuarios), '4321');
assert.equal(suelto.user.es_recolector_rt, true);
assert.equal(suelto.user.sucursal_id, 'MAIN');
assert.equal(suelto.user.rol, 'Repartidor');
assert.equal(suelto.user.repartidor_id, 'rep_r');

const ligado = await usuarioDesdePinRecolector(mock(reps, usuarios), '1111');
assert.equal(ligado.user.id, 'u-luis');
assert.equal(ligado.user.es_recolector_rt, undefined);

const nada = await usuarioDesdePinRecolector(mock(reps, usuarios), '0000');
assert.equal(nada.user, null);

const turno = usuarioAutorizadoLogin({ es_recolector_rt: true, rol: 'Repartidor' });
assert.equal(turno.ok, true);

const equipo = evaluarVinculoDispositivo({ es_recolector_rt: true, rol: 'Repartidor', dispositivo_id: 'otro' });
assert.equal(equipo.ok, true);
assert.equal(equipo.sinAnclaje, true);

console.log('usuarioDesdePinRecolector.test.mjs ok');
