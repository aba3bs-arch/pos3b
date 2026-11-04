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

// Módulos de oficina, contabilidad y ruta (sin filtro de privilegios: administrador).
const casosOficina = [
  ['como doy de alta un empleado nuevo', 'usuarios_alta'],
  ['como creo un usuario con pin', 'usuarios_alta'],
  ['como doy de baja a un empleado', 'usuarios_baja'],
  ['como reingreso a alguien que ya se fue', 'usuarios_baja'],
  ['como cambio de tienda a un empleado', 'usuarios_baja'],
  ['como cierro la nomina de la semana', 'nomina'],
  ['como pagar a los empleados', 'nomina'],
  ['como paso dinero a tesoreria', 'tesoreria'],
  ['como se concilian las ventas de ruta', 'conciliaciones'],
  ['como cambio el tipo de cambio del dolar', 'configuracion'],
  ['como le doy acceso a un modulo a un cajero', 'configuracion'],
  ['como configuro los turnos de caja', 'configuracion_sistema'],
  ['como paso mercancia del almacen central a una tienda', 'multitienda'],
  ['quien entro al sistema', 'auditoria'],
  ['como cargo el camion', 'ruta_carga'],
  ['como vendo en ruta', 'ruta_venta'],
  ['como cancelo una venta de ruta', 'ruta_cancelacion'],
  ['como registro un gasto de ruta', 'ruta_gastos_corte'],
  ['como doy de alta un recolector en el panel rt', 'panel_rt'],
  ['como sello la liquidacion de recolecciones', 'liquidacion_recolecciones'],
  ['cuanto me deben los clientes de credito', 'credito_cartera'],
  ['como financio un prestamo en auto fin', 'auto_fin'],
  ['como doy de alta un socio 3b', 'socio_3b'],
  ['como reviso los tickets de compras', 'revision_compras'],
  ['como registro un gasto con evidencia para aprobar', 'registro_gastos'],
  ['como registro un ingreso en ie virtual', 'ie_libros'],
  ['como recibo las recolecciones en rc virtual', 'rc_virtual'],
  ['como restauro un registro del archivo', 'archivo'],
  ['como hago una evaluacion operativa', 'evaluacion_operativa'],
  ['como veo el resumen operativo y la meta del mes', 'resumen_operativo'],
  ['donde veo las estadisticas de abarrotes', 'estadisticas'],
  ['como guardo el faltante neto del reporte de inventario', 'reporte_inventario'],
  ['como resuelvo una incidencia por atender', 'incidencias_admin'],
  ['como fijo los descansos en el plan horario', 'plan_horario'],
  ['como publico una vacante', 'contratacion'],
  ['como veo las compras contra el inventario descuadradas', 'compras_vs_inventario'],
  ['como consolido los gastos por turno', 'consolidacion'],
];
{
  const fallosOficina = casosOficina.filter(([t, g]) => guia(t) !== g).map(([t, g]) => `${t} -> ${guia(t)} (esperaba ${g})`);
  assert.deepEqual(fallosOficina, []);
}

// Con privilegios de cajero, los módulos de oficina no se explican.
{
  const cajero = new Set(['Inicio', 'Mensajes', 'Ventas', 'Productos', 'Corte de caja', 'Checador', 'Compras', 'Vales y Préstamos', 'Corte Virtual', 'Corte Abarrotes', 'Corte Garage']);
  const opciones = { puedeVerModulo: (m) => cajero.has(m) };
  for (const t of ['como cierro la nomina de la semana', 'como doy de alta un empleado nuevo', 'como cargo el camion', 'quien entro al sistema']) {
    const r = responderDuda(t, opciones);
    assert.equal(r.sinPermiso, true, t);
    assert.match(r.texto, /no tiene el módulo/);
  }
  assert.equal(responderDuda('como cobrar con tarjeta', opciones).conocida, true);
  assert.equal(responderDuda('como hago un preinventario', opciones).guia, 'preinventario');
  const gasto = responderDuda('donde registro un gasto', opciones);
  assert.equal(gasto.sinPermiso, undefined);
  assert.equal(gasto.guia, 'cortes_conta');
}

// Una pregunta desconocida nunca contesta "no tengo el paso exacto".
const raro = responderDuda('xyz qwerty');
assert.equal(raro.conocida, false);
assert.doesNotMatch(raro.texto, /No tengo el paso exacto/i);
assert.match(raro.texto, /preinventario/);
assert.match(raro.texto, /solicitud abierta/);
assert.equal(responderDuda('').conocida, false);

console.log('soporteBot.test.mjs ok');
