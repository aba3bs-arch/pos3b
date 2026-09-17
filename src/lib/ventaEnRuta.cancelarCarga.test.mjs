import assert from 'node:assert/strict';
import {
  cancelarCargaRuta,
  disponibleEnLineaCarga,
  listarReporteIngresosCargaRuta,
} from './ventaEnRuta.js';

assert.equal(disponibleEnLineaCarga({ qty_cargada: 10, qty_vendida: 0, qty_devuelta: 0 }), 10);
assert.equal(disponibleEnLineaCarga({ qty_cargada: 10, qty_vendida: 4, qty_devuelta: 2 }), 4);

/** Mock mínimo estilo supabase chain para cancelar / reporte. */
function mockSupabase({ carga, lineas = [], updateCarga, updateLinea } = {}) {
  const state = {
    carga: carga ? { ...carga } : null,
    lineas: lineas.map((l) => ({ ...l })),
    updatesCarga: [],
    updatesLinea: [],
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
                  order() {
                    return {
                      limit: async () => ({ data: state.carga ? [state.carga] : [], error: null }),
                    };
                  },
                };
              },
              order() {
                return {
                  limit: async () => ({ data: state.carga ? [state.carga] : [], error: null }),
                };
              },
            };
          },
          update(patch) {
            state.updatesCarga.push(patch);
            if (updateCarga) updateCarga(patch);
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
            state.updatesLinea.push(patch);
            if (updateLinea) updateLinea(patch);
            return {
              eq(col, id) {
                const lin = state.lineas.find((l) => String(l[col]) === String(id) || String(l.id) === String(id));
                if (lin) Object.assign(lin, patch);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };
}

// Sin privilegio
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'R1', estado: 'en_ruta' },
    lineas: [],
  });
  const r = await cancelarCargaRuta(sb, { cargaId: 'c1', rol: 'Cajero', userId: 'u1' });
  assert.equal(r.ok, false);
  assert.match(r.error, /privilegio/i);
}

// Ya cancelada
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'R1', estado: 'cancelada' },
    lineas: [{ id: 'l1', carga_id: 'c1', producto_id: 'P1', qty_cargada: 5, qty_vendida: 0, qty_devuelta: 0 }],
  });
  const r = await cancelarCargaRuta(sb, {
    cargaId: 'c1',
    rol: 'Gerente',
    userId: 'admin',
    usuarioNombre: 'Admin',
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /ya está cancelada/i);
}

// Liquidada
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'R1', estado: 'liquidada' },
    lineas: [],
  });
  const r = await cancelarCargaRuta(sb, { cargaId: 'c1', rol: 'Gerente', userId: 'admin' });
  assert.equal(r.ok, false);
  assert.match(r.error, /liquidada/i);
}

// Con ventas → no cancelar
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'R1', estado: 'en_ruta', notas: '' },
    lineas: [
      {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Agua',
        qty_cargada: 10,
        qty_vendida: 2,
        qty_devuelta: 0,
        precio: 15,
      },
    ],
  });
  const r = await cancelarCargaRuta(sb, { cargaId: 'c1', rol: 'Gerente', userId: 'admin' });
  assert.equal(r.ok, false);
  assert.match(r.error, /ventas/i);
}

// Cancelar en_ruta sin disponible (ya todo marcado devuelto) → marca cancelada sin tocar CEDIS
{
  const sb = mockSupabase({
    carga: { id: 'c1', folio: 'RC-OK', estado: 'en_ruta', notas: 'ok' },
    lineas: [
      {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Agua',
        qty_cargada: 5,
        qty_vendida: 0,
        qty_devuelta: 5,
        precio: 10,
      },
    ],
  });
  const r = await cancelarCargaRuta(sb, {
    cargaId: 'c1',
    rol: 'Administrador',
    userId: 'u-admin',
    usuarioNombre: 'Admin',
    motivo: 'Prueba',
  });
  assert.equal(r.ok, true);
  assert.equal(r.carga.estado, 'cancelada');
  assert.match(String(r.carga.notas || ''), /Cancelada/);
  assert.match(String(r.carga.notas || ''), /Prueba/);
}

// Reporte ingresos: piezas y total
{
  const sb = mockSupabase({
    carga: {
      id: 'c1',
      folio: 'RC-001',
      estado: 'en_ruta',
      vendedor_nombre: 'Juan',
      fecha: '2026-03-17',
      created_at: '2026-03-17T10:00:00Z',
    },
    lineas: [
      {
        id: 'l1',
        carga_id: 'c1',
        producto_id: 'P1',
        producto_nombre: 'Agua',
        qty_cargada: 10,
        qty_vendida: 0,
        qty_devuelta: 0,
        precio: 12.5,
      },
      {
        id: 'l2',
        carga_id: 'c1',
        producto_id: 'P2',
        producto_nombre: 'Pan',
        qty_cargada: 4,
        qty_vendida: 0,
        qty_devuelta: 0,
        precio: 20,
      },
    ],
  });
  // listarCargasRuta usa .order().limit() sin eq cuando no hay filtro
  const r = await listarReporteIngresosCargaRuta(sb, { limit: 10 });
  assert.equal(r.error, undefined);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].piezas, 14);
  assert.equal(r.data[0].total, 205); // 10*12.5 + 4*20
  assert.equal(r.data[0].tipo_reporte, 'ingreso_ruta');
  assert.equal(r.data[0].lineas.length, 2);
  assert.match(r.data[0].etiqueta, /CEDIS/i);
}

console.log('ventaEnRuta.cancelarCarga.test.mjs OK');
