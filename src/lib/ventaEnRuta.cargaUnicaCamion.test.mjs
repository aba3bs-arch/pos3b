import assert from 'node:assert/strict';
import {
  buscarCargaAbiertaCamionRuta,
  sumarLineasACargaRuta,
} from './ventaEnRuta.js';

/** Query builder thenable compatible con listarCargasRuta (order/limit/eq encadenables). */
function queryCargas(state) {
  const filters = [];
  const api = {
    eq(col, val) {
      filters.push({ col, val });
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    then(resolve, reject) {
      let data = [...state.cargas];
      for (const f of filters) {
        data = data.filter((c) => String(c[f.col] ?? '') === String(valOrEmpty(f.val)));
      }
      data.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return api;
}

function valOrEmpty(v) {
  return v;
}

function mockSupabase({ cargas = [], lineas = [] } = {}) {
  const state = {
    cargas: cargas.map((c) => ({ ...c })),
    lineas: lineas.map((l) => ({ ...l })),
    updates: [],
    inserts: [],
  };
  return {
    state,
    from(table) {
      if (table === 'ruta_cargas') {
        return {
          select() {
            return queryCargas(state);
          },
        };
      }
      if (table === 'ruta_carga_lineas') {
        return {
          select() {
            return {
              eq(_col, cargaId) {
                return Promise.resolve({
                  data: state.lineas.filter((l) => String(l.carga_id) === String(cargaId)),
                  error: null,
                });
              },
            };
          },
          update(patch) {
            return {
              eq(_col, id) {
                const lin = state.lineas.find((l) => String(l.id) === String(id));
                if (lin) Object.assign(lin, patch);
                state.updates.push({ id, patch });
                return Promise.resolve({ data: lin, error: null });
              },
            };
          },
          insert(rows) {
            const row = { id: `new-${state.inserts.length + 1}`, ...rows[0] };
            state.lineas.push(row);
            state.inserts.push(row);
            return {
              select() {
                return {
                  single: async () => ({ data: row, error: null }),
                };
              },
            };
          },
        };
      }
      throw new Error(`tabla inesperada ${table}`);
    },
  };
}

// Preferir la carga más antigua en_ruta del camión
{
  const sb = mockSupabase({
    cargas: [
      {
        id: 'c-nueva',
        folio: 'CR-NEW',
        camion_id: 'cam1',
        vendedor_id: 'v1',
        estado: 'en_ruta',
        created_at: '2026-09-22T10:00:00Z',
      },
      {
        id: 'c-vieja',
        folio: 'CR-OLD',
        camion_id: 'cam1',
        vendedor_id: 'v1',
        estado: 'en_ruta',
        created_at: '2026-09-19T10:00:00Z',
      },
      {
        id: 'c-otro',
        folio: 'CR-OTHER',
        camion_id: 'cam2',
        vendedor_id: 'v2',
        estado: 'en_ruta',
        created_at: '2026-09-10T10:00:00Z',
      },
    ],
  });
  const r = await buscarCargaAbiertaCamionRuta(sb, { camionId: 'cam1' });
  assert.equal(r.ok, true);
  assert.equal(r.carga?.id, 'c-vieja', 'debe reutilizar la carga más antigua del camión');
  assert.equal(r.carga?.folio, 'CR-OLD');
}

// Sin camión: por vendedor
{
  const sb = mockSupabase({
    cargas: [
      {
        id: 'c1',
        folio: 'CR-1',
        vendedor_id: 'vend-a',
        estado: 'en_ruta',
        created_at: '2026-09-20T00:00:00Z',
      },
    ],
  });
  const r = await buscarCargaAbiertaCamionRuta(sb, { vendedorId: 'vend-a' });
  assert.equal(r.ok, true);
  assert.equal(r.carga?.id, 'c1');
  const none = await buscarCargaAbiertaCamionRuta(sb, { vendedorId: 'otro' });
  assert.equal(none.carga, null);
}

// Sumar qty a línea existente + insertar producto nuevo
{
  const sb = mockSupabase({
    lineas: [
      {
        id: 'lin1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Agua',
        precio: 10,
        qty_cargada: 5,
        qty_vendida: 1,
        qty_devuelta: 0,
      },
    ],
  });
  const r = await sumarLineasACargaRuta(sb, 'c1', [
    { productoId: 'P1', nombre: 'Agua', precio: 12, cantidad: 3 },
    { productoId: 'P2', nombre: 'Pan', precio: 8, cantidad: 4 },
  ]);
  assert.equal(r.ok, true);
  const p1 = sb.state.lineas.find((l) => l.producto_id === 'P1');
  assert.equal(p1.qty_cargada, 8);
  assert.equal(p1.precio, 12);
  const p2 = sb.state.lineas.find((l) => l.producto_id === 'P2');
  assert.equal(p2.qty_cargada, 4);
  assert.equal(p2.producto_nombre, 'Pan');
  assert.equal(sb.state.inserts.length, 1);
  assert.equal(sb.state.updates.length, 1);
}

console.log('ventaEnRuta.cargaUnicaCamion.test.mjs OK');
