import assert from 'node:assert/strict';
import { administradoresSinExpedienteRh, sincronizarAdministradoresRh } from './rhAba3b.js';

const usuarios = [
  { id: 'a1', nombre: 'Ana Admin', rol: 'Administrador', activo: true },
  { id: 'a2', nombre: 'Beto Admin', rol: 'Administrador', activo: true },
  { id: 'a3', nombre: 'Cora Admin', rol: 'Administrador', activo: false },
  { id: 'a4', nombre: 'Dani Admin', rol: 'Administrador', activo: true },
  { id: 'c1', nombre: 'Caja Uno', rol: 'Cajero', activo: true },
];
const expedientes = [
  { id: 'r1', usuario_id: 'a1', nombre: 'Ana', apellidos: 'Admin', tipo_empleado: 'administrador', estado: 'activo' },
  { id: 'r2', usuario_id: null, nombre: 'Dani', apellidos: 'Admin', tipo_empleado: 'administrador', rol_sistema: 'Administrador', estado: 'activo' },
  { id: 'r3', usuario_id: null, nombre: 'Beto', apellidos: 'Admin', tipo_empleado: 'tienda', estado: 'activo' },
];

assert.deepEqual(
  administradoresSinExpedienteRh(usuarios, expedientes).map((u) => u.id),
  ['a2'],
  'ligado por usuario_id y por nombre cuentan; el de tienda homónimo no sirve; inactivos y cajeros se ignoran',
);
assert.deepEqual(administradoresSinExpedienteRh(usuarios, []).map((u) => u.id), ['a1', 'a2', 'a4']);

const sinDb = await sincronizarAdministradoresRh(null);
assert.equal(sinDb.creados, 0);

const inserts = [];
const falso = {
  from(tabla) {
    const q = {
      _t: tabla,
      select() { return q; },
      eq(col, val) { if (col === 'usuario_id') q._uid = val; return q; },
      limit() { return q; },
      order() { return q; },
      insert(rows) { inserts.push({ tabla: q._t, rows }); return q; },
      update() { return q; },
      single() { return Promise.resolve({ data: { id: `n${inserts.length}`, ...inserts[inserts.length - 1].rows[0] }, error: null }); },
      then(res) {
        if (q._t === 'usuarios') return res({ data: usuarios.filter((u) => u.rol === 'Administrador'), error: null });
        if (q._t === 'rh_empleados') return res({ data: q._uid ? expedientes.filter((e) => e.usuario_id === q._uid) : expedientes, error: null });
        return res({ data: [], error: null });
      },
    };
    return q;
  },
};
const r = await sincronizarAdministradoresRh(falso, { user: { id: 'x', nombre: 'AMR' } });
assert.equal(r.creados, 1);
const alta = inserts.find((i) => i.tabla === 'rh_empleados');
assert.equal(alta.rows[0].usuario_id, 'a2');
assert.equal(alta.rows[0].tipo_empleado, 'administrador');
assert.equal(alta.rows[0].sucursal_id, 'MAIN');
console.log('rhAba3b.administradores.test.mjs OK');
