import assert from 'node:assert/strict';
import {
  DIAS_ARCHIVO_DEFAULT,
  TIPOS_ARCHIVO,
  agruparArchivoPorSucursalDeptoFecha,
  construirArbolArchivoPorEvento,
  construirArbolArchivoPorDepartamento,
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

{
  const sample = [
    { id: 1, sucursal_id: '3B10', departamento: 'Abarrotes', departamento_raw: 'abarrotes', fecha: '2026-09-01', tipo: 'gastos', tipoLabel: 'Gastos de corte', resumen: 'a' },
    { id: 2, sucursal_id: '3B10', departamento: 'Abarrotes', departamento_raw: 'abarrotes', fecha: '2026-09-02', tipo: 'cierres', tipoLabel: 'Cortes (cierres)', resumen: 'b' },
    { id: 3, sucursal_id: '3B10', departamento: 'Virtual', departamento_raw: 'virtual', fecha: '2026-09-03', tipo: 'cierres', tipoLabel: 'Cortes (cierres)', resumen: 'c' },
    { id: 4, sucursal_id: '3B2', departamento: 'Virtual', departamento_raw: 'virtual', fecha: '2026-08-15', tipo: 'vales', tipoLabel: 'Vales', resumen: 'd' },
  ];
  const porEv = construirArbolArchivoPorEvento(sample);
  assert.equal(porEv.length, 2, '2 tiendas');
  const t10 = porEv.find((t) => t.id === '3B10');
  assert.equal(t10.count, 3);
  assert.ok(t10.eventos.some((e) => e.id === 'cierres'));
  assert.ok(t10.eventos.some((e) => e.id === 'gastos'));
  const cierres = t10.eventos.find((e) => e.id === 'cierres');
  assert.equal(cierres.departamentos.length, 2, 'Virtual y Abarrotes bajo Cortes');

  const porDep = construirArbolArchivoPorDepartamento(sample);
  const t10b = porDep.find((t) => t.id === '3B10');
  const abar = t10b.departamentos.find((d) => d.id === 'abarrotes');
  assert.equal(abar.eventos.length, 2, 'gastos + cierres bajo Abarrotes');
}

console.log('archivo.test.mjs OK');

