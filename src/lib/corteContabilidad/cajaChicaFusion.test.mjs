import assert from 'node:assert/strict';
import {
  cajaAnteriorDesdeFilasCierre,
  sucursalIdCorte,
  sucursalesIdCorteQuery,
} from './store.js';

assert.equal(sucursalIdCorte('Fusión'), 'FUSION');
assert.equal(sucursalIdCorte('FUSIÓN'), 'FUSION');
assert.equal(sucursalIdCorte('FUSION'), 'FUSION');
assert.ok(sucursalesIdCorteQuery('Fusión').includes('FUSION'));
assert.ok(sucursalesIdCorteQuery('FUSION').includes('Fusión'));

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'RECOLECCION', caja_actual: 999 },
    { turno: 'DIURNO', caja_actual: 1850.5, detalle: {} },
  ]),
  1850.5,
);

// Cierre con caja_actual=0 (p. ej. recolección de nómina) NO debe revivir
// detalle.caja_anterior ni mirar cierres viejos.
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    {
      turno: 'NOCTURNO',
      caja_actual: 0,
      detalle: { caja_anterior: 1940, recoleccion: '1940', tipo_cierre: 'cierre' },
    },
    { turno: 'NOCTURNO', caja_actual: 1940, detalle: {} },
  ]),
  0,
);

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { deleted_at: '2026-09-01', turno: 'DIURNO', caja_actual: 500 },
    { turno: 'DIURNO', caja_actual: 310 },
  ]),
  310,
);

assert.equal(cajaAnteriorDesdeFilasCierre([]), null);
assert.equal(cajaAnteriorDesdeFilasCierre([{ turno: 'RECOLECCION', caja_actual: 100 }]), null);

// Sin caja_actual en el cierre: solo campos explícitos de arrastre (no caja_anterior).
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_chica: 420, caja_anterior: 999 } },
  ]),
  420,
);
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_anterior: 999 } },
  ]),
  null,
);

console.log('cajaChicaFusion.ok');

// Virtual en ceros: reconstruir desde el último cierre / recolección.
{
  const { estadoVirtualDesdeFilasCierre } = await import('./store.js');
  const cierre = estadoVirtualDesdeFilasCierre([
    {
      turno: 'NOCTURNO',
      caja_actual: 1200,
      detalle: { moneda_inicial: 5000, moneda_inicial_turno: 4800, moneda_final: 4100, moneda_final_editada: true, subtotal: 700, tipo_cierre: 'cierre' },
    },
  ]);
  assert.equal(cierre.moneda_inicial, 5000);
  assert.equal(cierre.moneda_inicial_turno, 4100);
  assert.equal(cierre.caja_anterior, 1200);
  assert.equal(cierre.moneda_final, 0);

  const rec = estadoVirtualDesdeFilasCierre([
    { turno: 'RECOLECCION', caja_actual: 0, detalle: { moneda_inicial: 5000, moneda_final: 4100, moneda_final_editada: true, tipo_cierre: 'recoleccion' } },
  ]);
  assert.equal(rec.caja_anterior, 0);
  assert.equal(rec.moneda_inicial, 5000);
  assert.equal(rec.moneda_inicial_turno, 5000);

  const saltaEliminado = estadoVirtualDesdeFilasCierre([
    { deleted_at: '2026-10-01', turno: 'DIURNO', caja_actual: 9, detalle: { moneda_inicial: 9000, moneda_final: 8000 } },
    { turno: 'DIURNO', caja_actual: 300, detalle: { moneda_inicial: 5000, moneda_final: 4500, moneda_final_editada: true } },
  ]);
  assert.equal(saltaEliminado.caja_anterior, 300);
  assert.equal(estadoVirtualDesdeFilasCierre([]), null);
  assert.equal(estadoVirtualDesdeFilasCierre([{ turno: 'DIURNO', detalle: {} }]), null);
}
// Error de lectura: no devolver un estado "válido" que pueda guardarse encima del real.
{
  const { cargarEstadoCorte } = await import('./store.js');
  const sbError = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'timeout', code: '57014' } }) }) }) }),
    }),
  };
  const r = await cargarEstadoCorte(sbError, 'FUSION', 'virtual');
  assert.equal(r.lecturaFallida, true);
  assert.equal(r.error, 'timeout');
}
console.log('cajaChicaFusion: ok');
