import assert from 'node:assert/strict';
import {
  construirLineasAuditoriaCamion,
  departamentosAuditoriaCamion,
  lineasAuditoriaPorDepartamento,
  precioVentaPublico,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirAuditoriaCamion,
  resumirValorCamion,
  armarCierreAuditoria,
  folioAuditoriaRuta,
  resumirDepartamentoAuditoria,
  siguienteIndicePendiente,
  accionPersistenciaBorradorAuditoria,
  borradorAuditoriaTieneProgreso,
  guardarBorradorAuditoria,
  leerBorradorAuditoria,
  listarBorradoresAuditoria,
  borrarBorradorAuditoria,
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

{
  const inv = [
    { id: 'A', nombre: 'A', cat: 'BEBIDAS', _disp_camion: 10, precio: 20, precio_ruta: 15, precio_compra_sin: 8 },
    { id: 'B', nombre: 'B', cat: 'CIGARROS', _disp_camion: 2, precio: 50, precio_ruta: 45, precio_compra_sin: 40 },
    { id: 'C', nombre: 'C', cat: 'CIGARROS', _disp_camion: 0, precio: 99, precio_compra_sin: 1 },
  ];
  const lineas = construirLineasAuditoriaCamion(inv, {});
  const v = resumirValorCamion(lineas);
  assert.equal(v.productos, 2);
  assert.equal(v.piezas, 12);
  assert.equal(v.valorCosto, 160);
  assert.equal(v.valorPublico, 300);
  assert.equal(v.valorRuta, 240);
  assert.equal(v.margenPotencial, 140);
  assert.equal(v.deptos[0].departamento, 'BEBIDAS');
  assert.equal(v.deptos[0].valorPublico, 200);

  const conteo = construirLineasAuditoriaCamion(inv, { A: '9', B: '2' });
  const libre = armarCierreAuditoria(conteo, [], ['A']);
  assert.equal(libre.lineas.length, 1);
  assert.equal(libre.resumen.piezasFaltantes, 1);
  const mixto = armarCierreAuditoria(conteo, ['CIGARROS'], ['A', 'B']);
  assert.equal(mixto.lineas.length, 3);
  assert.equal(mixto.resumen.valorTeoricoPublico, 300 - 0);
}
console.log('auditoriaCamionRuta (valor camión y libre) OK');

{
  assert.equal(borradorAuditoriaTieneProgreso(null), false);
  assert.equal(borradorAuditoriaTieneProgreso({ conteos: {}, deptosSel: [], paso: 'deptos' }), false);
  assert.equal(borradorAuditoriaTieneProgreso({ deptosSel: ['BEBIDAS'] }), true);
  assert.equal(borradorAuditoriaTieneProgreso({ paso: 'conteo', deptoActivo: 'BEBIDAS' }), true);
  assert.equal(borradorAuditoriaTieneProgreso({ conteos: { A: '4' } }), true);

  // La pantalla vacía al volver no debe borrar el conteo ya guardado.
  assert.equal(accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: 'cam-1',
    paso: 'recolector',
    datos: { conteos: {}, cerrados: {}, deptosSel: [], libreIds: [], paso: 'deptos' },
  }), 'omitir');
  assert.equal(accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: '',
    paso: 'deptos',
    datos: { conteos: { A: '1' }, paso: 'deptos' },
  }), 'omitir');
  assert.equal(accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: 'cam-1',
    paso: 'ticket',
    datos: { conteos: { A: '1' } },
  }), 'omitir');
  assert.equal(accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: 'cam-1',
    paso: 'deptos',
    datos: { conteos: {}, deptosSel: ['BEBIDAS'], paso: 'deptos' },
  }), 'guardar');
  assert.equal(accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: 'cam-1',
    paso: 'conteo',
    datos: { conteos: { A: '9' }, paso: 'conteo', deptoActivo: 'BEBIDAS', indice: 3 },
  }), 'guardar');
}

{
  const data = {};
  globalThis.localStorage = Object.create({
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
    key(i) { return Object.keys(this)[i] ?? null; },
    get length() { return Object.keys(this).length; },
  });
  Object.assign(localStorage, data);

  guardarBorradorAuditoria('cam-1', {
    conteos: { A: '9' },
    paso: 'conteo',
    deptoActivo: 'BEBIDAS',
    indice: 2,
    deptosSel: ['BEBIDAS'],
    recolector_id: 'r1',
    recolector_nombre: 'Ruta 1',
  });
  const leido = leerBorradorAuditoria('cam-1');
  assert.equal(leido.conteos.A, '9');
  assert.equal(leido.deptoActivo, 'BEBIDAS');
  assert.equal(leido.indice, 2);

  const accionVacio = accionPersistenciaBorradorAuditoria({
    camionId: 'cam-1',
    borradorCamion: 'cam-1',
    paso: 'recolector',
    datos: { conteos: {}, paso: 'deptos' },
  });
  assert.equal(accionVacio, 'omitir');
  assert.equal(leerBorradorAuditoria('cam-1').conteos.A, '9');

  const lista = listarBorradoresAuditoria();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].camion_id, 'cam-1');

  borrarBorradorAuditoria('cam-1');
  assert.equal(leerBorradorAuditoria('cam-1'), null);
  assert.equal(listarBorradoresAuditoria().length, 0);
}
console.log('auditoriaCamionRuta (no borrar al salir) OK');
