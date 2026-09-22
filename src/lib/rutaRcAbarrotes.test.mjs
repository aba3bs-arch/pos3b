import assert from 'node:assert/strict';
import {
  esCierreRecoleccionRc,
  esPendienteBandejaRc,
  itemBandejaDesdeCorte,
  etiquetaRecolectorRVirtual,
} from './rVirtual.js';
import { detalleRecoleccionParaIe } from './corteContabilidad/calc.js';
import { estadoAprobacionRecoleccionInicial } from './contabilidadConstants.js';

/** Simula el payload que genera registrarRecoleccionRcAbarrotesDesdeVentaRuta. */
function cierreDesdeVentaRuta({ monto, vendedorNombre, sucursalId, folio }) {
  const recolector = vendedorNombre || 'Recolector ruta';
  const estadoAprob = estadoAprobacionRecoleccionInicial(recolector);
  return {
    id: 'cierre-vr-1',
    sucursal_id: sucursalId || 'CEDIS',
    modulo: 'abarrotes',
    folio: `REC-${folio}`,
    turno: 'RECOLECCION',
    usuario_nombre: recolector,
    created_at: '2026-09-22T12:00:00Z',
    detalle: detalleRecoleccionParaIe({
      efectivo: monto,
      gastosTotal: 0,
      extras: {
        tipo_cierre: 'recoleccion',
        estado_aprobacion: estadoAprob,
        origen: 'venta_ruta',
        folio_venta: folio,
      },
    }),
  };
}

const recLuis = cierreDesdeVentaRuta({
  monto: 850,
  vendedorNombre: 'Luis Enrique Ozuna',
  sucursalId: 'FUSION',
  folio: 'VRABC123',
});
assert.equal(esCierreRecoleccionRc(recLuis, 'abarrotes'), true);
assert.equal(esPendienteBandejaRc(recLuis, 'abarrotes'), true);
assert.equal(esCierreRecoleccionRc(recLuis, 'virtual'), false);

const item = itemBandejaDesdeCorte(recLuis);
assert.equal(item.monto, 850);
assert.equal(item.tipoItem, 'Recolección Abarrotes');
assert.equal(item.modulo, 'abarrotes');
assert.equal(item.receivable, true);
assert.equal(item.recolectorEtiqueta, 'Luis Enrique Ozuna');
assert.equal(item.detalle, 'modulo:abarrotes');
assert.match(item.folio, /REC-VRABC123/);

const recRep = cierreDesdeVentaRuta({
  monto: 200,
  vendedorNombre: 'Juan Repartidor',
  sucursalId: 'CEDIS',
  folio: 'VR999',
});
assert.equal(esCierreRecoleccionRc(recRep, 'abarrotes'), true);
const itemRep = itemBandejaDesdeCorte(recRep);
assert.equal(itemRep.recolectorNombre, 'Juan Repartidor');
assert.equal(itemRep.receivable, true);
assert.equal(etiquetaRecolectorRVirtual('Juan Repartidor'), 'Juan Repartidor');

// FJBB no entra a bandeja RC (va directo a IE)
const recFjbb = cierreDesdeVentaRuta({
  monto: 100,
  vendedorNombre: 'Francisco',
  folio: 'VRFJBB',
});
assert.equal(esCierreRecoleccionRc(recFjbb, 'abarrotes'), false);

console.log('rutaRcAbarrotes.test.mjs ok');
