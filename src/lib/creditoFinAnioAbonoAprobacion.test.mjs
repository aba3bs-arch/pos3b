import assert from 'node:assert/strict';
import {
  aprobarSolicitudAbonoFinAnio,
  rechazarSolicitudAbonoFinAnio,
  solicitarAbonoFinAnio,
} from './creditoFinAnioAbonoAprobacion.js';

function memoria() {
  const tables = {};
  let n = 1;
  return {
    tables,
    from(name) {
      if (!tables[name]) tables[name] = [];
      const rows = tables[name];
      const q = { filters: [], patch: null, inserted: null };
      const matched = () => rows.filter((r) => q.filters.every(([col, op, val]) => (
        op === 'is' ? r[col] == null : String(r[col]) === String(val)
      )));
      const chain = {
        select() { return chain; },
        is(col, val) { q.filters.push([col, 'is', val]); return chain; },
        order() { return chain; },
        eq(col, val) { q.filters.push([col, 'eq', val]); return chain; },
        in() { return chain; },
        overlaps() { return chain; },
        limit() { return Promise.resolve({ data: matched(), error: null }); },
        maybeSingle() {
          const found = matched();
          return Promise.resolve({ data: found[0] || null, error: null });
        },
        insert(row) {
          const rec = { id: `sol${n++}`, archived_at: null, created_at: new Date().toISOString(), ...row };
          rows.unshift(rec);
          q.inserted = rec;
          return chain;
        },
        update(patch) { q.patch = patch; return chain; },
        single() { return Promise.resolve({ data: q.inserted, error: null }); },
        then(resolve, reject) {
          const found = matched();
          if (q.patch) found.forEach((r) => Object.assign(r, q.patch));
          return Promise.resolve({ data: found, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const db = memoria();
const pedido = await solicitarAbonoFinAnio(db, {
  cuentaId: 'c3',
  sucursalId: '3B3',
  monto: 480,
  notas: 'caja',
  repartidorId: 'rep_pancho',
  repartidorNombre: 'Pancho',
  cajero: { id: 'cj1', nombre: 'Caja 1' },
});
assert.equal(pedido.ok, true);
assert.equal(db.tables.credito_fin_anio_abonos, undefined);
assert.equal(pedido.solicitud.estado, 'pendiente');
assert.equal(pedido.solicitud.monto, 480);
assert.deepEqual(pedido.solicitud.repartidor_aliases, ['rep_pancho']);

const repetido = await solicitarAbonoFinAnio(db, {
  cuentaId: 'c3',
  sucursalId: '3B3',
  monto: 10,
  repartidorId: 'rep_pancho',
  cajero: { nombre: 'Caja 1' },
});
assert.equal(repetido.ok, false);

let aplicado = 0;
const pinOk = async () => ({ ok: true, user: { id: 'rep_pancho', nombre: 'Pancho', repartidor_id: 'rep_pancho' } });
const sesion = { id: 'rep_pancho', nombre: 'Pancho', aliases: ['rep_pancho'] };
const malPin = await aprobarSolicitudAbonoFinAnio(db, {
  solicitudId: pedido.solicitud.id, pin: '0000', sesion,
}, {
  verificarPin: async () => ({ ok: false, error: 'PIN incorrecto.' }),
  aplicar: async () => { aplicado += 1; return { ok: true }; },
});
assert.equal(malPin.ok, false);
assert.equal(aplicado, 0);
assert.equal(pedido.solicitud.estado, 'pendiente');

const rechazado = await rechazarSolicitudAbonoFinAnio(db, {
  solicitudId: pedido.solicitud.id, pin: '1234', sesion, motivo: 'no lo recibí',
}, { verificarPin: pinOk });
assert.equal(rechazado.ok, true);
assert.equal(pedido.solicitud.estado, 'rechazada');
assert.equal(aplicado, 0);

const otro = await solicitarAbonoFinAnio(db, {
  cuentaId: 'c9',
  sucursalId: '3B3',
  monto: 480,
  repartidorId: 'rep_pancho',
  repartidorNombre: 'Pancho',
  cajero: { nombre: 'Caja 1' },
});
const bien = await aprobarSolicitudAbonoFinAnio(db, {
  solicitudId: otro.solicitud.id, pin: '1234', sesion,
}, {
  verificarPin: pinOk,
  aplicar: async (_sb, cuentaId, datos, user) => {
    aplicado += 1;
    assert.equal(cuentaId, 'c9');
    assert.equal(datos.monto, 480);
    assert.equal(datos.sucursalId, '3B3');
    assert.equal(user.nombre, 'Caja 1');
    return { ok: true, abonoId: 'ab1' };
  },
});
assert.equal(bien.ok, true);
assert.equal(aplicado, 1);
assert.equal(otro.solicitud.estado, 'aprobada');
assert.ok(otro.solicitud.aplicada_at);
assert.equal(otro.solicitud.abono_id, 'ab1');

console.log('creditoFinAnioAbonoAprobacion.test.mjs ok');
