import assert from 'node:assert/strict';
import { resolverImpresionVentaPorMonto } from './posConfig.js';

function cfg(partial) {
  return {
    autoVenta: true,
    entregaVenta: 'imprimir',
    copias: 1,
    modos: { venta: true },
    ventaPorMonto: {
      activo: false,
      umbralMinimo: 0,
      debajoDelUmbral: 'no_imprimir',
      umbralCopiasExtra: null,
      copiasAltoMonto: 2,
    },
    ...partial,
    modos: { venta: true, ...(partial.modos || {}) },
    ventaPorMonto: {
      activo: false,
      umbralMinimo: 0,
      debajoDelUmbral: 'no_imprimir',
      umbralCopiasExtra: null,
      copiasAltoMonto: 2,
      ...(partial.ventaPorMonto || {}),
    },
  };
}

// No imprimir: autoVenta off
assert.equal(resolverImpresionVentaPorMonto(200, cfg({ autoVenta: false })).accion, 'omitir');

// No imprimir: entregaVenta ninguno
assert.equal(
  resolverImpresionVentaPorMonto(200, cfg({ entregaVenta: 'ninguno', autoVenta: true })).accion,
  'omitir',
);

// Documento venta desactivado
assert.equal(
  resolverImpresionVentaPorMonto(200, cfg({ modos: { venta: false } })).accion,
  'omitir',
);

// Umbral 150: menor no imprime (aunque activo no esté marcado, umbral > 0 aplica)
{
  const c = cfg({
    ventaPorMonto: { umbralMinimo: 150, debajoDelUmbral: 'no_imprimir', activo: false },
  });
  assert.equal(resolverImpresionVentaPorMonto(149.99, c).accion, 'omitir');
  assert.equal(resolverImpresionVentaPorMonto(150, c).accion, 'imprimir');
  assert.equal(resolverImpresionVentaPorMonto(200, c).accion, 'imprimir');
}

// Debajo del umbral: preguntar
{
  const c = cfg({
    ventaPorMonto: { activo: true, umbralMinimo: 150, debajoDelUmbral: 'preguntar' },
  });
  assert.equal(resolverImpresionVentaPorMonto(100, c).accion, 'preguntar');
  assert.equal(resolverImpresionVentaPorMonto(150, c).accion, 'imprimir');
}

console.log('posConfig.impresion.test.mjs ok');
