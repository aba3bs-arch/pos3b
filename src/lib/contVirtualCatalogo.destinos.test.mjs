import assert from 'node:assert/strict';
import {
  DESTINOS_CATALOGO,
  parseDestinosCatalogo,
  serializarDestinosCatalogo,
  destinosDeCategoria,
  categoriaVisibleEnDestino,
  categoriaEnCatalogoCortes,
} from './contVirtualCatalogo.js';
import { catalogoIeAFormatoCorte } from './corteContabilidad/catalogoGastos.js';
import { categoriasValeDesdeCatalogoIe } from './valesCatalogoIe.js';

assert.deepEqual(DESTINOS_CATALOGO.map((d) => d.id), ['abarrotes', 'virtual', 'garage', 'vales', 'registro_gastos']);
assert.equal(parseDestinosCatalogo(null), null);
assert.equal(parseDestinosCatalogo(''), null);
assert.deepEqual(parseDestinosCatalogo('abarrotes, virtual,xx'), ['abarrotes', 'virtual']);
assert.deepEqual(parseDestinosCatalogo(['Garage']), ['garage']);
assert.equal(serializarDestinosCatalogo(['virtual', 'virtual', 'vales', 'nada']), 'virtual,vales');

// Sin selección guardada = comportamiento anterior.
const legado = { id: 'luz', nombre: 'Luz', activo: true, flujo: 'egreso' };
assert.deepEqual(destinosDeCategoria(legado), ['abarrotes', 'virtual', 'garage', 'vales', 'registro_gastos']);
const legadoSinCortes = { ...legado, en_catalogo_cortes: false };
assert.deepEqual(destinosDeCategoria(legadoSinCortes), ['vales', 'registro_gastos']);
assert.equal(categoriaEnCatalogoCortes(legadoSinCortes), false);

// Selección explícita.
const soloAbarrotes = { ...legado, destinos_catalogo: ['abarrotes'] };
assert.equal(categoriaVisibleEnDestino(soloAbarrotes, 'abarrotes'), true);
assert.equal(categoriaVisibleEnDestino(soloAbarrotes, 'virtual'), false);
assert.equal(categoriaVisibleEnDestino(soloAbarrotes, 'vales'), false);
assert.equal(categoriaEnCatalogoCortes(soloAbarrotes), true);
const soloVales = { ...legado, destinos_catalogo: ['vales'] };
assert.equal(categoriaEnCatalogoCortes(soloVales), false);
assert.equal(categoriaVisibleEnDestino({ ...legado, destinos_catalogo: [] }, 'garage'), false);
// Ingresos nunca; Empleado siempre.
assert.equal(categoriaVisibleEnDestino({ id: 'ing-x', nombre: 'X', flujo: 'ingreso' }, 'virtual'), false);
assert.equal(categoriaVisibleEnDestino({ id: 'empleado', nombre: 'Empleado', destinos_catalogo: [] }, 'garage'), true);

const catalogo = [
  { ...soloAbarrotes, subcategorias: [{ id: 's1', nombre: 'Recibo', activo: true }] },
  { id: 'gas', nombre: 'Gasolina', activo: true, flujo: 'egreso', destinos_catalogo: ['virtual', 'garage'], subcategorias: [{ id: 's2', nombre: 'Carga', activo: true }] },
  { id: 'vales', nombre: 'Vales', activo: true, flujo: 'egreso', destinos_catalogo: ['vales'], subcategorias: [{ id: 's3', nombre: 'Consumo', activo: true }] },
];
const nombres = (m) => catalogoIeAFormatoCorte(catalogo, m === 'abarrotes' ? 'ie_abarrotes' : 'ie_virtual', m).map((c) => c.categoria);
assert.deepEqual(nombres('abarrotes'), ['LUZ']);
assert.deepEqual(nombres('virtual'), ['GASOLINA']);
assert.deepEqual(nombres('garage'), ['GASOLINA']);

// Vales: solo las enviadas a Vales.
const idsVales = categoriasValeDesdeCatalogoIe(catalogo.map((c) => ({ ...c, flujo: 'egreso' }))).map((c) => c.id);
assert.deepEqual(idsVales, ['vales']);

// Cuenta de sistema «manual» (p. ej. renombrada «Gastos Administrativo»): fuera de Vales por defecto, entra si se envía.
const manual = { id: 'manual', nombre: 'Gastos Administrativo', activo: true, flujo: 'egreso', fijo: true, subcategorias: [{ id: 'manual-otros', nombre: 'Otros', activo: true }] };
assert.deepEqual(destinosDeCategoria(manual), ['abarrotes', 'virtual', 'garage', 'registro_gastos']);
assert.equal(categoriasValeDesdeCatalogoIe([manual]).some((c) => c.id === 'manual'), false);
const enviada = { ...manual, destinos_catalogo: ['vales', 'abarrotes'] };
const vales = categoriasValeDesdeCatalogoIe([enviada]);
assert.equal(vales[0].id, 'manual');
assert.equal(vales[0].label, 'Gastos Administrativo');
assert.deepEqual(vales[0].subcategorias.map((s) => s.id), ['manual-otros']);
console.log('contVirtualCatalogo.destinos.test.mjs OK');
