import assert from 'node:assert/strict';
import test from 'node:test';
import { unificarEgresosParaPanel } from './contVirtualEgresos.js';

const base = {
  fecha: '2026-11-08',
  created_at: '2026-11-08T20:14:00Z',
  sucursal_id: '3B5',
  estado_aprobacion: 'aprobado',
  usuario_nombre: 'Azul Carrillo',
};

test('Abarrotes: CUBRE TURNO del corte aparece en IE sin esperar la recolección', () => {
  const r = unificarEgresosParaPanel({
    gastosCorte: [
      { ...base, id: 'g1', modulo: 'abarrotes', categoria: 'CUBRE TURNO', subcategoria: 'Gen', monto: 480 },
      { ...base, id: 'g2', modulo: 'abarrotes', categoria: 'CUBRE TURNO', monto: 80 },
    ],
  });
  assert.equal(r.egresosTotal, 560);
  assert.equal(r.detalle.length, 2);
});

test('Abarrotes: si el libro ya trae el renglón del gasto no se duplica', () => {
  const r = unificarEgresosParaPanel({
    egresosLibro: [
      { id: 'e1', fecha: '2026-11-08', cuenta: 'abarrotes', monto: 480, categoria_id: 'cubre-turno', categoria_nombre: 'Cubre turno', ref_tabla: 'cortes_contabilidad_gastos', ref_id: 'g1' },
    ],
    gastosCorte: [
      { ...base, id: 'g1', modulo: 'abarrotes', categoria: 'CUBRE TURNO', monto: 480 },
    ],
  });
  assert.equal(r.egresosTotal, 480);
  assert.equal(r.detalle.length, 1);
});

test('Virtual/Garage: CUBRE TURNO sigue esperando la recolección', () => {
  const r = unificarEgresosParaPanel({
    gastosCorte: [{ ...base, id: 'g3', modulo: 'virtual', categoria: 'CUBRE TURNO', monto: 300 }],
  });
  assert.equal(r.egresosTotal, 0);
});
