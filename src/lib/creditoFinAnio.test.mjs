import assert from 'node:assert/strict';
import { puedeAccionVentaRuta, subcomandosVentaRutaVisibles } from './ventaEnRutaAcciones.js';
import {
  TIPO_DEJAR,
  TIPO_RETIRAR,
  inventarioDeMovimientos,
  nombreCuentaFinAnio,
  resumenCuenta,
  resumenPorSucursal,
  codigoVisibleProducto,
  productoParaCargarFinAnio,
  sugerenciasCatalogoFinAnio,
  validarAbono,
  validarDejar,
  validarRetiro,
} from './creditoFinAnio.js';

const movs = [
  { tipo: TIPO_DEJAR, codigo: 'A1', nombre: 'Coca', cantidad: 10, importe: 200, cuenta_id: 'c1' },
  { tipo: TIPO_DEJAR, codigo: 'A1', nombre: 'Coca', cantidad: 5, importe: 100, cuenta_id: 'c1' },
  { tipo: TIPO_RETIRAR, codigo: 'A1', nombre: 'Coca', cantidad: 4, importe: 80, cuenta_id: 'c1' },
  { tipo: TIPO_DEJAR, codigo: 'B2', nombre: 'Agua', cantidad: 2, importe: 40, cuenta_id: 'c1', archived_at: '2026-01-01' },
];
const abonos = [
  { cuenta_id: 'c1', monto: 50 },
  { cuenta_id: 'c1', monto: 999, archived_at: '2026-01-01' },
];

const inv = inventarioDeMovimientos(movs);
assert.equal(inv.length, 1);
assert.equal(inv[0].cantidad, 11);
assert.equal(inv[0].valor, 220);

const res = resumenCuenta(movs, abonos);
assert.equal(res.dejado, 300);
assert.equal(res.retirado, 80);
assert.equal(res.saldoMercancia, 220);
assert.equal(res.abonado, 50);
assert.equal(res.saldo, 170);

const porSuc = resumenPorSucursal(
  [
    { id: 'c1', sucursal_id: '3b2', estado: 'abierta' },
    { id: 'c2', sucursal_id: '3B2', estado: 'cerrada' },
  ],
  [...movs, { tipo: TIPO_DEJAR, nombre: 'Sal', cantidad: 1, importe: 10, cuenta_id: 'c2' }],
  abonos,
);
const s3 = porSuc.get('3B2');
assert.equal(s3.cuentas, 2);
assert.equal(s3.abiertas, 1);
assert.equal(s3.saldoMercancia, 230);
assert.equal(s3.saldo, 180);

assert.equal(validarDejar({ nombre: '', cantidad: 1, precio: 1 }), 'Escribe el producto.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 0, precio: 1 }), 'La cantidad debe ser mayor a cero.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 1, precio: -1 }), 'El precio no puede ser negativo.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 1, precio: 0 }), '');
assert.match(validarRetiro({ cantidad: 5, disponible: 4 }), /No hay tanta/);
assert.equal(validarRetiro({ cantidad: 4, disponible: 4 }), '');
assert.match(validarAbono(0), /mayor a cero/);
assert.equal(nombreCuentaFinAnio(new Date('2026-11-18T03:00:00Z')), 'Fin de año 2026');

const catalogo = [
  { id: '93', nombre: 'Escupidor de batalla', precio: 25 },
  { id: '7501', nombre: 'Emperador Zenzo Chocotella 93g', precio: 18 },
  { id: '7502', nombre: 'MADALENAS BIMBO 93G', precio: 20 },
  { id: '7503', nombre: 'Paloma', precio: 10, codigos_alt: ['93A'] },
];
const por93 = sugerenciasCatalogoFinAnio(catalogo, '93');
assert.equal(por93.length, 1);
assert.equal(por93[0].id, '93');
assert.equal(productoParaCargarFinAnio(catalogo, '93')?.nombre, 'Escupidor de batalla');
assert.equal(codigoVisibleProducto(por93[0]), '93');
assert.equal(productoParaCargarFinAnio(catalogo, 'emperador'), null);
const porNombre = sugerenciasCatalogoFinAnio(catalogo, 'bimbo');
assert.equal(porNombre.length, 1);
assert.equal(porNombre[0].id, '7502');
assert.equal(productoParaCargarFinAnio(catalogo, '93A')?.id, '7503');

assert.equal(puedeAccionVentaRuta('Administrador', '1', 'ruta_fin_anio'), true);
assert.equal(puedeAccionVentaRuta('Gerente', '2', 'ruta_fin_anio'), true);
assert.equal(puedeAccionVentaRuta('Cajero', '3', 'ruta_fin_anio'), false);
assert.equal(puedeAccionVentaRuta('Repartidor', '4', 'ruta_fin_anio'), false);
assert.ok(subcomandosVentaRutaVisibles('Administrador', '1').some((s) => s.id === 'ruta_fin_anio'));
assert.ok(!subcomandosVentaRutaVisibles('Cajero', '3').some((s) => s.id === 'ruta_fin_anio'));

console.log('creditoFinAnio.test.mjs ok');
