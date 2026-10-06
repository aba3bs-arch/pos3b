import assert from 'node:assert/strict';
import { liquidarCargaRuta, disponibleEnLineaCarga, disponibleTotalCarga } from './ventaEnRuta.js';

assert.equal(disponibleEnLineaCarga({ qty_cargada: 10, qty_vendida: 3, qty_devuelta: 7 }), 0);
assert.equal(
  disponibleTotalCarga([
    { qty_cargada: 100, qty_vendida: 1, qty_devuelta: 99 },
    { qty_cargada: 50, qty_vendida: 10, qty_devuelta: 0 },
  ]),
  40,
);
assert.equal(
  disponibleTotalCarga([
    { qty_cargada: 1000, qty_vendida: 301, qty_devuelta: 699 },
  ]),
  0,
);

function mockSupabase({ carga, lineas = [] } = {}) {
  const state = {
    carga: carga ? { ...carga } : null,
    lineas: lineas.map((l) => ({ ...l })),
  };
  return {
    state,
    from(table) {
      if (table === 'ruta_cargas') {
        return {
          select() {
            return {
              eq(_col, id) {
                return {
                  maybeSingle: async () => ({
                    data: state.carga && String(state.carga.id) === String(id) ? state.carga : null,
                    error: null,
                  }),
                };
              },
            };
          },
          update(patch) {
            Object.assign(state.carga, patch);
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => ({ data: { ...state.carga }, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'ruta_carga_lineas') {
        return {
          select() {
            return {
              eq(_col, cargaId) {
                const data = state.lineas.filter((l) => String(l.carga_id) === String(cargaId));
                return Promise.resolve({ data, error: null });
              },
            };
          },
          update(patch) {
            return {
              eq(col, id) {
                const lin = state.lineas.find((l) => String(l.id) === String(id));
                if (lin) Object.assign(lin, patch);
                return Promise.resolve({ data: lin ? [lin] : [], error: null });
              },
            };
          },
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  };
}

const admin = { rol: 'Administrador', userId: 'u1', usuarioNombre: 'Admin' };

// Sin resto → liquidada
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'CR-1', estado: 'en_ruta', notas: '' },
    lineas: [
      { id: 'l1', carga_id: 'c1', producto_id: 'p1', producto_nombre: 'A', qty_cargada: 10, qty_vendida: 10, qty_devuelta: 0 },
    ],
  });
  const r = await liquidarCargaRuta(sb, { cargaId: 'c1', ...admin });
  assert.equal(r.ok, true);
  assert.equal(r.carga.estado, 'liquidada');
  assert.ok(r.carga.liquidada_at);
  assert.equal(r.restanteDevuelto, 0);
}

// Con resto sin devolverRestante → error
{
  const sb = mockSupabase({
    carga: { id: 'c2', folio: 'CR-2', estado: 'en_ruta' },
    lineas: [
      { id: 'l1', carga_id: 'c2', producto_id: 'p1', qty_cargada: 10, qty_vendida: 2, qty_devuelta: 0 },
    ],
  });
  const r = await liquidarCargaRuta(sb, { cargaId: 'c2', ...admin, devolverRestante: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /Quedan/);
  assert.equal(r.restante, 8);
}

// Ya liquidada → ok idempotente
{
  const sb = mockSupabase({
    carga: { id: 'c3', folio: 'CR-3', estado: 'liquidada', liquidada_at: '2026-10-01' },
    lineas: [],
  });
  const r = await liquidarCargaRuta(sb, { cargaId: 'c3', ...admin });
  assert.equal(r.ok, true);
  assert.equal(r.yaLiquidada, true);
}

// Cancelada → error
{
  const sb = mockSupabase({
    carga: { id: 'c4', folio: 'CR-4', estado: 'cancelada' },
    lineas: [],
  });
  const r = await liquidarCargaRuta(sb, { cargaId: 'c4', ...admin });
  assert.equal(r.ok, false);
}

console.log('ventaEnRuta.liquidarCarga.test.mjs OK');
