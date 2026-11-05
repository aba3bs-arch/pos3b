import assert from 'node:assert/strict';
import { resumenMercanciaEnTransitoPorRepartidor } from './controlEfectivo.js';

const llamadas = [];
const supabase = {
  from(tabla) {
    llamadas.push(tabla);
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () =>
        Promise.resolve({
          data: [{ id: 't1', repartidor_id: 'r1', monto: 100, tipo_movimiento: 'Recolección', sucursal_origen: '3B1' }],
          error: null,
        }),
    };
    return q;
  },
};

const reps = [{ id: 'r1', nombre: 'Luis' }, { id: 'r2', nombre: 'Ana' }];
const resumen = await resumenMercanciaEnTransitoPorRepartidor(supabase, reps);
assert.deepEqual(llamadas, ['transito_efectivo'], 'con repartidores ya cargados no vuelve a consultarlos');
assert.equal(resumen.find((r) => r.id === 'r1').total, 100);
assert.equal(resumen.find((r) => r.id === 'r2').count, 0);
console.log('resumenTransitoReps.test.mjs ok');
