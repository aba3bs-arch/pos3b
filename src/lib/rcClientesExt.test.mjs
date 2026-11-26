import assert from 'node:assert/strict';
import { htmlTicketVenta } from './impresion.js';
import {
  armarLiquidacionClientesExt,
  armarRegistroClientesExt,
  cancelarCobroClienteExt,
  cancelarLiquidacionClienteExt,
  cobrosDelRegistro,
  datosTicketAbarrotes,
  planCobroClienteExt,
  registrarCobroClienteExt,
  registrarLiquidacionClienteExt,
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
assert.equal(reg.clientes[0].tickets[0].metodo, 'credito');
assert.equal(reg.clientes[0].tickets[0].lineas[0].nombre, 'Cuete');
assert.equal(reg.clientes[0].tickets[0].lineas[0].cantidad, 40);
assert.equal(reg.clientes[0].tickets[0].lineas[0].importe, 1000);
assert.equal(reg.clientes[1].tickets[0].metodo, 'mixto');
assert.equal(reg.clientes[1].tickets[0].efectivo, 200);
assert.equal(reg.clientes[1].tickets[0].lineas.length, 1);
assert.equal(reg.clientes[1].tickets[0].lineas[0].nombre, '93');

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
assert.equal(cobros[0].ticketId, 'v1');
assert.equal(cobros[0].origen, 'venta');

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
assert.equal(movsDb.find((m) => m.tipo === 'cargo').monto, 600);
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

const contado = {
  id: 'v-efe',
  folio: 'EXT-EFE',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  metodo_pago: 'efectivo',
  total: 80,
  created_at: '2026-11-22T20:00:00Z',
  articulos: [{ producto_id: '10', nombre: 'Leche', cantidad: 2, precio: 40, importe: 80 }],
};
const regEfe = armarRegistroClientesExt([pepe, contado], []);
const ticketEfe = regEfe.clientes[0].tickets.find((t) => t.folio === 'EXT-EFE');
assert.equal(regEfe.clientes[0].efectivo, 80);
assert.equal(regEfe.clientes[0].credito, 1000);
assert.equal(regEfe.clientes[0].tickets.length, 2);
assert.equal(ticketEfe.metodo, 'efectivo');
assert.equal(ticketEfe.pendiente, 0);
assert.equal(ticketEfe.lineas[0].nombre, 'Leche');
assert.equal(ticketEfe.lineas[0].cantidad, 2);
assert.equal(ticketEfe.lineas[0].importe, 80);
const hoja = datosTicketAbarrotes(reg.clientes[0].tickets[0], {
  cliente: 'Don Pepe',
  sucursal: '3B10',
  fecha: '18/11/2026',
});
assert.equal(hoja.metodo_pago, 'credito');
assert.equal(hoja.destino, 'Don Pepe');
assert.equal(hoja.tiendaTexto, 'Don Pepe');
assert.equal(hoja.sucursal, '');
const hojaNombre = datosTicketAbarrotes(reg.clientes[0].tickets[0], { cliente: 'fernán 2' });
assert.equal(hojaNombre.tiendaTexto, 'fernán 2');
assert.equal(hojaNombre.destino, 'fernán 2');
const htmlNombre = htmlTicketVenta(hojaNombre);
assert.match(htmlNombre, /Tienda: fernán 2/);
assert.doesNotMatch(htmlNombre, /FERNAN_2|Central de administración|\(MAIN\)/);
const htmlTienda = htmlTicketVenta({
  sucursal: 'MAIN',
  articulos: [{ nombre: 'Sal', precio: 10, qty: 1 }],
  total: 10,
  metodo_pago: 'efectivo',
});
assert.match(htmlTienda, /Tienda: Central de administración \(MAIN\)/);
assert.equal(hoja.folio, 'EXT-1');
assert.equal(hoja.articulos[0].nombre, 'Cuete');
assert.equal(hoja.articulos[0].qty, 40);
assert.equal(hoja.articulos[0].precio, 25);
assert.equal(hoja.monto_credito, 1000);
assert.equal(hoja.total, 1000);

const regCancelado = armarRegistroClientesExt([pepe], [{
  id: 'a-x',
  tipo: 'abono',
  venta_id: 'v1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  monto: 250,
  notas: 'CANCELADO · Abono · Luis',
  estatus: 'pagado',
  created_at: '2026-11-21T18:00:00Z',
}]);
assert.equal(regCancelado.clientes[0].cobrado, 0);
assert.equal(regCancelado.clientes[0].pendiente, 1000);
assert.equal(regCancelado.clientes[0].tickets[0].cobros.length, 0);
assert.equal(regCancelado.clientes[0].tickets[0].cobrosCancelados.length, 1);

function ventaCredito(estado = 'pendiente') {
  return {
    id: 'v1',
    folio: 'EXT-1',
    cliente_tipo: 'externo',
    cliente_id: 'cli-1',
    cliente_nombre: 'Don Pepe',
    metodo_pago: 'credito',
    total: 1000,
    estado_credito: estado,
    created_at: '2026-11-18T20:00:00Z',
    articulos: [{ nombre: 'Cuete', cantidad: 40, precio: 25, importe: 1000 }],
  };
}
function cargoDe(estado = 'pendiente') {
  return {
    id: 'cargo-1',
    tipo: 'cargo',
    venta_id: 'v1',
    cliente_tipo: 'externo',
    cliente_id: 'cli-1',
    cliente_nombre: 'Don Pepe',
    monto: 1000,
    estatus: estado,
    pagado_at: estado === 'pagado' ? '2026-11-20T18:00:00Z' : null,
    folio_venta: 'EXT-1',
    created_at: '2026-11-18T20:00:00Z',
  };
}

const ventasPar = [ventaCredito()];
const movsPar = [cargoDe()];
const dbPar = mockDb(ventasPar, movsPar);
await registrarCobroClienteExt(dbPar, { ticketIds: ['v1'], monto: 250, nota: 'Abono', usuarioNombre: 'Luis' });
const abonoParcial = movsPar.find((m) => m.tipo === 'abono');
const cancelParcial = await cancelarCobroClienteExt(dbPar, { cobroId: abonoParcial.id, usuarioNombre: 'Ana' });
assert.equal(cancelParcial.ok, true);
assert.equal(cancelParcial.monto, 250);
assert.equal(cancelParcial.pendiente, 1000);
assert.equal(abonoParcial.estatus, 'cancelado');
assert.equal(movsPar.find((m) => m.tipo === 'cargo').monto, 1000);
assert.equal(movsPar.find((m) => m.tipo === 'cargo').estatus, 'pendiente');
const deudaParcial = armarRegistroClientesExt(ventasPar, movsPar);
assert.equal(deudaParcial.totales.cobrado, 0);
assert.equal(deudaParcial.totales.pendiente, 1000);
assert.equal(deudaParcial.clientes[0].tickets[0].cobrosCancelados.length, 1);

const ventasFull = [ventaCredito()];
const movsFull = [cargoDe()];
const dbFull = mockDb(ventasFull, movsFull);
await registrarCobroClienteExt(dbFull, { ticketIds: ['v1'], monto: 400, nota: 'Abono', usuarioNombre: 'Luis' });
await registrarCobroClienteExt(dbFull, { ticketIds: ['v1'], monto: 600, usuarioNombre: 'Luis' });
assert.equal(ventasFull[0].estado_credito, 'pagado');
const abonoChico = movsFull.find((m) => m.tipo === 'abono' && m.monto === 400);
const cancelParte = await cancelarCobroClienteExt(dbFull, { cobroId: abonoChico.id, usuarioNombre: 'Ana' });
assert.equal(cancelParte.ok, true);
assert.equal(cancelParte.pendiente, 400);
assert.equal(ventasFull[0].estado_credito, 'pendiente');
assert.equal(movsFull.find((m) => m.id === 'cargo-1').estatus, 'pendiente');
assert.equal(movsFull.find((m) => m.id === 'cargo-1').pagado_at, null);
assert.equal(movsFull.find((m) => m.id === 'cargo-1').monto, 400);
const deudaParte = armarRegistroClientesExt(ventasFull, movsFull);
assert.equal(deudaParte.totales.cobrado, 600);
assert.equal(deudaParte.totales.pendiente, 400);

const ventasSint = [ventaCredito('pagado')];
const movsSint = [cargoDe('pagado')];
const dbSint = mockDb(ventasSint, movsSint);
const antesSint = armarRegistroClientesExt(ventasSint, movsSint);
assert.equal(antesSint.totales.pendiente, 0);
assert.equal(antesSint.clientes[0].tickets[0].cobros[0].id, 'cobro:v1');
const cancelSint = await cancelarCobroClienteExt(dbSint, { cobroId: 'cobro:v1', usuarioNombre: 'Ana' });
assert.equal(cancelSint.ok, true);
assert.equal(cancelSint.monto, 1000);
assert.equal(ventasSint[0].estado_credito, 'pendiente');
assert.equal(movsSint[0].estatus, 'pendiente');
assert.equal(movsSint[0].pagado_at, null);
const deudaSint = armarRegistroClientesExt(ventasSint, movsSint);
assert.equal(deudaSint.totales.cobrado, 0);
assert.equal(deudaSint.totales.pendiente, 1000);

const ventasMix = [ventaCredito('pagado')];
const movsMix = [cargoDe('pagado'), {
  id: 'ab-real',
  tipo: 'abono',
  venta_id: 'v1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-1',
  cliente_nombre: 'Don Pepe',
  monto: 400,
  estatus: 'pagado',
  notas: 'Abono',
  folio_venta: 'EXT-1',
  created_at: '2026-11-19T18:00:00Z',
}];
const dbMix = mockDb(ventasMix, movsMix);
const antesMix = armarRegistroClientesExt(ventasMix, movsMix);
assert.equal(antesMix.totales.cobrado, 1000);
assert.equal(antesMix.totales.pendiente, 0);
assert.equal(antesMix.clientes[0].tickets[0].cobros.some((c) => c.id === 'cobro:v1'), true);
const cancelMix = await cancelarCobroClienteExt(dbMix, { cobroId: 'ab-real', usuarioNombre: 'Ana' });
assert.equal(cancelMix.ok, true);
assert.equal(cancelMix.monto, 400);
assert.equal(cancelMix.pendiente, 400);
assert.equal(ventasMix[0].estado_credito, 'pendiente');
const deudaMix = armarRegistroClientesExt(ventasMix, movsMix);
assert.equal(deudaMix.totales.cobrado, 600);
assert.equal(deudaMix.totales.pendiente, 400);
assert.equal(deudaMix.clientes[0].tickets[0].cobros.some((c) => c.nota === 'Crédito cobrado' && c.monto === 600), true);
assert.equal(movsMix.find((m) => m.id === 'ab-real').estatus, 'cancelado');

const otraVez = await cancelarCobroClienteExt(dbMix, { cobroId: 'ab-real', usuarioNombre: 'Ana' });
assert.equal(otraVez.ok, false);

const ventaMixLiq = {
  id: 'vm',
  folio: 'VR-1',
  cliente_tipo: 'externo',
  cliente_id: 'cli-f',
  cliente_nombre: 'fernán 2',
  metodo_pago: 'mixto',
  total: 500,
  estado_credito: 'pendiente',
  created_at: '2026-11-25T20:00:00Z',
  articulos: [
    { nombre: 'Hulk', cantidad: 10, precio: 50, importe: 500 },
    { _pago_mixto: true, efectivo: 200, credito: 300 },
  ],
};
const abonoLiq = {
  id: 'ab-liq',
  tipo: 'abono',
  venta_id: 'vm',
  cliente_tipo: 'externo',
  cliente_id: 'cli-f',
  monto: 100,
  notas: 'Abono',
  estatus: 'pagado',
  created_at: '2026-11-25T21:00:00Z',
};
const regLiq = armarRegistroClientesExt([ventaMixLiq], [abonoLiq]);
const liq0 = armarLiquidacionClientesExt(regLiq, [abonoLiq]);
assert.equal(liq0.totales.efectivo, 200);
assert.equal(liq0.totales.abonos, 100);
assert.equal(liq0.totales.total, 300);
assert.equal(liq0.lineas.length, 2);
assert.equal(regLiq.totales.pendiente, 200);
const sello = {
  id: 'liq-1',
  tipo: 'liquidacion',
  cliente_tipo: 'externo',
  cliente_id: 'rc-liquidacion',
  monto: 300,
  estatus: 'cerrada',
  created_at: '2026-11-25T22:00:00Z',
  usuario_nombre: 'Ana',
  notas: `LIQ ${JSON.stringify({ efectivo: 200, abonos: 100, refs: liq0.lineas.map((l) => l.ref), usuario: 'Ana' })}`,
};
const liq1 = armarLiquidacionClientesExt(regLiq, [abonoLiq, sello]);
assert.equal(liq1.lineas.length, 0);
assert.equal(liq1.historial[0].total, 300);
assert.equal(liq1.historial[0].usuario, 'Ana');
const regConSello = armarRegistroClientesExt([ventaMixLiq], [abonoLiq, sello]);
assert.equal(regConSello.totales.cobrado, regLiq.totales.cobrado);
assert.equal(regConSello.totales.pendiente, regLiq.totales.pendiente);
const selloCancel = { ...sello, estatus: 'cancelado', notas: `CANCELADO · ${sello.notas}` };
const liq2 = armarLiquidacionClientesExt(regLiq, [abonoLiq, selloCancel]);
assert.equal(liq2.lineas.length, 2);
assert.equal(liq2.historial[0].cancelada, true);
const soloDeuda = armarLiquidacionClientesExt(armarRegistroClientesExt([ventaCredito()], []), []);
assert.equal(soloDeuda.lineas.length, 0);
const soloEfe = armarLiquidacionClientesExt(armarRegistroClientesExt([contado], []), []);
assert.equal(soloEfe.totales.efectivo, 80);
assert.equal(soloEfe.totales.abonos, 0);

const ventasLiq = [ventaMixLiq];
const movsLiq = [abonoLiq];
const dbLiq = mockDb(ventasLiq, movsLiq);
const hecha = await registrarLiquidacionClienteExt(dbLiq, {
  refs: liq0.lineas.map((l) => l.ref),
  usuarioNombre: 'Ana',
});
assert.equal(hecha.ok, true);
assert.equal(hecha.monto, 300);
assert.equal(hecha.efectivo, 200);
assert.equal(hecha.abonos, 100);
const guardada = movsLiq.find((m) => m.tipo === 'liquidacion');
assert.equal(guardada.monto, 300);
const registroLiq = armarLiquidacionClientesExt(armarRegistroClientesExt(ventasLiq, movsLiq), movsLiq);
assert.equal(registroLiq.lineas.length, 0);
assert.equal(registroLiq.historial.length, 1);
assert.equal(registroLiq.historial[0].total, 300);
assert.equal(registroLiq.historial[0].partes[0].cliente, 'fernán 2');
assert.equal(registroLiq.historial[0].partes[0].monto, 300);
const repetida = await registrarLiquidacionClienteExt(dbLiq, { refs: ['efe:vm'], usuarioNombre: 'Ana' });
assert.equal(repetida.ok, false);
const cancelLiq = await cancelarLiquidacionClienteExt(dbLiq, { liquidacionId: guardada.id, usuarioNombre: 'Ana' });
assert.equal(cancelLiq.ok, true);
assert.equal(cancelLiq.monto, 300);
assert.equal(guardada.estatus, 'cancelado');
assert.equal(armarLiquidacionClientesExt(armarRegistroClientesExt(ventasLiq, movsLiq), movsLiq).lineas.length, 2);
const otraLiq = await cancelarLiquidacionClienteExt(dbLiq, { liquidacionId: guardada.id, usuarioNombre: 'Ana' });
assert.equal(otraLiq.ok, false);

console.log('rcClientesExt.test.mjs ok');
