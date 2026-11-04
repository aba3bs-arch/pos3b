import assert from 'node:assert/strict';
import { responderDuda } from './soporteBot.js';

const guia = (t) => responderDuda(t).guia;

// La duda del chat: debe responder el preinventario, aunque esté mal escrita.
for (const t of [
  'como hacer preinventario',
  'como hacer preimventario',
  'como hago un pre inventario',
  'Como hacer PRE-INVENTARIO?',
  'preinventaro',
  'ayuda con el preinbentario',
  'quiero hacer un conteo previo',
]) {
  assert.equal(guia(t), 'preinventario', t);
}
assert.match(responderDuda('como hacer preinventario').texto, /Nueva plantilla/);

// Las guías anteriores siguen respondiendo.
assert.equal(guia('no imprime la impresora'), 'equipo');
assert.equal(guia('la inpresora se atora'), 'equipo');
assert.equal(guia('se me olvido mi pin'), 'login');
assert.equal(guia('como cobrar con tarjeta'), 'cobrar');
assert.equal(guia('como hago un ingreso de mercancia'), 'ingreso');
assert.equal(guia('no cuadra el corte'), 'corte');
assert.equal(guia('no me deja marcar mi entrada en el checador'), 'checador');
assert.equal(guia('como mando mercancia a otra tienda con un traspaso'), 'traspaso');
assert.equal(guia('no hay internet'), 'red');
assert.equal(guia('como pido un cubre turno'), 'cubre');

// Cobertura de los módulos del cajero (con faltas de ortografía).
const casos = [
  ['como cancelo un ticket', 'cancelar_venta'],
  ['como cancelar una venta', 'cancelar_venta'],
  ['quiero poner un gasto en corte abarrotes', 'cortes_conta'],
  ['como cobro un credito de ruta', 'cobranza'],
  ['como recibo mercancia de compras', 'compras'],
  ['olvide marcar mi salida', 'olvide_marcar'],
  ['me aparece como falta', 'resumen_dias'],
  ['como imprimir un vale', 'vales'],
  ['como abono un pagare', 'pagare'],
  ['checklist', 'checklist'],
  ['quiero reportar una incidencia', 'incidencias'],
  ['donde estan los tutoriales', 'tutorial'],
  ['como uso el escaner de caja en el celular', 'escaner'],
  ['como escaneo un producto en la venta', 'cobrar'],
  ['como veo los proveedores', 'proveedores'],
  ['como pido un prestamo', 'prestamos'],
  ['como veo mis reportes', 'reportes'],
  ['como consulto una venta anterior', 'consultas'],
  ['como doy de alta un producto', 'productos'],
  ['como mando un mensage a un compañero', 'mensajes'],
];
const fallos = casos.filter(([t, g]) => guia(t) !== g).map(([t, g]) => `${t} -> ${guia(t)} (esperaba ${g})`);
assert.deepEqual(fallos, []);
assert.equal(guia('como pedir mercancia'), 'compras');
assert.equal(guia('como veo el inventario'), 'productos');
assert.equal(guia('cambio de turno'), 'cubre');

// Una pregunta desconocida nunca contesta "no tengo el paso exacto".
const raro = responderDuda('xyz qwerty');
assert.equal(raro.conocida, false);
assert.doesNotMatch(raro.texto, /No tengo el paso exacto/i);
assert.match(raro.texto, /preinventario/);
assert.match(raro.texto, /solicitud abierta/);
assert.equal(responderDuda('').conocida, false);

console.log('soporteBot.test.mjs ok');
