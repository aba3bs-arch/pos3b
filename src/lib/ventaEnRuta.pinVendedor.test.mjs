import assert from 'node:assert/strict';
import { verificarPinRepartidorRuta } from './ventaEnRuta.js';

// Sin conexión / sin datos
{
  const r = await verificarPinRepartidorRuta(null, { pin: '1234', repartidorId: 'u1' });
  assert.equal(r.ok, false);
  assert.match(r.error, /conexión/i);
}

{
  const r = await verificarPinRepartidorRuta({}, { pin: '', repartidorId: 'u1' });
  assert.equal(r.ok, false);
  assert.match(r.error, /PIN/i);
}

{
  const r = await verificarPinRepartidorRuta({}, { pin: '1234', repartidorId: '' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Selecciona/i);
}

// Mock supabase: PIN correcto del repartidor elegido
{
  const users = [
    { id: 'r1', nombre: 'Rep Uno', rol: 'Repartidor', activo: true, pin: '1111' },
    { id: 'r2', nombre: 'Rep Dos', rol: 'Repartidor', activo: true, pin: '2222' },
    { id: 'c1', nombre: 'Cajero', rol: 'Cajero', activo: true, pin: '3333' },
  ];
  const sb = {
    from(table) {
      assert.equal(table, 'usuarios');
      return {
        select() {
          return {
            eq(_col, pin) {
              const data = users.filter((u) => u.pin === pin).map(({ pin: _p, ...rest }) => rest);
              return {
                limit: async () => ({ data, error: null }),
              };
            },
          };
        },
      };
    },
  };

  const ok = await verificarPinRepartidorRuta(sb, { pin: '1111', repartidorId: 'r1' });
  assert.equal(ok.ok, true);
  assert.equal(ok.user.id, 'r1');
  assert.equal(ok.user.nombre, 'Rep Uno');

  const wrongPerson = await verificarPinRepartidorRuta(sb, { pin: '2222', repartidorId: 'r1' });
  assert.equal(wrongPerson.ok, false);
  assert.match(wrongPerson.error, /no corresponde/i);

  const notRep = await verificarPinRepartidorRuta(sb, { pin: '3333', repartidorId: 'c1' });
  assert.equal(notRep.ok, false);
  assert.match(notRep.error, /Repartidor/i);

  const badPin = await verificarPinRepartidorRuta(sb, { pin: '9999', repartidorId: 'r1' });
  assert.equal(badPin.ok, false);
  assert.match(badPin.error, /incorrecto/i);
}

console.log('ventaEnRuta.pinVendedor.test.mjs OK');
