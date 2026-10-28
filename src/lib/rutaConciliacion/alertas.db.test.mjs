import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidarRuta } from '../consolidacionRuta.js';
import { construirHallazgos } from './motor.js';
import { cambiarEstadoAlerta, listarAlertas, sincronizarAlertas } from './alertas.js';

function dbEnMemoria() {
  const t = { ruta_conciliacion_alertas: [], ruta_conciliacion_corridas: [], contabilidad_notificaciones: [] };
  let seq = 0;
  const consulta = (tabla) => {
    const st = { filtros: [], patch: null };
    const filas = () => t[tabla].filter((r) => st.filtros.every((f) => f(r)));
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      in(c, v) { st.filtros.push((r) => v.includes(r[c])); return thenable(); },
      eq(c, v) { st.filtros.push((r) => r[c] === v); return thenable(); },
      range() { return Promise.resolve({ data: filas(), error: null }); },
      update(p) { st.patch = p; return q; },
      upsert(rows, o) {
        for (const r of rows) if (!(o.ignoreDuplicates && t[tabla].some((x) => x.clave === r.clave))) t[tabla].push({ id: `id${++seq}`, ...r });
        return Promise.resolve({ error: null });
      },
      insert(rows) {
        const filas2 = rows.map((r) => ({ id: `id${++seq}`, ...r })); t[tabla].push(...filas2);
        const r = { select: () => ({ single: () => Promise.resolve({ data: { id: filas2[0].id }, error: null }) }) };
        return r;
      },
    };
    const thenable = () => Object.assign(q, { then(res) { 
      if (st.patch) { filas().forEach((r) => Object.assign(r, st.patch)); return Promise.resolve({ error: null }).then(res); }
      return Promise.resolve({ data: filas(), error: null }).then(res); } });
    return q;
  };
  return { t, from: consulta };
}

const venta = { id: 'v1', carga_id: 'c1', folio: 'VR-1-M', cliente_tipo: 'sucursal', cliente_id: 'FUSION', cliente_nombre: 'Fusión', metodo_pago: 'efectivo', total: 40, created_at: '2026-10-20T10:00:00Z', articulos: [{ producto_id: 'p1', nombre: 'Arroz', cantidad: 2 }], vendedor_nombre: 'Luis', compra_id: 'p1' };
const datos = (gasto) => ({ ventas: [venta], cargas: [{ id: 'c1', vendedor_id: 'u1', vendedor_nombre: 'Luis' }], compras: [{ id: 'p1', sucursal_id: 'FUSION', estado: 'recibida' }],
  movimientos: [{ tipo: 'entrada', sucursal_id: 'FUSION', producto_id: 'p1', cantidad: 2, meta: { compra_id: 'p1' } }], gastos: gasto ? [{ id: 'g1', categoria: 'PROVEEDORES', sucursal_id: 'FUSION', comentario: 'VR-1-M', monto: gasto }] : [],
  cxc: [], transitos: [{ id: 't1', num_traspaso: 'VR-1-M', monto: 40, tipo_movimiento: 'Venta Ruta', estatus: 'En Tránsito' }] });
const correr = async (db, gasto) => {
  const { entregas } = consolidarRuta(datos(gasto));
  return sincronizarAlertas(db, { hallazgos: construirHallazgos(entregas).hallazgos, entregas, ahora: new Date('2026-10-27T20:00:00Z') });
};

test('guarda alertas, avisa una vez, es idempotente y se auto-resuelve al corregir el gasto', async () => {
  const db = dbEnMemoria();
  const r1 = await correr(db, 0);
  assert.equal(r1.ok, true);
  const criticas = db.t.ruta_conciliacion_alertas.filter((a) => a.severidad === 'critica');
  assert.equal(criticas.length, 1);
  assert.equal(r1.notificadas, 1);
  assert.equal(db.t.contabilidad_notificaciones[0].tipo, 'ruta_conciliacion');
  const total = db.t.ruta_conciliacion_alertas.length;

  const r2 = await correr(db, 0);
  assert.equal(r2.nuevas, 0); assert.equal(r2.notificadas, 0);
  assert.equal(db.t.ruta_conciliacion_alertas.length, total);
  assert.equal(db.t.contabilidad_notificaciones.length, 1);

  const r3 = await correr(db, 40);
  assert.ok(r3.resueltas >= 1);
  assert.ok(db.t.ruta_conciliacion_alertas.every((a) => a.estado === 'auto_resuelta'));
  assert.equal(db.t.ruta_conciliacion_corridas.length, 3);
});

test('cambiar estado exige permiso y nota', async () => {
  const db = dbEnMemoria();
  await correr(db, 0);
  const a = db.t.ruta_conciliacion_alertas.find((x) => x.severidad === 'critica');
  assert.equal((await cambiarEstadoAlerta(db, a, { estado: 'resuelta', nota: 'corregido en caja', rol: 'Gerente' })).ok, false);
  assert.equal((await cambiarEstadoAlerta(db, a, { estado: 'resuelta', nota: 'x', rol: 'Administrador' })).ok, false);
  assert.equal((await cambiarEstadoAlerta(db, a, { estado: 'resuelta', nota: 'corregido en caja', rol: 'Administrador', usuario: { nombre: 'Ana' } })).ok, true);
  assert.equal(a.estado, 'resuelta'); assert.equal(a.resuelta_por, 'Ana');
});

test('sin tabla creada devuelve el aviso de SQL', async () => {
  const db = { from: () => ({ select: () => ({ in: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'x' } }) }) }) }) }) };
  const { entregas } = consolidarRuta(datos(0));
  const r = await sincronizarAlertas(db, { hallazgos: [], entregas });
  assert.equal(r.faltaTabla, true); assert.match(r.error, /fix_ruta_conciliacion/);
  const l = await listarAlertas({ from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'x' } }) }) }) }) }) });
  assert.equal(l.faltaTabla, true);
});
