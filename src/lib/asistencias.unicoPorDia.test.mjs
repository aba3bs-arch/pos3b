import assert from 'node:assert/strict';
import { actualizarMarcajeAsistencia, crearMarcajeAsistencia } from './asistencias.js';

function mockSupabase(tabla) {
  const insertados = [];
  return {
    insertados,
    from() {
      const filtros = {};
      const q = {
        select: () => q,
        gte: (c, v) => ((filtros.gte = v), q),
        lt: (c, v) => ((filtros.lt = v), q),
        limit: () => q,
        eq: (c, v) => ((filtros[`eq_${c}`] = v), q),
        is: (c, v) => ((filtros[`is_${c}`] = v), q),
        maybeSingle: () => Promise.resolve({ data: tabla.find((r) => r.id === filtros.eq_id) || null }),
        insert: (rows) => {
          insertados.push(...rows);
          return Promise.resolve({ error: null });
        },
        update: () => q,
        then(res, rej) {
          const data = tabla.filter((r) => {
            if (filtros.eq_usuario_id != null && String(r.usuario_id) !== String(filtros.eq_usuario_id)) return false;
            if ('is_usuario_id' in filtros && r.usuario_id != null) return false;
            if (filtros.eq_nombre != null && r.nombre !== filtros.eq_nombre) return false;
            return r.created_at >= filtros.gte && r.created_at < filtros.lt;
          });
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

const tabla = [
  { id: 'a', usuario_id: 7, nombre: 'Luis', tipo: 'ENTRADA', created_at: '2026-11-06T15:00:00.000Z', sucursal_id: '3B1' },
];
const sb = mockSupabase(tabla);
const base = { usuario_id: 7, nombre: 'Luis', sucursal_id: '3B1' };

let r = await crearMarcajeAsistencia(sb, { ...base, tipo: 'ENTRADA', created_at: '2026-11-06T17:00:00.000Z' });
assert.equal(r.ok, false);
assert.equal(r.duplicado, true);
assert.equal(sb.insertados.length, 0);

r = await crearMarcajeAsistencia(sb, { ...base, tipo: 'SALIDA', created_at: '2026-11-06T23:00:00.000Z' });
assert.equal(r.ok, true);
assert.equal(sb.insertados.length, 1);

// Día siguiente: otra entrada sí.
r = await crearMarcajeAsistencia(sb, { ...base, tipo: 'ENTRADA', created_at: '2026-11-07T15:00:00.000Z' });
assert.equal(r.ok, true);

// Cambiar a ENTRADA una salida del mismo día con entrada ya existente se rechaza.
tabla.push({ id: 'b', usuario_id: 7, nombre: 'Luis', tipo: 'SALIDA', created_at: '2026-11-06T23:00:00.000Z' });
r = await actualizarMarcajeAsistencia(sb, 'b', { tipo: 'ENTRADA' });
assert.equal(r.ok, false);
assert.match(r.error, /una entrada/);
console.log('asistencias.unicoPorDia.test.mjs ok');
