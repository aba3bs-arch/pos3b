import test from 'node:test';
import assert from 'node:assert/strict';
import { firmaInventarioDesdeFirmante, firmaInventarioYaRegistrada, resolverFirmanteInventario } from './firmaInventarioPin.js';
import { normalizarFirmasInventario } from './resultadoInventario.js';
import { validarPinTemporalCt, ventanaPinParaFecha } from './cubreSolicitudes.js';

const sinUsuario = async () => ({ user: null, error: null });
const solicitud = { id: 'sol1', estado: 'aceptada', pin_temporal: '4827', sucursal_id: 'FUSION', fecha: '2026-10-27', turno_id: 'tarde', turno_etiqueta: 'Tarde', ct_nombre: 'Rosa CT', ...ventanaPinParaFecha('2026-10-27', 'tarde', 'Tarde') };
const dbCon = (rows) => ({ from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => Promise.resolve({ data: rows, error: null }) }; return q; } });

test('usuario normal de la tienda firma con su PIN', async () => {
  const r = await resolverFirmanteInventario({}, '1111', 'FUSION', { buscarUsuario: async () => ({ user: { id: 'u1', nombre: 'Ana' } }) });
  assert.deepEqual(r, { ok: true, firmante: { nombre: 'Ana', usuario_id: 'u1', cubre_turno: false, cubre_solicitud_id: null } });
});

test('PIN temporal de CT activo en la tienda firma y queda marcado como CT', async () => {
  const ahora = new Date('2026-10-27T20:00:00-07:00');
  const r = await resolverFirmanteInventario({}, '4827', 'FUSION', { buscarUsuario: sinUsuario, validarPinCt: (d, p, s) => validarPinTemporalCt(dbCon([solicitud]), p, s), ahora });
  assert.equal(r.ok, true);
  assert.deepEqual(r.firmante, { nombre: 'Rosa CT', usuario_id: null, cubre_turno: true, cubre_solicitud_id: 'sol1' });
});

test('PIN temporal de CT de otra tienda no firma', async () => {
  const r = await resolverFirmanteInventario({}, '4827', '3B7', { buscarUsuario: sinUsuario, validarPinCt: (d, p, s) => validarPinTemporalCt(dbCon([solicitud]), p, s) });
  assert.equal(r.ok, false);
});

test('PIN temporal vencido o de fecha futura no firma y explica el motivo', async () => {
  const vencida = { ...solicitud, fecha: '2026-01-10', ...ventanaPinParaFecha('2026-01-10', 'tarde', 'Tarde') };
  const r = await resolverFirmanteInventario({}, '4827', 'FUSION', { buscarUsuario: sinUsuario, validarPinCt: (d, p, s) => validarPinTemporalCt(dbCon([vencida]), p, s) });
  assert.equal(r.ok, false); assert.match(r.error, /venci/i);
  const futura = { ...solicitud, fecha: '2099-01-10', ...ventanaPinParaFecha('2099-01-10', 'tarde', 'Tarde') };
  const f = await resolverFirmanteInventario({}, '4827', 'FUSION', { buscarUsuario: sinUsuario, validarPinCt: (d, p, s) => validarPinTemporalCt(dbCon([futura]), p, s) });
  assert.equal(f.ok, false); assert.match(f.error, /2099-01-10/);
});

test('PIN desconocido y sin tabla de CT devuelve PIN no válido', async () => {
  const r = await resolverFirmanteInventario({}, '0000', 'FUSION', { buscarUsuario: sinUsuario, validarPinCt: async () => ({ ok: false, razon: 'falta_tabla', error: 'x' }) });
  assert.deepEqual(r, { ok: false, error: 'PIN no válido.' });
});

test('error de consulta del usuario se respeta', async () => {
  const r = await resolverFirmanteInventario({}, '1', 'FUSION', { buscarUsuario: async () => ({ user: null, error: 'Usuario inactivo' }) });
  assert.deepEqual(r, { ok: false, error: 'Usuario inactivo' });
});

test('PIN de otra sucursal sin CT usa el mensaje de sucursal incorrecta', async () => {
  const r = await resolverFirmanteInventario({}, '2222', 'FUSION', {
    buscarUsuario: async () => ({ user: { id: 'u9', nombre: 'Beto' }, avisoSucursal: true, sucursalReal: '3B7' }),
    validarPinCt: async () => ({ ok: false }),
  });
  assert.equal(r.ok, false); assert.match(r.error, /3B7|sucursal/i);
});

test('la firma de CT se guarda con su marca y se conserva al normalizar', () => {
  const firma = firmaInventarioDesdeFirmante({ nombre: 'Rosa CT', usuario_id: null, cubre_turno: true, cubre_solicitud_id: 'sol1' }, new Date('2026-10-27T20:00:00Z'));
  const [f0, f1] = normalizarFirmasInventario([firma]);
  assert.deepEqual(f0, { nombre: 'Rosa CT', usuario_id: null, firmado_at: '2026-10-27T20:00:00.000Z', cubre_turno: true, cubre_solicitud_id: 'sol1' });
  assert.equal(f1.cubre_turno, undefined);
  assert.equal('cubre_turno' in firmaInventarioDesdeFirmante({ nombre: 'Ana', usuario_id: 'u1' }), false);
});

test('la misma persona no firma dos campos (usuario o CT)', () => {
  const firmas = [{ nombre: 'Ana', usuario_id: 'u1' }, { nombre: 'Rosa CT', cubre_turno: true, cubre_solicitud_id: 'sol1' }, { nombre: '' }];
  assert.equal(firmaInventarioYaRegistrada(firmas, 2, { usuario_id: 'u1' }), true);
  assert.equal(firmaInventarioYaRegistrada(firmas, 2, { cubre_solicitud_id: 'sol1' }), true);
  assert.equal(firmaInventarioYaRegistrada(firmas, 0, { usuario_id: 'u1' }), false);
  assert.equal(firmaInventarioYaRegistrada(firmas, 2, { usuario_id: 'u2' }), false);
});
