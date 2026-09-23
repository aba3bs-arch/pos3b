import assert from 'node:assert/strict';
import {
  TECLAS_MIN_ASALTO,
  teclasSimultaneasActivanAsalto,
  mensajeAlertaAsalto,
  usuarioRecibeAlertaAsalto,
  crearDetectorTeclasAsalto,
  TEXTO_ALERTA_ASALTO,
} from './alertaAsalto.js';

assert.equal(TECLAS_MIN_ASALTO, 5);
assert.equal(teclasSimultaneasActivanAsalto(4), false);
assert.equal(teclasSimultaneasActivanAsalto(5), true);
assert.equal(teclasSimultaneasActivanAsalto(8), true);

assert.ok(TEXTO_ALERTA_ASALTO.includes('ASALTO'));
assert.match(mensajeAlertaAsalto({ sucursal: '3B2', usuarioNombre: 'Ana', teclas: 5 }), /Ana/);
assert.match(mensajeAlertaAsalto({ sucursal: '3B2', usuarioNombre: 'Ana', teclas: 5 }), /5 teclas/);

assert.equal(usuarioRecibeAlertaAsalto({ rol: 'Administrador', sucursal_id: '3B2' }), true);
assert.equal(usuarioRecibeAlertaAsalto({ rol: 'Gerente', sucursal_id: '3B5' }), true);
assert.equal(usuarioRecibeAlertaAsalto({ rol: 'Cajero', sucursal_id: '3B2' }), false);
assert.equal(
  usuarioRecibeAlertaAsalto({
    rol: 'Empleado',
    sucursal_id: 'MAIN',
    tipo_empleado: 'indirecto',
  }),
  true,
);
assert.equal(usuarioRecibeAlertaAsalto({ rol: 'Cajero', esCtMovil: true }), false);

let activaciones = 0;
const det = crearDetectorTeclasAsalto({
  minimo: 5,
  onActivar: () => {
    activaciones += 1;
  },
});

const target = {
  listeners: {},
  addEventListener(type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  },
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  },
  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event);
  },
};

const detach = det.attach(target);
const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'];
for (const code of codes) {
  target.emit('keydown', { code, repeat: false, target: {} });
}
assert.equal(activaciones, 1);
// Same chord: no second fire until all keys up
target.emit('keydown', { code: 'KeyH', repeat: false, target: {} });
assert.equal(activaciones, 1);
for (const code of codes) {
  target.emit('keyup', { code });
}
target.emit('keyup', { code: 'KeyH' });
// New chord
for (const code of codes) {
  target.emit('keydown', { code, repeat: false, target: {} });
}
assert.equal(activaciones, 2);
detach();

console.log('alertaAsalto.test.mjs OK');
