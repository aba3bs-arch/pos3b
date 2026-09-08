import assert from 'node:assert/strict';
import {
  ambitoDuplicadoUsuario,
  detectarConflictoAltaUsuario,
  encontrarGruposDuplicadosActivos,
  scoreUsuarioParaConservar,
} from './usuariosDuplicados.js';

{
  const a = { id: 1, nombre: 'sandra lourdes martinez galindo', sucursal_id: '3B6', tipo_empleado: 'tienda', activo: true, rol: 'Cajero' };
  const b = {
    id: 2,
    nombre: 'Sandra Lourdes Martinez Galindo',
    sucursal_id: '3B6',
    tipo_empleado: 'tienda',
    activo: true,
    rol: 'Cajero',
    dispositivo_id: 'x',
    dispositivo_id_2: 'y',
  };
  const c = { id: 3, nombre: 'Sandra Lourdes Martinez Galindo', sucursal_id: '3B7', tipo_empleado: 'tienda', activo: true, rol: 'Cajero' };
  assert.equal(ambitoDuplicadoUsuario(a), '3B6');
  assert.ok(scoreUsuarioParaConservar(b) > scoreUsuarioParaConservar(a));

  const grupos = encontrarGruposDuplicadosActivos([a, b, c]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].ambito, '3B6');
  assert.equal(grupos[0].conservar.id, 2);
  assert.equal(grupos[0].duplicados.length, 1);
  assert.equal(grupos[0].duplicados[0].id, 1);
}

{
  const a = {
    id: 1,
    nombre: 'Gabriela Janette Rodriguez Chavez',
    sucursal_id: '3B10',
    tipo_empleado: 'tienda',
    activo: true,
    rol: 'Cajero',
    dispositivo_id: 'a',
    dispositivo_id_2: 'b',
  };
  const b = {
    id: 2,
    nombre: 'Gabriela Janette Rodríguez Chavez',
    sucursal_id: '3B10',
    tipo_empleado: 'tienda',
    activo: true,
    rol: 'Cajero',
  };
  const grupos = encontrarGruposDuplicadosActivos([a, b]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].conservar.id, 1, 'conserva la de 2 equipos');
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
