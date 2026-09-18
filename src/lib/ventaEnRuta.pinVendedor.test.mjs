import assert from 'node:assert/strict';
import {
  listarVendedoresSesionRuta,
  listarAdministradoresCorteRuta,
  verificarPinVendedorSesionRuta,
  verificarPinAdminCorteRuta,
  verificarPinRepartidorRuta,
} from './ventaEnRuta.js';
import {
  puedeAccionVentaRuta,
  ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL,
} from './ventaEnRutaAcciones.js';

function mockSb({ usuarios = [], repartidores = [] } = {}) {
  return {
    from(table) {
      if (table === 'usuarios') {
        return {
          select() {
            const chain = {
              order() {
                return {
                  limit: async () => ({
                    data: usuarios.map(({ pin: _p, ...rest }) => rest),
                    error: null,
                  }),
                };
              },
              eq(col, val) {
                if (col === 'pin') {
                  const data = usuarios
                    .filter((u) => String(u.pin ?? '').trim() === String(val).trim())
                    .map((u) => ({ ...u }));
                  return {
                    eq(col2, val2) {
                      const data2 = data.filter((u) => String(u[col2]) === String(val2));
                      return {
                        maybeSingle: async () => ({
                          data: data2[0] || null,
                          error: null,
                        }),
                      };
                    },
                    limit: async () => ({ data, error: null }),
                    maybeSingle: async () => ({ data: data[0] || null, error: null }),
                  };
                }
                if (col === 'id') {
                  const u = usuarios.find((x) => String(x.id) === String(val));
                  return {
                    maybeSingle: async () => ({
                      data: u ? { ...u } : null,
                      error: null,
                    }),
                    limit: async () => ({
                      data: u ? [{ ...u }] : [],
                      error: null,
                    }),
                  };
                }
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                  limit: async () => ({ data: [], error: null }),
                };
              },
              limit: async () => ({
                data: usuarios.map((u) => ({ ...u })),
                error: null,
              }),
            };
            return chain;
          },
        };
      }
      if (table === 'repartidores') {
        return {
          select() {
            return {
              eq(col, val) {
                if (col === 'activo') {
                  return {
                    order: async () => ({
                      data: repartidores.filter((r) => r.activo !== false),
                      error: null,
                    }),
                  };
                }
                if (col === 'id') {
                  return {
                    maybeSingle: async () => {
                      const r = repartidores.find((x) => String(x.id) === String(val));
                      return { data: r ? { ...r } : null, error: null };
                    },
                  };
                }
                return {
                  order: async () => ({ data: repartidores, error: null }),
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
              order: async () => ({ data: repartidores, error: null }),
            };
          },
        };
      }
      throw new Error(`tabla inesperada: ${table}`);
    },
  };
}

// --- listarVendedoresSesionRuta ---
{
  const sb = mockSb({
    usuarios: [
      { id: 'u1', nombre: 'Ana Ruta', rol: 'Repartidor', activo: true, pin: '1111' },
      { id: 'u2', nombre: 'Cajero Uno', rol: 'Cajero', activo: true, pin: '2222' },
    ],
    repartidores: [
      { id: 'rt1', nombre: 'Ana Ruta', pin: '1111', activo: true },
      { id: 'rt2', nombre: 'Solo Panel RT', pin: '9999', activo: true },
      { id: 'rt3', nombre: 'Inactivo', pin: '0000', activo: false },
    ],
  });
  const r = await listarVendedoresSesionRuta(sb);
  assert.ok(!r.error, r.error);
  const ids = (r.data || []).map((v) => v.id);
  assert.ok(ids.includes('u1'));
  assert.ok((r.data || []).some((v) => v.repartidor_id === 'rt2'));
  assert.ok(!(r.data || []).some((v) => v.nombre === 'Inactivo'));
  assert.ok(!(r.data || []).some((v) => v.nombre === 'Cajero Uno'));
  const ana = (r.data || []).find((v) => v.usuario_id === 'u1' || v.id === 'u1');
  assert.equal(ana.repartidor_id, 'rt1');
}

// --- listarAdministradoresCorteRuta ---
{
  const sb = mockSb({
    usuarios: [
      { id: 'a1', nombre: 'Admin', rol: 'Administrador', activo: true, pin: '1234' },
      { id: 'g1', nombre: 'Gerente', rol: 'Gerente', activo: true, pin: '5678' },
      { id: 'r1', nombre: 'Rep', rol: 'Repartidor', activo: true, pin: '1111' },
      { id: 'x1', nombre: 'Ex', rol: 'Administrador', activo: false, pin: '0000' },
    ],
  });
  const r = await listarAdministradoresCorteRuta(sb);
  assert.equal(r.data.length, 2);
  assert.deepEqual(r.data.map((u) => u.id).sort(), ['a1', 'g1']);
}

// --- PIN usuario por id ---
{
  const users = [
    { id: 'r1', nombre: 'Rep Uno', rol: 'Repartidor', activo: true, pin: '1111' },
    { id: 'r2', nombre: 'Rep Dos', rol: 'Repartidor', activo: true, pin: '2222' },
  ];
  const vendedores = users.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    fuente: 'usuario',
    usuario_id: u.id,
    repartidor_id: null,
  }));
  const sb = mockSb({ usuarios: users });

  const ok = await verificarPinVendedorSesionRuta(sb, {
    pin: '1111',
    vendedorId: 'r1',
    vendedores,
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.user.id, 'r1');

  const wrong = await verificarPinVendedorSesionRuta(sb, {
    pin: '2222',
    vendedorId: 'r1',
    vendedores,
  });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /PIN incorrecto|no corresponde/i);
}

// --- PIN con espacios / trim ---
{
  const users = [{ id: 'r1', nombre: 'Rep', rol: 'Repartidor', activo: true, pin: ' 3333 ' }];
  const vendedores = [{ id: 'r1', nombre: 'Rep', fuente: 'usuario', usuario_id: 'r1', repartidor_id: null }];
  const sb = mockSb({ usuarios: users });
  const ok = await verificarPinVendedorSesionRuta(sb, { pin: '3333', vendedorId: 'r1', vendedores });
  assert.equal(ok.ok, true, ok.error);
}

// --- PIN Panel RT puro ---
{
  const rt = { id: 'rt9', nombre: 'Reco RT', pin: '4444', activo: true };
  const vendedores = [{
    id: 'rt:rt9',
    nombre: rt.nombre,
    fuente: 'rt',
    usuario_id: null,
    repartidor_id: 'rt9',
  }];
  const sb = mockSb({ repartidores: [rt] });
  const ok = await verificarPinVendedorSesionRuta(sb, {
    pin: '4444',
    vendedorId: 'rt:rt9',
    vendedores,
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.user.fuente, 'rt');
  assert.equal(ok.user.repartidor_id, 'rt9');
}

// --- Usuario enlazado a RT: acepta PIN del Panel RT aunque el de usuarios sea otro ---
{
  const users = [{ id: 'u1', nombre: 'Ana', rol: 'Repartidor', activo: true, pin: '1111' }];
  const rts = [{ id: 'rt1', nombre: 'Ana', pin: '9999', activo: true }];
  const vendedores = [{
    id: 'u1',
    nombre: 'Ana',
    fuente: 'usuario',
    usuario_id: 'u1',
    repartidor_id: 'rt1',
  }];
  const sb = mockSb({ usuarios: users, repartidores: rts });

  const conUsuario = await verificarPinVendedorSesionRuta(sb, {
    pin: '1111',
    vendedorId: 'u1',
    vendedores,
  });
  assert.equal(conUsuario.ok, true, conUsuario.error);

  const conRt = await verificarPinVendedorSesionRuta(sb, {
    pin: '9999',
    vendedorId: 'u1',
    vendedores,
  });
  assert.equal(conRt.ok, true, conRt.error);
  assert.equal(conRt.user.repartidor_id, 'rt1');
}

// --- PIN admin por id ---
{
  const users = [
    { id: 'a1', nombre: 'Admin', rol: 'Administrador', activo: true, pin: '1234', sucursal_id: '3B1' },
    { id: 'r1', nombre: 'Rep', rol: 'Repartidor', activo: true, pin: '1111', sucursal_id: '3B1' },
  ];
  const sb = mockSb({ usuarios: users });
  const ok = await verificarPinAdminCorteRuta(sb, { pin: '1234', adminId: 'a1', sucursal: '3B1' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.user.id, 'a1');

  const badRol = await verificarPinAdminCorteRuta(sb, { pin: '1111', adminId: 'r1', sucursal: '3B1' });
  assert.equal(badRol.ok, false);
}

// Validaciones básicas
{
  const r1 = await verificarPinAdminCorteRuta(null, { pin: '1', adminId: 'a1' });
  assert.equal(r1.ok, false);
  const r2 = await verificarPinAdminCorteRuta({}, { pin: '', adminId: 'a1' });
  assert.match(r2.error, /PIN/i);
  const r3 = await verificarPinAdminCorteRuta({}, { pin: '1234', adminId: '' });
  assert.match(r3.error, /Selecciona/i);
  const r = await verificarPinRepartidorRuta(null, { pin: '1', repartidorId: 'x' });
  assert.equal(r.ok, false);
}

// --- Privilegios ---
{
  assert.ok(ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL.Repartidor.includes('ruta_pos'));
  assert.ok(puedeAccionVentaRuta('Administrador', '1', 'ruta_corte', { porRol: {}, acciones: {} }));
  assert.equal(
    puedeAccionVentaRuta('Repartidor', '2', 'ruta_pos', {
      porRol: { Repartidor: ['Venta en Ruta'] },
      acciones: { ruta_pos: { porRol: { Repartidor: false } } },
    }),
    false,
  );
}

console.log('ventaEnRuta.pinVendedor.test.mjs OK');
