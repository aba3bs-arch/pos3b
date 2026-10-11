import assert from 'node:assert/strict';
import {
  construirLineasAuditoriaCamion,
  departamentosAuditoriaCamion,
  lineasAuditoriaPorDepartamento,
  precioVentaPublico,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirAuditoriaCamion,
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
