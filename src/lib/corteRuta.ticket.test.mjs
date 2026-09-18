import assert from 'node:assert/strict';
import {
  construirTicketCorteRuta,
  montosPagoVentaRuta,
  resumirVentasRutaParaCorte,
} from './corteRuta.js';

// Mixto: montos desde meta
{
  const m = montosPagoVentaRuta({
    metodo_pago: 'mixto',
    total: 100,
    articulos: [{ _pago_mixto: true, efectivo: 40, credito: 60 }],
  });
  assert.equal(m.efectivo, 40);
  assert.equal(m.credito, 60);
}

const ventas = [
  { folio: 'A', metodo_pago: 'efectivo', total: 50 },
  { folio: 'B', metodo_pago: 'credito', total: 30 },
  { folio: 'C', metodo_pago: 'mixto', total: 20, articulos: [{ _pago_mixto: true, efectivo: 5, credito: 15 }] },
];
const res = resumirVentasRutaParaCorte(ventas);
assert.equal(res.tickets, 3);
assert.equal(res.total, 100);
assert.equal(res.efectivoEsperado, 55);
assert.equal(res.credito, 45);

const ticket = construirTicketCorteRuta(
  {
    fecha: '2026-03-17',
    carga_folio: 'RC-1',
    vendedor_nombre: 'Juan Repartidor',
    tickets: res.tickets,
    total_ventas: res.total,
    efectivo_esperado: res.efectivoEsperado,
    credito: res.credito,
    efectivo_contado: 55,
    diferencia: 0,
    por_metodo: res.porMetodo,
    notas: 'ok',
    usuario: 'Admin',
  },
);

assert.equal(ticket.usuario, 'Juan Repartidor');
assert.equal(ticket.turno, 'Juan Repartidor');
assert.match(ticket.sucursal, /RUTA/);
assert.ok(ticket.detalleMetodos.some((d) => d.metodo === 'Efectivo' && d.monto === 50));
assert.ok(ticket.detalleMetodos.some((d) => d.metodo === 'Crédito' && d.monto === 30));
assert.ok(ticket.detalleMetodos.every((d) => 'monto' in d));
assert.match(String(ticket.notas || ''), /Crédito en ventas/);
assert.match(String(ticket.notas || ''), /Cerrado por: Admin/);

console.log('corteRuta.ticket.test.mjs OK');
