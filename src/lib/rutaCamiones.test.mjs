import assert from 'node:assert/strict';
import {
  etiquetaCamion,
  slugCodigoCamion,
  validarCamionForm,
  crearCamionRuta,
  listarCamionesRuta,
  AVISO_FALTA_RUTA_CAMIONES,
} from './rutaCamiones.js';
import { puedeAccionVentaRuta } from './ventaEnRutaAcciones.js';

assert.equal(slugCodigoCamion('cam 01'), 'CAM-01');
assert.equal(slugCodigoCamion('  Camión Norte  '), 'CAMION-NORTE');
assert.equal(etiquetaCamion({ codigo: 'CAM-01', alias: 'Norte' }), 'CAM-01 · Norte');
assert.equal(etiquetaCamion({ codigo: 'CAM-02', placa: 'ABC123' }), 'CAM-02 · ABC123');

{
  const bad = validarCamionForm({ codigo: '', alias: '', placa: '' });
  assert.equal(bad.ok, false);
  const noAsig = validarCamionForm({ codigo: 'CAM-1' });
  assert.equal(noAsig.ok, false);
  assert.match(noAsig.error, /Asigna/i);
  const ok = validarCamionForm({ codigo: 'cam-3', usuarioId: 'u1' });
  assert.equal(ok.ok, true);
  assert.equal(ok.codigo, 'CAM-3');
}

{
  const r = await crearCamionRuta(null, { codigo: 'CAM-1', usuarioId: 'u1' });
  assert.equal(r.ok, false);
  assert.match(r.error, /conexión/i);
}

{
  const r = await listarCamionesRuta(null);
  assert.deepEqual(r.data, []);
}

// Mock: crear + listar
{
  const store = [];
  const sb = {
    from(table) {
      assert.equal(table, 'ruta_camiones');
      return {
        select() {
          return {
            order: async () => ({ data: [...store], error: null }),
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: store[0] || null, error: null }),
                  };
                },
                maybeSingle: async () => ({ data: store[0] || null, error: null }),
              };
            },
          };
        },
        insert(rows) {
          const row = { id: `c${store.length + 1}`, ...rows[0] };
          store.push(row);
          return {
            select() {
              return {
                single: async () => ({ data: row, error: null }),
              };
            },
          };
        },
      };
    },
  };

  const created = await crearCamionRuta(sb, {
    codigo: 'cam-01',
    alias: 'Unidad 1',
    usuarioId: 'u-rep',
  });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.camion.codigo, 'CAM-01');
  assert.equal(created.camion.usuario_id, 'u-rep');

  const listed = await listarCamionesRuta(sb);
  assert.equal(listed.data.length, 1);
}

// Privilegio hub
assert.equal(
  puedeAccionVentaRuta('Administrador', '1', 'ruta_camiones', { porRol: {}, acciones: {} }),
  true,
);
assert.equal(
  puedeAccionVentaRuta('Repartidor', '2', 'ruta_camiones', {
    porRol: { Repartidor: ['Venta en Ruta'] },
    acciones: {},
  }),
  false,
);

// Aviso tabla faltante
{
  const sb = {
    from() {
      return {
        select() {
          return {
            order: async () => ({
              data: null,
              error: { message: 'relation "ruta_camiones" does not exist' },
            }),
          };
        },
      };
    },
  };
  const r = await listarCamionesRuta(sb);
  assert.equal(r.aviso, AVISO_FALTA_RUTA_CAMIONES);
  assert.deepEqual(r.data, []);
}

console.log('rutaCamiones.test.mjs OK');
