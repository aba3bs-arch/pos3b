import assert from 'node:assert/strict';
import test from 'node:test';
import {
  textoEsRecarga,
  montoRecargasDeVenta,
  totalRecargasPos,
  evaluarCandadoRecargasMp,
  notaFaltanteRecargasMp,
  notaVentaRegistradaRecargasMp,
  ACCION_FALTANTE,
  ACCION_REGISTRAR_VENTA,
} from './corteCajaRecargasMp.js';

test('detecta textos de recarga', () => {
  assert.equal(textoEsRecarga('Recarga Telcel'), true);
  assert.equal(textoEsRecarga('Tiempo aire Movistar'), true);
  assert.equal(textoEsRecarga('TAE 100'), true);
  assert.equal(textoEsRecarga('Coca Cola'), false);
});

test('monto de venta por método o artículos', () => {
  assert.equal(montoRecargasDeVenta({ metodo_pago: 'Recarga MP', total: 150 }), 150);
  assert.equal(montoRecargasDeVenta({
    metodo_pago: 'Efectivo',
    total: 200,
    articulos: [
      { nombre: 'Recarga Telcel 100', qty: 1, precio: 100 },
      { nombre: 'Sabritas', qty: 1, precio: 20 },
    ],
  }), 100);
  assert.equal(montoRecargasDeVenta({ metodo_pago: 'Efectivo', articulos: [{ nombre: 'Agua', precio: 10 }] }), 0);
});

test('total neto ventas − cancelaciones', () => {
  const ventas = [
    { metodo_pago: 'Recarga', total: 200 },
    { metodo_pago: 'Efectivo', total: 50, articulos: [{ nombre: 'Pan', precio: 50 }] },
  ];
  const canc = [{ metodo_pago: 'Recarga', total: 50 }];
  assert.equal(totalRecargasPos(ventas, canc), 150);
});

test('candado: exige monto terminal', () => {
  const r = evaluarCandadoRecargasMp({ terminalRaw: '', pos: 0 });
  assert.equal(r.ok, false);
  assert.match(r.error, /terminal/i);
});

test('candado: cuadra → ok', () => {
  const r = evaluarCandadoRecargasMp({ terminalRaw: '100', pos: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.diferencia, 0);
  assert.equal(r.faltante, 0);
});

test('candado: terminal > POS exige elegir resolución', () => {
  const sin = evaluarCandadoRecargasMp({ terminalRaw: '180', pos: 100 });
  assert.equal(sin.ok, false);
  assert.equal(sin.faltante, 80);
  assert.equal(sin.montoVenta, 80);
  assert.equal(sin.requiereAceptarFaltante, true);
  assert.match(sin.error, /registrar la venta|faltante/i);
});

test('candado: aceptar faltante', () => {
  const con = evaluarCandadoRecargasMp({
    terminalRaw: '180',
    pos: 100,
    accionResolucion: ACCION_FALTANTE,
  });
  assert.equal(con.ok, true);
  assert.equal(con.faltante, 80);
  assert.equal(con.accion, ACCION_FALTANTE);
  assert.match(notaFaltanteRecargasMp(con, 'Ana'), /FALTANTE RECARGAS MP: \$80\.00/);
});

test('candado: registrar venta en POS (compat checkbox aceptoFaltante)', () => {
  const legacy = evaluarCandadoRecargasMp({
    terminalRaw: '150',
    pos: 100,
    aceptoFaltante: true,
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.faltante, 50);
  assert.equal(legacy.accion, ACCION_FALTANTE);
});

test('candado: registrar venta en POS', () => {
  const con = evaluarCandadoRecargasMp({
    terminalRaw: '150',
    pos: 100,
    accionResolucion: ACCION_REGISTRAR_VENTA,
  });
  assert.equal(con.ok, true);
  assert.equal(con.faltante, 0);
  assert.equal(con.montoVenta, 50);
  assert.equal(con.accion, ACCION_REGISTRAR_VENTA);
  assert.match(notaVentaRegistradaRecargasMp(con, 'Luis'), /VENTA RECARGAS MP REGISTRADA/);
  assert.equal(notaFaltanteRecargasMp(con, 'Luis'), '');
});

test('candado: POS > terminal exige revisión', () => {
  const sin = evaluarCandadoRecargasMp({ terminalRaw: '50', pos: 100 });
  assert.equal(sin.ok, false);
  assert.equal(sin.requiereAceptarRevision, true);
  const con = evaluarCandadoRecargasMp({ terminalRaw: '50', pos: 100, aceptoRevision: true });
  assert.equal(con.ok, true);
});
