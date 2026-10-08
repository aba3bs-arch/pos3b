import assert from 'node:assert/strict';
import {
  construirLineasAuditoriaCamion,
  precioVentaPublico,
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
      _disp_camion: 10,
      precio: 20,
      precio_compra_sin: 8,
      precio_ruta: 15,
    },
    {
      id: 'B',
      nombre: 'Prod B',
      _disp_camion: 5,
      precio: 40,
      precio_compra_sin: 22,
    },
  ];
  const lineas = construirLineasAuditoriaCamion(inv, { A: '7', B: '5' });
  assert.equal(lineas[0].faltante, 3);
  assert.equal(lineas[0].perdidaCosto, 24);
  assert.equal(lineas[0].perdidaPublico, 60);
  assert.equal(lineas[1].faltante, 0);

  const r = resumirAuditoriaCamion(lineas);
  assert.equal(r.piezasFaltantes, 3);
  assert.equal(r.perdidaCosto, 24);
  assert.equal(r.perdidaPublico, 60);
  assert.equal(r.margenPerdidoPublico, 36);
}

console.log('auditoriaCamionRuta.test.mjs ok');
