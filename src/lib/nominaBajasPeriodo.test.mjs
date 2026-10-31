import assert from 'node:assert/strict';
import { empleadosParaNominaGlobal } from './empleadosVisibles.js';
import { bajasEnPeriodoNomina, lineasDesdeEmpleados } from './nomina.js';

const usuarios = [
  { id: 'u1', nombre: 'Ana Pérez', rol: 'Cajero', sucursal_id: '3B2', activo: true },
  { id: 'u2', nombre: 'Beto Ruiz', rol: 'Cajero', sucursal_id: '3B2', activo: false },
  { id: 'u3', nombre: 'Carla Diaz', rol: 'Cajero', sucursal_id: '3B2', activo: false },
  { id: 'u4', nombre: 'Dora Sol', rol: 'Cajero', sucursal_id: '3B2', activo: false },
];

const soloU = (arr) => arr.map((e) => e.id).filter((id) => /^u\d$/.test(id)).sort();
assert.deepEqual(soloU(empleadosParaNominaGlobal(usuarios)), ['u1']);

const bajas = { porId: new Map([['u2', '2026-10-28']]), porNombre: new Map([['carla diaz', '2026-10-29']]) };
const lista = empleadosParaNominaGlobal(usuarios, { bajasEnPeriodo: bajas });
assert.deepEqual(soloU(lista), ['u1', 'u2', 'u3']);
assert.equal(lista.find((e) => e.id === 'u2').fecha_baja_nomina, '2026-10-28');
assert.equal(lista.find((e) => e.id === 'u3').fecha_baja_nomina, '2026-10-29');

const lineas = lineasDesdeEmpleados(lista);
assert.equal(lineas.find((l) => l.usuario_id === 'u2').fecha_baja, '2026-10-28');
assert.equal(lineas.find((l) => l.usuario_id === 'u1').fecha_baja, null);

const sb = (rows, error = null) => {
  const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, then: (r) => Promise.resolve({ data: rows, error }).then(r) };
  return { from: () => q };
};
const r = await bajasEnPeriodoNomina(sb([{ usuario_id: 'u2', nombre: 'Beto', apellidos: 'Ruiz', fecha_baja: '2026-10-28' }]), { desde: '2026-10-24', hasta: '2026-10-30' });
assert.equal(r.porId.get('u2'), '2026-10-28');
assert.equal(r.porNombre.get('beto ruiz'), '2026-10-28');
assert.equal(await bajasEnPeriodoNomina(sb([]), { desde: 'a', hasta: 'b' }), null);
assert.equal(await bajasEnPeriodoNomina(sb(null, { message: 'no table' }), { desde: 'a', hasta: 'b' }), null);
console.log('nominaBajasPeriodo: ok');
