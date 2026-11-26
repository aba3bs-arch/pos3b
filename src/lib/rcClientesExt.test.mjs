import assert from 'node:assert/strict';
import {
  armarRegistroClientesExt,
  cobrosDelRegistro,
  planCobroClienteExt,
  registrarCobroClienteExt,
} from './rcClientesExt.js';

const pepe = {
  id: 'v1',
  folio: 'EXT-1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  metodo_pago: 'credito',
  total: 1000,
  estado_credito: 'pendiente',
  created_at: '2026-11-18T20:00:00Z',
  articulos: [{ producto_id: '93', nombre: 'Cuete', cantidad: 40, precio: 25, importe: 1000 }],
};
const luis = {
  id: 'v2',
  folio: 'EXT-2',
  cliente_tipo: 'externo',
  cliente_id: 'cli-2',
  cliente_nombre: 'Luis',
  metodo_pago: 'mixto',
  total: 500,
  estado_credito: 'pagado',
  created_at: '2026-11-19T20:00:00Z',
  articulos: [
    { producto_id: '93', importe: 500 },
    { _pago_mixto: true, efectivo: 200, credito: 300 },
  ],
};
const tienda = {
  id: 'v3',
  folio: '3B-1',
  cliente_tipo: 'sucursal',
  cliente_id: '3B5',
  cliente_nombre: '3B5',
  metodo_pago: 'credito',
  total: 800,
  estado_credito: 'pendiente',
  articulos: [{ producto_id: '93', importe: 800 }],
};

const reg = armarRegistroClientesExt([pepe, luis, tienda], [
  { id: 'a1', tipo: 'abono', venta_id: 'v1', cliente_tipo: 'externo', cliente_id: 'cli-1', cliente_nombre: 'Don Pepe', monto: 400, created_at: '2026-11-20T18:00:00Z', notas: 'Abono atrasado' },
]);

assert.equal(reg.clientes.length, 2);
assert.equal(reg.clientes[0].nombre, 'Don Pepe');
assert.equal(reg.clientes[0].credito, 1000);
assert.equal(reg.clientes[0].cobrado, 400);
assert.equal(reg.clientes[0].pendiente, 600);
assert.equal(reg.clientes[0].tickets[0].cobros[0].nota, 'Abono atrasado');
assert.equal(reg.clientes[1].nombre, 'Luis');
assert.equal(reg.clientes[1].efectivo, 200);
assert.equal(reg.clientes[1].credito, 300);
assert.equal(reg.clientes[1].cobrado, 300);
assert.equal(reg.clientes[1].pendiente, 0);
assert.equal(reg.clientes[1].tickets[0].cobros[0].nota, 'Crédito cobrado');
assert.equal(reg.totales.credito, 1300);
assert.equal(reg.totales.cobrado, 700);
assert.equal(reg.totales.pendiente, 600);
assert.equal(reg.totales.efectivo, 200);
assert.equal(reg.clientes[0].tickets[0].origen, 'venta');
assert.equal(reg.clientes[0].tickets[0].clienteId, 'cli-1');

const cargoSuelto = {
  id: 'c9',
  tipo: 'cargo',
  cliente_tipo: 'externo',
  cliente_id: 'cli-9',
  cliente_nombre: 'Ana',
  monto: 500,
  estatus: 'pendiente',
  created_at: '2026-11-10T18:00:00Z',
  folio_venta: 'EXT-9',
};
const abonoCargo = {
  id: 'a9',
  tipo: 'abono',
  cargo_id: 'c9',
  cliente_tipo: 'externo',
  cliente_id: 'cli-9',
  cliente_nombre: 'Ana',
  monto: 200,
  notas: 'Abono atrasado',
  created_at: '2026-11-21T18:00:00Z',
};
const regCargo = armarRegistroClientesExt([], [cargoSuelto, abonoCargo]);
assert.equal(regCargo.clientes.length, 1);
assert.equal(regCargo.clientes[0].credito, 500);
assert.equal(regCargo.clientes[0].cobrado, 200);
assert.equal(regCargo.clientes[0].pendiente, 300);
assert.equal(regCargo.clientes[0].tickets.length, 1);
assert.equal(regCargo.clientes[0].tickets[0].cobros[0].nota, 'Abono atrasado');

const cobros = cobrosDelRegistro(reg);
assert.equal(cobros.length, 2);
assert.equal(cobros[0].cliente, 'Don Pepe');
assert.equal(cobros[0].monto, 400);

const viejo = { id: 't1', folio: 'A', fecha: '2026-11-01T00:00:00Z', pendiente: 100 };
const nuevo = { id: 't2', folio: 'B', fecha: '2026-11-02T00:00:00Z', pendiente: 300 };
const plan = planCobroClienteExt([nuevo, viejo], 150);
assert.equal(plan.ok, true);
assert.equal(plan.partes[0].id, 't1');
assert.equal(plan.partes[0].monto, 100);
assert.equal(plan.partes[0].parcial, false);
assert.equal(plan.partes[1].id, 't2');
assert.equal(plan.partes[1].monto, 50);
assert.equal(plan.partes[1].parcial, true);
assert.equal(planCobroClienteExt([viejo], 101).ok, false);
assert.equal(planCobroClienteExt([viejo], 0).ok, false);

function mockDb(ventas, movs) {
  const updates = [];
  const from = (table) => {
    const state = { filters: [], op: 'select', payload: null, patch: null };
    const fuente = () => (table === 'ruta_ventas' ? ventas : movs);
    const run = () => {
      const coincide = (row) => state.filters.every(([c, v]) => String(row[c] ?? '') === String(v));
      if (state.op === 'select') return { data: fuente().filter(coincide), error: null };
      if (state.op === 'insert') {
        const row = { id: `ab-${movs.length + 1}`, created_at: '2026-11-25T20:00:00Z', ...state.payload[0] };
        movs.push(row);
        return { data: row, error: null };
      }
      updates.push({ table, patch: state.patch, filters: state.filters });
      for (const row of fuente()) if (coincide(row)) Object.assign(row, state.patch);
      return { data: null, error: null };
    };
    const q = {
      select() { return q; },
      insert(rows) { state.op = 'insert'; state.payload = rows; return q; },
      update(patch) { state.op = 'update'; state.patch = patch; return q; },
      eq(col, val) { state.filters.push([col, val]); return q; },
      order() { return q; },
      range() { return q; },
      maybeSingle() { return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return q;
  };
  return { from, updates };
}

const ventasDb = [{
  id: 'v1',
  folio: 'EXT-1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  metodo_pago: 'credito',
  total: 1000,
  estado_credito: 'pendiente',
  created_at: '2026-11-18T20:00:00Z',
  articulos: [{ importe: 1000 }],
}];
const movsDb = [{
  id: 'cargo-1',
  tipo: 'cargo',
  venta_id: 'v1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  monto: 1000,
  estatus: 'pendiente',
  folio_venta: 'EXT-1',
  created_at: '2026-11-18T20:00:00Z',
}];
const db = mockDb(ventasDb, movsDb);
const parcial = await registrarCobroClienteExt(db, {
  ticketIds: ['v1'],
  monto: 400,
  nota: 'Abono atrasado',
  usuarioNombre: 'Luis',
});
assert.equal(parcial.ok, true);
assert.equal(parcial.monto, 400);
assert.equal(parcial.aplicados[0].parcial, true);
assert.equal(ventasDb[0].estado_credito, 'pendiente');
assert.equal(movsDb.find((m) => m.tipo === 'abono').monto, 400);
assert.equal(movsDb.find((m) => m.tipo === 'abono').notas, 'Abono atrasado');
assert.equal(db.updates.some((u) => u.table === 'ruta_ventas'), false);

const completo = await registrarCobroClienteExt(db, {
  ticketIds: ['v1'],
  monto: 600,
  usuarioNombre: 'Luis',
});
assert.equal(completo.ok, true);
assert.equal(completo.aplicados[0].parcial, false);
assert.equal(ventasDb[0].estado_credito, 'pagado');
assert.equal(movsDb.find((m) => m.id === 'cargo-1').estatus, 'pagado');
const despues = armarRegistroClientesExt(ventasDb, movsDb);
assert.equal(despues.totales.cobrado, 1000);
assert.equal(despues.totales.pendiente, 0);

const deMas = await registrarCobroClienteExt(db, { ticketIds: ['v1'], monto: 10, usuarioNombre: 'Luis' });
assert.equal(deMas.ok, false);

console.log('rcClientesExt.test.mjs ok');
