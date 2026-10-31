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

// Pago mixto: una línea «ambos» genera un egreso Virtual y otro Abarrotes.
{
  const { sincronizarEgresosPayrollNomina, revertirEgresosPayrollNomina } = await import('./nominaIeSync.js');
  const insertados = [];
  const borrados = [];
  const builderDe = (tabla) => {
    let modo = 'select';
    let payload = null;
    const b = {
      select() { return b; },
      insert(rows) { modo = 'insert'; payload = rows[0]; return b; },
      delete() { modo = 'delete'; return b; },
      in(_c, v) { if (modo === 'delete') borrados.push(...v); return b; },
      eq() { return b; }, gte() { return b; }, lte() { return b; }, limit() { return b; },
      order() { return b; }, or() { return b; }, upsert() { return b; }, update() { return b; },
      async maybeSingle() { return { data: null, error: null }; },
      async single() {
        if (modo === 'insert' && tabla === 'cont_virtual_egresos') {
          insertados.push(payload);
          return { data: { id: `e${insertados.length}` }, error: null };
        }
        return { data: null, error: null };
      },
      then(res) {
        const out = tabla === 'cont_virtual_categorias'
          ? { data: null, error: { code: '42P01', message: 'relation cont_virtual_categorias does not exist' } }
          : modo === 'delete'
            ? { data: [], error: null }
            : { data: [], error: null };
        return Promise.resolve(out).then(res);
      },
    };
    return b;
  };
  const fake = () => ({ from: (t) => builderDe(t) });
  const res = await sincronizarEgresosPayrollNomina(fake(), {
    periodo: { id: 'p1', sucursal_id: 'MAIN', periodo_inicio: '2026-10-24', periodo_fin: '2026-10-30' },
    lineasInsertadas: [
      { id: 'L1', usuario_id: 'u1', nombre: 'Luz Zazueta', total: 3000, pagador_nomina: 'ambos', pago_virtual: 1200 },
      { id: 'L2', usuario_id: 'u2', nombre: 'Ana', total: 500, pagador_nomina: 'virtual' },
    ],
    empleados: [],
  });
  assert.equal(res.ok, true);
  const payroll = insertados.filter((e) => e.fuente === FUENTE_PAYROLL);
  const luz = payroll.filter((e) => e.usuario_nombre === 'Luz Zazueta');
  assert.equal(luz.length, 2);
  assert.deepEqual(luz.map((e) => [e.cuenta, e.monto, e.ref_id]).sort(), [['abarrotes', 1800, 'L1'], ['virtual', 1200, 'L1:virtual']]);
  assert.equal(payroll.filter((e) => e.usuario_nombre === 'Ana').length, 1);
  await revertirEgresosPayrollNomina(fake(), [{ id: 'L1' }]);
  assert.ok(borrados.includes('L1') && borrados.includes('L1:virtual'));
}
console.log('nominaIeSync mixto: ok');
