import assert from 'node:assert/strict';
import {
  armarCatalogoGastosExt,
  editarGastoClienteExt,
  puedeQuitarDelCatalogo,
  prepararGastoExt,
  resumenVentaConGastos,
  validarNombreCatalogo,
} from './rcClientesExtGastos.js';

const filas = [
  { id: 'c1', parent_id: null, nivel: 1, nombre: 'Operación', orden: 1 },
  { id: 'c2', parent_id: null, nivel: 1, nombre: 'Camión', orden: 0 },
  { id: 's1', parent_id: 'c2', nivel: 2, nombre: 'Combustible', orden: 0 },
  { id: 'd1', parent_id: 's1', nivel: 3, nombre: 'Gasolina', orden: 0 },
  { id: 'd2', parent_id: 's1', nivel: 3, nombre: 'Diésel', orden: 1 },
  { id: 'suelto', parent_id: null, nivel: 2, nombre: 'Huérfano', orden: 0 },
];
const arbol = armarCatalogoGastosExt(filas);
assert.deepEqual(arbol.map((c) => c.nombre), ['Camión', 'Operación']);
assert.equal(arbol[0].subcategorias[0].nombre, 'Combustible');
assert.deepEqual(arbol[0].subcategorias[0].detalles.map((d) => d.nombre), ['Gasolina', 'Diésel']);
assert.equal(arbol[1].subcategorias.length, 0);

const venta = resumenVentaConGastos(
  { efectivo: 2125, credito: 1407, cobrado: 400, pendiente: 1007 },
  [{ monto: 200 }, { monto: 50.5 }],
);
assert.equal(venta.venta, 3532);
assert.equal(venta.gastos, 250.5);
assert.equal(venta.neta, 3281.5);

const cat = validarNombreCatalogo(arbol, { nivel: 1, nombre: '  camión ' });
assert.equal(cat.ok, false);
const sub = validarNombreCatalogo(arbol, { nivel: 2, parentId: 'c2', nombre: 'Peajes' });
assert.equal(sub.ok, true);
assert.equal(sub.parentId, 'c2');
const det = validarNombreCatalogo(arbol, { nivel: 3, parentId: 's1', nombre: 'Gasolina' });
assert.equal(det.ok, false);
const detNuevo = validarNombreCatalogo(arbol, { nivel: 3, parentId: 's1', nombre: 'Aceite' });
assert.equal(detNuevo.ok, true);
assert.equal(validarNombreCatalogo(arbol, { nivel: 3, parentId: 'c2', nombre: 'Aceite' }).ok, false);

const gasto = prepararGastoExt({
  categoriaId: 'c2',
  subcategoriaId: 's1',
  detalleId: 'd1',
  monto: '125,5',
  nota: '  carga  ',
  arbol,
});
assert.equal(gasto.ok, true);
assert.equal(gasto.gasto.monto, 125.5);
assert.equal(gasto.gasto.detalle_nombre, 'Gasolina');
assert.equal(gasto.gasto.notas, 'carga');
assert.equal(prepararGastoExt({ categoriaId: 'c2', subcategoriaId: 's1', detalleId: 'no', monto: 10, arbol }).ok, false);
assert.equal(prepararGastoExt({ categoriaId: 'c1', subcategoriaId: 's1', detalleId: 'd1', monto: 10, arbol }).ok, false);
assert.equal(prepararGastoExt({ categoriaId: 'c2', subcategoriaId: 's1', detalleId: 'd1', monto: 0, arbol }).ok, false);

const gastos = [{ categoria_id: 'c2', subcategoria_id: 's1', detalle_id: 'd1', monto: 10 }];
assert.equal(puedeQuitarDelCatalogo(arbol, 'c2', []).ok, false);
assert.equal(puedeQuitarDelCatalogo(arbol, 's1', []).ok, false);
assert.equal(puedeQuitarDelCatalogo(arbol, 'd1', gastos).ok, false);
assert.equal(puedeQuitarDelCatalogo(arbol, 'd2', gastos).ok, true);
assert.equal(puedeQuitarDelCatalogo(arbol, 'c1', []).ok, true);

const fila = {
  id: 'g1',
  usuario_nombre: 'Luis',
  created_at: '2026-11-25T21:30:00Z',
  monto: 40,
  notas: 'carga',
  categoria_nombre: 'Camión',
  subcategoria_nombre: 'Combustible',
  detalle_nombre: 'Gasolina',
};
const db = {
  from() {
    const state = { patch: null };
    const q = {
      update(patch) { state.patch = patch; return q; },
      eq() { return q; },
      select() { return q; },
      single() {
        Object.assign(fila, state.patch);
        return Promise.resolve({ data: { ...fila }, error: null });
      },
    };
    return q;
  },
};
const editado = await editarGastoClienteExt(db, {
  id: 'g1',
  categoriaId: 'c2',
  subcategoriaId: 's1',
  detalleId: 'd2',
  monto: '55',
  nota: 'otra',
  arbol,
});
assert.equal(editado.ok, true);
assert.equal(editado.data.detalle_nombre, 'Diésel');
assert.equal(editado.data.monto, 55);
assert.equal(editado.data.usuario_nombre, 'Luis');
assert.equal(editado.data.created_at, '2026-11-25T21:30:00Z');
assert.equal(fila.usuario_nombre, 'Luis');
assert.equal(fila.created_at, '2026-11-25T21:30:00Z');

console.log('rcClientesExtGastos.test.mjs ok');
