import assert from 'node:assert/strict';
import { resumirVentasPorTienda, tiendasDeVentas, listarVentasRutaPorRango, totalGastos, listarGastosRutaPorRango } from './ventasRutaPorTienda.js';

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

assert.equal(totalGastos([{ monto: 100 }, { monto: '50.25' }, { monto: 999, estatus: 'Cancelado' }, {}]), 150.25);

{
  const q = { filtros: [] };
  const supabase = {
    from(tabla) {
      q.tabla = tabla;
      const c = {
        select: () => c,
        eq: (k, v) => { q.filtros.push([k, v]); return c; },
        gte: () => c,
        lte: () => c,
        order: () => c,
        range: async () => ({ data: [{ id: 1, monto: 40 }], error: null }),
      };
      return c;
    },
  };
  const r = await listarGastosRutaPorRango(supabase, { desde: '2026-10-01', hasta: '2026-10-02' });
  assert.equal(q.tabla, 'transito_efectivo');
  assert.deepEqual(q.filtros, [['tipo_movimiento', 'Gasto']]);
  assert.equal(totalGastos(r.data), 40);
}

console.log('ventasRutaPorTienda: ok');
