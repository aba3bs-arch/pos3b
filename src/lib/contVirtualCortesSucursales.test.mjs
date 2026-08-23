import assert from 'node:assert/strict';
import {
  categoriaEnCatalogoCortes,
  subcategoriaEnCatalogoCortes,
  sucursalEnAlcanceCortes,
  normalizarCortesSucursales,
  etiquetaAlcanceCortes,
} from './contVirtualCatalogo.js';
import { catalogoIeAFormatoCorte } from './corteContabilidad/catalogoGastos.js';

assert.equal(normalizarCortesSucursales(null), null);
assert.equal(normalizarCortesSucursales([]), null);
assert.deepEqual(normalizarCortesSucursales(['fusion', '3B7']), ['FUSION', '3B7']);
assert.equal(sucursalEnAlcanceCortes(null, 'FUSION'), true);
assert.equal(sucursalEnAlcanceCortes(['FUSION'], 'FUSION'), true);
assert.equal(sucursalEnAlcanceCortes(['FUSION'], '3B7'), false);
assert.equal(etiquetaAlcanceCortes(null), 'todas las tiendas');

const catAll = {
  id: 'taxis',
  nombre: 'Taxis',
  activo: true,
  flujo: 'egreso',
  en_catalogo_cortes: true,
  cortes_sucursales: null,
  subcategorias: [
    { id: 'taxis-servicio', nombre: 'Servicio', activo: true, en_catalogo_cortes: true },
  ],
};
assert.equal(categoriaEnCatalogoCortes(catAll), true);
assert.equal(categoriaEnCatalogoCortes(catAll, { sucursal: '3B7' }), true);

const catSoloFusion = {
  ...catAll,
  cortes_sucursales: ['FUSION'],
  subcategorias: [
    { id: 'taxis-servicio', nombre: 'Servicio', activo: true, en_catalogo_cortes: true },
    { id: 'taxis-extra', nombre: 'Extra', activo: true, en_catalogo_cortes: false },
  ],
};
assert.equal(categoriaEnCatalogoCortes(catSoloFusion, { sucursal: 'FUSION' }), true);
assert.equal(categoriaEnCatalogoCortes(catSoloFusion, { sucursal: '3B7' }), false);

assert.equal(
  subcategoriaEnCatalogoCortes(catSoloFusion.subcategorias[0], {
    sucursal: 'FUSION',
    categoria: catSoloFusion,
  }),
  true,
);
assert.equal(
  subcategoriaEnCatalogoCortes(catSoloFusion.subcategorias[1], {
    sucursal: 'FUSION',
    categoria: catSoloFusion,
  }),
  false,
);

const ie = catalogoIeAFormatoCorte([catSoloFusion], 'ie_virtual', { sucursal: 'FUSION' });
assert.equal(ie.length, 1);
assert.deepEqual(ie[0].subcategorias, ['SERVICIO']);

const ieOtra = catalogoIeAFormatoCorte([catSoloFusion], 'ie_virtual', { sucursal: '3B7' });
assert.equal(ieOtra.length, 0);

console.log('contVirtualCortesSucursales.test.mjs ok');
