/**
 * Tablero de checado de tickets de compra.
 * Ejecutar: node --test src/lib/checarTicketsCompra.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidarEventos } from './consolidacionComprasInventario.js';
import { sanitizarPrivilegios } from './privilegios.js';
import {
  armarTableroChecarTickets,
  enumerarDias,
  incluirEnChecarTickets,
  rangoSemanaCompleta,
} from './checarTicketsCompra.js';

describe('enumerarDias', () => {
  it('pone el día de la semana y el número', () => {
    const { dias, truncado } = enumerarDias('2026-11-16', '2026-11-18');
    assert.equal(truncado, false);
    assert.deepEqual(dias.map((d) => d.etiqueta), ['Lun 16', 'Mar 17', 'Mié 18']);
  });

  it('arma la semana de lunes a domingo', () => {
    assert.deepEqual(rangoSemanaCompleta(new Date(2026, 10, 23)), {
      desde: '2026-11-23',
      hasta: '2026-11-29',
    });
    assert.deepEqual(rangoSemanaCompleta(new Date(2026, 10, 22)), {
      desde: '2026-11-16',
      hasta: '2026-11-22',
    });
  });

  it('corta el rango largo', () => {
    const { dias, truncado } = enumerarDias('2026-11-01', '2026-12-20', 31);
    assert.equal(truncado, true);
    assert.equal(dias.length, 31);
    assert.equal(dias[0].ymd, '2026-11-01');
  });
});

describe('armarTableroChecarTickets', () => {
  const filas = [
    {
      id: 'c1',
      origen: 'compra',
      tipo: 'compra',
      folio: 'CMP-1',
      sucursal_id: '3B5',
      tienda: '3B5',
      fecha_ymd: '2026-11-16',
      proveedor: 'Coca',
      monto_ticket: 100,
      monto_gasto: 100,
      lineas_ticket: [{ id: 'p1', nombre: 'Coca 600', qty: 10, costo: 10 }],
      lineas_inventario: [{ id: 'p1', nombre: 'Coca 600', qty: 8, costo: 10 }],
      gastos: [{ id: 'g1', monto: 100, usuario: 'Ana', fecha_ymd: '2026-11-16' }],
    },
    {
      id: 'c2',
      origen: 'compra',
      tipo: 'compra',
      folio: 'CMP-2',
      sucursal_id: '3B5',
      tienda: '3B5',
      fecha_ymd: '2026-11-18',
      proveedor: 'Coca',
      monto_ticket: 40,
      monto_gasto: 0,
      notas: '',
      lineas_ticket: [{ id: 'p1', nombre: 'Coca 600', qty: 4, costo: 10 }],
      lineas_inventario: [{ id: 'p1', nombre: 'Coca 600', qty: 4, costo: 10 }],
      gastos: [],
    },
    {
      id: 'g-solo',
      origen: 'gasto_huerfano',
      tipo: 'gasto',
      folio: '—',
      sucursal_id: '3B5',
      tienda: '3B5',
      fecha_ymd: '2026-11-17',
      proveedor: 'Bimbo',
      monto_ticket: 0,
      monto_gasto: 80,
      lineas_ticket: [],
      lineas_inventario: [],
      gastos: [{ id: 'g2', monto: 80, fecha_ymd: '2026-11-17' }],
    },
    {
      id: 'trp',
      origen: 'traspaso',
      tipo: 'traspaso',
      proveedor: 'Traspaso 3B2 → 3B5',
      fecha_ymd: '2026-11-16',
      monto_gasto: 0,
      lineas_ticket: [{ nombre: 'Agua', qty: 3 }],
      lineas_inventario: [{ nombre: 'Agua', qty: 3 }],
      gastos: [],
    },
  ];

  it('deja al proveedor repetido, el gasto en su columna y el ticket en el día', () => {
    const tab = armarTableroChecarTickets(filas, { desde: '2026-11-16', hasta: '2026-11-18' });
    assert.equal(tab.rows.length, 3);
    assert.deepEqual(tab.rows.map((r) => r.proveedor), ['Bimbo', 'Coca', 'Coca']);
    const cocaLun = tab.rows.find((r) => r.id === 'c1');
    assert.equal(cocaLun.gastoEstado, 'ingresado');
    assert.equal(cocaLun.montoGasto, 100);
    assert.equal(cocaLun.celdas['2026-11-16'].piezas, 8);
    assert.equal(cocaLun.celdas['2026-11-16'].piezasTicket, 10);
    assert.equal(cocaLun.celdas['2026-11-17'], undefined);
    const cocaMie = tab.rows.find((r) => r.id === 'c2');
    assert.equal(cocaMie.gastoEstado, 'sin_gasto');
    assert.ok(cocaMie.celdas['2026-11-18']);
    const bimbo = tab.rows.find((r) => r.id === 'g-solo');
    assert.equal(bimbo.tieneTicket, false);
    assert.equal(bimbo.gastoEstado, 'ingresado');
    assert.deepEqual(bimbo.celdas, {});
    assert.equal(incluirEnChecarTickets(filas[3]), false);
    assert.equal(tab.resumen.sinGasto, 1);
    assert.equal(tab.resumen.sinTicket, 1);
    assert.equal(tab.resumen.piezas, 12);
    assert.equal(tab.piezasPorDia['2026-11-16'], 8);
    assert.equal(tab.piezasPorDia['2026-11-18'], 4);
  });

  it('no exige gasto cuando la compra es a crédito', () => {
    const tab = armarTableroChecarTickets([
      {
        id: 'cred',
        origen: 'compra',
        tipo: 'compra',
        proveedor: 'Ruta',
        fecha_ymd: '2026-11-16',
        notas: 'metodo: credito',
        monto_ticket: 50,
        monto_gasto: 0,
        lineas_ticket: [{ nombre: 'Sabritas', qty: 2 }],
        lineas_inventario: [{ nombre: 'Sabritas', qty: 2 }],
        gastos: [],
      },
    ], { desde: '2026-11-16', hasta: '2026-11-16' });
    assert.equal(tab.rows[0].gastoEstado, 'credito');
    assert.equal(tab.resumen.sinGasto, 0);
  });
});

describe('consolidar + tablero', () => {
  it('quita el traspaso y conserva la compra sin gasto', () => {
    const eventos = consolidarEventos({
      compras: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sucursal_id: '3B5',
          estado: 'recibida',
          total: 100,
          items: [{ id: 'p1', nombre: 'Prod', qty: 2, costo: 50 }],
          proveedores: { nombre: 'Demo' },
          created_at: '2026-11-16T18:00:00.000Z',
        },
      ],
      movimientos: [],
      traspasos: [
        {
          id: 't1',
          folio: 'trp-5-0001',
          estado: 'recibido',
          origen_id: '3B2',
          destino_id: '3B5',
          lineas: [{ producto_id: 'p9', nombre: 'Agua', cantidad: 1, costo: 10 }],
          created_at: '2026-11-16T18:00:00.000Z',
        },
      ],
      gastos: [
        {
          id: 'g-suelto',
          sucursal_id: '3B5',
          categoria: 'PROVEEDORES',
          subcategoria: 'Gamesa',
          comentario: '',
          monto: 500,
          created_at: '2026-11-17T18:00:00.000Z',
        },
      ],
    });
    const tab = armarTableroChecarTickets(eventos, { desde: '2026-11-16', hasta: '2026-11-18' });
    assert.ok(tab.rows.some((r) => r.proveedor === 'Demo' && r.gastoEstado === 'sin_gasto' && r.tieneTicket));
    assert.ok(tab.rows.some((r) => r.proveedor === 'Gamesa' && !r.tieneTicket && r.montoGasto === 500));
    assert.equal(tab.rows.some((r) => /traspaso/i.test(r.proveedor)), false);
  });
});

describe('privilegios Checar tickets', () => {
  const migrados = [
    'Mensajes', 'Check List', 'Evaluación operativa', 'Consolidación',
    'Compras vs inventario', 'Revisión de compras', 'Conciliaciones',
    'Registro de gastos', 'Socio 3B', 'RC Garage', 'RC Abarrotes',
  ];

  it('lo deja en el menú del auditor y no en contabilidad ni en el cajero', () => {
    const auditor = sanitizarPrivilegios({
      porRol: { Auditor: ['Inicio', 'Compras'] },
      _migratedModulos: migrados,
    });
    assert.ok(auditor.porRol.Auditor.includes('Checar tickets'));

    const gerente = sanitizarPrivilegios({
      porRol: { Gerente: ['Inicio', 'Revisión de compras'] },
      _migratedModulos: migrados,
    });
    assert.equal(gerente.porRol.Gerente.includes('Checar tickets'), false);

    const cajero = sanitizarPrivilegios({
      porRol: { Cajero: ['Inicio', 'Ventas'] },
      _migratedModulos: migrados,
    });
    assert.equal(cajero.porRol.Cajero.includes('Checar tickets'), false);

    const ya = sanitizarPrivilegios({
      porRol: { Auditor: ['Inicio', 'Compras'] },
      _migratedModulos: [...migrados, 'Checar tickets'],
    });
    assert.equal(ya.porRol.Auditor.includes('Checar tickets'), false);
  });
});
