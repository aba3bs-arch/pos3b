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
  enviarCategoriaPorModulo,
  destinosPropiosDeSubcategoria,
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

// enviarCategoriaPorModulo con almacén local (sin Supabase).
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
  // Abarrotes: subs 0 y 1. Después Virtual: subs 1 y 2. Cada módulo conserva lo suyo.
  const r1 = await enviarCategoriaPorModulo(null, 'operativos', {
    subsPorModulo: { abarrotes: [ids[0], ids[1]] },
    subsTodas: ids,
  });
  assert.equal(r1.ok, true);
  let actual = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  const inicial = {
    abarrotes: [ids[0], ids[1]],
    virtual: [ids[1], ids[2]],
  };
  const r2 = await enviarCategoriaPorModulo(null, 'operativos', { subsPorModulo: inicial, subsTodas: ids });
  assert.equal(r2.ok, true);
  actual = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  const visibles = (m) => actual.subcategorias.filter((x) => subcategoriaVisibleEnDestino(x, actual, m)).map((x) => x.id);
  assert.deepEqual(visibles('abarrotes'), [ids[0], ids[1]]);
  assert.deepEqual(visibles('virtual'), [ids[1], ids[2]]);
  assert.deepEqual(visibles('vales'), []);
  assert.equal(categoriaVisibleEnDestino(actual, 'abarrotes'), true);
  assert.equal(categoriaVisibleEnDestino(actual, 'garage'), false);
  assert.deepEqual(destinosPropiosDeSubcategoria(actual.subcategorias.find((x) => x.id === ids[1]), actual), ['abarrotes', 'virtual']);

  // Cambiar solo Virtual no mueve Abarrotes.
  await enviarCategoriaPorModulo(null, 'operativos', { subsPorModulo: { abarrotes: inicial.abarrotes, virtual: [ids[0]] }, subsTodas: ids });
  actual = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  assert.deepEqual(visibles('abarrotes'), [ids[0], ids[1]]);
  assert.deepEqual(visibles('virtual'), [ids[0]]);

  // Ocultar la cuenta de todos los módulos y volver a mostrarla recupera las subcuentas de cada módulo.
  await enviarCategoriaPorModulo(null, 'operativos', { subsPorModulo: {}, subsTodas: [] });
  actual = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  assert.equal(categoriaVisibleEnDestino(actual, 'abarrotes'), false);
  assert.deepEqual(
    actual.subcategorias.filter((x) => destinosPropiosDeSubcategoria(x, actual).includes('abarrotes')).map((x) => x.id),
    [ids[0], ids[1]],
  );

  // Quitar de todos los módulos.
  const quitar = await enviarCategoriaPorModulo(null, 'operativos', { subsPorModulo: {}, subsTodas: ids });
  assert.equal(quitar.ok, true);
  const fin = (await listarCatalogoContVirtual(null)).data.find((c) => c.id === 'operativos');
  assert.equal(categoriaVisibleEnDestino(fin, 'vales'), false);
  assert.equal(categoriaVisibleEnDestino(fin, 'registro_gastos'), false);
}
console.log('contVirtualCatalogo.destinos.test.mjs OK');
