import assert from 'node:assert/strict';
import {
  itemIngresoManualDesdeFila,
  actualizarIngresoContVirtual,
  eliminarIngresoContVirtual,
  registrarIngresoContVirtual,
} from './contVirtualIngresos.js';

// Shape de item incluye campos para editar en IE
{
  const item = itemIngresoManualDesdeFila({
    id: 'abc',
    fecha: '2026-08-26',
    monto: 150.5,
    sucursal_id: '3B2',
    cuenta: 'virtual',
    categoria_id: 'ing-manual',
    categoria_nombre: 'Manual',
    subcategoria_id: 'ing-manual-otros',
    subcategoria_nombre: 'Otros',
    descripcion: 'Ajuste',
  });
  assert.equal(item.tipo_mov, 'manual');
  assert.equal(item.manual, true);
  assert.equal(item.categoria_id, 'ing-manual');
  assert.equal(item.subcategoria_id, 'ing-manual-otros');
  assert.equal(item.descripcion, 'Ajuste');
  assert.equal(item.monto, 150.5);
}

// CRUD local (sin supabase)
{
  const created = await registrarIngresoContVirtual(null, {
    monto: 200,
    categoria_id: 'ing-manual',
    categoria_nombre: 'Manual',
    sucursal_id: 'MAIN',
    fecha: '2026-08-26',
    cuenta: 'abarrotes',
    descripcion: 'Prueba',
  });
  assert.equal(created.ok, true);
  assert.ok(created.id);

  const upd = await actualizarIngresoContVirtual(null, created.id, {
    monto: 250,
    descripcion: 'Corregido',
  });
  assert.equal(upd.ok, true);

  const del = await eliminarIngresoContVirtual(null, created.id);
  assert.equal(del.ok, true);
}

console.log('contVirtualIngresos.test.mjs OK');
