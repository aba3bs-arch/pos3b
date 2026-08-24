import assert from 'node:assert/strict';
import {
  etiquetaColectaPrestamo,
  prestamoInterareaPuedeRecolectarRc,
} from './contabilidadConstants.js';

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'recuperar', saldo: 100 }),
  false,
  'sin corte colectado no se recolecta a RC',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'por_recolectar', saldo: 100 }),
  true,
  'por_recolectar con saldo puede ir a RC',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'recuperar', saldo: 50, colectado_por: 'JLBB' }),
  true,
  'colectado_por con saldo habilita Recolectar',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'por_recolectar', saldo: 0 }),
  false,
  'sin saldo no aparece Recolectar',
);

assert.equal(
  prestamoInterareaPuedeRecolectarRc({ estado: 'recuperado', saldo: 0, colectado_por: 'JLBB' }),
  false,
  'recuperado no se recolecta',
);

assert.match(
  etiquetaColectaPrestamo({
    colectado_por: 'JLBB',
    colectado_at: '2026-08-23T12:00:00Z',
    colectado_modulo: 'virtual',
    colectado_folio: 'REC-V-054',
  }),
  /JLBB/,
);

assert.match(
  etiquetaColectaPrestamo({
    colectado_por: 'JLBB',
    colectado_at: '2026-08-23T12:00:00Z',
    rc_recibido_por: 'AMR',
    rc_recibido_at: '2026-08-24T10:00:00Z',
    rc_monto: 500,
  }),
  /RC · AMR/,
);

assert.equal(etiquetaColectaPrestamo({ cargado_corte: true }), 'En corte · pendiente recolección');

console.log('prestamosInterareaRc.test.mjs OK');
