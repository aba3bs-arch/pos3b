/**
 * Reimpresión desde historial debe conservar el desglose Socio 3B guardado.
 * Ejecutar: node --test src/lib/impresionCorteContabilidad.historialPago.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPagoClienteRecoleccion } from './clientesMaquinas.js';
import { datosImpresionDesdeHistorial } from './impresionCorteContabilidad.js';

describe('datosImpresionDesdeHistorial · Socio 3B', () => {
  it('propaga pago_cliente y etiqueta_cliente del detalle guardado', () => {
    const pago = calcularPagoClienteRecoleccion({
      modulo: 'virtual',
      recoleccion: 3000,
    });
    const h = {
      id: 'cierre-1',
      sucursal_id: 'CLIENTE_DEMO',
      folio: 'REC-V1',
      turno: 'RECOLECCION',
      usuario_nombre: 'Recolector',
      created_at: '2026-03-20T12:00:00.000Z',
      ventas: 0,
      caja_actual: 0,
      detalle: {
        tipo_cierre: 'recoleccion',
        recoleccion: 3000,
        moneda_tope: 5000,
        moneda_final: 2000,
        pago_cliente: pago,
        etiqueta_cliente: 'Socio Demo',
        ticket_socio_3b_guardado_at: '2026-03-20T12:05:00.000Z',
      },
    };

    const data = datosImpresionDesdeHistorial(h, 'virtual');
    assert.equal(data.tipo_cierre, 'recoleccion');
    assert.equal(data.etiqueta_cliente, 'Socio Demo');
    assert.ok(data.pago_cliente);
    assert.equal(data.pago_cliente.pago_cliente, 1020);
    assert.equal(data.pago_cliente.ganancia_empresa, 1530);
    assert.equal(data.pago_cliente.descuento_monto, 450);
  });

  it('garage también conserva el desglose guardado', () => {
    const pago = calcularPagoClienteRecoleccion({
      modulo: 'garage',
      recoleccion: 3000,
    });
    const data = datosImpresionDesdeHistorial(
      {
        sucursal_id: 'CLIENTE_G',
        folio: 'REC-G1',
        detalle: {
          tipo_cierre: 'recoleccion',
          recoleccion: 3000,
          pago_cliente: pago,
          etiqueta_cliente: 'Garage Socio',
        },
      },
      'garage',
    );
    assert.equal(data.etiqueta_cliente, 'Garage Socio');
    assert.equal(data.pago_cliente.pago_cliente, 1200);
    assert.equal(data.pago_cliente.ie_destino, 'IE VIRTUAL · Garage');
  });
});
