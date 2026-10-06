import assert from 'node:assert/strict';
import {
  payloadTicketCargaCamion,
  registrarEventoCargaRuta,
  listarEventosCargaRuta,
  listarReporteIngresosCargaRuta,
} from './ventaEnRuta.js';

const LS_KEY = 'pos3b_ruta_carga_eventos';

function mockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
  };
  return store;
}

function mockSupabaseEventos({ failInsert = false, faltaTabla = false, rows = [] } = {}) {
  const state = { inserts: [], rows: [...rows] };
  return {
    state,
    from(table) {
      assert.equal(table, 'ruta_carga_eventos');
      return {
        insert(payload) {
          return {
            select() {
              return {
                async single() {
                  if (faltaTabla) {
                    return { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };
                  }
                  if (failInsert) {
                    return { data: null, error: { message: 'insert failed' } };
                  }
                  const row = {
                    id: `uuid-${state.inserts.length + 1}`,
                    ...(Array.isArray(payload) ? payload[0] : payload),
                    created_at: new Date().toISOString(),
                  };
                  state.inserts.push(row);
                  state.rows.unshift(row);
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            order() {
              return {
                limit(n) {
                  return Promise.resolve({
                    data: state.rows.slice(0, n),
                    error: faltaTabla
                      ? { code: 'PGRST205', message: 'Could not find the table' }
                      : null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

mockLocalStorage();

{
  const t = payloadTicketCargaCamion({
    folioEvento: 'CI-TEST-1',
    cargaFolio: 'CR-TEST',
    camionEtiqueta: 'Camión 1',
    vendedorNombre: 'Juan',
    usuarioNombre: 'Admin',
    lineas: [
      { productoId: 'P1', nombre: 'Galleta', cantidad: 3, precio: 10 },
      { producto_id: 'P2', producto_nombre: 'Agua', cantidad: 2, precio: 5 },
    ],
    reusada: true,
  });
  assert.equal(t.folio, 'CI-TEST-1');
  assert.equal(t.cargaFolio, 'CR-TEST');
  assert.equal(t.piezas, 5);
  assert.equal(t.total, 40);
  assert.equal(t.lineas.length, 2);
  assert.equal(t.reusada, true);
  assert.match(t.titulo, /CARGA/i);
}

{
  localStorage.removeItem(LS_KEY);
  const sb = mockSupabaseEventos();
  const r = await registrarEventoCargaRuta(sb, {
    cargaId: 'c1',
    cargaFolio: 'CR-1',
    camionId: 'cam1',
    camionEtiqueta: 'RT-01',
    vendedorId: 'v1',
    vendedorNombre: 'Pedro',
    usuarioId: 'u1',
    usuarioNombre: 'Ana',
    reusada: false,
    lineas: [{ productoId: 'X', nombre: 'Item', cantidad: 4, precio: 12.5 }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.evento?.folio?.startsWith('CI-'));
  assert.equal(r.ticket.piezas, 4);
  assert.equal(r.ticket.total, 50);
  assert.equal(r.nubeOk, true);
  assert.equal(sb.state.inserts.length, 1);
  const local = JSON.parse(localStorage.getItem(LS_KEY));
  assert.equal(local.length, 1);
  assert.equal(local[0].folio, r.evento.folio);
}

{
  localStorage.removeItem(LS_KEY);
  const sb = mockSupabaseEventos({ faltaTabla: true });
  const r = await registrarEventoCargaRuta(sb, {
    cargaFolio: 'CR-2',
    vendedorNombre: 'Luis',
    lineas: [{ productoId: 'Y', nombre: 'Y', cantidad: 1, precio: 8 }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.aviso);
  assert.equal(r.nubeOk, false);
  assert.equal(r.ticket.piezas, 1);
  const list = await listarEventosCargaRuta(sb, { limit: 10 });
  assert.equal(list.data.length, 1);
  assert.ok(list.aviso);
}

{
  localStorage.removeItem(LS_KEY);
  const sb = mockSupabaseEventos();
  await registrarEventoCargaRuta(sb, {
    cargaFolio: 'CR-3',
    vendedorNombre: 'Eva',
    camionEtiqueta: 'C-9',
    lineas: [{ productoId: 'Z', nombre: 'Zeta', cantidad: 2, precio: 3 }],
  });
  const rep = await listarReporteIngresosCargaRuta(sb, { limit: 20 });
  assert.ok(rep.data.length >= 1);
  assert.equal(rep.data[0].tipo_reporte, 'evento_carga');
  assert.ok(rep.data[0].ticket);
  assert.equal(rep.data[0].ticket.piezas, 2);
}

console.log('ventaEnRuta.cargaTicketRegistro.test.mjs OK');
