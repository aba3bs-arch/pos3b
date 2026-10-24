import assert from 'node:assert/strict';
import {
  calcularVirtual,
  estadoVirtualQuedoEnCierreAnterior,
  lecturaMonedaFinalVirtual,
  reponerEstadoTrasCierreVirtual,
} from './calc.js';

// 3B9, cierre V-200 (24 oct 2026, 14:25 Hermosillo). La cadena del turno sí cuadra.
const cierreV200 = {
  folio: 'V-200',
  caja_actual: 5302,
  ventas: 1049,
  detalle: {
    folio: 'V-200',
    tipo_cierre: 'cierre',
    fondo: 500,
    moneda_inicial: 10000,
    moneda_inicial_turno: 5408,
    moneda_turno_base: 5408,
    moneda_final: 4359,
    moneda_final_editada: true,
    caja_anterior: 4327,
    gastos_total: 74,
    subtotal: 975,
    faltante: 0,
    _post_recoleccion: false,
    alerta_recup_pico: 82,
    alerta_recup_liquidada: false,
  },
};

const calcCierre = calcularVirtual(
  {
    moneda_inicial: 10000,
    moneda_inicial_turno: 5408,
    moneda_final: 4359,
    moneda_final_editada: true,
    caja_anterior: 4327,
  },
  [{ monto: 74, estado_aprobacion: 'aprobado' }],
);
assert.equal(calcCierre.venta, 1049);
assert.equal(calcCierre.gastosTotal, 74);
assert.equal(calcCierre.subtotal, 975);
assert.equal(calcCierre.cajaActual, 5302);

// Pantalla que se quedó en el turno ya cerrado, con moneda final en 0 marcada como capturada.
const abiertoPegado = {
  folio: 'V-200',
  fondo: 500,
  caja_anterior: 4327,
  moneda_inicial: 10000,
  moneda_inicial_turno: 5408,
  moneda_turno_base: 5408,
  moneda_final: 0,
  moneda_final_editada: true,
  _mi_turno_inicializado: true,
  _post_recoleccion: false,
  turno_sesion: { id: 'nocturno', nombre: 'Turno nocturno' },
};

assert.equal(estadoVirtualQuedoEnCierreAnterior(abiertoPegado, cierreV200), true);
assert.equal(
  estadoVirtualQuedoEnCierreAnterior({ ...abiertoPegado, moneda_inicial_turno: 5308 }, cierreV200),
  true,
);
const fantasma = calcularVirtual(abiertoPegado, []);
assert.equal(fantasma.venta, 5408);
assert.equal(fantasma.cajaActual, 9735);

const turnoNuevo = { id: 'diurno', nombre: 'Turno diurno', hora_inicio: '07:00', hora_fin: '19:00' };
const reparado = reponerEstadoTrasCierreVirtual(abiertoPegado, cierreV200, {
  folioSiguiente: 'V-201',
  turnoSesion: turnoNuevo,
});
assert.equal(reparado.folio, 'V-201');
assert.equal(reparado.moneda_inicial_turno, 4359);
assert.equal(reparado.caja_anterior, 5302);
assert.equal(reparado.moneda_final, '');
assert.equal(reparado.moneda_final_editada, false);
assert.equal(reparado.moneda_inicial, 10000);
assert.equal(reparado.fondo, 500);
assert.equal(reparado.turno_sesion.id, 'diurno');
assert.equal(reparado.gastos, undefined);

const calcReparado = calcularVirtual(reparado, []);
assert.equal(calcReparado.venta, 0);
assert.equal(calcReparado.subtotal, 0);
assert.equal(calcReparado.cajaActual, 5302);
assert.equal(estadoVirtualQuedoEnCierreAnterior(reparado, cierreV200), false);

// Borrar la moneda final no es un conteo en cero.
const borrada = {
  moneda_inicial_turno: 5408,
  moneda_final: '',
  moneda_final_editada: true,
  caja_anterior: 5302,
};
assert.equal(lecturaMonedaFinalVirtual(borrada).capturada, false);
assert.equal(calcularVirtual(borrada, []).venta, 0);
assert.equal(calcularVirtual(borrada, []).cajaActual, 5302);

// Cajero que sí cuenta cero: la venta es toda la moneda inicial.
const enCero = {
  moneda_inicial_turno: 5408,
  moneda_final: 0,
  moneda_final_editada: true,
  caja_anterior: 100,
};
assert.equal(calcularVirtual(enCero, []).venta, 5408);

// Turno sin movimiento: solo avanza el folio, no reinventa la caja.
const cierreQuieto = {
  folio: 'V-10',
  caja_actual: 80,
  ventas: 0,
  detalle: {
    folio: 'V-10',
    tipo_cierre: 'cierre',
    moneda_inicial: 10000,
    moneda_inicial_turno: 9000,
    moneda_final: 9000,
    moneda_final_editada: true,
    caja_anterior: 80,
    subtotal: 0,
    fondo: 500,
  },
};
const quieto = {
  folio: 'V-10',
  moneda_inicial: 10000,
  moneda_inicial_turno: 9000,
  moneda_final: 9000,
  moneda_final_editada: true,
  caja_anterior: 80,
  fondo: 500,
};
assert.equal(estadoVirtualQuedoEnCierreAnterior(quieto, cierreQuieto), true);
const repQuieto = reponerEstadoTrasCierreVirtual(quieto, cierreQuieto, { folioSiguiente: 'V-11' });
assert.equal(repQuieto.folio, 'V-11');
assert.equal(repQuieto.moneda_inicial_turno, 9000);
assert.equal(repQuieto.caja_anterior, 80);
assert.equal(repQuieto.moneda_final, '');
assert.equal(repQuieto.moneda_final_editada, false);
assert.equal(calcularVirtual(repQuieto, []).venta, 0);
assert.equal(calcularVirtual(repQuieto, []).cajaActual, 80);
