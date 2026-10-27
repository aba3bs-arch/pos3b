import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gastoManualEsMercanciaEnOtraCategoria,
  montoEfectivoPedidoRuta,
  pedidoRutaCoincideConGasto,
  validarGastoManualSinFuga,
} from './gastoManualSinFuga.js';

test('cobro de cigarro en gastos operativos / otros se bloquea', () => {
  assert.equal(
    gastoManualEsMercanciaEnOtraCategoria({
      categoria: 'GASTOS OPERATIVOS',
      subcategoria: 'OTROS',
      comentario: 'COBRO DE CIGARRO',
      monto: 400,
    }),
    true,
  );
});

test('PROVEEDORES, EMPLEADO y vales quedan exentos', () => {
  for (const categoria of ['PROVEEDORES', 'EMPLEADO', 'VALE MAIN', 'INVERSION OFICINA']) {
    assert.equal(
      gastoManualEsMercanciaEnOtraCategoria({ categoria, subcategoria: 'X', comentario: 'cigarro' }),
      false,
    );
  }
});

test('gasto operativo normal no se bloquea', () => {
  assert.equal(
    gastoManualEsMercanciaEnOtraCategoria({
      categoria: 'GASTOS OPERATIVOS',
      subcategoria: 'OTROS',
      comentario: 'BOLSAS Y LIMPIEZA',
    }),
    false,
  );
});

test('monto efectivo del pedido de ruta', () => {
  assert.equal(montoEfectivoPedidoRuta({ notas: 'Venta en ruta VR-1 · Ana · metodo efectivo', total: 400 }), 400);
  assert.equal(montoEfectivoPedidoRuta({ notas: 'Venta en ruta VR-1 · metodo credito', total: 400 }), null);
  assert.equal(
    montoEfectivoPedidoRuta({ notas: 'Venta en ruta VR-1 · metodo mixto · efe 300.00 · cre 100.00', total: 400 }),
    300,
  );
  assert.equal(pedidoRutaCoincideConGasto({ notas: 'Venta en ruta VR-1', total: 400 }, 400), true);
  assert.equal(pedidoRutaCoincideConGasto({ notas: 'Venta en ruta VR-1', total: 400 }, 350), false);
});

test('validar: bloquea mercancía manual y deja pasar PROVEEDORES', async () => {
  const bloq = await validarGastoManualSinFuga(null, {
    sucursal: 'FUSION',
    modulo: 'abarrotes',
    gasto: { categoria: 'GASTOS OPERATIVOS', subcategoria: 'OTROS', comentario: 'cobro de cigarro', monto: 400 },
  });
  assert.equal(bloq.ok, false);
  const ok = await validarGastoManualSinFuga(null, {
    sucursal: 'FUSION',
    modulo: 'abarrotes',
    gasto: { categoria: 'PROVEEDORES', subcategoria: 'X', comentario: 'x', monto: 400 },
  });
  assert.equal(ok.ok, true);
  const virtual = await validarGastoManualSinFuga(null, {
    sucursal: 'FUSION',
    modulo: 'virtual',
    gasto: { categoria: 'GASTOS OPERATIVOS', comentario: 'cigarro', monto: 400 },
  });
  assert.equal(virtual.ok, true);
});

test('validar: pedido de ruta pendiente con el mismo monto bloquea el gasto manual', async () => {
  const supabase = {
    from() {
      const q = {
        select: () => q, in: () => q, eq: () => q, ilike: () => q,
        limit: async () => ({
          data: [{ id: 1, notas: 'Venta en ruta VR-9 · Ana · metodo efectivo', total: 400, estado: 'pedido' }],
          error: null,
        }),
      };
      return q;
    },
  };
  const r = await validarGastoManualSinFuga(supabase, {
    sucursal: 'FUSION',
    modulo: 'abarrotes',
    gasto: { categoria: 'GASTOS OPERATIVOS', subcategoria: 'OTROS', comentario: 'varios', monto: 400 },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /VR-9/);
});
