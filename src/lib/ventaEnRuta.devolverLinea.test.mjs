import assert from 'node:assert/strict';
import { disponibleEnLineaCarga } from './ventaEnRuta.js';

// Disp. = cargada − vendida − devuelta (botones Devolver/Quitar usan esto)
assert.equal(disponibleEnLineaCarga({ qty_cargada: 100, qty_vendida: 1, qty_devuelta: 0 }), 99);
assert.equal(disponibleEnLineaCarga({ qty_cargada: 1000, qty_vendida: 1, qty_devuelta: 999 }), 0);
assert.equal(disponibleEnLineaCarga({ qty_cargada: 100, qty_vendida: 1, qty_devuelta: 50 }), 49);
assert.equal(disponibleEnLineaCarga({ qty_cargada: 10, qty_vendida: 0, qty_devuelta: 0 }), 10);

/**
 * Mock mínimo para devolverLineaCargaRuta: carga + línea + CEDIS stub.
 * CEDIS se stubbea vía productos.maybeSingle + rpc fallido → fallback update.
 */
function mockDevolver({ carga, linea, stockCedis = 500 } = {}) {
  const state = {
    carga: { ...carga },
    linea: { ...linea },
    deleted: false,
    updates: [],
    productoUpdates: [],
  };

  const maybeSingleOf = (row) => ({
    maybeSingle: async () => ({ data: row ? { ...row } : null, error: null }),
  });

  return {
    state,
    rpc: async () => ({ data: null, error: { message: 'rpc missing', code: 'PGRST202' } }),
    from(table) {
      if (table === 'ruta_cargas') {
        return {
          select() {
            return {
              eq(_c, id) {
                const row = String(state.carga.id) === String(id) ? state.carga : null;
                return maybeSingleOf(row);
              },
            };
          },
        };
      }
      if (table === 'ruta_carga_lineas') {
        return {
          select() {
            return {
              eq(_c, id) {
                const row = String(state.linea.id) === String(id) && !state.deleted
                  ? state.linea
                  : null;
                return maybeSingleOf(row);
              },
            };
          },
          update(patch) {
            return {
              eq(_c, id) {
                if (String(state.linea.id) === String(id)) Object.assign(state.linea, patch);
                state.updates.push({ id, patch });
                return Promise.resolve({ data: state.linea, error: null });
              },
            };
          },
          delete() {
            return {
              eq(_c, id) {
                if (String(state.linea.id) === String(id)) state.deleted = true;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === 'productos') {
        return {
          select() {
            return {
              eq(_c, id) {
                return maybeSingleOf({
                  id,
                  nombre: state.linea.producto_nombre || id,
                  stock: stockCedis,
                  stock_sucursales: {
                    CEDIS: { cedis: stockCedis },
                  },
                });
              },
            };
          },
          update(patch) {
            return {
              eq(_c, id) {
                state.productoUpdates.push({ id, patch });
                return Promise.resolve({ data: patch, error: null });
              },
            };
          },
        };
      }
      // Tablas auxiliares (movimientos, sync) → no-op OK
      return {
        select() {
          return {
            eq() {
              return maybeSingleOf(null);
            },
            limit() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        insert() {
          return Promise.resolve({ data: null, error: null });
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

{
  const { devolverLineaCargaRuta } = await import('./ventaEnRuta.js');

  // Con ventas: Devolver sube qty_devuelta (no baja cargada)
  {
    const sb = mockDevolver({
      carga: { id: 'c1', folio: 'CR-1', estado: 'en_ruta' },
      linea: {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Malboro',
        qty_cargada: 100,
        qty_vendida: 1,
        qty_devuelta: 0,
      },
    });
    const r = await devolverLineaCargaRuta(sb, {
      cargaId: 'c1',
      lineaId: 'l1',
      cantidad: 10,
      rol: 'Administrador',
      userId: 'admin',
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.eliminada, false);
    assert.equal(sb.state.linea.qty_cargada, 100);
    assert.equal(sb.state.linea.qty_devuelta, 10);
    assert.equal(disponibleEnLineaCarga(sb.state.linea), 89);
  }

  // Quitar todo disponible con ventas
  {
    const sb = mockDevolver({
      carga: { id: 'c1', folio: 'CR-1', estado: 'en_ruta' },
      linea: {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Malboro',
        qty_cargada: 100,
        qty_vendida: 1,
        qty_devuelta: 0,
      },
    });
    const r = await devolverLineaCargaRuta(sb, {
      cargaId: 'c1',
      lineaId: 'l1',
      cantidad: 99,
      rol: 'Administrador',
      userId: 'admin',
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(sb.state.linea.qty_devuelta, 99);
    assert.equal(disponibleEnLineaCarga(sb.state.linea), 0);
  }

  // Sin ventas: Quitar todo elimina la línea
  {
    const sb = mockDevolver({
      carga: { id: 'c1', folio: 'CR-1', estado: 'en_ruta' },
      linea: {
        id: 'l2',
        carga_id: 'c1',
        producto_id: 'P2',
        producto_nombre: 'PallMall',
        qty_cargada: 50,
        qty_vendida: 0,
        qty_devuelta: 0,
      },
    });
    const r = await devolverLineaCargaRuta(sb, {
      cargaId: 'c1',
      lineaId: 'l2',
      cantidad: 50,
      rol: 'Administrador',
      userId: 'admin',
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.eliminada, true);
    assert.equal(sb.state.deleted, true);
  }

  // No permite devolver más que el disponible
  {
    const sb = mockDevolver({
      carga: { id: 'c1', folio: 'CR-1', estado: 'en_ruta' },
      linea: {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'X',
        qty_cargada: 100,
        qty_vendida: 1,
        qty_devuelta: 0,
      },
    });
    const r = await devolverLineaCargaRuta(sb, {
      cargaId: 'c1',
      lineaId: 'l1',
      cantidad: 100,
      rol: 'Administrador',
      userId: 'admin',
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /disponible/i);
  }
}

console.log('ventaEnRuta.devolverLinea.test.mjs OK');
