import assert from 'node:assert/strict';
import {
  valeDebeIrAContVirtual,
  sucursalIeDesdeVale,
  unificarEgresosParaPanel,
} from './contVirtualEgresos.js';

const gasVirtual = {
  id: 'v1',
  categoria: 'gasolina',
  area: 'virtual',
  estado_aprobacion: 'aprobado',
  sucursal_id: '3B5',
  monto: 500,
  folio: 'V-1',
  nombre_empleado: 'Misael',
};
const gasAbarrotes = {
  ...gasVirtual,
  id: 'v2',
  area: 'abarrotes',
  nombre_empleado: 'Luis Enrique',
};
const gasPendiente = { ...gasVirtual, id: 'v3', estado_aprobacion: 'pendiente_admin' };
const consumoVirtual = {
  id: 'v4',
  categoria: 'consumo',
  area: 'virtual',
  estado_aprobacion: 'aprobado',
  sucursal_id: '3B5',
};
const consumoAbarrotes = { ...consumoVirtual, id: 'v5', area: 'abarrotes' };

assert.equal(valeDebeIrAContVirtual(gasVirtual), true);
assert.equal(valeDebeIrAContVirtual(gasAbarrotes), true, 'gasolina abarrotes → IE ABARROTES');
assert.equal(valeDebeIrAContVirtual(gasPendiente), false);
assert.equal(valeDebeIrAContVirtual(consumoVirtual), true);
assert.equal(valeDebeIrAContVirtual(consumoAbarrotes), false, 'consumo abarrotes no va al libro directo');

assert.equal(sucursalIeDesdeVale(gasVirtual), 'MAIN', 'gasolina sin sucursal_ie → MAIN');
assert.equal(sucursalIeDesdeVale(gasAbarrotes), 'MAIN');
assert.equal(sucursalIeDesdeVale(consumoVirtual), '3B5');
assert.equal(
  sucursalIeDesdeVale({ ...gasVirtual, sucursal_ie: '3B2' }),
  '3B2',
  'sucursal_ie explícita gana',
);
assert.equal(
  sucursalIeDesdeVale({ ...consumoVirtual, sucursal_ie: 'MAIN' }),
  'MAIN',
);

const unif = unificarEgresosParaPanel({
  egresosLibro: [{
    id: 'e1',
    fecha: '2026-09-22',
    sucursal_id: 'MAIN',
    categoria_id: 'vales',
    categoria_nombre: 'Vales',
    subcategoria_id: 'vales-gasolina',
    subcategoria_nombre: 'Gasolina',
    monto: 500,
    fuente: 'vale',
    ref_tabla: 'vales',
    ref_id: 'v2',
    cuenta: 'abarrotes',
    descripcion: 'VALE GASOLINA',
  }],
  gastosCorte: [{
    id: 'g1',
    categoria: 'VALES',
    subcategoria: 'GASOLINA',
    modulo: 'abarrotes',
    sucursal_id: '3B5',
    monto: 500,
    estado_aprobacion: 'aprobado',
    created_at: '2026-09-22T12:00:00Z',
  }, {
    id: 'g2',
    categoria: 'VALES',
    subcategoria: 'HERRAMIENTA',
    modulo: 'abarrotes',
    sucursal_id: '3B5',
    monto: 100,
    estado_aprobacion: 'aprobado',
    created_at: '2026-09-22T12:00:00Z',
  }],
  catalogo: [],
  idsGastosLiberados: new Set(['g1', 'g2']),
});

assert.ok(unif.detalle.some((d) => d.id === 'e1' && d.tienda === 'MAIN' && d.cuenta === 'abarrotes'));
assert.ok(!unif.detalle.some((d) => d.id === 'corte-g1'), 'no duplicar gasolina desde corte');
assert.ok(unif.detalle.some((d) => d.id === 'corte-g2'), 'otros vales abarrotes siguen desde corte');

console.log('contVirtualEgresos.gasolinaCentral.test.mjs ok');
