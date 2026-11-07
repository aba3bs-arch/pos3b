import assert from 'node:assert/strict';
import { editarEmpleadoRh, recontratarEmpleadoRh, reactivarUsuarioPosYRh, esExpedienteCubreTurno } from './rhAba3b.js';

const admin = { id: 'adm', nombre: 'Admin', rol: 'Administrador' };

function crearMock({ rh, usuarios }) {
  const log = { updates: [] };
  const tablas = { rh_empleados: [rh], usuarios };
  const from = (tabla) => {
    let op = 'select';
    let payload = null;
    const filtros = [];
    let uno = false;
    const filas = () => {
      let rows = tablas[tabla] || [];
      for (const f of filtros) {
        rows = rows.filter((r) => (f.tipo === 'eq' ? String(r[f.col]) === String(f.val) : f.val.map(String).includes(String(r[f.col]))));
      }
      return rows;
    };
    const q = {
      select: () => q,
      eq: (col, val) => (filtros.push({ tipo: 'eq', col, val }), q),
      in: (col, val) => (filtros.push({ tipo: 'in', col, val }), q),
      neq: () => q,
      order: () => q,
      limit: () => q,
      gte: () => q,
      lte: () => q,
      is: () => q,
      not: () => q,
      or: () => q,
      insert: (rows) => ((op = 'insert'), (payload = rows), q),
      update: (p) => ((op = 'update'), (payload = p), q),
      delete: () => ((op = 'delete'), q),
      single: () => ((uno = true), q),
      maybeSingle: () => ((uno = true), q),
      then(res, rej) {
        let data = [];
        if (op === 'update') {
          for (const r of filas()) Object.assign(r, payload);
          log.updates.push({ tabla, payload, ids: filas().map((r) => r.id) });
          data = filas().map((r) => ({ ...r }));
        } else if (op === 'select') data = filas().map((r) => ({ ...r }));
        else data = payload;
        const out = { data: uno ? data?.[0] ?? null : data, error: null };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return q;
  };
  return { from, log, tablas };
}

// Kathara fue cajero (baja) y reingresa como Cubre Turno.
{
  const rh = {
    id: 'rh1', usuario_id: 'u1', nombre: 'Kathara', apellidos: '', nombre_completo: 'Kathara',
    tipo_empleado: 'tienda', estado: 'baja', recontratable: true, sucursal_id: '3B1', extras: { ine: true },
  };
  const usuarios = [{ id: 'u1', nombre: 'Kathara', activo: false, rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', pin: '1111' }];
  const sb = crearMock({ rh, usuarios });
  const res = await recontratarEmpleadoRh(sb, 'rh1', { tipo_empleado: 'cubre_turno', sucursal_id: '3B1' }, { user: admin });
  assert.equal(res.ok, true, res.error);
  assert.equal(sb.tablas.usuarios[0].activo, false, 'el usuario POS del ex cajero sigue inactivo');
  assert.equal(sb.tablas.rh_empleados[0].estado, 'activo');
  assert.equal(sb.tablas.rh_empleados[0].tipo_empleado, 'cubre_turno');
  assert.equal(sb.tablas.rh_empleados[0].extras.sin_nomina, true);
  assert.equal(sb.tablas.rh_empleados[0].extras.ine, true, 'conserva documentos');
  assert.match(res.mensaje, /Cubre Turno/);
  assert.ok(!sb.log.updates.some((u) => u.tabla === 'usuarios' && u.payload.activo === true));
}

// Reingreso normal como cajero: sí reactiva al usuario.
{
  const rh = {
    id: 'rh2', usuario_id: 'u2', nombre: 'Luis', apellidos: '', nombre_completo: 'Luis',
    tipo_empleado: 'tienda', estado: 'baja', recontratable: true, sucursal_id: '3B1', extras: {},
  };
  const usuarios = [{ id: 'u2', nombre: 'Luis', activo: false, rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', pin: '2222' }];
  const sb = crearMock({ rh, usuarios });
  const res = await recontratarEmpleadoRh(sb, 'rh2', { tipo_empleado: 'tienda', sucursal_id: '3B1' }, { user: admin });
  assert.equal(res.ok, true, res.error);
  assert.equal(sb.tablas.usuarios[0].activo, true);
}

// Cajero activo que se cambia a Cubre Turno: su usuario POS se desactiva.
{
  const rh = {
    id: 'rh3', usuario_id: 'u3', nombre: 'Ana', apellidos: '', nombre_completo: 'Ana',
    tipo_empleado: 'tienda', estado: 'activo', recontratable: true, sucursal_id: '3B1', extras: {},
  };
  const usuarios = [{ id: 'u3', nombre: 'Ana', activo: true, rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', pin: '3333' }];
  const sb = crearMock({ rh, usuarios });
  const res = await editarEmpleadoRh(sb, 'rh3', { tipo_empleado: 'cubre_turno', sucursal_id: '3B1', ct_sucursales: ['3B1'] }, { user: admin });
  assert.equal(res.ok, true, res.error);
  assert.equal(sb.tablas.usuarios[0].activo, false);
}

// Reingreso desde Usuarios no reactiva a quien ya es Cubre Turno activo.
{
  const rh = {
    id: 'rh4', usuario_id: 'u4', nombre: 'Kathara', apellidos: '', nombre_completo: 'Kathara',
    tipo_empleado: 'cubre_turno', estado: 'activo', recontratable: true, sucursal_id: '3B1', extras: {},
  };
  const usuarios = [{ id: 'u4', nombre: 'Kathara', activo: false, rol: 'Cajero', sucursal_id: '3B1', tipo_empleado: 'tienda', pin: '4444' }];
  const sb = crearMock({ rh, usuarios });
  const res = await reactivarUsuarioPosYRh(sb, usuarios[0], {}, { user: admin });
  assert.equal(res.ok, false);
  assert.match(res.error, /Cubre Turno/);
  assert.equal(sb.tablas.usuarios[0].activo, false);
}

assert.equal(esExpedienteCubreTurno({ tipo_empleado: 'cubre_turno' }), true);
assert.equal(esExpedienteCubreTurno({ tipo_empleado: 'tienda' }), false);
console.log('rhAba3b.reingresoCubreTurno.test.mjs ok');
