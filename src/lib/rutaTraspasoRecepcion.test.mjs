import assert from 'node:assert/strict';
import {
  crearTraspasoEnviadoDesdeRuta,
  filtrarParaRecibir,
  etiquetaOrigenTraspaso,
  normalizarLineasTraspasoIniciales,
} from './traspasosInventario.js';
import { SUCURSAL_RUTA } from '../constants/sucursales.js';

assert.equal(etiquetaOrigenTraspaso('RUTA'), 'Venta en ruta');
assert.equal(etiquetaOrigenTraspaso(SUCURSAL_RUTA), 'Venta en ruta');

const lineas = normalizarLineasTraspasoIniciales([
  { productoId: 'P1', nombre: 'Agua', cantidad: 2, precio: 10 },
  { producto_id: 'P2', nombre: 'Pan', cantidad: 1, precio: 8 },
]);
assert.equal(lineas.length, 2);

const upserted = [];
const fakeSb = {
  from(tabla) {
    return {
      upsert(row) {
        upserted.push({ tabla, row });
        return {
          select() {
            return {
              single: async () => ({ data: row, error: null }),
            };
          },
        };
      },
    };
  },
};

// siguienteFolioTrp usa supabase; mock mínimo vía stub del módulo no es trivial.
// Probamos filtrarParaRecibir y la forma del doc resultante con upsert directo.

const doc = {
  id: 't1',
  tipo: 'envio',
  estado: 'enviado',
  origen_id: 'RUTA',
  destino_id: '3B5',
  lineas,
};
assert.equal(filtrarParaRecibir([doc], '3B5').length, 1);
assert.equal(filtrarParaRecibir([doc], '3B3').length, 0);
assert.equal(filtrarParaRecibir([{ ...doc, estado: 'recibido' }], '3B5').length, 0);

// Sin supabase → error claro
{
  const r = await crearTraspasoEnviadoDesdeRuta(null, {
    destinoId: '3B5',
    lineas,
  });
  assert.equal(r.ok, false);
}

console.log('rutaTraspasoRecepcion.test.mjs OK');
