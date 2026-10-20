import assert from 'node:assert/strict';
import {
  MENSAJE_SUPABASE_CAIDO,
  buscarUsuarioPorPinYSucursal,
  esFalloTransitorioSupabase,
} from './usuariosAuth.js';

assert.equal(esFalloTransitorioSupabase({ code: 'PGRST002', message: 'schema cache' }), true);
assert.equal(esFalloTransitorioSupabase({ status: 521, message: 'Web server is down' }), true);
assert.equal(esFalloTransitorioSupabase({ message: 'PIN duplicado' }), false);

function supabaseConGuion(pasos) {
  let i = 0;
  const chain = () => {
    const b = {
      select() { return b; },
      eq() { return b; },
      limit() {
        const paso = pasos[Math.min(i, pasos.length - 1)];
        i += 1;
        return Promise.resolve(paso);
      },
    };
    return b;
  };
  return {
    from() { return chain(); },
    llamadas() { return i; },
  };
}

const reintento = { intentos: 3, esperaMs: 0, timeoutMs: 2000 };
const usuario = {
  id: 'u1',
  pin: '9999',
  activo: true,
  rol: 'Administrador',
  sucursal_id: '3B5',
};
const caido = { data: null, error: { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' } };

const dbParpadeo = supabaseConGuion([
  caido,
  caido,
  { data: [usuario], error: null },
]);
const entro = await buscarUsuarioPorPinYSucursal(dbParpadeo, '9999', '3B5', { reintento });
assert.equal(entro.error, null);
assert.equal(entro.user?.id, 'u1');
assert.equal(dbParpadeo.llamadas(), 3);

const dbCaido = supabaseConGuion([caido, caido, caido]);
const fallo = await buscarUsuarioPorPinYSucursal(dbCaido, '9999', '3B5', { reintento });
assert.equal(fallo.user, null);
assert.equal(fallo.error, MENSAJE_SUPABASE_CAIDO);
assert.equal(dbCaido.llamadas(), 3);

console.log('usuariosAuth.test.mjs ok');
