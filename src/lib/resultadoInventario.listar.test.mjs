import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const { listarResultadosInventario, claveResultadoInventario } = await import('./resultadoInventario.js');

const prefix = 'pos3b_resultado_inv_';
const keys = [];
for (let i = 0; i < localStorage.length; i += 1) {
  const k = localStorage.key(i);
  if (k?.startsWith(prefix)) keys.push(k);
}
for (const k of keys) localStorage.removeItem(k);

const k1 = claveResultadoInventario('3B1', '2026-08-01', '2026-08-07');
const k2 = claveResultadoInventario('3B2', '2026-08-01', '2026-08-07');
localStorage.setItem(k1, JSON.stringify({
  sucursal_id: '3B1',
  desde: '2026-08-01',
  hasta: '2026-08-07',
  valor_contado: 100000,
  valor_faltante: 1500,
  valor_bonificacion: 200,
  updated_at: '2026-08-08T12:00:00.000Z',
}));
localStorage.setItem(k2, JSON.stringify({
  sucursal_id: '3B2',
  desde: '2026-08-01',
  hasta: '2026-08-07',
  valor_contado: 80000,
  valor_faltante: 900,
  updated_at: '2026-08-08T13:00:00.000Z',
}));

const r = await listarResultadosInventario(null, { desde: '2026-08-01', hasta: '2026-08-07' });
assert.equal(r.porTienda.length, 2);
assert.equal(r.registros.length, 2);
assert.ok(r.porTienda.some((g) => g.sucursal_id === '3B1'));
assert.ok(r.porTienda.some((g) => g.sucursal_id === '3B2'));
assert.equal(r.porTienda.find((g) => g.sucursal_id === '3B1').registros[0].fuente, 'local');

const fuera = await listarResultadosInventario(null, { desde: '2026-07-01', hasta: '2026-07-15' });
assert.equal(fuera.registros.length, 0);

console.log('resultadoInventario.listar.test.mjs OK');
