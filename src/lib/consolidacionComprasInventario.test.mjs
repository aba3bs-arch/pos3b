/**
 * Tests unitarios — consolidación compras ↔ inventario ↔ gastos.
 * Ejecutar: node --test src/lib/consolidacionComprasInventario.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS,
  clasificarEstadoFila,
  compararProductosTicketVsInventario,
  consolidarEventos,
  foliosDesdeComentarioGasto,
  resumirConsolidacion,
} from './consolidacionComprasInventario.js';

describe('foliosDesdeComentarioGasto', () => {
  it('extrae SMOK_INV y TRP_INV', () => {
    const a = foliosDesdeComentarioGasto('PAGO · SMOK_INV:ING-5-0809-0001,CMP-5-AABBCCDD');
    assert.ok(a.some((f) => /^ING-/i.test(f)));
    assert.ok(a.some((f) => /^CMP-/i.test(f)));
    const b = foliosDesdeComentarioGasto('TRASPASO · TRP_INV:trp-5-0020');
    assert.ok(b.some((f) => /^trp-/i.test(f)));
  });
});

describe('compararProductosTicketVsInventario', () => {
  it('detecta productos faltantes por qty', () => {
    const { faltantes } = compararProductosTicketVsInventario(
      [
        { id: 'p1', nombre: 'Coca 600', qty: 10, costo: 12 },
        { id: 'p2', nombre: 'Sabritas', qty: 5, costo: 8 },
      ],
      [{ id: 'p1', nombre: 'Coca 600', qty: 7, costo: 12 }],
    );
    assert.equal(faltantes.length, 2);
    const coca = faltantes.find((f) => f.id === 'p1');
    assert.equal(coca.qty_faltante, 3);
    const sab = faltantes.find((f) => f.id === 'p2');
    assert.equal(sab.qty_faltante, 5);
  });
});

describe('consolidarEventos', () => {
  it('marca sin_gasto cuando hay compra+inventario sin gasto', () => {
    const compraId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const filas = consolidarEventos({
      compras: [
        {
          id: compraId,
          sucursal_id: '3B5',
          estado: 'recibida',
          total: 100,
          notas: 'Ticket proveedor: $100.00 · Folio inv CMP-5-AAAAAAAA',
          items: [{ id: 'p1', nombre: 'Prod', qty: 2, costo: 50 }],
          proveedores: { nombre: 'Demo' },
          created_at: '2026-09-01T15:00:00.000Z',
        },
      ],
      movimientos: [
        {
          id: 'm1',
          tipo: 'entrada',
          modo: 'compra',
          producto_id: 'p1',
          producto_nombre: 'Prod',
          cantidad: 2,
          sucursal_id: '3B5',
          meta: { folio: 'CMP-5-AAAAAAAA', precio: 50 },
          created_at: '2026-09-01T15:01:00.000Z',
        },
      ],
      traspasos: [],
      gastos: [],
    });
    assert.equal(filas.length, 1);
    assert.equal(filas[0].estado, ESTADOS.SIN_GASTO);
    assert.equal(filas[0].monto_ticket, 100);
  });

  it('detecta gasto duplicado y productos faltantes', () => {
    const compraId = '11111111-2222-3333-4444-555555555555';
    const filas = consolidarEventos({
      compras: [
        {
          id: compraId,
          sucursal_id: '3B5',
          estado: 'recibida',
          total: 200,
          notas: 'Folio inv CMP-5-11111111',
          items: [
            { id: 'a', nombre: 'A', qty: 4, costo: 25 },
            { id: 'b', nombre: 'B', qty: 4, costo: 25 },
          ],
          proveedores: { nombre: 'Smoking' },
          created_at: '2026-09-02T12:00:00.000Z',
        },
      ],
      movimientos: [
        {
          id: 'm1',
          tipo: 'entrada',
          producto_id: 'a',
          producto_nombre: 'A',
          cantidad: 4,
          sucursal_id: '3B5',
          meta: { folio: 'CMP-5-11111111', precio: 25 },
          created_at: '2026-09-02T12:01:00.000Z',
        },
      ],
      gastos: [
        {
          id: 'g1',
          sucursal_id: '3B5',
          categoria: 'PROVEEDORES',
          subcategoria: 'SMOKING',
          comentario: 'SMOK_INV:CMP-5-11111111',
          monto: 200,
          created_at: '2026-09-02T18:00:00.000Z',
        },
        {
          id: 'g2',
          sucursal_id: '3B5',
          categoria: 'PROVEEDORES',
          subcategoria: 'SMOKING',
          comentario: 'SMOK_INV:CMP-5-11111111',
          monto: 200,
          created_at: '2026-09-02T19:00:00.000Z',
        },
      ],
    });
    const fila = filas.find((f) => f.tipo === 'compra');
    assert.ok(fila);
    assert.equal(fila.n_gastos, 2);
    assert.ok(fila.productos_faltantes.some((p) => p.id === 'b'));
    // productos_faltantes tiene prioridad sobre duplicado en clasificarEstadoFila
    assert.equal(fila.estado, ESTADOS.PRODUCTOS_FALTANTES);
  });

  it('marca gasto sin ingreso', () => {
    const filas = consolidarEventos({
      compras: [],
      movimientos: [],
      traspasos: [],
      gastos: [
        {
          id: 'gx',
          sucursal_id: 'FUSION',
          categoria: 'PROVEEDORES',
          subcategoria: 'BIMBO',
          comentario: 'pago fantasma',
          monto: 350,
          created_at: '2026-09-03T10:00:00.000Z',
        },
      ],
    });
    assert.equal(filas.length, 1);
    assert.equal(filas[0].estado, ESTADOS.GASTO_SIN_INGRESO);
  });

  it('liga gasto por soft-match de monto', () => {
    const filas = consolidarEventos({
      compras: [],
      movimientos: [
        {
          id: 'm1',
          tipo: 'entrada',
          modo: 'masivo',
          producto_id: 'x',
          producto_nombre: 'X',
          cantidad: 10,
          sucursal_id: '3B7',
          meta: { folio: 'ING-7-0509-0003', precio: 15 },
          created_at: '2026-09-05T14:00:00.000Z',
        },
      ],
      gastos: [
        {
          id: 'g1',
          sucursal_id: '3B7',
          categoria: 'PROVEEDORES',
          subcategoria: 'OTROS',
          comentario: 'mercancia',
          monto: 150,
          created_at: '2026-09-05T20:00:00.000Z',
        },
      ],
    });
    const ing = filas.find((f) => f.tipo === 'ingreso');
    assert.ok(ing);
    assert.equal(ing.n_gastos, 1);
    assert.equal(ing.gastos[0].via, 'monto');
    assert.equal(ing.estado, ESTADOS.OK);
  });

  it('Snacky: gasto $100 liga ingreso $108 sin folio ING (no es gasto sin ingreso)', () => {
    const filas = consolidarEventos({
      compras: [],
      movimientos: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          tipo: 'entrada',
          modo: 'masivo',
          producto_id: 'p1',
          producto_nombre: 'Máx Mix Chile limon',
          cantidad: 1,
          sucursal_id: '3B2',
          usuario: 'KATHARA LOPEZ',
          meta: { precio: 27 },
          created_at: '2026-09-02T17:54:00.000Z',
        },
        {
          id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
          tipo: 'entrada',
          modo: 'masivo',
          producto_id: 'p2',
          producto_nombre: 'Max Mix limon sal',
          cantidad: 1,
          sucursal_id: '3B2',
          usuario: 'KATHARA LOPEZ',
          meta: { precio: 27 },
          created_at: '2026-09-02T17:54:10.000Z',
        },
        {
          id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee',
          tipo: 'entrada',
          modo: 'masivo',
          producto_id: 'p3',
          producto_nombre: 'Max mix 330g',
          cantidad: 1,
          sucursal_id: '3B2',
          usuario: 'KATHARA LOPEZ',
          meta: { precio: 27 },
          created_at: '2026-09-02T17:54:20.000Z',
        },
        {
          id: 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee',
          tipo: 'entrada',
          modo: 'masivo',
          producto_id: 'p4',
          producto_nombre: 'Max Mix otro',
          cantidad: 1,
          sucursal_id: '3B2',
          usuario: 'KATHARA LOPEZ',
          meta: { precio: 27 },
          created_at: '2026-09-02T17:54:30.000Z',
        },
      ],
      gastos: [
        {
          id: 'gx-snacky',
          sucursal_id: '3B2',
          categoria: 'PROVEEDORES',
          subcategoria: 'SNACKY PARTY',
          comentario: '',
          monto: 100,
          created_at: '2026-09-02T16:21:00.000Z',
        },
      ],
      productoAProveedor: new Map([
        ['p1', { id: 'prov1', nombre: 'Snacky' }],
        ['p2', { id: 'prov1', nombre: 'Snacky' }],
        ['p3', { id: 'prov1', nombre: 'Snacky' }],
        ['p4', { id: 'prov1', nombre: 'Snacky' }],
      ]),
    });
    const huerfanos = filas.filter((f) => f.estado === ESTADOS.GASTO_SIN_INGRESO);
    assert.equal(huerfanos.length, 0);
    const ing = filas.find((f) => f.tipo === 'ingreso');
    assert.ok(ing);
    assert.equal(ing.n_gastos, 1);
    assert.equal(ing.monto_inventario, 108);
    assert.equal(ing.monto_gasto, 100);
    // $108 vs $100 → ligado pero descuadrado
    assert.equal(ing.estado, ESTADOS.MONTO_DESCUADRADO);
  });
});

describe('resumirConsolidacion', () => {
  it('agrupa por tienda y cuenta discrepancias', () => {
    const filas = consolidarEventos({
      compras: [],
      movimientos: [],
      traspasos: [],
      gastos: [
        {
          id: '1',
          sucursal_id: '3B5',
          categoria: 'PROVEEDORES',
          subcategoria: 'A',
          comentario: '',
          monto: 10,
          created_at: '2026-09-01T12:00:00.000Z',
        },
        {
          id: '2',
          sucursal_id: '3B6',
          categoria: 'PROVEEDORES',
          subcategoria: 'B',
          comentario: '',
          monto: 20,
          created_at: '2026-09-01T12:00:00.000Z',
        },
      ],
    });
    const r = resumirConsolidacion(filas);
    assert.equal(r.n_eventos, 2);
    assert.equal(r.n_discrepancias, 2);
    assert.equal(r.por_tienda.length, 2);
  });
});

describe('clasificarEstadoFila', () => {
  it('prioriza sin inventario', () => {
    assert.equal(
      clasificarEstadoFila({
        tipo: 'compra',
        monto_ticket: 50,
        lineas_inventario: [],
        gastos: [],
        productos_faltantes: [],
      }),
      ESTADOS.SIN_INVENTARIO,
    );
  });
});
