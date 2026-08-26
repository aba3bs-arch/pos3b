import assert from 'node:assert/strict';
import { esGastoNominaEmpleadoCorte } from './contVirtualCatalogo.js';
import {
  cuentaIeDesdePagadorNomina,
  lineaNominaYaEnCorte,
  FUENTE_NOM_CORTE,
  FUENTE_PAYROLL,
} from './nominaIeSync.js';
import { unificarEgresosParaPanel } from './contVirtualEgresos.js';

assert.equal(cuentaIeDesdePagadorNomina('virtual'), 'virtual');
assert.equal(cuentaIeDesdePagadorNomina('garage'), 'garage');
assert.equal(cuentaIeDesdePagadorNomina('abarrotes'), 'abarrotes');
assert.equal(cuentaIeDesdePagadorNomina('ambos'), 'abarrotes');
assert.equal(cuentaIeDesdePagadorNomina(''), 'abarrotes');

assert.equal(
  esGastoNominaEmpleadoCorte({ categoria: 'EMPLEADO', subcategoria: 'NOMINA EMPLEADO' }),
  true,
);
assert.equal(
  esGastoNominaEmpleadoCorte({ categoria: 'EMPLEADO', subcategoria: 'CONSUMO' }),
  false,
);
assert.equal(
  esGastoNominaEmpleadoCorte({ categoria: 'EMPLEADO', subcategoria: 'CONSUMO · NOMINA' }),
  false,
);
assert.equal(
  esGastoNominaEmpleadoCorte({ categoria: 'EMPLEADO', subcategoria: 'CUBRE TURNOS' }),
  false,
);

{
  const enCorte = {
    porId: new Set(['u1']),
    porNombre: new Set(['juan perez']),
  };
  assert.equal(lineaNominaYaEnCorte({ usuario_id: 'u1', nombre: 'Otro' }, enCorte), true);
  assert.equal(lineaNominaYaEnCorte({ usuario_id: 'u9', nombre: 'Juan Pérez' }, enCorte), true);
  assert.equal(lineaNominaYaEnCorte({ usuario_id: 'u9', nombre: 'Ana' }, enCorte), false);
}

// Unificar etiqueta nom_corte para NOMINA EMPLEADO
{
  const u = unificarEgresosParaPanel({
    egresosLibro: [],
    gastosCorte: [
      {
        id: 'g1',
        categoria: 'EMPLEADO',
        subcategoria: 'NOMINA EMPLEADO',
        monto: 1500,
        modulo: 'abarrotes',
        sucursal_id: '3B2',
        usuario_nombre: 'Ana',
        estado_aprobacion: 'aprobado',
        created_at: '2026-08-20T12:00:00Z',
      },
      {
        id: 'g2',
        categoria: 'EMPLEADO',
        subcategoria: 'CONSUMO',
        monto: 50,
        modulo: 'abarrotes',
        sucursal_id: '3B2',
        usuario_nombre: 'Ana',
        estado_aprobacion: 'aprobado',
        created_at: '2026-08-20T12:00:00Z',
      },
    ],
    prestamos: [],
    catalogo: [
      {
        id: 'empleado',
        nombre: 'Empleado',
        subcategorias: [
          { id: 'empleado-nomina', nombre: 'Nomina Empleado' },
          { id: 'empleado-consumo', nombre: 'Consumo' },
        ],
      },
    ],
    idsGastosLiberados: new Set(['g1', 'g2']),
  });
  const nom = u.detalle.find((d) => d.id === 'corte-g1');
  const cons = u.detalle.find((d) => d.id === 'corte-g2');
  assert.ok(nom);
  assert.equal(nom.fuente, FUENTE_NOM_CORTE);
  assert.equal(nom.subcategoria, 'Nom corte');
  assert.equal(cons.fuente, 'corte');
  assert.notEqual(cons.subcategoria, 'Nom corte');
}

assert.equal(FUENTE_PAYROLL, 'payroll');

console.log('nominaIeSync.test.mjs OK');
