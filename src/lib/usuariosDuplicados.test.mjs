import assert from 'node:assert/strict';
import {
  ambitoDuplicadoUsuario,
  detectarConflictoAltaUsuario,
  encontrarGruposDuplicadosActivos,
  scoreUsuarioParaConservar,
} from './usuariosDuplicados.js';

{
  const a = { id: 1, nombre: 'Sandra Lourdes', sucursal_id: 'T1', tipo_empleado: 'tienda', activo: true, rol: 'Cajero' };
  const b = { id: 2, nombre: 'Sandra Lourdes', sucursal_id: 'T1', tipo_empleado: 'tienda', activo: true, rol: 'Cajero', dispositivo_id: 'x' };
  const c = { id: 3, nombre: 'Sandra Lourdes', sucursal_id: 'T2', tipo_empleado: 'tienda', activo: true, rol: 'Cajero' };
  assert.equal(ambitoDuplicadoUsuario(a), 'T1');
  assert.ok(scoreUsuarioParaConservar(b) > scoreUsuarioParaConservar(a));

  const grupos = encontrarGruposDuplicadosActivos([a, b, c]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].ambito, 'T1');
  assert.equal(grupos[0].conservar.id, 2);
  assert.equal(grupos[0].duplicados.length, 1);
  assert.equal(grupos[0].duplicados[0].id, 1);
}

{
  const conf = detectarConflictoAltaUsuario(
    [{ id: 1, nombre: 'Sandra Lourdes', sucursal_id: 'CEDIS', tipo_empleado: 'tienda', activo: true, rol: 'Cajero', pin: '1234' }],
    { nombre: 'Sandra Lourdes', sucursal_id: 'CEDIS', tipo_empleado: 'tienda' },
  );
  assert.equal(conf.ok, false);
  assert.equal(conf.tipo, 'activo');
}

{
  const conf = detectarConflictoAltaUsuario(
    [{ id: 1, nombre: 'Sandra Lourdes', sucursal_id: 'CEDIS', tipo_empleado: 'tienda', activo: false, rol: 'Cajero' }],
    { nombre: 'Sandra Lourdes', sucursal_id: 'CEDIS', tipo_empleado: 'tienda' },
  );
  assert.equal(conf.ok, false);
  assert.equal(conf.tipo, 'baja');
}

{
  const conf = detectarConflictoAltaUsuario(
    [{ id: 1, nombre: 'Otra Persona', sucursal_id: 'CEDIS', tipo_empleado: 'tienda', activo: true, rol: 'Cajero' }],
    { nombre: 'Sandra Lourdes', sucursal_id: 'CEDIS', tipo_empleado: 'tienda' },
  );
  assert.equal(conf.ok, true);
}

console.log('usuariosDuplicados.test.mjs ok');
