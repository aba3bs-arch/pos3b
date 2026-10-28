import assert from 'node:assert/strict';
import { resumirVentasPorTienda, tiendasDeVentas, listarVentasRutaPorRango, resumirCreditoAcumulado, acumuladoMostrado } from './ventasRutaPorTienda.js';

const ventas = [
  { id: 1, cliente_tipo: 'sucursal', cliente_id: '3b2', cliente_nombre: 'Las 3B 2', metodo_pago: 'efectivo', total: 100 },
  { id: 2, cliente_tipo: 'sucursal', cliente_id: '3B2', cliente_nombre: 'Las 3B 2', metodo_pago: 'credito', total: 250.5 },
  { id: 3, cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'mixto', total: 300, articulos: [{ _pago_mixto: true, efectivo: 120, credito: 180 }] },
  { id: 4, cliente_tipo: 'sucursal', cliente_id: '3B2', metodo_pago: 'efectivo', total: 999, estado: 'cancelada' },
  { id: 5, cliente_tipo: 'sucursal', cliente_id: '3B4', cliente_nombre: 'Las 3B 4', metodo_pago: 'efectivo', total: 80 },
  { id: 6, cliente_tipo: 'externo', cliente_id: 'x1', cliente_nombre: 'Tiendita Lola', metodo_pago: 'credito', total: 40 },
];

{
  const { filas, total } = resumirVentasPorTienda(ventas);
  const t2 = filas.find((f) => f.clave === '3B2');
  assert.equal(t2.ventas, 3);
  assert.equal(t2.efectivo, 220);
  assert.equal(t2.credito, 430.5);
  assert.equal(t2.total, 650.5);
  assert.equal(total.canceladas, 1);
  assert.equal(total.ventas, 5);
  assert.equal(total.efectivo, 300);
  assert.equal(total.credito, 470.5);
  assert.equal(total.efectivo + total.credito, total.total);
  assert.equal(filas[0].clave, '3B2');
  assert.ok(filas.some((f) => f.externo && f.nombre === 'Tiendita Lola'));
}

{
  const { filas, total } = resumirVentasPorTienda(ventas, { tienda: '3B4' });
  assert.equal(filas.length, 1);
  assert.equal(total.total, 80);
}

{
  const lista = tiendasDeVentas(ventas);
  assert.deepEqual(lista.map((t) => t.clave).sort(), ['3B2', '3B4', 'EXT:TIENDITA LOLA']);
}

{
  const llamadas = [];
  const filas = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
  const supabase = {
    from() {
      const q = {
        select: () => q,
        gte: (c, v) => { llamadas.push(['gte', c, v]); return q; },
        lte: (c, v) => { llamadas.push(['lte', c, v]); return q; },
        order: () => q,
        range: async (a, b) => ({ data: filas.slice(a, b + 1), error: null }),
      };
      return q;
    },
  };
  const r = await listarVentasRutaPorRango(supabase, { desde: '2026-10-01', hasta: '2026-10-07' });
  assert.equal(r.data.length, 1500);
  assert.equal(llamadas[0][2], '2026-10-01T07:00:00.000Z');
  assert.equal(llamadas[1][2], '2026-10-08T06:59:59.999Z');
}

{
  const cargos = [
    { cliente_tipo: 'sucursal', cliente_id: '3b2', monto: 9000, venta_id: 'v1' },
    { cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 372.5, folio_venta: 'F1' },
    { cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 26670.5, carga_id: 'rec:abc-123' },
    { cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 100, notas: 'Recolección transito:1234abcd-5678' },
    { cliente_tipo: 'sucursal', cliente_id: '3B7', cliente_nombre: 'Las 3B 7', monto: 200 },
    { cliente_tipo: 'externo', cliente_nombre: 'Tiendita Lola', monto: 25 },
    { cliente_tipo: 'sucursal', cliente_id: '3B2', monto: 0 },
  ];
  const ac = resumirCreditoAcumulado(cargos);
  assert.equal(ac.porTienda.get('3B2').monto, 36143);
  assert.equal(ac.porTienda.get('3B2').ruta, 9372.5);
  assert.equal(ac.porTienda.get('3B2').recoleccion, 26770.5);
  assert.equal(ac.porTienda.get('3B2').folios, 4);
  assert.equal(ac.total, 36368);
  assert.equal(ac.ruta + ac.recoleccion, ac.total);
  assert.equal(acumuladoMostrado(ac, '3B2').monto, 36143);
  assert.equal(acumuladoMostrado(ac, '').monto, 36368);
  assert.equal(acumuladoMostrado(ac, '3B9').monto, 0);
  // No altera efectivo/crédito de las ventas
  const antes = JSON.stringify(resumirVentasPorTienda(ventas));
  resumirCreditoAcumulado(cargos);
  assert.equal(JSON.stringify(resumirVentasPorTienda(ventas)), antes);
}

console.log('ventasRutaPorTienda: ok');
