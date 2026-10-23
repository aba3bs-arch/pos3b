import assert from 'node:assert/strict';
import {
  construirLineasAuditoriaCamion,
  departamentosAuditoriaCamion,
  lineasAuditoriaPorDepartamento,
  precioVentaPublico,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirAuditoriaCamion,
  armarCierreAuditoria,
  folioAuditoriaRuta,
  resumirDepartamentoAuditoria,
  siguienteIndicePendiente,
} from './auditoriaCamionRuta.js';

{
  const p = { precio: 25, precio_ruta: 18, precio_compra_sin: 10 };
  assert.equal(precioVentaPublico(p), 25);
}

{
  const inv = [
    {
      id: 'A',
      nombre: 'Prod A',
      cat: 'BEBIDAS',
      _disp_camion: 10,
      precio: 20,
      precio_compra_sin: 8,
      precio_ruta: 15,
    },
    {
      id: 'B',
      nombre: 'Prod B',
      cat: 'ABARROTES',
      _disp_camion: 5,
      precio: 40,
      precio_compra_sin: 22,
    },
    {
      id: 'C',
      nombre: 'Prod C',
      cat: 'BEBIDAS',
      _disp_camion: 2,
      precio: 10,
      precio_compra_sin: 4,
    },
  ];
  const lineas = construirLineasAuditoriaCamion(inv, { A: '7', B: '5' });
  assert.equal(lineas[0].faltante, 3);
  assert.equal(lineas[0].cat, 'BEBIDAS');
  assert.equal(lineas[0].perdidaCosto, 24);
  assert.equal(lineas[0].perdidaPublico, 60);
  assert.equal(lineas[1].faltante, 0);

  const r = resumirAuditoriaCamion(lineas);
  assert.equal(r.piezasFaltantes, 3);
  assert.equal(r.perdidaCosto, 24);
  assert.equal(r.perdidaPublico, 60);
  assert.equal(r.margenPerdidoPublico, 36);

  assert.deepEqual(departamentosAuditoriaCamion(inv), ['ABARROTES', 'BEBIDAS']);
  const beb = lineasAuditoriaPorDepartamento(lineas, 'BEBIDAS');
  assert.equal(beb.length, 2);
  assert.ok(beb.every((l) => l.cat === 'BEBIDAS'));

  const prog = progresoDepartamentosAuditoria(lineas);
  const rowBeb = prog.find((d) => d.departamento === 'BEBIDAS');
  assert.equal(rowBeb.productos, 2);
  assert.equal(rowBeb.contados, 1);
  assert.equal(rowBeb.piezasFaltantes, 3);
  assert.equal(rowBeb.pct, 50);
  assert.equal(rowBeb.completo, false);
  const rowAba = prog.find((d) => d.departamento === 'ABARROTES');
  assert.equal(rowAba.completo, true);
}

{
  const cams = [
    { id: 'c1', activo: true, repartidor_id: 'rt1', usuario_id: null, codigo: 'CAM-1' },
    { id: 'c2', activo: true, repartidor_id: null, usuario_id: 'u9', codigo: 'CAM-2' },
  ];
  assert.equal(resolverCamionDeRecolector(cams, { id: 'rt1', repartidor_id: 'rt1' })?.id, 'c1');
  assert.equal(resolverCamionDeRecolector(cams, { id: 'x', usuario_id: 'u9' })?.id, 'c2');
  assert.equal(resolverCamionDeRecolector(cams, { id: 'nope' }), null);
}

console.log('auditoriaCamionRuta.test.mjs ok');

{
  const inv = [
    { id: 'A', nombre: 'A', cat: 'BEBIDAS', _disp_camion: 10, precio: 20, precio_compra_sin: 8 },
    { id: 'B', nombre: 'B', cat: 'BEBIDAS', _disp_camion: 5, precio: 10, precio_compra_sin: 4 },
    { id: 'C', nombre: 'C', cat: 'CIGARROS', _disp_camion: 3, precio: 50, precio_compra_sin: 40 },
  ];
  const lineas = construirLineasAuditoriaCamion(inv, { A: '8', B: '5', C: '1' });
  const beb = lineasAuditoriaPorDepartamento(lineas, 'BEBIDAS');
  const rd = resumirDepartamentoAuditoria(beb);
  assert.equal(rd.listoParaCerrar, true);
  assert.equal(rd.piezasFaltantes, 2);
  assert.equal(rd.cuadran, 1);
  assert.equal(rd.piezasContadas, 13);
  assert.equal(rd.piezasTeoricas, 15);

  const pend = construirLineasAuditoriaCamion(inv, { A: '8' });
  const bebP = lineasAuditoriaPorDepartamento(pend, 'BEBIDAS');
  assert.equal(resumirDepartamentoAuditoria(bebP).listoParaCerrar, false);
  assert.equal(siguienteIndicePendiente(bebP, 0), 1);
  assert.equal(siguienteIndicePendiente(bebP, 1), -1);
  assert.equal(siguienteIndicePendiente(lineasAuditoriaPorDepartamento(construirLineasAuditoriaCamion(inv, {}), 'BEBIDAS'), 1), 0);

  const cierre = armarCierreAuditoria(lineas, ['BEBIDAS']);
  assert.equal(cierre.lineas.length, 2);
  assert.equal(cierre.deptos.length, 1);
  assert.equal(cierre.resumen.piezasFaltantes, 2);
  assert.equal(cierre.resumen.perdidaCosto, 16);
  assert.equal(cierre.resumen.perdidaPublico, 40);

  const f = new Date(2026, 9, 22, 10, 0);
  assert.equal(folioAuditoriaRuta([], f), 'INV-RT-261022-001');
  assert.equal(folioAuditoriaRuta([{ folio: 'INV-RT-261022-001' }, { folio: 'INV-RT-261021-009' }], f), 'INV-RT-261022-002');
}
console.log('auditoriaCamionRuta (flujo por departamento) OK');
