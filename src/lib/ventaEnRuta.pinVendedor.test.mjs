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
                  limit: async () => ({ data: usuarios.map(({ pin: _p, ...rest }) => rest), error: null }),
                };
              },
              eq(col, val) {
                if (col === 'pin') {
                  const data = usuarios.filter((u) => String(u.pin) === String(val)).map(({ pin: _p, ...rest }) => rest);
                  return {
                    limit: async () => ({ data, error: null }),
                  };
                }
                return {
                  maybeSingle: async () => {
                    const u = usuarios.find((x) => String(x[col]) === String(val));
                    return { data: u ? (({ pin: _p, ...rest }) => rest)(u) : null, error: null };
                  },
                  limit: async () => ({
                    data: usuarios.filter((x) => String(x[col]) === String(val)).map(({ pin: _p, ...rest }) => rest),
                    error: null,
                  }),
                };
              },
              limit: async () => ({ data: usuarios.map(({ pin: _p, ...rest }) => rest), error: null }),
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
                      return { data: r || null, error: null };
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

// --- listarVendedoresSesionRuta: usuarios Repartidor + Panel RT ---
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
  // listarRepartidores usa .eq('activo', true).order('nombre') — mock debe devolver thenable
  const r = await listarVendedoresSesionRuta(sb);
  assert.ok(!r.error, r.error);
  const ids = (r.data || []).map((v) => v.id);
  assert.ok(ids.includes('u1'), 'incluye usuario Repartidor');
  assert.ok(ids.includes('rt:rt2') || (r.data || []).some((v) => v.repartidor_id === 'rt2'), 'incluye Panel RT puro');
  assert.ok(!(r.data || []).some((v) => v.nombre === 'Inactivo'), 'excluye RT inactivo');
  assert.ok(!(r.data || []).some((v) => v.nombre === 'Cajero Uno'), 'no lista cajeros como vendedores');
  const ana = (r.data || []).find((v) => v.usuario_id === 'u1' || v.id === 'u1');
  assert.ok(ana);
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

// --- PIN vendedor: usuario ---
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
  assert.equal(ok.ok, true);
  assert.equal(ok.user.id, 'r1');

  const wrong = await verificarPinVendedorSesionRuta(sb, {
    pin: '2222',
    vendedorId: 'r1',
    vendedores,
  });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /no corresponde/i);
}

// --- PIN vendedor: Panel RT puro ---
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
  assert.equal(ok.ok, true);
  assert.equal(ok.user.fuente, 'rt');
  assert.equal(ok.user.repartidor_id, 'rt9');

  const bad = await verificarPinVendedorSesionRuta(sb, {
    pin: '0000',
    vendedorId: 'rt:rt9',
    vendedores,
  });
  assert.equal(bad.ok, false);
}

// --- PIN admin corte ---
{
  const users = [
    { id: 'a1', nombre: 'Admin', rol: 'Administrador', activo: true, pin: '1234', sucursal_id: '3B1' },
    { id: 'r1', nombre: 'Rep', rol: 'Repartidor', activo: true, pin: '1111', sucursal_id: '3B1' },
  ];
  // buscarUsuarioPorPinYSucursal needs a richer mock — use verificarPinAdmin with simplified path
  // We stub via from().select().eq('pin')... but auth uses buscarUsuarioPorPinYSucursal
}

// Validaciones básicas admin
{
  const r1 = await verificarPinAdminCorteRuta(null, { pin: '1', adminId: 'a1' });
  assert.equal(r1.ok, false);
  const r2 = await verificarPinAdminCorteRuta({}, { pin: '', adminId: 'a1' });
  assert.match(r2.error, /PIN/i);
  const r3 = await verificarPinAdminCorteRuta({}, { pin: '1234', adminId: '' });
  assert.match(r3.error, /Selecciona/i);
}

// Alias deprecated
{
  const r = await verificarPinRepartidorRuta(null, { pin: '1', repartidorId: 'x' });
  assert.equal(r.ok, false);
}

// --- Privilegios por rol ---
{
  assert.ok(ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL.Repartidor.includes('ruta_pos'));
  assert.ok(!ACCIONES_DEFAULT_VENTA_RUTA_POR_ROL.Repartidor.includes('ruta_corte'));
  assert.ok(puedeAccionVentaRuta('Administrador', '1', 'ruta_corte', { porRol: {}, acciones: {} }));
  assert.equal(
    puedeAccionVentaRuta('Repartidor', '2', 'ruta_pos', {
      porRol: { Repartidor: ['Venta en Ruta'] },
      acciones: {},
    }),
    true,
  );
  // Checkbox explícito false oculta POS aunque sea default
  assert.equal(
    puedeAccionVentaRuta('Repartidor', '2', 'ruta_pos', {
      porRol: { Repartidor: ['Venta en Ruta'] },
      acciones: { ruta_pos: { porRol: { Repartidor: false } } },
    }),
    false,
  );
  // Checkbox explícito true otorga corte al repartidor
  assert.equal(
    puedeAccionVentaRuta('Repartidor', '2', 'ruta_corte', {
      porRol: { Repartidor: ['Venta en Ruta'] },
      acciones: { ruta_corte: { porRol: { Repartidor: true } } },
    }),
    true,
  );
}

console.log('ventaEnRuta.pinVendedor.test.mjs OK');
