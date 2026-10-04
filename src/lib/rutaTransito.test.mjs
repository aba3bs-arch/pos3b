import assert from 'node:assert/strict';
import { resolverRepartidorId } from './rutaTransito.js';

function mockSb(repartidores = [], camiones = []) {
  return {
    from(table) {
      if (table === 'repartidores') {
        return {
          select() {
            return {
              order: async () => ({ data: repartidores, error: null }),
            };
          },
        };
      }
      if (table === 'ruta_camiones') {
        return {
          select() {
            return {
              eq(col, val) {
                const api = {
                  _filters: [{ col, val }],
                  eq(c2, v2) {
                    this._filters.push({ col: c2, val: v2 });
                    return this;
                  },
                  limit: async () => {
                    let rows = [...camiones];
                    for (const f of api._filters) {
                      rows = rows.filter((r) => String(r[f.col]) === String(f.val)
                        || (f.col === 'activo' && f.val === true && r.activo !== false));
                    }
                    return { data: rows, error: null };
                  },
                };
                return api;
              },
            };
          },
        };
      }
      throw new Error(`tabla ${table}`);
    },
  };
}

const reps = [
  { id: 'rep_luis', nombre: 'Luis Enrique Mada Osuna', activo: true },
  { id: 'rep_test_user', nombre: 'test user', activo: true },
];

{
  const sb = mockSb(reps);
  const r = await resolverRepartidorId(sb, null, 'test user');
  assert.equal(r.ok, true);
  assert.equal(r.id, 'rep_test_user');
}

{
  const sb = mockSb(reps);
  const r = await resolverRepartidorId(sb, 'rt:rep_test_user', 'test user');
  assert.equal(r.ok, true);
  assert.equal(r.id, 'rep_test_user');
}

{
  const sb = mockSb(reps);
  // Id mal formado con espacio → se normaliza al slug canónico
  const r = await resolverRepartidorId(sb, 'rt:rep_test user', '');
  assert.equal(r.ok, true);
  assert.equal(r.id, 'rep_test_user');
}

{
  const sb = mockSb(reps);
  const r = await resolverRepartidorId(sb, 'rep_fantasma', 'nadie');
  assert.equal(r.ok, false);
}

{
  const uid = '7b22096d-6820-4ba4-8b93-f0392db4b610';
  const sb = mockSb(reps, [
    { usuario_id: uid, repartidor_id: 'rep_luis', activo: true },
  ]);
  const r = await resolverRepartidorId(sb, uid, 'Otro Nombre');
  assert.equal(r.ok, true);
  assert.equal(r.id, 'rep_luis');
}

{
  const sb = mockSb(reps);
  const r = await resolverRepartidorId(sb, 'x', 'y', { repartidorId: 'rep_test_user' });
  assert.equal(r.ok, true);
  assert.equal(r.id, 'rep_test_user');
}

console.log('rutaTransito.test.mjs OK');
