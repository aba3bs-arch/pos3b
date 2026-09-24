import assert from 'node:assert/strict';
import { gastoCuentaEnNomina } from './nominaGastos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';

assert.equal(gastoDescuentaNomina('abarrotes', 'EMPLEADO', 'CONSUMO'), true);
assert.equal(gastoDescuentaNomina('virtual', 'EMPLEADO', 'CONSUMO'), true);
assert.equal(gastoDescuentaNomina('abarrotes', 'EMPLEADO', 'ANTICIPO'), true);

assert.equal(
  gastoCuentaEnNomina({
    modulo: 'abarrotes',
    categoria: 'EMPLEADO',
    subcategoria: 'CONSUMO',
    descontado_nomina: false,
    estado_aprobacion: 'aprobado',
    usuario_nombre: 'Misael',
    monto: 50,
  }),
  true,
);

assert.equal(
  gastoCuentaEnNomina({
    modulo: 'virtual',
    categoria: 'EMPLEADO',
    subcategoria: 'CONSUMO',
    descontado_nomina: false,
    estado_aprobacion: 'aprobado',
    usuario_nombre: 'Luis Enrique',
    monto: 80,
  }),
  true,
);

// Ya marcado descontado_nomina no afecta gastoCuentaEnNomina (el filtro es en la query);
// sí debe contar conceptualmente como gasto de nómina.
assert.equal(
  gastoCuentaEnNomina({
    modulo: 'abarrotes',
    categoria: 'EMPLEADO',
    subcategoria: 'CONSUMO',
    descontado_nomina: true,
    usuario_nombre: 'Misael',
  }),
  true,
);

const empleados = [
  { id: 'uuid-misael', nombre: 'Misael', rol: 'Técnico', sucursal_id: 'MAIN' },
  { id: 'uuid-luis', nombre: 'Luis Enrique Mada Osuna', rol: 'Repartidor', sucursal_id: 'MAIN' },
];
const idx = indiceEmpleados(empleados);
assert.equal(
  resolverClaveEmpleado({ usuario_id: 'uuid-misael', usuario_nombre: 'Misael' }, idx),
  'uuid-misael',
);
assert.equal(
  resolverClaveEmpleado({ usuario_id: null, usuario_nombre: 'Misael' }, idx),
  'uuid-misael',
);
assert.equal(
  resolverClaveEmpleado({ usuario_id: 'consumo-pin:misael', usuario_nombre: 'Misael' }, idx),
  'uuid-misael',
);

console.log('nomina.consumoPinCorte.test.mjs OK');
