import assert from 'node:assert/strict';
import {
  PREFIJO_CXC_RECOLECCION,
  esCargoDesdeRecoleccion,
  transitoIdDesdeCargoRecoleccion,
  asegurarCargoCxcDesdeRecoleccion,
} from './rutaCxc.js';

assert.equal(PREFIJO_CXC_RECOLECCION, 'rec:');

assert.equal(
  transitoIdDesdeCargoRecoleccion({
    carga_id: 'rec:abc-123',
    notas: 'otro',
  }),
  'abc-123',
);

assert.equal(
  transitoIdDesdeCargoRecoleccion({
    carga_id: null,
    notas: 'Recolección · Entrega Crédito · ficha 768 · transito:deadbeef-0001-0002-0003-000000000099',
  }),
  'deadbeef-0001-0002-0003-000000000099',
);

assert.equal(transitoIdDesdeCargoRecoleccion({ notas: 'Venta 123' }), null);
assert.equal(esCargoDesdeRecoleccion({ carga_id: 'rec:x' }), true);
assert.equal(esCargoDesdeRecoleccion({ carga_id: 'carga1', notas: 'Venta' }), false);

/**
 * Regresión: error de columna carga_id / schema cache NO debe ir a localStorage.
 * Antes faltaTabla() matcheaba "ruta_cxc"+"schema cache" y los créditos no llegaban a CxC.
 */
function mockSupabaseCargaIdMissingThenOk() {
  const inserted = [];
  const ERR_CARGA = {
    message: "Could not find the 'carga_id' column of 'ruta_cxc_movimientos' in the schema cache",
  };

  const thenable = (result) => ({
    eq() { return this; },
    order() { return this; },
    limit() { return Promise.resolve(result); },
    single() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  });

  return {
    from(table) {
      assert.equal(table, 'ruta_cxc_movimientos');
      return {
        select() {
          // Busquedas / listados: sin columna carga_id → error en 1er filtro; listados vacíos OK.
          return thenable({ data: [], error: null });
        },
        insert(rows) {
          const row = { ...rows[0] };
          return {
            select() {
              return {
                single: async () => {
                  if (row.carga_id != null) {
                    return { data: null, error: ERR_CARGA };
                  }
                  const saved = {
                    id: `cxc-${inserted.length + 1}`,
                    ...row,
                    created_at: new Date().toISOString(),
                  };
                  inserted.push(saved);
                  return { data: saved, error: null };
                },
              };
            },
          };
        },
      };
    },
    _inserted: inserted,
  };
}

{
  // Forzar el select inicial por carga_id a fallar:
  const sb = mockSupabaseCargaIdMissingThenOk();
  let selectCalls = 0;
  const origFrom = sb.from.bind(sb);
  sb.from = (table) => {
    const api = origFrom(table);
    const origSelect = api.select.bind(api);
    api.select = (...args) => {
      selectCalls += 1;
      // Primera consulta (existentes por carga_id) falla como en producción.
      if (selectCalls === 1) {
        return {
          eq() { return this; },
          order() { return this; },
          limit() {
            return Promise.resolve({
              data: null,
              error: {
                message:
                  "Could not find the 'carga_id' column of 'ruta_cxc_movimientos' in the schema cache",
              },
            });
          },
          then(resolve, reject) {
            return Promise.resolve({
              data: null,
              error: {
                message:
                  "Could not find the 'carga_id' column of 'ruta_cxc_movimientos' in the schema cache",
              },
            }).then(resolve, reject);
          },
        };
      }
      return origSelect(...args);
    };
    return api;
  };

  const r = await asegurarCargoCxcDesdeRecoleccion(sb, {
    id: 'deadbeef-0001-0002-0003-000000000099',
    num_traspaso: '768',
    monto: 150,
    cajero_nombre: 'Ana',
    sucursal_origen: '3B10',
  });
  assert.equal(r.ok, true, r.error || 'ok');
  assert.equal(r.soloLocal, undefined);
  assert.ok(sb._inserted.length >= 1, 'debió insertar en Supabase, no localStorage');
  const cargo = sb._inserted.find((x) => x.tipo === 'cargo') || sb._inserted[0];
  assert.equal(cargo.cliente_id, '3B10');
  assert.match(String(cargo.notas || ''), /transito:deadbeef/);
  assert.equal(cargo.carga_id, undefined);
}

console.log('rutaCxc.recoleccion.test.mjs ok');
