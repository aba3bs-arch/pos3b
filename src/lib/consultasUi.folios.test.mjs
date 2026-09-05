import assert from 'node:assert/strict';
import { agruparDocumentosInventario } from './consultasUi.js';

const t0 = '2026-09-05T12:00:00.000Z';

const cocaTicket = [
  {
    id: 'c1',
    tipo: 'entrada',
    modo: 'compra',
    folio: 'ING-5-0509-0001',
    sucursal: '3B5',
    producto_id: 'coca-600',
    producto_nombre: 'Coca 600ml',
    cantidad: 24,
    usuario: 'Ana',
    created_at: t0,
  },
  {
    id: 'c2',
    tipo: 'entrada',
    modo: 'compra',
    folio: 'ING-5-0509-0001',
    sucursal: '3B5',
    producto_id: 'coca-2l',
    producto_nombre: 'Coca 2L',
    cantidad: 12,
    usuario: 'Ana',
    created_at: t0,
  },
];

const panTicket = [
  {
    id: 'p1',
    tipo: 'entrada',
    modo: 'compra',
    folio: 'ING-5-0509-0002',
    sucursal: '3B5',
    producto_id: 'pan',
    producto_nombre: 'Pan Bimbo',
    cantidad: 10,
    usuario: 'Ana',
    created_at: t0,
  },
];

const sabritasOtraSuc = [
  {
    id: 's1',
    tipo: 'entrada',
    modo: 'compra',
    folio: 'ING-2-0509-0001',
    sucursal: '3B2',
    producto_id: 'sabritas',
    producto_nombre: 'Sabritas',
    cantidad: 8,
    usuario: 'Luis',
    created_at: t0,
  },
];

{
  const docs = agruparDocumentosInventario([...cocaTicket, ...panTicket, ...sabritasOtraSuc]);
  assert.equal(docs.length, 3, 'Coca, pan y Sabritas deben ser 3 folios distintos');
  const porFolio = Object.fromEntries(docs.map((d) => [d.folio, d]));
  assert.equal(porFolio['ING-5-0509-0001'].lineas.length, 2);
  assert.equal(porFolio['ING-5-0509-0002'].lineas.length, 1);
  assert.equal(porFolio['ING-2-0509-0001'].lineas.length, 1);
}

{
  // Folios viejos iguales no deben mezclar tickets de sucursales distintas.
  const docs = agruparDocumentosInventario([
    { ...cocaTicket[0], folio: 'ING-0509-0001' },
    { ...cocaTicket[1], folio: 'ING-0509-0001' },
    { ...sabritasOtraSuc[0], folio: 'ING-0509-0001' },
  ]);
  assert.equal(docs.length, 2);
  const sucs = docs.map((d) => d.sucursal).sort();
  assert.deepEqual(sucs, ['3B2', '3B5']);
  const coca = docs.find((d) => d.sucursal === '3B5');
  assert.equal(coca.lineas.length, 2);
}

console.log('consultasUi.folios.test.mjs ok');
