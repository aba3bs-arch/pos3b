import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esGastoSmokingAbarrotes,
  esProveedorSmokingGasto,
  normalizarFolioSustentoSmoking,
  parseFoliosInventarioSmoking,
  aplicarMarkerSmokingComentario,
  totalIngresoMovimientosSmoking,
  resolverFolioSustentoSmoking,
  MARKER_SMOK_INV,
} from './smokingSustentoInventario.js';

test('detecta Smoking en gasto Abarrotes', () => {
  assert.equal(
    esGastoSmokingAbarrotes('abarrotes', { categoria: 'PROVEEDORES', subcategoria: 'SMOKING' }),
    true,
  );
  assert.equal(
    esGastoSmokingAbarrotes('abarrotes', { categoria: 'PROVEEDORES', subcategoria: 'COCA COLA' }),
    false,
  );
  assert.equal(
    esGastoSmokingAbarrotes('virtual', { categoria: 'PROVEEDORES', subcategoria: 'SMOKING' }),
    false,
  );
});

test('esProveedorSmokingGasto acepta variantes', () => {
  assert.equal(esProveedorSmokingGasto({ subcategoria: 'EsmoKing' }), true);
  assert.equal(esProveedorSmokingGasto({ comentario: 'pago marlboro' }), true);
  assert.equal(esProveedorSmokingGasto({ subcategoria: 'BIMBO' }), false);
});

test('normaliza folios ING corto, CMP y trp', () => {
  assert.equal(normalizarFolioSustentoSmoking('ing-0309-1'), 'ING-0309-0001');
  assert.equal(normalizarFolioSustentoSmoking('ING-0309-0001'), 'ING-0309-0001');
  assert.equal(normalizarFolioSustentoSmoking('ing-20260903-0007'), 'ING-20260903-0007');
  assert.equal(normalizarFolioSustentoSmoking('CMP-a1b2c3d4'), 'CMP-A1B2C3D4');
  assert.equal(normalizarFolioSustentoSmoking('trp-20'), 'trp-0020');
  assert.equal(normalizarFolioSustentoSmoking('trp0020'), 'trp-0020');
});

test('parseFoliosInventarioSmoking', () => {
  assert.deepEqual(parseFoliosInventarioSmoking('ING-1, CMP-2; trp-3'), ['ING-1', 'CMP-2', 'trp-3']);
});

test('aplicarMarkerSmokingComentario', () => {
  const m = `${MARKER_SMOK_INV}ING-0309-0001`;
  assert.match(aplicarMarkerSmokingComentario('pago', m), /SMOK_INV:ING-0309-0001/);
});

test('totalIngresoMovimientosSmoking usa tarifa ruta Smoking/Marlboro', () => {
  const { total, hayCigarro } = totalIngresoMovimientosSmoking([
    {
      producto_nombre: 'Smoking Rojo',
      cantidad: 10,
      departamento: 'CIGARROS',
      meta: { precio: 2.1 },
    },
    {
      producto_nombre: 'Marlboro Rojo',
      cantidad: 5,
      departamento: 'CIGARROS',
      meta: { precio: 6 },
    },
    {
      producto_nombre: 'Sabritas',
      cantidad: 100,
      meta: { precio: 1 },
    },
  ]);
  assert.equal(hayCigarro, true);
  // 10*2.10 + 5*6 = 21 + 30 = 51
  assert.equal(total, 51);
});

function mockSupabaseMovimientos(rowsByContains) {
  return {
    from(table) {
      if (table !== 'movimientos_inventario') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          gte() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
          contains() {
            return this;
          },
          filter() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      const api = {
        _tipo: null,
        _folio: null,
        select() {
          return this;
        },
        eq(col, val) {
          if (col === 'tipo') this._tipo = val;
          return this;
        },
        contains(_col, obj) {
          this._folio = obj?.folio;
          return this;
        },
        filter(expr, _op, val) {
          if (String(expr).includes('folio')) this._folio = val;
          return this;
        },
        order() {
          return this;
        },
        limit() {
          const folio = this._folio;
          const tipo = this._tipo;
          const data = (rowsByContains || []).filter(
            (r) =>
              (!tipo || r.tipo === tipo) &&
              String(r.meta?.folio || '') === String(folio || ''),
          );
          return Promise.resolve({ data, error: null });
        },
      };
      return api;
    },
  };
}

test('resolverFolioSustentoSmoking acepta ING en MAIN para corte de tienda', async () => {
  const supabase = mockSupabaseMovimientos([
    {
      id: 'm1',
      tipo: 'entrada',
      producto_nombre: 'Smoking Azul',
      cantidad: 100,
      departamento: 'CIGARROS',
      sucursal_id: 'MAIN',
      meta: { folio: 'ING-0309-0001', precio: 2.1 },
    },
  ]);
  const r = await resolverFolioSustentoSmoking(supabase, {
    folio: 'ING-0309-0001',
    sucursal: '3B2',
  });
  assert.equal(r.ok, true);
  assert.equal(r.tipo, 'ingreso');
  assert.equal(r.folio, 'ING-0309-0001');
  assert.equal(r.total, 210);
  assert.equal(r.fuente, 'movimientos_inventario');
});

test('resolverFolioSustentoSmoking falla si ING es de otra tienda (no MAIN/CEDIS)', async () => {
  const supabase = mockSupabaseMovimientos([
    {
      id: 'm2',
      tipo: 'entrada',
      producto_nombre: 'Smoking',
      cantidad: 10,
      sucursal_id: '3B5',
      meta: { folio: 'ING-0309-0002', precio: 2.1 },
    },
  ]);
  const r = await resolverFolioSustentoSmoking(supabase, {
    folio: 'ING-0309-0002',
    sucursal: '3B2',
  });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /otra sucursal/i);
});
