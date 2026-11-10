import assert from 'node:assert/strict';
import {
  DESTINOS_CATALOGO,
  parseDestinosCatalogo,
  serializarDestinosCatalogo,
  destinosDeCategoria,
  categoriaVisibleEnDestino,
  categoriaEnCatalogoCortes,
  subcategoriaVisibleEnDestino,
  destinosDeSubcategoria,
  enviarCategoriaConSubcuentas,
} from './contVirtualCatalogo.js';
import { catalogoIeAFormatoCorte } from './corteContabilidad/catalogoGastos.js';
import { categoriasValeDesdeCatalogoIe } from './valesCatalogoIe.js';

assert.deepEqual(DESTINOS_CATALOGO.map((d) => d.id), ['abarrotes', 'virtual', 'garage', 'vales', 'registro_gastos']);
assert.equal(parseDestinosCatalogo(null), null);
assert.equal(parseDestinosCatalogo(''), null);
assert.deepEqual(parseDestinosCatalogo('abarrotes, virtual,xx'), ['abarrotes', 'virtual']);
assert.deepEqual(parseDestinosCatalogo(['Garage']), ['garage']);
assert.equal(serializarDestinosCatalogo(['virtual', 'virtual', 'vales', 'nada']), 'virtual,vales');
// Selección vacía explícita («-») no es lo mismo que sin selección (null).
assert.equal(serializarDestinosCatalogo([]), '-');
assert.deepEqual(parseDestinosCatalogo('-'), []);

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

// Subcuentas: solo la seleccionada se va.
const admin = {
  id: 'manual',
  nombre: 'Gastos Administrativo',
  activo: true,
  flujo: 'egreso',
  destinos_catalogo: ['vales', 'abarrotes'],
  subcategorias: [
    { id: 'a', nombre: 'Apertura', activo: true, destinos_catalogo: ['vales', 'abarrotes'] },
    { id: 'b', nombre: 'Comidas', activo: true, destinos_catalogo: [], en_catalogo_cortes: false },
    { id: 'c', nombre: 'Cambio moneda', activo: true },
  ],
};
assert.equal(subcategoriaVisibleEnDestino(admin.subcategorias[0], admin, 'vales'), true);
assert.equal(subcategoriaVisibleEnDestino(admin.subcategorias[0], admin, 'virtual'), false);
assert.equal(subcategoriaVisibleEnDestino(admin.subcategorias[1], admin, 'vales'), false);
assert.equal(subcategoriaVisibleEnDestino(admin.subcategorias[1], admin, 'abarrotes'), false);
assert.equal(subcategoriaVisibleEnDestino(admin.subcategorias[2], admin, 'vales'), true); // sin selección propia hereda
assert.deepEqual(destinosDeSubcategoria(admin.subcategorias[0], admin), ['abarrotes', 'vales']);
assert.deepEqual(destinosDeSubcategoria(admin.subcategorias[1], admin), []);
assert.deepEqual(categoriasValeDesdeCatalogoIe([admin])[0].subcategorias.map((x) => x.id), ['a', 'c']);
assert.deepEqual(
  catalogoIeAFormatoCorte([admin], 'ie_abarrotes', 'abarrotes')[0].subcategorias,
  ['APERTURA', 'CAMBIO MONEDA'],
);

// enviarCategoriaConSubcuentas con almacén local (sin Supabase).
{
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    key: (i) => Object.keys(mem)[i] ?? null,
    get length() { return Object.keys(mem).length; },
  };
  const { listarCatalogoContVirtual } = await import('./contVirtualCatalogo.js');
  const ini = await listarCatalogoContVirtual(null);
  const cat = ini.data.find((c) => c.id === 'operativos');
  assert.ok(cat && cat.subcategorias.length >= 3);
  const ids = cat.subcategorias.map((x) => x.id);
  const res = await enviarCategoriaConSubcuentas(null, 'operativos', ['vales'], { subsEnviar: [ids[0]], subsTodas: ids });
  assert.equal(res.ok, true);
  const despues = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  const visibles = despues.subcategorias.filter((x) => subcategoriaVisibleEnDestino(x, despues, 'vales')).map((x) => x.id);
  assert.deepEqual(visibles, [ids[0]]);
  assert.equal(categoriaVisibleEnDestino(despues, 'virtual'), false);
  const quitar = await enviarCategoriaConSubcuentas(null, 'operativos', [], { subsEnviar: [], subsTodas: ids });
  assert.equal(quitar.ok, true);
  const fin = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  assert.equal(categoriaVisibleEnDestino(fin, 'vales'), false);
  assert.equal(categoriaVisibleEnDestino(fin, 'registro_gastos'), false);
}
console.log('contVirtualCatalogo.destinos.test.mjs OK');
