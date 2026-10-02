import assert from 'node:assert/strict';
import {
  AMBITO_PROVEEDOR_CEDIS,
  AMBITO_PROVEEDOR_TIENDA,
  ambitoProveedorParaSucursal,
  filtrarProveedoresPorAmbito,
  normalizarAmbitoProveedor,
  payloadAmbitoAlGuardarProveedor,
} from './proveedoresAmbito.js';

{
  assert.equal(ambitoProveedorParaSucursal('CEDIS'), AMBITO_PROVEEDOR_CEDIS);
  assert.equal(ambitoProveedorParaSucursal('MAIN'), AMBITO_PROVEEDOR_TIENDA); // MAIN = admin, no almacén
  assert.equal(ambitoProveedorParaSucursal('3B5'), AMBITO_PROVEEDOR_TIENDA);
  assert.equal(normalizarAmbitoProveedor('CEDIS'), AMBITO_PROVEEDOR_CEDIS);
  assert.equal(normalizarAmbitoProveedor(''), AMBITO_PROVEEDOR_TIENDA);
}

{
  const list = [
    { id: '1', nombre: 'Coca Cola', ambito: 'tienda' },
    { id: '2', nombre: 'CEDIS LAS 3B', ambito: 'cedis' },
    { id: '3', nombre: 'Tabacos del Norte', ambito: 'cedis' },
    { id: '4', nombre: 'Sabritas', ambito: 'tienda' },
  ];
  const enCedis = filtrarProveedoresPorAmbito(list, 'CEDIS');
  assert.deepEqual(enCedis.map((p) => p.id).sort(), ['2', '3']);
  const enTienda = filtrarProveedoresPorAmbito(list, '3B5');
  assert.deepEqual(enTienda.map((p) => p.id).sort(), ['1', '4']);
  // CEDIS LAS 3B no aparece en tienda
  assert.equal(enTienda.some((p) => p.nombre === 'CEDIS LAS 3B'), false);
  // MAIN (admin) ve catálogo de tiendas, no el de almacén
  assert.deepEqual(filtrarProveedoresPorAmbito(list, 'MAIN').map((p) => p.id).sort(), ['1', '4']);
}

{
  // Fallback sin columna ambito: CEDIS solo CEDIS LAS 3B; tienda excluye ese nombre
  const list = [
    { id: '1', nombre: 'Coca Cola' },
    { id: '2', nombre: 'CEDIS LAS 3B' },
  ];
  assert.deepEqual(filtrarProveedoresPorAmbito(list, 'CEDIS').map((p) => p.id), ['2']);
  assert.deepEqual(filtrarProveedoresPorAmbito(list, '3B2').map((p) => p.id), ['1']);
}

{
  const okCedis = payloadAmbitoAlGuardarProveedor({ sucursal: 'CEDIS' });
  assert.equal(okCedis.ok, true);
  assert.equal(okCedis.ambito, AMBITO_PROVEEDOR_CEDIS);
  const okTienda = payloadAmbitoAlGuardarProveedor({ sucursal: '3B5' });
  assert.equal(okTienda.ambito, AMBITO_PROVEEDOR_TIENDA);

  const cruzado = payloadAmbitoAlGuardarProveedor({
    sucursal: '3B5',
    editId: 'x',
    rowActual: { ambito: 'cedis', nombre: 'Tabacos' },
  });
  assert.equal(cruzado.ok, false);
  assert.match(cruzado.error, /CEDIS/);
}

console.log('proveedoresAmbito.test.mjs ok');
