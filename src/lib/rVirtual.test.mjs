import assert from 'node:assert/strict';
import {
  areaCustodiaRc,
  custodiaEsDeArea,
  esCierreRecoleccionRc,
  esDestinoFinalRc,
  esPendienteBandejaRc,
  esRecoleccionGarageDeAgosto,
  esRecoleccionTemporalGarage,
  esRecoleccionYaEnIeVirtual,
  etiquetaDestinoFinalRc,
  etiquetaIeRc,
  etiquetaModuloRc,
  itemBandejaDesdeCorte,
  normalizarAreaRc,
  omitirRecoleccionBandejaGarage,
} from './rVirtual.js';

assert.equal(normalizarAreaRc('garage'), 'garage');
assert.equal(normalizarAreaRc('GARAGE'), 'garage');
assert.equal(normalizarAreaRc('virtual'), 'virtual');
assert.equal(normalizarAreaRc(''), 'virtual');
assert.equal(normalizarAreaRc('abarrotes'), 'abarrotes');
assert.equal(normalizarAreaRc('ABARROTES'), 'abarrotes');

assert.equal(etiquetaDestinoFinalRc('virtual'), 'ABB');
assert.equal(etiquetaDestinoFinalRc('garage'), 'ABB');
assert.equal(etiquetaDestinoFinalRc('abarrotes'), 'FJBB');
assert.equal(etiquetaIeRc('abarrotes'), 'IE ABARROTES');
assert.equal(etiquetaIeRc('virtual'), 'IE VIRTUAL');
assert.equal(etiquetaModuloRc('abarrotes'), 'RC Abarrotes');

assert.equal(esDestinoFinalRc('ABB', 'virtual'), true);
assert.equal(esDestinoFinalRc('Antonio', 'virtual'), true);
assert.equal(esDestinoFinalRc('FJBB', 'virtual'), false);
assert.equal(esDestinoFinalRc('Francisco', 'abarrotes'), true);
assert.equal(esDestinoFinalRc('FJBB', 'abarrotes'), true);
assert.equal(esDestinoFinalRc('ABB', 'abarrotes'), false);

const recVirtualAmr = {
  modulo: 'virtual',
  turno: 'RECOLECCION',
  usuario_nombre: 'AMR',
  detalle: { tipo_cierre: 'recoleccion', recoleccion: 500, r_virtual_estado: null },
};
const recVirtualAbb = {
  modulo: 'virtual',
  turno: 'RECOLECCION',
  usuario_nombre: 'ABB',
  detalle: { tipo_cierre: 'recoleccion', recoleccion: 500 },
};
const recGarageAmrDef = {
  id: 'g1',
  modulo: 'garage',
  turno: 'RECOLECCION',
  usuario_nombre: 'AMR',
  sucursal_id: 'MAIN',
  folio: 'REC-G-1',
  created_at: '2026-09-07T12:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 800,
    maquinas_en_cero: true,
    estado_aprobacion: 'pendiente_admin',
  },
};
const recGarageTemporal = {
  id: 'g2',
  modulo: 'garage',
  turno: 'RECOLECCION',
  usuario_nombre: 'Luis Enrique Ozuna',
  sucursal_id: 'MAIN',
  folio: 'REC-G-2',
  created_at: '2026-09-07T13:00:00Z',
  detalle: { tipo_cierre: 'recoleccion_temporal', recoleccion: 250, maquinas_en_cero: false },
};
const recGarageAbb = {
  id: 'g3',
  modulo: 'garage',
  turno: 'RECOLECCION',
  usuario_nombre: 'ABB',
  sucursal_id: 'MAIN',
  folio: 'REC-G-3',
  created_at: '2026-09-07T14:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 100,
    maquinas_en_cero: true,
    estado_aprobacion: 'aprobado',
  },
};
const recGarageAgosto = {
  id: 'g-ago',
  modulo: 'garage',
  turno: 'RECOLECCION',
  usuario_nombre: 'AMR',
  sucursal_id: 'MAIN',
  folio: 'REC-G-AGO',
  created_at: '2026-08-15T18:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 400,
    maquinas_en_cero: true,
    estado_aprobacion: 'pendiente_admin',
  },
};
const recGarageAgostoTemporal = {
  id: 'g-ago-t',
  modulo: 'garage',
  turno: 'RECOLECCION',
  usuario_nombre: 'Luis Enrique Ozuna',
  sucursal_id: 'MAIN',
  folio: 'REC-G-AGO-T',
  created_at: '2026-08-20T18:00:00Z',
  detalle: { tipo_cierre: 'recoleccion_temporal', recoleccion: 90, maquinas_en_cero: false },
};
const recGarageYaRecibida = {
  ...recGarageAmrDef,
  detalle: { ...recGarageAmrDef.detalle, r_virtual_estado: 'recibido' },
};
const recAbarrotesAmr = {
  id: 'a1',
  modulo: 'abarrotes',
  turno: 'RECOLECCION',
  usuario_nombre: 'AMR',
  sucursal_id: 'MAIN',
  folio: 'REC-A-1',
  created_at: '2026-09-07T12:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 1200,
    estado_aprobacion: 'pendiente_admin',
  },
};
const recAbarrotesFjbb = {
  id: 'a2',
  modulo: 'abarrotes',
  turno: 'RECOLECCION',
  usuario_nombre: 'FJBB',
  sucursal_id: 'MAIN',
  folio: 'REC-A-2',
  created_at: '2026-09-07T13:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 300,
    estado_aprobacion: 'aprobado',
  },
};
const recAbarrotesLuis = {
  id: 'a3',
  modulo: 'abarrotes',
  turno: 'RECOLECCION',
  usuario_nombre: 'Luis Enrique Ozuna',
  sucursal_id: 'FUSION',
  folio: 'REC-A-3',
  created_at: '2026-09-07T14:00:00Z',
  detalle: {
    tipo_cierre: 'recoleccion',
    recoleccion: 450,
    estado_aprobacion: 'pendiente_admin',
  },
};

assert.equal(esCierreRecoleccionRc(recVirtualAmr, 'virtual'), true, 'virtual AMR entra a RC Virtual');
assert.equal(esCierreRecoleccionRc(recVirtualAbb, 'virtual'), false, 'virtual ABB no entra a RC Virtual');
assert.equal(esCierreRecoleccionRc(recGarageAmrDef, 'virtual'), false, 'garage no se mezcla en RC Virtual');
assert.equal(esCierreRecoleccionRc(recGarageAmrDef, 'garage'), true, 'garage definitiva entra a RC Garage');
assert.equal(esCierreRecoleccionRc(recGarageTemporal, 'garage'), true, 'garage temporal entra a RC Garage');
assert.equal(esCierreRecoleccionRc(recGarageAbb, 'garage'), true, 'garage ABB es recolección de garage');
assert.equal(esPendienteBandejaRc(recGarageAbb, 'garage'), false, 'ABB aprobado ya está en IE: no bandeja');
assert.equal(esPendienteBandejaRc(recGarageAmrDef, 'garage'), true, 'AMR pendiente septiembre sí entra');
assert.equal(esPendienteBandejaRc(recGarageTemporal, 'garage'), true, 'temporal septiembre sí entra');
assert.equal(esPendienteBandejaRc(recGarageAgosto, 'garage'), false, 'agosto 2026 no entra aunque esté pendiente');
assert.equal(esPendienteBandejaRc(recGarageAgostoTemporal, 'garage'), false, 'temporal de agosto 2026 no entra');
assert.equal(esRecoleccionYaEnIeVirtual(recGarageAbb), true);
assert.equal(esRecoleccionYaEnIeVirtual(recGarageAmrDef), false);
assert.equal(esRecoleccionGarageDeAgosto(recGarageAgosto), true);
assert.equal(esRecoleccionGarageDeAgosto(recGarageAmrDef), false);
assert.equal(omitirRecoleccionBandejaGarage(recGarageAbb), true);
assert.equal(omitirRecoleccionBandejaGarage(recGarageAgosto), true);
assert.equal(omitirRecoleccionBandejaGarage(recGarageTemporal), false);
assert.equal(esCierreRecoleccionRc(recGarageYaRecibida, 'garage'), false, 'ya recibida no se lista');
assert.equal(esCierreRecoleccionRc(recAbarrotesAmr, 'garage'), false, 'abarrotes no va a RC Garage');
assert.equal(esCierreRecoleccionRc(recAbarrotesAmr, 'virtual'), false, 'abarrotes no va a RC Virtual');
assert.equal(esCierreRecoleccionRc(recAbarrotesAmr, 'abarrotes'), true, 'AMR entra a RC Abarrotes');
assert.equal(esCierreRecoleccionRc(recAbarrotesLuis, 'abarrotes'), true, 'Luis Enrique entra a RC Abarrotes');
assert.equal(esCierreRecoleccionRc(recAbarrotesFjbb, 'abarrotes'), false, 'FJBB no entra a RC Abarrotes (va directo a IE)');
assert.equal(esPendienteBandejaRc(recAbarrotesAmr, 'abarrotes'), true);

assert.equal(esRecoleccionTemporalGarage(recGarageTemporal), true);
assert.equal(esRecoleccionTemporalGarage(recGarageAmrDef), false);
assert.equal(esRecoleccionTemporalGarage(recVirtualAmr), false);

const itemTmp = itemBandejaDesdeCorte(recGarageTemporal);
assert.equal(itemTmp.temporal, true);
assert.equal(itemTmp.receivable, true, 'temporal de Luis Enrique se puede recibir');
assert.equal(itemTmp.aprobadoIe, false, 'temporal no cuenta como En IE');
assert.match(itemTmp.tipoItem, /temporal/i);
assert.equal(itemTmp.recolectorEtiqueta, 'Luis Enrique Ozuna');
assert.equal(itemTmp.monto, 250);

const itemAbb = itemBandejaDesdeCorte(recGarageAbb);
assert.equal(itemAbb.receivable, false, 'ABB garage es registro, no se recarga a cuenta');
assert.equal(itemAbb.aprobadoIe, true, 'ABB definitiva ya está en IE');
assert.equal(itemAbb.recolectorEtiqueta, 'ABB');
assert.equal(itemAbb.monto, 100);

const itemDef = itemBandejaDesdeCorte(recGarageAmrDef);
assert.equal(itemDef.receivable, true);
assert.equal(itemDef.tipoItem, 'Recolección Garage');

const itemAba = itemBandejaDesdeCorte(recAbarrotesAmr);
assert.equal(itemAba.tipoItem, 'Recolección Abarrotes');
assert.equal(itemAba.receivable, true);
assert.equal(itemAba.modulo, 'abarrotes');
assert.equal(itemAba.monto, 1200);
assert.equal(itemAba.detalle, 'modulo:abarrotes');

assert.equal(areaCustodiaRc({ tipo_item: 'Recolección Garage (temporal)' }), 'garage');
assert.equal(areaCustodiaRc({ tipo_item: 'Recolección Virtual' }), 'virtual');
assert.equal(areaCustodiaRc({ tipo_item: 'Recolección Abarrotes' }), 'abarrotes');
assert.equal(areaCustodiaRc({ detalle: 'modulo:garage' }), 'garage');
assert.equal(areaCustodiaRc({ detalle: 'modulo:abarrotes' }), 'abarrotes');
assert.equal(custodiaEsDeArea({ tipo_item: 'Recolección Garage' }, 'garage'), true);
assert.equal(custodiaEsDeArea({ tipo_item: 'Recolección Garage' }, 'virtual'), false);
assert.equal(custodiaEsDeArea({ tipo_item: 'Recolección Abarrotes' }, 'abarrotes'), true);
assert.equal(custodiaEsDeArea({ tipo_item: 'Recolección Abarrotes' }, 'virtual'), false);
assert.equal(custodiaEsDeArea({ tipo_item: 'Préstamo entre áreas' }, 'virtual'), true);

console.log('rVirtual.test.mjs ok');
