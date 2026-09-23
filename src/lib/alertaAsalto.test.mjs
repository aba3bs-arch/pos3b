import assert from 'node:assert/strict';
import {
  TECLAS_MIN_ASALTO,
  ESC_TAPS_ASALTO,
  teclasSimultaneasActivanAsalto,
  mensajeAlertaAsalto,
  usuarioRecibeAlertaAsalto,
  crearDetectorTeclasAsalto,
  TEXTO_ALERTA_ASALTO,
} from './alertaAsalto.js';

assert.equal(TECLAS_MIN_ASALTO, 3);
assert.equal(ESC_TAPS_ASALTO, 5);
assert.equal(teclasSimultaneasActivanAsalto(2), false);
assert.equal(teclasSimultaneasActivanAsalto(3), true);
assert.equal(teclasSimultaneasActivanAsalto(8), true);

assert.ok(TEXTO_ALERTA_ASALTO.includes('ASALTO'));
assert.match(mensajeAlertaAsalto({ sucursal: '3B2', usuarioNombre: 'Ana', teclas: 3 }), /Ana/);
assert.match(mensajeAlertaAsalto({ sucursal: '3B2', usuarioNombre: 'Ana', teclas: 3 }), /3 teclas/);
assert.match(mensajeAlertaAsalto({ sucursal: '3B2', usuarioNombre: 'Ana', modo: 'prueba' }), /PRUEBA/);

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
let ultimoModo = null;
const det = crearDetectorTeclasAsalto({
  minimo: 3,
  escTaps: 5,
  escVentanaMs: 2500,
  onActivar: ({ modo }) => {
    activaciones += 1;
    ultimoModo = modo;
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
const codes = ['KeyA', 'KeyS', 'KeyD'];
for (const code of codes) {
  target.emit('keydown', { code, key: code, repeat: false, target: {} });
}
assert.equal(activaciones, 1);
assert.equal(ultimoModo, 'teclas');
for (const code of codes) target.emit('keyup', { code });

// Escape ×5
activaciones = 0;
for (let i = 0; i < 5; i += 1) {
  target.emit('keydown', { code: 'Escape', key: 'Escape', repeat: false, target: {} });
  target.emit('keyup', { code: 'Escape', key: 'Escape' });
}
assert.equal(activaciones, 1);
assert.equal(ultimoModo, 'escape');
detach();

console.log('alertaAsalto.test.mjs OK');
