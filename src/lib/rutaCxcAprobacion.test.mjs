import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPartesPorVendedor, aliasesDeSesion, aprobarSolicitudCobro, cancelarSolicitudCobro, listarSolicitudesDeVendedor,
  rechazarSolicitudCobro, solicitarCobroCreditos, solicitudEsDelVendedor, solicitudRequiereAccion,
} from './rutaCxcAprobacion.js';

function dbEnMemoria(inicial = {}) {
  const t = { ruta_cxc_movimientos: [], ruta_cxc_aprobaciones: [], ...inicial };
  let seq = 0;
  const from = (tabla) => {
    const st = { filtros: [], patch: null, insertar: null, limite: null };
    const filas = () => t[tabla].filter((r) => st.filtros.every((f) => f(r)));
    const q = {
      select() { return q; }, order() { return q; }, limit(n) { st.limite = n; return q; },
      eq(c, v) { st.filtros.push((r) => r[c] === v); return q; },
      in(c, v) { st.filtros.push((r) => v.includes(r[c])); return q; },
      gte(c, v) { st.filtros.push((r) => String(r[c]) >= String(v)); return q; },
      is(c, v) { st.filtros.push((r) => (r[c] ?? null) === v); return q; },
      overlaps(c, v) { st.filtros.push((r) => (r[c] || []).some((x) => v.includes(x))); return q; },
      update(p) { st.patch = p; return q; },
      insert(rows) { st.insertar = rows; return q; },
      maybeSingle() { return Promise.resolve({ data: filas()[0] || null, error: null }); },
      then(res, rej) {
        let r;
        if (st.insertar) {
          const nuevas = st.insertar.map((x) => ({ id: `s${++seq}`, pago_id: `pago${seq}`, ...x }));
          t[tabla].push(...nuevas); r = { data: nuevas, error: null };
        } else if (st.patch) {
          const hit = filas(); hit.forEach((x) => Object.assign(x, st.patch)); r = { data: hit.map((x) => ({ id: x.id })), error: null };
        } else r = { data: filas(), error: null };
        return Promise.resolve(r).then(res, rej);
      },
    };
    return q;
  };
  return { t, from };
}

const cargo = (id, monto, extra = {}) => ({ id, tipo: 'cargo', estatus: 'pendiente', cliente_tipo: 'sucursal', cliente_id: 'FUSION', monto, carga_id: 'c1', folio_venta: `VR-${id}`, created_at: `2026-10-2${id.length}T10:00:00Z`, ...extra });
const resolver = (mapa) => async (db, cargos) => new Map(cargos.filter((c) => mapa[c.id]).map((c) => [String(c.id), mapa[c.id]]));
const luis = { ref: 'rep_luis', nombre: 'Luis', aliases: ['rep_luis', 'u-luis'] };
const marta = { ref: 'rep_marta', nombre: 'Marta', aliases: ['rep_marta'] };
const cajero = { id: 'cj1', nombre: 'Ana' };

test('alias: rt: y el id sin prefijo son la misma persona', () => {
  assert.deepEqual(aliasesDeSesion({ id: 'rt:REP_Luis', repartidor_id: 'rep_luis', usuario_id: 'U-1' }), ['rep_luis', 'u-1']);
  assert.equal(solicitudEsDelVendedor({ vendedor_aliases: ['rep_luis'] }, aliasesDeSesion({ id: 'rt:rep_luis' })), true);
  assert.equal(solicitudEsDelVendedor({ vendedor_aliases: ['rep_luis'] }, aliasesDeSesion({ id: 'otro' })), false);
});

test('agrupa por vendedor y el reparto parcial conserva el total', () => {
  const partes = [{ cargo: cargo('a', 100), monto: 100, parcial: false }, { cargo: cargo('bb', 50), monto: 30, parcial: true }];
  const g = agruparPartesPorVendedor(partes, new Map([['a', luis], ['bb', marta]]));
  assert.equal(g.grupos.length, 2);
  assert.deepEqual(g.grupos.map((x) => [x.ref, x.monto, x.parcial]), [['rep_luis', 100, false], ['rep_marta', 30, true]]);
  assert.equal(agruparPartesPorVendedor(partes, new Map([['a', luis]])).ok, false);
});

test('solicitar: crea una solicitud por vendedor y no registra ningún pago', async () => {
  const db = dbEnMemoria({ ruta_cxc_movimientos: [cargo('a', 100), cargo('bb', 50)] });
  const r = await solicitarCobroCreditos(db, { movimientoIds: ['a', 'bb'], monto: 130, sucursal: 'Fusión', cajeroUser: cajero }, { resolverVendedores: resolver({ a: luis, bb: marta }) });
  assert.equal(r.ok, true); assert.equal(r.modo, 'aprobacion');
  assert.equal(r.solicitudes.length, 2);
  const [s1, s2] = db.t.ruta_cxc_aprobaciones;
  assert.deepEqual([s1.sucursal_id, s1.monto, s1.estado, s1.cajero_nombre, s1.vendedor_nombre], ['FUSION', 100, 'pendiente', 'Ana', 'Luis']);
  assert.deepEqual([s2.monto, s2.parcial, s2.movimiento_ids], [30, true, ['bb']]);
  assert.ok(db.t.ruta_cxc_movimientos.every((m) => m.estatus === 'pendiente'));
});

test('solicitar: bloquea folios que ya esperan aprobación, créditos pagados y vendedor desconocido', async () => {
  const db = dbEnMemoria({ ruta_cxc_movimientos: [cargo('a', 100), cargo('bb', 50, { estatus: 'pagado' })] });
  const deps = { resolverVendedores: resolver({ a: luis }) };
  const base = { monto: 100, sucursal: 'FUSION', cajeroUser: cajero };
  assert.equal((await solicitarCobroCreditos(db, { ...base, movimientoIds: ['a'] }, deps)).ok, true);
  const dup = await solicitarCobroCreditos(db, { ...base, movimientoIds: ['a'] }, deps);
  assert.equal(dup.ok, false); assert.match(dup.error, /esperando aprobación/);
  assert.match((await solicitarCobroCreditos(db, { ...base, movimientoIds: ['bb'] }, deps)).error, /ya fue pagado/);
  const db2 = dbEnMemoria({ ruta_cxc_movimientos: [cargo('a', 100)] });
  assert.match((await solicitarCobroCreditos(db2, { ...base, movimientoIds: ['a'] }, { resolverVendedores: resolver({}) })).error, /vendedor/);
});

test('solicitar: otra sucursal, monto excesivo, Recolecciones y mezcla', async () => {
  const db = dbEnMemoria({ ruta_cxc_movimientos: [cargo('a', 100), cargo('r', 40, { carga_id: 'rec:1' }), cargo('o', 10, { cliente_id: '3B7' })] });
  const deps = { resolverVendedores: resolver({ a: luis }) };
  const base = { sucursal: 'FUSION', cajeroUser: cajero };
  assert.match((await solicitarCobroCreditos(db, { ...base, movimientoIds: ['o'], monto: 10 }, deps)).error, /no pertenecen/);
  assert.equal((await solicitarCobroCreditos(db, { ...base, movimientoIds: ['a'], monto: 500 }, deps)).ok, false);
  assert.deepEqual(await solicitarCobroCreditos(db, { ...base, movimientoIds: ['r'], monto: 40 }, deps), { ok: true, modo: 'directo' });
  assert.match((await solicitarCobroCreditos(db, { ...base, movimientoIds: ['a', 'r'], monto: 140 }, deps)).error, /por separado/);
  assert.equal(db.t.ruta_cxc_aprobaciones.length, 0);
});

test('solicitar: sin la tabla pide ejecutar el SQL', async () => {
  const db = { from: (t) => t === 'ruta_cxc_movimientos' ? dbEnMemoria({ ruta_cxc_movimientos: [cargo('a', 100)] }).from(t)
    : { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'x' } }) }) }) }) }) } };
  const r = await solicitarCobroCreditos(db, { movimientoIds: ['a'], monto: 100, sucursal: 'FUSION', cajeroUser: cajero }, { resolverVendedores: resolver({ a: luis }) });
  assert.equal(r.faltaTabla, true); assert.match(r.error, /fix_ruta_cxc_aprobaciones/);
});

const nuevaSolicitud = (extra = {}) => ({
  id: 's1', pago_id: 'pago-1', sucursal_id: 'FUSION', movimiento_ids: ['a'], monto: 100, cajero_id: 'cj1', cajero_nombre: 'Ana',
  vendedor_aliases: ['rep_luis', 'u-luis'], estado: 'pendiente', ...extra,
});
const sesionLuis = { id: 'u-luis', nombre: 'Luis' };
const pinOk = async (db, { vendedorId }) => ({ ok: true, user: { id: vendedorId, nombre: 'Luis', repartidor_id: 'rep_luis' } });

test('aprobar: valida PIN, reclama la solicitud y ejecuta un solo pago con el id de la solicitud', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud()] });
  const llamadas = [];
  const r = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1234', sesion: sesionLuis }, {
    verificarPin: pinOk, pagar: async (d, args) => { llamadas.push(args); return { ok: true, montoPagado: 100 }; },
  });
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 1);
  assert.deepEqual([llamadas[0].solicitudId, llamadas[0].montoPagar, llamadas[0].sucursal, llamadas[0].cajeroUser.nombre], ['pago-1', 100, 'FUSION', 'Ana']);
  const s = db.t.ruta_cxc_aprobaciones[0];
  assert.equal(s.estado, 'aprobada'); assert.ok(s.aplicada_at); assert.equal(s.resuelta_por, 'Luis');
  const otra = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1234', sesion: sesionLuis }, { verificarPin: pinOk, pagar: async () => { throw new Error('no debe pagar'); } });
  assert.equal(otra.ok, false); assert.match(otra.error, /ya está aprobada/);
});

test('aprobar: PIN incorrecto o solicitud de otro vendedor no paga', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud()] });
  const pagar = async () => { throw new Error('no debe pagar'); };
  const mal = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '0', sesion: sesionLuis }, { verificarPin: async () => ({ ok: false, error: 'PIN incorrecto.' }), pagar });
  assert.deepEqual(mal, { ok: false, error: 'PIN incorrecto.' });
  const ajeno = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: { id: 'u-otro' } }, {
    verificarPin: async () => ({ ok: true, user: { id: 'u-otro', nombre: 'Otro' } }), pagar,
  });
  assert.match(ajeno.error, /otro vendedor/);
  assert.equal(db.t.ruta_cxc_aprobaciones[0].estado, 'pendiente');
});

test('aprobar: si el pago falla vuelve a pendiente y se puede reintentar sin cobrar doble', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud()] });
  const fallo = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: sesionLuis }, { verificarPin: pinOk, pagar: async () => ({ ok: false, error: 'Sin conexión.' }) });
  assert.equal(fallo.ok, false);
  assert.equal(db.t.ruta_cxc_aprobaciones[0].estado, 'pendiente');
  assert.equal(solicitudRequiereAccion(db.t.ruta_cxc_aprobaciones[0]), true);
  const ok = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: sesionLuis }, { verificarPin: pinOk, pagar: async () => ({ ok: true }) });
  assert.equal(ok.ok, true);
});

test('aprobar: una aprobada sin aplicar (corte tras pagar) se puede reintentar', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud({ estado: 'aprobada', aplicada_at: null })] });
  assert.equal(solicitudRequiereAccion(db.t.ruta_cxc_aprobaciones[0]), true);
  const r = await aprobarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: sesionLuis }, { verificarPin: pinOk, pagar: async (d, a) => ({ ok: true, id: a.solicitudId }) });
  assert.equal(r.ok, true); assert.equal(db.t.ruta_cxc_aprobaciones[0].resultado.id, 'pago-1');
});

test('rechazar: exige PIN del vendedor, guarda el motivo y deja los créditos sin tocar', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud()] });
  const r = await rechazarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: sesionLuis, motivo: ' no estuve ' }, { verificarPin: pinOk });
  assert.equal(r.ok, true);
  assert.deepEqual([db.t.ruta_cxc_aprobaciones[0].estado, db.t.ruta_cxc_aprobaciones[0].motivo], ['rechazada', 'no estuve']);
  assert.equal((await rechazarSolicitudCobro(db, { solicitudId: 's1', pin: '1', sesion: sesionLuis }, { verificarPin: pinOk })).ok, false);
});

test('cajero cancela solo mientras esté pendiente; el vendedor ve solo lo suyo', async () => {
  const db = dbEnMemoria({ ruta_cxc_aprobaciones: [nuevaSolicitud(), nuevaSolicitud({ id: 's2', vendedor_aliases: ['rep_marta'] }), nuevaSolicitud({ id: 's3', estado: 'rechazada' })] });
  const mias = await listarSolicitudesDeVendedor(db, aliasesDeSesion(sesionLuis));
  assert.deepEqual(mias.data.map((s) => s.id), ['s1']);
  assert.equal((await cancelarSolicitudCobro(db, { solicitudId: 's1', cajeroNombre: 'Ana' })).ok, true);
  assert.equal((await cancelarSolicitudCobro(db, { solicitudId: 's1' })).ok, false);
  assert.equal((await listarSolicitudesDeVendedor(db, aliasesDeSesion(sesionLuis))).data.length, 0);
});
