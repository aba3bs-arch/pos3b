import assert from 'node:assert/strict';
import {
  asignarVentaALineasProducto,
  disponibleEnLineaCarga,
  inventarioCamionDesdeLineas,
} from './ventaEnRuta.js';

// Tras vender, el disponible de la carga baja (preinventario / POS).
{
  const lineas = [
    {
      id: 'l1',
      carga_id: 'c-camion-A',
      producto_id: 'P1',
      producto_nombre: 'Producto',
      qty_cargada: 20,
      qty_vendida: 0,
      qty_devuelta: 0,
    },
  ];
  assert.equal(disponibleEnLineaCarga(lineas[0]), 20);

  const venta = asignarVentaALineasProducto(lineas, 7);
  assert.equal(venta.ok, true);
  assert.equal(venta.asignaciones[0].cargaId, 'c-camion-A');
  assert.equal(venta.asignaciones[0].qty, 7);

  // Simula update qty_vendida (lo que hace registrarVentaRuta)
  lineas[0].qty_vendida += venta.asignaciones[0].qty;
  assert.equal(disponibleEnLineaCarga(lineas[0]), 13);

  const inv = inventarioCamionDesdeLineas(lineas);
  assert.equal(inv[0]._disp_camion, 13);
  assert.equal(inv[0]._qty_cargada, 20);
  assert.equal(inv[0]._qty_vendida, 7);
}

// No debe mezclar líneas de otro camión al asignar si solo pasamos las de este.
{
  const soloEsteCamion = [
    { id: 'l1', carga_id: 'cA', producto_id: 'X', qty_cargada: 5, qty_vendida: 0, qty_devuelta: 0 },
  ];
  const otroCamion = [
    { id: 'l2', carga_id: 'cB', producto_id: 'X', qty_cargada: 50, qty_vendida: 0, qty_devuelta: 0 },
  ];
  // Si el resolver filtra bien, solo vemos 5.
  const ok = asignarVentaALineasProducto(soloEsteCamion, 5);
  assert.equal(ok.ok, true);
  const fail = asignarVentaALineasProducto(soloEsteCamion, 6);
  assert.equal(fail.ok, false);
  // Sin filtro (bug viejo): tomaría del otro camión
  const mezclado = asignarVentaALineasProducto([...soloEsteCamion, ...otroCamion], 6);
  assert.equal(mezclado.ok, true);
  assert.equal(mezclado.asignaciones.some((a) => a.cargaId === 'cB'), true);
}

console.log('ventaEnRuta.inventarioCarga.test.mjs ok');
