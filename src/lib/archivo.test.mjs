import assert from 'node:assert/strict';
import {
  DIAS_ARCHIVO_DEFAULT,
  TIPOS_ARCHIVO,
  agruparArchivoPorSucursalDeptoFecha,
  fechaUmbralArchivo,
  ymdUmbralArchivo,
  faltaColumnaArchivedAt,
  guardarDiasArchivoOperativo,
  leerDiasArchivoOperativo,
} from './archivo.js';

assert.equal(DIAS_ARCHIVO_DEFAULT, 15);
assert.ok(TIPOS_ARCHIVO.length >= 6);
assert.ok(TIPOS_ARCHIVO.some((t) => t.id === 'cierres'));
assert.ok(TIPOS_ARCHIVO.some((t) => t.id === 'nominas'));

{
  const ref = new Date('2026-10-08T12:00:00');
  // Con días explícitos (no depende de localStorage del entorno)
  assert.equal(ymdUmbralArchivo(ref, 15), '2026-09-23');
  assert.equal(ymdUmbralArchivo(ref, 30), '2026-09-08');
  assert.equal(ymdUmbralArchivo(ref, 7), '2026-10-01');
  assert.ok(fechaUmbralArchivo(ref, 15).startsWith('2026-09-23'));
}

assert.equal(
  faltaColumnaArchivedAt({ message: 'column archived_at does not exist' }),
  true,
);
assert.equal(faltaColumnaArchivedAt({ message: 'other error' }), false);

{
  const prev = leerDiasArchivoOperativo();
  assert.equal(guardarDiasArchivoOperativo(45), 45);
  assert.equal(leerDiasArchivoOperativo(), 45);
  assert.equal(guardarDiasArchivoOperativo(0), 1, 'mínimo 1');
  assert.equal(guardarDiasArchivoOperativo(999), 365, 'máximo 365');
  guardarDiasArchivoOperativo(prev);
}

{
  const grupos = agruparArchivoPorSucursalDeptoFecha([
    { id: 1, sucursal_id: '3B10', departamento: 'Abarrotes', fecha: '2026-09-01', tipo: 'gastos' },
    { id: 2, sucursal_id: '3B10', departamento: 'Abarrotes', fecha: '2026-09-01', tipo: 'cierres' },
    { id: 3, sucursal_id: '3B2', departamento: 'Virtual', fecha: '2026-08-15', tipo: 'vales' },
  ]);
  assert.equal(grupos.length, 2);
  const g310 = grupos.find((g) => g.sucursal_id === '3B10');
  assert.equal(g310.items.length, 2);
}

console.log('archivo.test.mjs OK');
