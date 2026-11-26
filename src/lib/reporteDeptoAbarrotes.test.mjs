/**
 * Tests — reporte departamento ABARROTES (catálogo).
 * node --test src/lib/reporteDeptoAbarrotes.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarCompra,
  agregarEntrada,
  agregarTicket,
  construirReporte,
  crearEstadoReporte,
  csvReporteDeptoAbarrotes,
  diagnosticoTienda,
  esLineaDeptoAbarrotes,
  paretoDeMapa,
  semanaOperativaKey,
  textoConclusion,
} from './reporteDeptoAbarrotes.js';

describe('semanaOperativaKey', () => {
  it('sábado queda como inicio', () => {
    assert.equal(semanaOperativaKey('2026-11-21'), '2026-11-21');
  });
  it('jueves cae en el sábado anterior', () => {
    assert.equal(semanaOperativaKey('2026-11-26'), '2026-11-21');
  });
  it('viernes cierra la semana del sábado previo', () => {
    assert.equal(semanaOperativaKey('2026-11-20'), '2026-11-14');
  });
});

describe('esLineaDeptoAbarrotes', () => {
  const ids = new Set(['ARROZ']);
  it('acepta por id de catálogo', () => {
    assert.equal(esLineaDeptoAbarrotes({ id: 'ARROZ', cat: 'BEBIDAS' }, ids), true);
  });
  it('acepta por cat de la línea', () => {
    assert.equal(esLineaDeptoAbarrotes({ id: 'X', cat: 'ABARROTES' }, ids), true);
  });
  it('rechaza otro departamento', () => {
    assert.equal(esLineaDeptoAbarrotes({ id: 'COCA', cat: 'BEBIDAS' }, ids), false);
  });
});

describe('agregarTicket + construirReporte', () => {
  it('arma Pareto por tienda y excluye venta en ruta de compras', () => {
    const abaIds = new Set(['ARROZ', 'FRIJOL']);
    const catalogo = new Map([
      ['ARROZ', { id: 'ARROZ', nombre: 'Arroz', cat: 'ABARROTES', precio: 20, stock_sucursales: { '3B2': { piso: 2 } } }],
      ['FRIJOL', { id: 'FRIJOL', nombre: 'Frijol', cat: 'ABARROTES', precio: 18, stock_sucursales: { '3B5': { piso: 1 } } }],
    ]);
    const estado = crearEstadoReporte({ tiendas: ['3B2', '3B5', '3B6'] });
    agregarTicket(estado, {
      id: 1,
      sucursal_id: '3B2',
      total: 100,
      created_at: '2026-09-12T18:00:00.000Z',
      articulos: [
        { id: 'ARROZ', cat: 'ABARROTES', qty: 2, precio: 20 },
        { id: 'COCA', cat: 'BEBIDAS', qty: 1, precio: 18 },
      ],
    }, abaIds, catalogo);
    agregarTicket(estado, {
      id: 2,
      sucursal_id: '3B5',
      total: 50,
      created_at: '2026-09-13T18:00:00.000Z',
      articulos: [{ id: 'FRIJOL', qty: 1, precio: 18 }],
    }, abaIds, catalogo);
    agregarTicket(estado, {
      id: 3,
      sucursal_id: '3B2',
      total: 10,
      created_at: '2026-09-13T19:00:00.000Z',
      articulos: [{ id: 'COCA', cat: 'BEBIDAS', qty: 1, precio: 10 }],
    }, abaIds, catalogo);

    agregarCompra(estado, {
      id: 10,
      sucursal_id: '3B2',
      total: 80,
      estado: 'recibido',
      created_at: '2026-09-10T18:00:00.000Z',
      notas: 'Pedido Abarrotes',
      items: [{ id: 'ARROZ', qty: 4, costo: 12 }],
    }, abaIds, catalogo);
    agregarCompra(estado, {
      id: 11,
      sucursal_id: '3B2',
      total: 200,
      estado: 'recibido',
      created_at: '2026-09-11T18:00:00.000Z',
      notas: 'Venta en ruta Folio 99',
      items: [{ id: 'ARROZ', qty: 20, costo: 12 }],
    }, abaIds, catalogo);
    agregarCompra(estado, {
      id: 12,
      sucursal_id: '3B5',
      total: 40,
      estado: 'pedido',
      created_at: '2026-09-11T18:00:00.000Z',
      notas: 'Pedido Abarrotes 3B5',
      items_pedido: [{ id: 'FRIJOL', qty_pedido: 10, costo_est: 8 }],
    }, abaIds, catalogo);

    agregarEntrada(estado, {
      tipo: 'entrada',
      modo: 'masivo',
      producto_id: 'ARROZ',
      cantidad: 30,
      sucursal_id: '3B2',
      created_at: '2026-09-09T18:00:00.000Z',
    }, abaIds);
    agregarEntrada(estado, {
      tipo: 'entrada',
      modo: 'venta',
      producto_id: 'ARROZ',
      cantidad: 99,
      sucursal_id: '3B2',
      created_at: '2026-09-09T18:00:00.000Z',
    }, abaIds);

    const pack = construirReporte(estado, {
      desde: '2026-09-01',
      hasta: '2026-09-30',
      inventario: [...catalogo.values()],
      abaIds,
      catalogo,
    });

    assert.equal(pack.ok, true);
    assert.equal(pack.totales.ticketsPOS, 3);
    assert.equal(pack.totales.ticketsConAbarrotes, 2);
    assert.equal(pack.totales.ventasAbarrotesMonto, 58);
    assert.equal(pack.totales.comprasAbarrotesMonto, 48);
    assert.equal(pack.totales.comprasDocsRutaExcluidas, 1);
    assert.equal(pack.totales.comprasPedidoAbarrotesDocs, 1);
    assert.equal(pack.pedidosAbarrotes.length, 2);
    assert.equal(pack.totales.entradasMasivoU, 30);
    assert.equal(pack.totales.entradasCompraU, 0);

    const b2 = pack.tiendas.find((t) => t.id === '3B2');
    const b5 = pack.tiendas.find((t) => t.id === '3B5');
    const b6 = pack.tiendas.find((t) => t.id === '3B6');
    assert.equal(b2.ventasMonto, 40);
    assert.equal(b2.comprasMonto, 48);
    assert.equal(b2.entradasMasivoU, 30);
    assert.equal(b5.ventasMonto, 18);
    assert.equal(b5.comprasDocs, 0, 'estado pedido no cuenta como compra recibida');
    assert.equal(b6.ventasMonto, 0);

    assert.equal(pack.paretoTiendas[0].id, '3B2');
    assert.ok(pack.paretoTiendas[0].pct > 60);
    assert.ok(pack.semanal.length >= 1);
    assert.match(pack.conclusion, /departamento/i);

    const csv = csvReporteDeptoAbarrotes(pack);
    assert.match(csv, /3B2 Pueblo Nuevo|3B2/);
    assert.match(csv, /Ventas depto/);
  });
});

describe('paretoDeMapa', () => {
  it('acumula al 80%', () => {
    const p = paretoDeMapa({
      a: { nombre: 'A', monto: 80, unidades: 1, tickets: 1 },
      b: { nombre: 'B', monto: 15, unidades: 1, tickets: 1 },
      c: { nombre: 'C', monto: 5, unidades: 1, tickets: 1 },
    });
    assert.equal(p.skus80, 1);
    assert.equal(p.top[0].pct, 80);
  });
});

describe('diagnosticoTienda', () => {
  it('marca desabasto cuando se vende sin reponer', () => {
    const d = diagnosticoTienda({
      ventasMonto: 1000,
      ventasUnidades: 100,
      tickets: 20,
      comprasMonto: 10,
      comprasDocs: 1,
      coberturaUnidades: 0.1,
      stockUnidades: 2,
      diasDeInventario: 1,
    });
    assert.equal(d.id, 'desabasto');
  });
  it('marca sin movimiento', () => {
    const d = diagnosticoTienda({ ventasMonto: 0, comprasMonto: 0, tickets: 0, comprasDocs: 0 });
    assert.equal(d.id, 'sin_movimiento');
  });
});

describe('textoConclusion', () => {
  it('explica falta de surtido formal', () => {
    const txt = textoConclusion({
      totales: { comprasPedidoAbarrotesDocs: 2, coberturaUnidades: 0.06, entradasMasivoU: 5000, entradasCompraU: 400 },
      rango: { diasSinPedido: 69 },
      paretoTiendas: [
        { label: '3B2', acumPct: 34 },
        { label: '3B5', acumPct: 63 },
        { label: '3B6', acumPct: 86 },
      ],
    });
    assert.match(txt, /no se ha estado surtiendo/i);
    assert.match(txt, /69 días/);
    assert.match(txt, /86%/);
  });
});
