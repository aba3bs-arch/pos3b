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

const {
  FIRMAS_INVENTARIO_COUNT,
  firmaInventarioVacia,
  normalizarFirmasInventario,
  guardarResultadoInventario,
  cargarResultadoInventario,
  claveResultadoInventario,
} = await import('./resultadoInventario.js');

assert.equal(FIRMAS_INVENTARIO_COUNT, 3);
assert.deepEqual(firmaInventarioVacia(), { nombre: '', usuario_id: null, firmado_at: null });

const vacias = normalizarFirmasInventario(null);
assert.equal(vacias.length, 3);
assert.equal(vacias[0].nombre, '');

const norm = normalizarFirmasInventario([
  { nombre: 'Ana López', usuario_id: 'u1', firmado_at: '2026-09-12T12:00:00.000Z' },
  { name: '  ', usuario_id: 'x' },
  { nombre: 'Carlos', usuarioId: 'u3' },
]);
assert.equal(norm[0].nombre, 'Ana López');
assert.equal(norm[0].usuario_id, 'u1');
assert.equal(norm[1].nombre, '');
assert.equal(norm[2].nombre, 'Carlos');
assert.equal(norm[2].usuario_id, 'u3');

const fromJson = normalizarFirmasInventario(JSON.stringify([
  { nombre: 'Solo uno', usuario_id: 'a' },
]));
assert.equal(fromJson[0].nombre, 'Solo uno');
assert.equal(fromJson[1].nombre, '');
assert.equal(fromJson[2].nombre, '');

const suc = '3B9';
const desde = '2026-09-01';
const hasta = '2026-09-07';
const clave = claveResultadoInventario(suc, desde, hasta);
localStorage.removeItem(clave);

const firmas = [
  { nombre: 'Firma A', usuario_id: '1', firmado_at: '2026-09-12T10:00:00.000Z' },
  { nombre: 'Firma B', usuario_id: '2', firmado_at: '2026-09-12T10:01:00.000Z' },
  { nombre: '', usuario_id: null, firmado_at: null },
];

const g = await guardarResultadoInventario(null, {
  sucursal: suc,
  desde,
  hasta,
  totalInventario: 50000,
  faltante: 1000,
  bonificacion: 100,
  firmas,
});
assert.equal(g.ok, true);
assert.equal(g.registro.firmas[0].nombre, 'Firma A');
assert.equal(g.registro.firmas[1].nombre, 'Firma B');
assert.equal(g.registro.firmas[2].nombre, '');

const c = await cargarResultadoInventario(null, { sucursal: suc, desde, hasta });
assert.equal(c.ok, true);
assert.equal(c.registro.firmas[0].nombre, 'Firma A');
assert.equal(c.registro.firmas[1].usuario_id, '2');

localStorage.removeItem(clave);
console.log('resultadoInventario.firmas.test.mjs OK');
